// Seed des Murs : pose quelques post-its sur le Mur des projets de demo.
//
// Le Mur est un document collaboratif (tldraw / Yjs) qui vit dans le service
// canvas, pas dans l'API REST. Il faut donc un client Hocuspocus, absent de
// l'image du core : ce script tourne dans l'image canvas (service `seed_walls`
// de docker-compose.yml), qui embarque yjs et @hocuspocus/provider.
//
// Comme le front : session de Mur emise par le core, puis Y.Map `tl_records`
// (voir WALL_RECORDS_KEY dans le front). Les projets viennent de l'API ; leur
// proprietaire se connecte avec le compte de demo du seed (<pseudo>@example.com,
// demo1234). Un Mur qui a deja des formes n'est pas touche : relancer est sans effet.
//
// Variables : API_URL (http://backend_core:3000), CANVAS_WS_URL (ws://backend_canvas:8585).

import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import WebSocket from 'ws';

const API = (process.env.API_URL ?? 'http://localhost:3000') + '/api';
const CANVAS_WS_URL = process.env.CANVAS_WS_URL;
const PASSWORD = 'demo1234';
const RECORDS_KEY = 'tl_records';
const WORKERS = 4;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const IDEAS = [
  'Afficher une annonce dans le quartier',
  'Prevoir un coin gouter pour tout le monde',
  'Organiser une premiere seance d essai',
  'Demander un lieu a la mairie',
  'Prevoir un plan B en cas de pluie',
  'Chercher des dons de materiel',
  'Creer un groupe de discussion pour l equipe',
  'Prendre des photos pour garder une trace',
];
const COLORS = ['yellow', 'light-blue', 'light-green', 'orange', 'light-violet', 'light-red'];

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (response.status === 429 && attempt < 8) {
      await sleep(5_000);
      continue;
    }
    const text = await response.text();
    const payload = text ? JSON.parse(text) : undefined;
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(payload)}`);
    return payload;
  }
}

/** Records tldraw d'un Mur : document, page, puis un post-it par texte. */
function wallRecords(texts) {
  const richText = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
  const records = [
    { id: 'document:document', typeName: 'document', gridSize: 10, name: '', meta: {} },
    { id: 'page:page', typeName: 'page', name: 'Page 1', index: 'a1', meta: {} },
  ];
  texts.slice(0, 9).forEach((text, i) => {
    records.push({
      id: `shape:note${i + 1}`,
      typeName: 'shape',
      type: 'note',
      x: (i % 3) * 240,
      y: Math.floor(i / 3) * 240,
      rotation: 0,
      index: `a${i + 1}`,
      parentId: 'page:page',
      isLocked: false,
      opacity: 1,
      meta: {},
      props: {
        color: COLORS[i % COLORS.length],
        labelColor: 'black',
        size: 'm',
        font: 'draw',
        fontSizeAdjustment: 0,
        align: 'middle',
        verticalAlign: 'middle',
        growY: 0,
        url: '',
        richText: richText(text),
        scale: 1,
      },
    });
  });
  return records;
}

const tokens = new Map();
async function tokenOf(username) {
  if (!tokens.has(username)) {
    const session = await call('POST', '/auth/login', { body: { email: `${username}@example.com`, password: PASSWORD } });
    tokens.set(username, session.token);
  }
  return tokens.get(username);
}

/** `true` si des post-its ont ete poses, `false` si le Mur n'etait pas vierge. */
async function seedWall(project, index) {
  const token = await tokenOf(project.owner.username);
  const session = await call('GET', `/projects/${project.slug}/wall/session`, { token });
  const document = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: CANVAS_WS_URL,
    name: session.canvasId,
    token: session.token,
    document,
    WebSocketPolyfill: WebSocket,
  });
  try {
    const synced = await Promise.race([
      new Promise((resolve) => provider.on('synced', () => resolve(true))),
      sleep(15_000).then(() => false),
    ]);
    if (!synced) throw new Error('synchronisation impossible');
    const records = document.getMap(RECORDS_KEY);
    if ([...records.values()].some((record) => record?.typeName === 'shape')) return false;

    const ideas = [0, 1, 2, 3].map((n) => IDEAS[(index + n * 2) % IDEAS.length]);
    const needs = (project.needs ?? []).filter((need) => !need.fulfilled).map((need) => `Trouver : ${need.label}`);
    document.transact(() => {
      for (const record of wallRecords([...needs, ...ideas])) records.set(record.id, record);
    });
    // Laisse la synchronisation atteindre le serveur avant de fermer.
    await sleep(1500);
    return true;
  } finally {
    provider.destroy();
  }
}

if (!CANVAS_WS_URL) {
  console.error('CANVAS_WS_URL manquant');
  process.exit(1);
}

const projects = [];
for (let cursor; ; ) {
  const page = await call('GET', `/projects?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
  projects.push(...page.items);
  if (!page.nextCursor) break;
  cursor = page.nextCursor;
}
console.log(`Murs : ${projects.length} projets publics`);

let seeded = 0;
let skipped = 0;
let failed = 0;
let next = 0;
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    while (next < projects.length) {
      const index = next++;
      const project = projects[index];
      try {
        if (await seedWall(project, index)) seeded++;
        else skipped++;
      } catch (error) {
        failed++;
        console.warn(`  ! Mur de ${project.slug} : ${error.message}`);
      }
    }
  }),
);
console.log(`  ${seeded} murs avec post-its (${skipped} deja remplis, ${failed} en echec)`);
process.exit(failed > 0 && seeded === 0 ? 1 : 0);
