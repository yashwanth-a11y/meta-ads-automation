import { notImplemented, forbidden } from '../../lib/errors.js';
import { env } from '../../config/env.js';

// Trim leading/trailing whitespace on every string field in the body so
// '  Alice@Example.com  ' is normalized BEFORE Ajv's `format: email` rejects
// it. Runs as a per-route preValidation hook, scoped to this plugin only.
function trimStringsInBody(request, _reply, done) {
  const body = request.body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const k of Object.keys(body)) {
      if (typeof body[k] === 'string') body[k] = body[k].trim();
    }
  }
  done();
}

export default async function routes(app) {
  // Apply the trim hook to every route in this plugin (auth only).
  app.addHook('preValidation', trimStringsInBody);

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

  // --- Forgot password ---
  // Always returns 200 with a generic message — no email-existence enumeration.
  // 5 requests per minute per IP. Sends a reset link by email (TODO: wire
  // email provider) AND logs it. In development the response also includes
  // the raw token + link so the FE can complete the flow without email.
  app.post(
    '/forgot-password',
    {
      config: {
        rateLimit: { max: 5, timeWindow: '1 minute' },
      },
      schema: {
        description: 'Request a password reset link. Always returns 200.',
        body: {
          type: 'object',
          required: ['email'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', format: 'email', maxLength: 255 },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await app.authService.forgotPassword(request.body);
      return reply.send(result);
    },
  );

  // --- Reset password ---
  // Consumes a reset token issued by /forgot-password, sets a new password,
  // marks the token used (single-use), and returns a fresh JWT (auto-login).
  app.post(
    '/reset-password',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
      schema: {
        description: 'Set a new password using a token from /forgot-password.',
        body: {
          type: 'object',
          required: ['token', 'password', 'confirm_password'],
          additionalProperties: false,
          properties: {
            token: { type: 'string', minLength: 32, maxLength: 256 },
            password: { type: 'string', minLength: 8, maxLength: 200 },
            confirm_password: { type: 'string', minLength: 8, maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await app.authService.resetPassword(request.body);
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

  app.put(
    '/me',
    {
      preHandler: app.requireAuth,
      schema: {
        description: 'Update the authenticated user profile.',
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            first_name: { type: 'string', minLength: 1, maxLength: 100 },
            last_name: { type: 'string', minLength: 1, maxLength: 100 },
            phone: { type: 'string', minLength: 6, maxLength: 20 },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await app.authService.updateProfile(request.user.id, request.body);
      return reply.send({ success: true, data: { user: result } });
    },
  );

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
