import fp from 'fastify-plugin';
import { db } from '../db/index.js';
import { MetaAdAccountRepository } from '../Repositories/MetaAdAccountRepository.js';
import { CtwaCampaignRepository } from '../Repositories/CtwaCampaignRepository.js';
import { CtwaConversationRepository } from '../Repositories/CtwaConversationRepository.js';
import { CtwaConversionRepository } from '../Repositories/CtwaConversionRepository.js';
import { CtwaInsightsRepository } from '../Repositories/CtwaInsightsRepository.js';
import { UserRepository } from '../Repositories/UserRepository.js';
import { PasswordResetTokenRepository } from '../Repositories/PasswordResetTokenRepository.js';
import { AdsService } from '../services/AdsService.js';
import { AnalyticsService } from '../services/AnalyticsService.js';
import { AuthService } from '../services/AuthService.js';
import { AdsController } from '../Controllers/AdsController.js';
import { CreativeService } from '../services/CreativeService.js';
import { InstagramAccountRepository } from '../Repositories/InstagramAccountRepository.js';
import { InstagramApiService } from '../services/InstagramApiService.js';
import { InstagramOAuthService } from '../services/InstagramOAuthServices.js';
import { InstagramOAuthController } from '../Controllers/InstagramOAuthController.js';

// Build the DI graph and decorate the Fastify instance. Keep this file as
// the *only* place that knows how the pieces are wired together — routes
// only ever pull `fastify.adsController` / `fastify.authService`.
async function plugin(app) {
  const userRepository = new UserRepository(db);
  const passwordResetTokenRepository = new PasswordResetTokenRepository(db);
  const metaAdAccountRepository = new MetaAdAccountRepository(db);
  const ctwaCampaignRepository = new CtwaCampaignRepository(db);
  const ctwaConversationRepository = new CtwaConversationRepository(db);
  const ctwaConversionRepository = new CtwaConversionRepository(db);
  const ctwaInsightsRepository = new CtwaInsightsRepository(db);

  const authService = new AuthService({
    userRepository,
    passwordResetTokenRepository,
    db,
    jwt: app.jwt,
    logger: app.log,
  });

  // The remaining repos referenced by AdsService (audience presets, contacts,
  // business accounts, automation flows) are not wired yet — the service
  // tolerates them being undefined and falls back gracefully. Add them here
  // when those subsystems land.
  const adsService = new AdsService({
    metaAdAccountRepository,
    ctwaCampaignRepository,
    ctwaInsightsRepository,
    ctwaConversationRepository,
    ctwaConversionRepository,
    audiencePresetRepository: null,
    contactRepository: null,
    businessAccountRepository: null,
    automationFlowRepository: null,
    logger: app.log,
  });

  const adsController = new AdsController(adsService, app.log);
  const creativeService = new CreativeService({ logger: app.log });

  // Live-fetch analytics service (no DB cache). Reuses the metaAdAccountRepo
  // for token + account lookup, and the CTWA conversation repo to layer
  // referral-source breakdowns alongside Meta-fetched metrics.
  const analyticsService = new AnalyticsService({
    metaAdAccountRepository,
    ctwaConversationRepository,
    logger: app.log,
  });

  // Instagram Business Login pipeline (separate from Ads OAuth).
  const instagramAccountRepository = new InstagramAccountRepository(db);
  const instagramApiService = new InstagramApiService({ logger: app.log });
  const instagramOAuthService = new InstagramOAuthService({
    logger: app.log,
    repository: instagramAccountRepository,
    apiService: instagramApiService,
  });
  const instagramOAuthController = new InstagramOAuthController(
    instagramOAuthService,
    app.log,
  );

  app.decorate('db', db);
  app.decorate('userRepository', userRepository);
  app.decorate('authService', authService);
  app.decorate('adsService', adsService);
  app.decorate('adsController', adsController);
  app.decorate('analyticsService', analyticsService);
  app.decorate('creativeService', creativeService);
  app.decorate('instagramAccountRepository', instagramAccountRepository);
  app.decorate('instagramOAuthController', instagramOAuthController);
}

export default fp(plugin, { name: 'di', dependencies: ['auth'] });
