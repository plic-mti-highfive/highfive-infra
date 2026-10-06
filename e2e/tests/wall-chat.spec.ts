import { test, expect, type APIRequestContext } from '@playwright/test';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import * as Y from 'yjs';
import WebSocket from 'ws';
import pg from 'pg';
import { db, seedUser, urls } from '../helpers/env';

// Pourquoi API + WebSocket et pas UI : le front ne branche pas encore le Mur
// ni le chat en temps reel. Le parcours est donc joue au niveau protocole,
// avec le meme jeton et le meme provider Hocuspocus que le front utilisera.

interface WallSession {
  token: string;
  canvasId: string;
  websocketUrl: string;
  role: string;
}
interface ChatBroadcast {
  id: string;
  conversationId?: string;
  authorId: string;
  body: string;
  sentAt: string;
  editedAt?: string;
  deleted: boolean;
  isAssistant?: boolean;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function login(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${urls.api}/auth/login`, { data: seedUser });
  expect(res.status(), 'connexion avec le compte du seed').toBe(200);
  return (await res.json()).token as string;
}

async function createPublishedProject(request: APIRequestContext, token: string) {
  const stamp = Date.now().toString(36);
  const created = await request.post(`${urls.api}/projects`, {
    headers: bearer(token),
    data: {
      title: `E2E chat ${stamp}`,
      tagline: 'Parcours chat du Mur',
      tags: ['code'],
      visibility: 'public',
      participation: 'open',
    },
  });
  expect(created.status()).toBe(201);
  const { slug, id } = await created.json();
  const published = await request.post(`${urls.api}/projects/${slug}/transition`, {
    headers: bearer(token),
    data: { transition: 'publish' },
  });
  expect(published.ok()).toBeTruthy();
  return { slug: slug as string, id: id as string };
}

function connect(session: WallSession) {
  const doc = new Y.Doc();
  const chats: ChatBroadcast[] = [];
  const websocketProvider = new HocuspocusProviderWebsocket({
    url: urls.canvasWs || session.websocketUrl,
    WebSocketPolyfill: WebSocket,
  });
  const provider = new HocuspocusProvider({
    websocketProvider,
    name: session.canvasId,
    token: session.token,
    document: doc,
    onStateless: ({ payload }) => {
      const msg = JSON.parse(payload) as { type: string; data: ChatBroadcast };
      if (msg.type === 'chat') chats.push(msg.data);
    },
  });
  const synced = new Promise<void>((resolve, reject) => {
    provider.on('synced', () => resolve());
    provider.on('authenticationFailed', ({ reason }: { reason: string }) =>
      reject(new Error(`authentification canvas refusee : ${reason}`)),
    );
  });
  provider.attach();
  return { doc, provider, chats, synced };
}

test('parcours chat : @ia repond avec le contexte, puis tout est sauvegarde', async ({ request }) => {
  const token = await login(request);
  const { slug, id: projectId } = await createPublishedProject(request, token);

  const sessionRes = await request.get(`${urls.api}/projects/${slug}/wall/session`, {
    headers: bearer(token),
  });
  expect(sessionRes.status()).toBe(200);
  const session = (await sessionRes.json()) as WallSession;
  expect(session.token).toBeTruthy();
  expect(session.role).toBe('admin');

  const { doc, provider, chats, synced } = connect(session);
  try {
    await synced;

    const ask = async (text: string) => {
      const before = chats.length;
      provider.sendStateless(JSON.stringify({ type: 'chat', text }));
      // 2 broadcasts : l'echo du message, puis la reponse de l'assistant.
      await expect.poll(() => chats.length - before, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
      const [echo, answer] = chats.slice(before);
      expect(echo.body).toBe(text);
      expect(echo.deleted).toBe(false);
      expect(Number.isNaN(Date.parse(echo.sentAt))).toBe(false);
      expect(echo.isAssistant).toBeFalsy();
      expect(answer.isAssistant).toBe(true);
      return answer;
    };
    const contextSize = (answer: ChatBroadcast) => {
      const m = answer.body.match(/Contexte : (\d+) message/);
      expect(m, `reponse inattendue : ${answer.body}`).not.toBeNull();
      return Number(m![1]);
    };

    const first = await ask('@ia propose un nom pour la fresque');
    expect(first.body).toContain('[assistant simule]');
    expect(first.body).toContain('propose un nom pour la fresque');
    const n1 = contextSize(first);

    const second = await ask('@ia et une palette de couleurs ?');
    expect(second.body).toContain('une palette de couleurs');
    // Le provider fake reflete l'historique : le 2e contexte contient au moins
    // le 1er echange (message + reponse) en plus du nouveau message.
    expect(contextSize(second)).toBeGreaterThanOrEqual(n1 + 2);

    // Un message sans mention ne declenche pas l'assistant (ASSISTANT_TRIGGER=mention).
    const before = chats.length;
    provider.sendStateless(JSON.stringify({ type: 'chat', text: 'message entre humains' }));
    await expect.poll(() => chats.length - before).toBe(1);
    await new Promise((r) => setTimeout(r, 2000));
    expect(chats.length - before).toBe(1);

    // Sauvegarde 1 : le document Yjs. Un nouveau client sans etat local le
    // recupere depuis le serveur canvas (donc depuis MinIO/memoire serveur).
    const second_client = connect(session);
    await second_client.synced;
    await expect
      .poll(() => second_client.doc.getArray<{ body: string }>('chat').toArray().length, {
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(5);
    const texts = second_client.doc.getArray<{ body: string }>('chat').toArray().map((m) => m.body);
    expect(texts.some((t) => t.includes('message entre humains'))).toBe(true);
    expect(texts.some((t) => t.startsWith('[assistant simule]'))).toBe(true);
    second_client.provider.destroy();

    // Sauvegarde 2 : la messagerie. Les messages du Mur sont des `messages` de la
    // conversation `kind = 'wall'` du projet (saute si la base n'est pas joignable).
    const client = new pg.Client({ ...db, connectionTimeoutMillis: 3000 });
    const reachable = await client.connect().then(() => true, () => false);
    test.skip(!reachable, `Postgres injoignable sur ${db.host}:${db.port}`);
    const wallMessages = `select m.id, m.author_id, m.body, c.id as conversation_id
      from messages m join conversations c on c.id = m.conversation_id
      where c.kind = 'wall' and c.project_id = $1 order by m.sent_at`;
    try {
      await expect
        .poll(async () => (await client.query(wallMessages, [projectId])).rows.length, {
          timeout: 15_000,
        })
        .toBe(5);
      const rows = (
        await client.query<{ id: string; author_id: string; body: string; conversation_id: string }>(
          wallMessages,
          [projectId],
        )
      ).rows;
      const isAssistant = (r: { author_id: string }) =>
        r.author_id === '00000000-0000-4000-8000-0000000000a1';
      expect(rows.filter(isAssistant)).toHaveLength(2);
      expect(rows.filter((r) => !isAssistant(r))).toHaveLength(3);
      // L'id genere par le canvas est celui du message en base.
      const ids = new Set(chats.map((c) => c.id));
      for (const row of rows) expect(ids.has(row.id)).toBe(true);

      // Le chat du Mur reste hors de la messagerie : les canaux d'equipe sont
      // listes (un canal a un seul membre est masque par la messagerie, d'ou
      // le canal du seed), jamais une conversation `wall`.
      const wallId = rows[0].conversation_id;
      const list = (await (
        await request.get(`${urls.api}/conversations`, { headers: bearer(token) })
      ).json()) as { id: string; type: string }[];
      expect(list.some((c) => c.type === 'channel')).toBe(true);
      const wallIds = new Set(
        (await client.query<{ id: string }>("select id from conversations where kind = 'wall'")).rows.map(
          (r) => r.id,
        ),
      );
      expect(wallIds.has(wallId)).toBe(true);
      expect(list.filter((c) => wallIds.has(c.id))).toEqual([]);
      // Le projet a bien, en plus, son canal d'equipe `messaging`.
      const channel = await client.query(
        "select 1 from conversations where kind = 'messaging' and type = 'channel' and project_id = $1",
        [projectId],
      );
      expect(channel.rowCount).toBe(1);
      const detail = await request.get(`${urls.api}/conversations/${wallId}`, {
        headers: bearer(token),
      });
      expect(detail.status()).toBe(404);
    } finally {
      await client.end();
    }
  } finally {
    provider.destroy();
    doc.destroy();
  }
});

test('le Mur refuse un client sans jeton valide', async ({ request }) => {
  const res = await request.get(`${urls.api}/projects/inexistant/wall/session`);
  expect(res.status()).toBe(401);
});
