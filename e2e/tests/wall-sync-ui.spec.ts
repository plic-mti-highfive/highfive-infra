import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import * as Y from 'yjs';
import WebSocket from 'ws';
import { seedUser, urls } from '../helpers/env';

// T9 : le Mur du front est synchronise (tldraw <-> Yjs/Hocuspocus) entre
// utilisateurs et persiste cote serveur. Parcours joue dans de vrais
// navigateurs (2 contextes), puis verifie au niveau protocole.

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function login(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${urls.api}/auth/login`, { data: seedUser });
  expect(res.status(), 'connexion avec le compte du seed').toBe(200);
  return (await res.json()).token as string;
}

async function createProject(request: APIRequestContext, token: string) {
  const created = await request.post(`${urls.api}/projects`, {
    headers: bearer(token),
    data: {
      title: `E2E mur ${Date.now().toString(36)}`,
      tagline: 'Synchronisation du Mur',
      tags: ['code'],
      visibility: 'public',
      participation: 'open',
    },
  });
  expect(created.status()).toBe(201);
  const { slug } = await created.json();
  const published = await request.post(`${urls.api}/projects/${slug}/transition`, {
    headers: bearer(token),
    data: { transition: 'publish' },
  });
  expect(published.ok()).toBeTruthy();
  return slug as string;
}

async function openWall(page: Page, token: string, slug: string) {
  await page.addInitScript((t) => localStorage.setItem('access_token', t), token);
  await page.goto(`${urls.gateway}/projets/${slug}/lab/mur`);
  await expect(page.getByText(/synchronisées en temps réel/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.tl-canvas')).toBeVisible();
}

test.describe('Mur synchronisé (UI)', () => {
  test('un post-it créé dans un navigateur apparaît dans l\'autre et est persisté', async ({
    browser,
    request,
  }) => {
    const token = await login(request);
    const slug = await createProject(request, token);
    const text = `Idée e2e ${Date.now().toString(36)}`;

    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      await openWall(pageA, token, slug);
      await openWall(pageB, token, slug);

      // Post-it : outil « note » (raccourci n), clic sur le canevas, saisie.
      await pageA.locator('.tl-canvas').click({ position: { x: 400, y: 300 } });
      await pageA.keyboard.press('n');
      await pageA.locator('.tl-canvas').click({ position: { x: 400, y: 300 } });
      await pageA.keyboard.type(text);
      await pageA.keyboard.press('Escape');

      await expect(pageB.locator('.tl-shape', { hasText: text })).toHaveCount(1, { timeout: 20_000 });

      // « Suggérer des tâches (IA) » : sans clé OpenAI, le core répond 503 et
      // le front affiche son message français (pas de faux succès).
      await pageA.getByRole('button', { name: 'Suggérer des tâches (IA)' }).click();
      await expect(pageA.getByRole('alert')).toContainText(/pas configur/i, { timeout: 20_000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }

    // Persistance côté serveur : un nouveau client voit l'élément.
    const sessionRes = await request.get(`${urls.api}/projects/${slug}/wall/session`, {
      headers: bearer(token),
    });
    expect(sessionRes.status()).toBe(200);
    const session = (await sessionRes.json()) as {
      token: string;
      canvasId: string;
      websocketUrl: string;
    };
    const doc = new Y.Doc();
    const socket = new HocuspocusProviderWebsocket({
      url: urls.canvasWs || session.websocketUrl,
      WebSocketPolyfill: WebSocket,
    });
    const provider = new HocuspocusProvider({
      websocketProvider: socket,
      name: session.canvasId,
      token: session.token,
      document: doc,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('synchronisation expirée')), 15_000);
        provider.on('synced', () => {
          clearTimeout(timer);
          resolve();
        });
        provider.attach();
      });
      const records = [...doc.getMap<{ typeName: string; type?: string; props?: unknown }>('tl_records').values()];
      const notes = records.filter((r) => r.typeName === 'shape' && r.type === 'note');
      expect(JSON.stringify(notes)).toContain(text);
    } finally {
      provider.destroy();
      socket.destroy();
    }
  });
});
