import { test, expect } from '@playwright/test';
import { urls } from '../helpers/env';

// Chaque service est joint par la route reellement exposee par la gateway :
// un 502 ici revele un probleme de routage ou de demarrage inter-services.
// Le worker IA n'a pas d'endpoint HTTP, Redis/Postgres/MinIO ne sont pas
// exposes : ils sont verifies indirectement (ready du core = DB + Redis + MinIO ;
// l'API IA depend de la DB et de Redis ; le chat e2e traverse Redis/BullMQ).
const checks: Array<{ name: string; url: string; expectBody?: RegExp }> = [
  { name: 'gateway', url: `${urls.gateway}/nginx-health`, expectBody: /ok/ },
  { name: 'frontend', url: urls.frontend, expectBody: /<html|<!doctype/i },
  { name: 'core /health', url: `${urls.api}/health`, expectBody: /ok/ },
  { name: 'core /health/ready (db, redis, minio)', url: `${urls.api}/health/ready` },
  { name: 'canvas /health', url: `${urls.canvas}/health` },
  { name: 'backend-ai /livez', url: `${urls.ai}/api/v1/livez`, expectBody: /alive/ },
];

for (const c of checks) {
  test(`connectivite : ${c.name}`, async ({ request }) => {
    const res = await request.get(c.url, { headers: {} });
    expect(res.status(), `${c.url} -> ${res.status()}`).toBe(200);
    if (c.expectBody) expect(await res.text()).toMatch(c.expectBody);
  });
}

test('connectivite : core -> base (le seed a cree un compte exploitable)', async ({ request }) => {
  const res = await request.post(`${urls.api}/auth/login`, {
    data: { email: 'alex.rivera@example.com', password: 'demo1234' },
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).token).toBeTruthy();
});
