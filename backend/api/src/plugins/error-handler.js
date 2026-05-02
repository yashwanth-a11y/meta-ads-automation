import fp from 'fastify-plugin';
import { AppError } from '../lib/errors.js';

async function plugin(app) {
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof AppError) {
      request.log.warn({ err, code: err.code }, 'app error');
      return reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, details: err.details },
      });
    }

    if (err.validation) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: err.message, details: err.validation },
      });
    }

    if (err.statusCode && err.statusCode < 500) {
      request.log.warn({ err }, 'client error');
      return reply.status(err.statusCode).send({
        error: { code: err.code || 'CLIENT_ERROR', message: err.message },
      });
    }

    request.log.error({ err }, 'unhandled error');
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` },
    });
  });
}

export default fp(plugin, { name: 'error-handler' });
