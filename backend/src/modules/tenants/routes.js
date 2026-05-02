import { notImplemented } from '../../lib/errors.js';

export default async function routes(app) {
  app.get('/', async () => {
    throw notImplemented('tenants.list');
  });

  app.post('/', async () => {
    throw notImplemented('tenants.create');
  });

  app.get('/:tenantId', async () => {
    throw notImplemented('tenants.get');
  });

  app.patch('/:tenantId', async () => {
    throw notImplemented('tenants.update');
  });
}
