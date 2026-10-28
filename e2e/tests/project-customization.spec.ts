import { deflateSync } from 'node:zlib';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { seedUser, urls } from '../helpers/env';

// Personnalisation de la fiche projet branchee au vrai backend : editeur du
// front -> gateway -> core -> MinIO, puis lecture de la fiche.

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
};

/** PNG RVB decodable par un navigateur ; `noise` = octets aleatoires (poids). */
function png(width: number, height: number, noise = false): Buffer {
  const row = 1 + width * 3;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width * 3; x += 1) {
      raw[y * row + 1 + x] = noise ? Math.floor(Math.random() * 256) : (x % 3 === 0 ? 200 : 90);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // profondeur
  header[9] = 2; // RVB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: noise ? 0 : 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function login(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${urls.api}/auth/login`, { data: seedUser });
  expect(res.status(), 'connexion avec le compte du seed').toBe(200);
  return (await res.json()).token as string;
}

async function createProject(request: APIRequestContext, token: string) {
  const created = await request.post(`${urls.api}/projects`, {
    headers: bearer(token),
    data: {
      title: `E2E fiche ${Date.now().toString(36)}`,
      tagline: 'Personnalisation de la fiche',
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

test.describe('Personnalisation de la fiche (stack reelle)', () => {
  test('la gateway laisse passer une image de plus de 1 Mo (limite du core : 2 Mo)', async ({
    request,
  }) => {
    const token = await login(request);
    const slug = await createProject(request, token);

    const big = png(600, 600, true); // ~1,1 Mo non compressible
    expect(big.length).toBeGreaterThan(1024 * 1024);
    expect(big.length).toBeLessThan(2 * 1024 * 1024);

    const res = await request.post(`${urls.api}/projects/${slug}/customization/images`, {
      headers: bearer(token),
      multipart: { file: { name: 'grosse.png', mimeType: 'image/png', buffer: big } },
    });
    expect(res.status(), await res.text()).toBe(201);
  });

  test('le porteur ajoute une banniere depuis l\'editeur, la fiche l\'affiche', async ({
    page,
    request,
  }) => {
    const token = await login(request);
    const slug = await createProject(request, token);
    await page.addInitScript((t) => localStorage.setItem('access_token', t), token);

    await page.goto(`${urls.gateway}/projets/${slug}/modifier`);
    await page.getByRole('tab', { name: 'Images' }).click();
    await page.locator('input[type=file]').first().setInputFiles({
      name: 'banniere.png',
      mimeType: 'image/png',
      buffer: png(1200, 400),
    });
    await page.getByLabel('Texte alternatif').first().fill('Une banniere unie');

    const saved = page.waitForResponse(
      (res) => res.url().endsWith(`/projects/${slug}/customization`) && res.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    expect((await saved).status()).toBe(200);

    // Persistee cote serveur, avec une vraie URL d'objet.
    const project = await (await request.get(`${urls.api}/projects/${slug}`)).json();
    expect(project.customization.banner.alt).toBe('Une banniere unie');
    expect(project.customization.banner.url).toMatch(/^https?:\/\//);

    // Un visiteur anonyme voit la banniere, chargee depuis le stockage.
    const visitor = await page.context().browser()!.newContext();
    const fiche = await visitor.newPage();
    await fiche.goto(`${urls.gateway}/projets/${slug}`);
    const banner = fiche.getByRole('img', { name: 'Une banniere unie' }).first();
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() => banner.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await visitor.close();
  });
});
