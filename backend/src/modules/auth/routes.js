import { notImplemented, forbidden } from '../../lib/errors.js';
import { env } from '../../config/env.js';

export default async function routes(app) {
  // --- Signup ---
  // Schema validation runs first (Fastify Ajv): if email is missing/malformed,
  // password is too short, etc., we return 400 VALIDATION_ERROR via the global
  // error handler before any service code runs. The service then layers on
  // semantic checks (email taken, password mismatch, weak password, bad phone).
  app.post(
    '/signup',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
      schema: {
        description: 'Create a new user account and return a JWT.',
        body: {
          type: 'object',
          required: ['first_name', 'last_name', 'email', 'phone', 'password', 'confirm_password'],
          additionalProperties: false,
          properties: {
            first_name: { type: 'string', minLength: 1, maxLength: 100 },
            last_name: { type: 'string', minLength: 1, maxLength: 100 },
            email: { type: 'string', format: 'email', maxLength: 255 },
            phone: { type: 'string', minLength: 6, maxLength: 20 },
            password: { type: 'string', minLength: 8, maxLength: 200 },
            confirm_password: { type: 'string', minLength: 8, maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await app.authService.signup(request.body);
      return reply.code(201).send({ success: true, data: result });
    },
  );

  // --- Login ---
  // 5 attempts per minute per IP. Failures and successes both count.
  app.post(
    '/login',
    {
      config: {
        rateLimit: { max: 5, timeWindow: '1 minute' },
      },
      schema: {
        description: 'Exchange email + password for a JWT.',
        body: {
          type: 'object',
          required: ['email', 'password'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', format: 'email', maxLength: 255 },
            password: { type: 'string', minLength: 1, maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await app.authService.login(request.body);
      return reply.send({ success: true, data: result });
    },
  );

  // Stateless JWT — server-side logout is a no-op. (Add a token blocklist
  // table if you need real revocation later.)
  app.post('/logout', async (_request, reply) => {
    return reply.send({ success: true, message: 'logged out' });
  });

  app.post('/refresh', async () => {
    throw notImplemented('auth.refresh');
  });

  app.get('/me', { preHandler: app.requireAuth }, async (request) => ({
    success: true,
    data: { user: request.user ?? null },
  }));

  // --- Dev-only: mint a JWT bound to a test user. Useful for hitting
  // protected routes from curl/Postman without going through signup.
  app.post(
    '/dev-token',
    {
      schema: {
        description: 'Mint a JWT for local development. 403 outside dev.',
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            organization_id: { type: 'string' },
            user_id: { type: 'string' },
            email: { type: 'string' },
            expires_in: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      if (env.NODE_ENV !== 'development') {
        throw forbidden('dev-token endpoint disabled outside development');
      }
      const body = request.body ?? {};
      const id = body.user_id || 'usr_dev_local';
      const organization_id = body.organization_id || id;
      const email = body.email || 'dev@growthos.local';
      const payload = { id, organization_id, tenantId: organization_id, email };
      const token = await app.jwt.sign(
        payload,
        body.expires_in ? { expiresIn: body.expires_in } : undefined,
      );
      return { token, payload, hint: "Send as 'Authorization: Bearer <token>'" };
    },
  );
}
