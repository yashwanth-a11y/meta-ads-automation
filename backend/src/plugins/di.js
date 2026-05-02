import fp from 'fastify-plugin';
import { db } from '../db/index.js';
import { MetaAdAccountRepository } from '../Repositories/MetaAdAccountRepository.js';
import { CtwaCampaignRepository } from '../Repositories/CtwaCampaignRepository.js';
import { CtwaConversationRepository } from '../Repositories/CtwaConversationRepository.js';
import { CtwaConversionRepository } from '../Repositories/CtwaConversionRepository.js';
import { CtwaInsightsRepository } from '../Repositories/CtwaInsightsRepository.js';
import { AdsService } from '../services/AdsService.js';
import { AdsController } from '../Controllers/AdsController.js';
import { CreativeService } from '../services/CreativeService.js';

// Build the DI graph for the Meta Ads slice and decorate the Fastify instance.
// Keep this file as the *only* place that knows how the pieces are wired
// together — routes only ever call `fastify.adsController`.
async function plugin(app) {
  const metaAdAccountRepository = new MetaAdAccountRepository(db);
  const ctwaCampaignRepository = new CtwaCampaignRepository(db);
  const ctwaConversationRepository = new CtwaConversationRepository(db);
  const ctwaConversionRepository = new CtwaConversionRepository(db);
  const ctwaInsightsRepository = new CtwaInsightsRepository(db);

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

  app.decorate('db', db);
  app.decorate('adsService', adsService);
  app.decorate('adsController', adsController);
  app.decorate('creativeService', creativeService);
}

export default fp(plugin, { name: 'di', dependencies: ['auth'] });
