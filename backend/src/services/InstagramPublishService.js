import { decryptToken } from '../utils/encryption.js';
import { badRequest, notFound } from '../lib/errors.js';
import { env } from '../config/env.js';

// IG-direct tokens (minted by Instagram Business Login) only validate against
// graph.instagram.com — sending them to graph.facebook.com (PublishingService's
// default) yields IG_190 "Cannot parse access token". Patch the host alongside
// the token swap below.
const IG_GRAPH_API_BASE = `${env.INSTAGRAM_GRAPH_API_BASE_URL}/${env.INSTAGRAM_API_VERSION}`;

// Thin orchestration wrapper over PublishingService.publishMedia for direct
// posting from the dashboard. Differences from PublishingService.publishBundle:
//   - takes an instagram_account_id (not a creative bundle id)
//   - uses the Instagram account row's own decrypted long-lived token
//     (NOT the meta_ad_accounts page token), since the user authenticated
//     each IG account through the Business Login flow
//   - does not touch creative_bundles
//   - cleans up uploaded files after publish completes (success or failure)
//
// publishMedia spec validation, container creation, polling, and the
// /media_publish call all live in PublishingService — this class is glue.

export class InstagramPublishService {
  constructor({ logger, instagramAccountRepository, publishingService, uploadService }) {
    this.logger = logger;
    this.repository = instagramAccountRepository;
    this.publishingService = publishingService;
    this.uploadService = uploadService;
  }

  // Publish a media spec to a specific IG account. `spec` shape matches
  // PublishingService MediaSpec — see that file's JSDoc. `cleanupPaths` is an
  // optional list of stored-path tokens (from upload service) to delete after
  // the publish call returns.
  async publishToAccount({ organizationId, accountId, spec, cleanupPaths = [] }) {
    if (!organizationId) throw badRequest('organizationId required');
    if (!accountId) throw badRequest('accountId required');

    const account = await this.repository.findById(accountId);
    if (!account || account.organization_id !== organizationId) {
      throw notFound('Instagram account not found');
    }
    if (!account.is_active) {
      throw badRequest('Instagram account is not active — reconnect to publish.');
    }
    if (!account.access_token_encrypted) {
      throw badRequest('Instagram account has no token on file — reconnect.');
    }

    const token = decryptToken(account.access_token_encrypted, 'instagram');

    // PublishingService.publishMedia reads its token via _getPageToken and
    // its API host via _apiBase. Default token comes from meta_ad_accounts
    // and default host is graph.facebook.com — both wrong for an IG-direct
    // token. We patch both for the duration of this single call. Same trick
    // publishBundle's fan-out path uses for the token swap; here we extend
    // it to the host so IG-direct tokens validate.
    const publisher = this.publishingService;
    const originalToken = publisher._getPageToken;
    const originalApiBase = publisher._apiBase;
    publisher._getPageToken = async () => token;
    publisher._apiBase = IG_GRAPH_API_BASE;

    const channelStub = {
      id: null,
      organization_id: organizationId,
      instagram_account_id: account.ig_business_id,
    };

    try {
      const result = await publisher.publishMedia(channelStub, spec);
      this.logger?.info?.({
        message: '[InstagramPublish] Published',
        accountId,
        ig_username: account.ig_username,
        type: spec.type,
        mediaId: result.mediaId,
      });
      return {
        media_id: result.mediaId,
        container_id: result.containerId,
        type: spec.type,
        ig_username: account.ig_username,
        ig_business_id: account.ig_business_id,
        published_at: new Date().toISOString(),
      };
    } finally {
      publisher._getPageToken = originalToken;
      publisher._apiBase = originalApiBase;
      // Always clean up uploaded temp files — IG has the bytes by now (on
      // success) or we don't want orphans (on failure). Errors swallowed
      // so a stale file never breaks the publish response.
      if (this.uploadService && cleanupPaths.length) {
        for (const p of cleanupPaths) {
          await this.uploadService.delete(p).catch(() => {});
        }
      }
    }
  }
}
