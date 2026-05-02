export default async function routes(app) {
  app.get('/health', async () => ({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));

  app.get('/ready', async () => ({ status: 'ready' }));
}
