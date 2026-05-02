import healthRoutes from './health/routes.js';
import authRoutes from './auth/routes.js';
import tenantsRoutes from './tenants/routes.js';
import channelsRoutes from './channels/routes.js';
import trendsRoutes from './trends/routes.js';
import creativesRoutes from './creatives/routes.js';
import approvalsRoutes from './approvals/routes.js';
import publishingRoutes from './publishing/routes.js';
import metaRoutes from './meta/routes.js';
import adsRoutes from './ads/routes.js';
import leadsRoutes from './leads/routes.js';
import analyticsRoutes from './analytics/routes.js';
import webhooksRoutes from './webhooks/routes.js';

export async function registerModules(app) {
  await app.register(healthRoutes);

  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(tenantsRoutes, { prefix: '/tenants' });
      await api.register(channelsRoutes, { prefix: '/channels' });
      await api.register(trendsRoutes, { prefix: '/trends' });
      await api.register(creativesRoutes, { prefix: '/creatives' });
      await api.register(approvalsRoutes, { prefix: '/approvals' });
      await api.register(publishingRoutes, { prefix: '/publishing' });
      await api.register(metaRoutes, { prefix: '/meta' });
      await api.register(adsRoutes, { prefix: '/ads' });
      await api.register(leadsRoutes, { prefix: '/leads' });
      await api.register(analyticsRoutes, { prefix: '/analytics' });
    },
    { prefix: '/api/v1' },
  );

  await app.register(webhooksRoutes, { prefix: '/webhooks' });
}
