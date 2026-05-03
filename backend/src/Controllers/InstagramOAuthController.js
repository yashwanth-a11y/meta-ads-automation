export class InstagramOAuthController {
  constructor(instagramOAuthService, logger) {
    this.service = instagramOAuthService;
    this.logger = logger;
  }

  async getAuthUrl(request, reply) {
    try {
      const result = this.service.generateAuthUrl({
        origin: request.query?.origin,
        referer: request.headers['referer'],
        forwardedHost: request.headers['x-forwarded-host'],
        forwardedProto: request.headers['x-forwarded-proto'],
      });
      return { success: true, data: result };
    } catch (err) {
      this.logger.error({ message: 'Error generating Instagram OAuth URL', err: err.message });
      return reply.status(500).send({
        success: false,
        error: 'Failed to generate authorization URL',
      });
    }
  }

  async exchangeToken(request, reply) {
    try {
      const { code, redirect_uri } = request.body;
      const result = await this.service.connectAccount(
        code,
        redirect_uri,
        request.user,
        request.headers,
      );
      return { success: true, data: result };
    } catch (err) {
      this.logger.error({
        message: 'Error exchanging Instagram OAuth token',
        err: err.message,
        metaErr: err.response?.data || null,
      });
      const status = Number.isInteger(err.statusCode) ? err.statusCode : 500;
      return reply.status(status).send({
        success: false,
        error: err.message || 'Failed to connect Instagram account',
        code: err.code,
      });
    }
  }

  async getAccounts(request, reply) {
    try {
      const accounts = await this.service.getAccounts(request.user.organization_id);
      return { success: true, data: accounts };
    } catch (err) {
      this.logger.error({ message: 'Error fetching Instagram accounts', err: err.message });
      return reply.status(500).send({ success: false, error: 'Failed to fetch accounts' });
    }
  }

  async getAccount(request, reply) {
    try {
      const out = await this.service.getAccountDetails(
        request.user.organization_id,
        request.params.accountId,
      );
      return { success: true, data: out };
    } catch (err) {
      const status = err.statusCode === 404 ? 404 : 500;
      return reply.status(status).send({ success: false, error: err.message });
    }
  }

  async disconnectAccount(request, reply) {
    try {
      await this.service.disconnectAccount(
        request.user.organization_id,
        request.params.accountId,
      );
      return { success: true, message: 'Instagram account disconnected' };
    } catch (err) {
      const status = err.statusCode === 404 ? 404 : 500;
      return reply.status(status).send({ success: false, error: err.message });
    }
  }

  async refreshAccount(request, reply) {
    try {
      await this.service.refreshAccount(
        request.user.organization_id,
        request.params.accountId,
      );
      return { success: true, message: 'Account refreshed' };
    } catch (err) {
      const status = err.statusCode === 404 ? 404 : 500;
      return reply.status(status).send({ success: false, error: err.message });
    }
  }

  async getMedia(request, reply) {
    try {
      const { limit, after } = request.query || {};
      const out = await this.service.getMedia(
        request.user.organization_id,
        request.params.accountId,
        {
          limit: limit ? parseInt(limit, 10) : undefined,
          after,
        },
      );
      return { success: true, data: out };
    } catch (err) {
      const status = err.statusCode === 404 ? 404 : 500;
      this.logger.error({ message: 'Error fetching Instagram media', err: err.message });
      return reply.status(status).send({
        success: false,
        error: err.message || 'Failed to fetch media',
      });
    }
  }

  async getMediaInsights(request, reply) {
    try {
      const { mediaType, mediaProductType } = request.query || {};
      const out = await this.service.getMediaInsights(
        request.user.organization_id,
        request.params.accountId,
        request.params.mediaId,
        { mediaType, mediaProductType },
      );
      return { success: true, data: out };
    } catch (err) {
      // IG Graph API error → surface its message; mark as 400 so the client
      // can show "Insights unavailable" without a 500-style retry banner.
      const igError = err.response?.data?.error;
      if (igError) {
        this.logger.warn({
          message: 'Instagram insights API rejected request',
          mediaId: request.params.mediaId,
          igError,
        });
        return reply.status(400).send({
          success: false,
          error: igError.message || 'Insights unavailable for this post',
          code: igError.code ? `IG_${igError.code}` : 'IG_INSIGHTS_UNAVAILABLE',
        });
      }
      const status = err.statusCode === 404 ? 404 : 500;
      this.logger.error({ message: 'Error fetching Instagram media insights', err: err.message });
      return reply.status(status).send({
        success: false,
        error: err.message || 'Failed to fetch insights',
      });
    }
  }

  async linkChannel(request, reply) {
    try {
      const { channel_id } = request.body;
      if (!channel_id) {
        return reply.status(400).send({ success: false, error: 'channel_id is required' });
      }
      await this.service.linkChannel(
        request.user.organization_id,
        request.params.accountId,
        channel_id,
      );
      return { success: true };
    } catch (err) {
      const status = err.statusCode || 500;
      return reply.status(status).send({ success: false, error: err.message });
    }
  }

  async unlinkChannel(request, reply) {
    try {
      await this.service.unlinkChannel(
        request.user.organization_id,
        request.params.accountId,
        request.params.channelId,
      );
      return { success: true };
    } catch (err) {
      const status = err.statusCode || 500;
      return reply.status(status).send({ success: false, error: err.message });
    }
  }
}
