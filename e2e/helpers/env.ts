/** URLs de la stack, surchargeables par variables d'environnement. */
const gateway =
  process.env.E2E_GATEWAY_URL ?? `http://localhost:${process.env.GATEWAY_PORT ?? 52}`;

export const urls = {
  gateway,
  frontend: process.env.E2E_FRONTEND_URL ?? `${gateway}/`,
  api: process.env.E2E_API_URL ?? `${gateway}/api`,
  ai: process.env.E2E_AI_URL ?? `${gateway}/ai`,
  canvas: process.env.E2E_CANVAS_URL ?? `${gateway}/ws`,
  // Vide : on utilise `websocketUrl` fournie par le core (session du Mur).
  canvasWs: process.env.E2E_CANVAS_WS_URL ?? '',
};

/** Acces direct a Postgres (optionnel : le test de persistance SQL est saute sans). */
export const db = {
  host: process.env.E2E_DB_HOST ?? '127.0.0.1',
  port: Number(process.env.E2E_DB_PORT ?? process.env.DB_HOST_PORT ?? 5432),
  user: process.env.E2E_DB_USER ?? process.env.POSTGRES_USER ?? 'postgresadmin',
  password: process.env.E2E_DB_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? 'postgresadmin',
  database: 'highfive',
};

export const seedUser = { email: 'alex.rivera@example.com', password: 'demo1234' };
