import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { AppError } from '../lib/errors.js';
import { sendEmail, buildPasswordResetEmail } from '../lib/email.js';
import { env } from '../config/env.js';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema.js';

const BCRYPT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// E.164: '+' then country digit (1-9) then up to 14 more digits.
const PHONE_RE = /^\+[1-9]\d{1,14}$/;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const RESET_GENERIC_RESPONSE = {
  success: true,
  message:
    'If an account exists for this email, a password reset link has been sent.',
};

function strip(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user;
  return rest;
}

export class AuthService {
  /**
   * @param {object} deps
   * @param {import('../Repositories/UserRepository.js').UserRepository} deps.userRepository
   * @param {import('../Repositories/PasswordResetTokenRepository.js').PasswordResetTokenRepository} [deps.passwordResetTokenRepository]
   * @param {object} [deps.db]  Drizzle instance, used for direct user updates on password reset
   * @param {{ sign: (payload, opts?) => Promise<string> }} deps.jwt  Fastify's app.jwt
   * @param {object} deps.logger
   */
  constructor({ userRepository, passwordResetTokenRepository, db, jwt, logger }) {
    this.userRepo = userRepository;
    this.resetRepo = passwordResetTokenRepository;
    this.db = db;
    this.jwt = jwt;
    this.logger = logger;
  }

  // --- Validation helpers ---

  // Normalize before validating + storing. Returns a shallow-cleaned copy.
  // Trim everything; lowercase the email (phone stays as-is post-trim).
  _normalizeSignup(payload) {
    return {
      first_name: typeof payload.first_name === 'string' ? payload.first_name.trim() : payload.first_name,
      last_name: typeof payload.last_name === 'string' ? payload.last_name.trim() : payload.last_name,
      email: typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : payload.email,
      phone: typeof payload.phone === 'string' ? payload.phone.trim() : payload.phone,
      password: payload.password,
      confirm_password: payload.confirm_password,
    };
  }

  _validateSignup({ first_name, last_name, email, phone, password, confirm_password }) {
    if (!first_name || !last_name) {
      throw new AppError('First name and last name are required', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 255) {
      throw new AppError('Invalid email address', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }
    if (typeof phone !== 'string' || !PHONE_RE.test(phone)) {
      throw new AppError(
        'Phone must be in E.164 format (e.g., +14155552671)',
        { statusCode: 400, code: 'INVALID_PHONE' },
      );
    }
    if (password !== confirm_password) {
      throw new AppError('Passwords do not match', {
        statusCode: 400,
        code: 'PASSWORD_MISMATCH',
      });
    }
    if (typeof password !== 'string' || password.length < 8) {
      throw new AppError('Password must be at least 8 characters', {
        statusCode: 400,
        code: 'WEAK_PASSWORD',
      });
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new AppError('Password must contain at least one letter and one digit', {
        statusCode: 400,
        code: 'WEAK_PASSWORD',
      });
    }
  }

  // Postgres unique-violation translator. Maps the constraint name to a
  // clean app error so a race condition between findByEmail/findByPhone and
  // the actual INSERT still surfaces as EMAIL_TAKEN / PHONE_TAKEN.
  _translateUniqueViolation(err) {
    if (err?.code !== '23505') return err;
    const constraint = err.constraint || '';
    if (constraint.includes('email')) {
      return new AppError('An account with this email already exists', {
        statusCode: 409,
        code: 'EMAIL_TAKEN',
      });
    }
    if (constraint.includes('phone')) {
      return new AppError('An account with this phone number already exists', {
        statusCode: 409,
        code: 'PHONE_TAKEN',
      });
    }
    // Unknown unique constraint — surface generically.
    return new AppError('Duplicate value', { statusCode: 409, code: 'CONFLICT' });
  }

  // --- JWT issuance ---
  // organization_id mirrors user.id so the existing Meta Ads code (which
  // scopes everything by organization_id) works without changes.
  async _issueToken(user) {
    return this.jwt.sign({
      id: user.id,
      organization_id: user.id,
      tenantId: user.id,
      email: user.email,
      role: 'owner',
    });
  }

  // --- Public API ---

  async signup(payload) {
    const clean = this._normalizeSignup(payload);
    this._validateSignup(clean);

    // Pre-flight uniqueness checks — friendly errors when we can detect
    // the conflict cheaply. The DB unique constraints below are the
    // authoritative guard against races.
    if (await this.userRepo.findByEmail(clean.email)) {
      throw new AppError('An account with this email already exists', {
        statusCode: 409,
        code: 'EMAIL_TAKEN',
      });
    }
    if (await this.userRepo.findByPhone(clean.phone)) {
      throw new AppError('An account with this phone number already exists', {
        statusCode: 409,
        code: 'PHONE_TAKEN',
      });
    }

    const password_hash = await bcrypt.hash(clean.password, BCRYPT_ROUNDS);

    let user;
    try {
      user = await this.userRepo.create({
        first_name: clean.first_name,
        last_name: clean.last_name,
        email: clean.email,
        phone: clean.phone,
        password_hash,
      });
    } catch (err) {
      throw this._translateUniqueViolation(err);
    }

    const token = await this._issueToken(user);
    this.logger?.info({ user_id: user.id, email: user.email }, 'auth.signup');
    return { user: strip(user), token };
  }

  async login({ email, password }) {
    // Generic error for both "no such user" and "wrong password" so an
    // attacker can't enumerate registered emails.
    const invalid = new AppError('Invalid email or password', {
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });

    if (typeof email !== 'string' || typeof password !== 'string') throw invalid;
    const cleanEmail = email.trim().toLowerCase();

    const user = await this.userRepo.findByEmail(cleanEmail);
    if (!user) {
      // Compare a fixed-length dummy hash anyway to keep response time roughly
      // constant whether the email exists or not (timing-side-channel guard).
      await bcrypt.compare(password, '$2a$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN1234567890.uK2');
      throw invalid;
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw invalid;

    const now = new Date();
    await this.userRepo.updateLastLogin(user.id);
    user.last_login_at = now; // keep response in sync with the row we just wrote
    const token = await this._issueToken(user);
    this.logger?.info({ user_id: user.id, email: user.email }, 'auth.login');
    return { user: strip(user), token };
  }

  async updateProfile(userId, payload) {
    const clean = {
      first_name: typeof payload.first_name === 'string' ? payload.first_name.trim() : undefined,
      last_name: typeof payload.last_name === 'string' ? payload.last_name.trim() : undefined,
      phone: typeof payload.phone === 'string' ? payload.phone.trim() : undefined,
    };

    if (userId === 'usr_dev_local') {
      // Mock update for local dev token immediately to prevent any DB errors
      return {
        id: userId,
        first_name: clean.first_name || 'Dev',
        last_name: clean.last_name || 'User',
        email: 'dev@growthos.local',
        phone: clean.phone || '+15555555555',
      };
    }

    if (clean.phone && !PHONE_RE.test(clean.phone)) {
      throw new AppError(
        'Phone must be in E.164 format (e.g., +14155552671)',
        { statusCode: 400, code: 'INVALID_PHONE' },
      );
    }

    if (clean.phone) {
      const existing = await this.userRepo.findByPhone(clean.phone);
      if (existing && existing.id !== userId) {
        throw new AppError('An account with this phone number already exists', {
          statusCode: 409,
          code: 'PHONE_TAKEN',
        });
      }
    }

    const updates = {};
    if (clean.first_name) updates.first_name = clean.first_name;
    if (clean.last_name) updates.last_name = clean.last_name;
    if (clean.phone) updates.phone = clean.phone;
    updates.updated_at = new Date();

    if (Object.keys(updates).length > 1) { // more than just updated_at
      await this.db.update(users).set(updates).where(eq(users.id, userId));
    }

    const user = await this.userRepo.findById(userId);
    return strip(user);
  }

  // --- Password reset ---

  _hashResetToken(raw) {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  _resetLink(token) {
    // First entry of CORS_ORIGINS is treated as the canonical frontend URL.
    const base = env.CORS_ORIGINS?.[0] || 'http://localhost:5173';
    return `${base.replace(/\/+$/, '')}/reset-password?token=${token}`;
  }

  /**
   * Always returns the same generic success body — even if the email is
   * unknown — so an attacker cannot probe which addresses are registered.
   * In development we additionally surface the raw token + link in the
   * response (and the logs) so the frontend can complete the flow without
   * an email provider being wired.
   */
  async forgotPassword({ email }) {
    if (typeof email !== 'string') {
      throw new AppError('Invalid email address', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) {
      throw new AppError('Invalid email address', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    const user = await this.userRepo.findByEmail(cleanEmail);
    if (!user || !this.resetRepo) {
      this.logger?.info({ email: cleanEmail }, 'auth.forgotPassword (no user or repo missing — no-op)');
      return { ...RESET_GENERIC_RESPONSE };
    }

    // Invalidate any older still-valid tokens — only the latest link works.
    await this.resetRepo.invalidateUserTokens(user.id);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this._hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await this.resetRepo.create({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    const link = this._resetLink(rawToken);
    const { subject, html, text } = buildPasswordResetEmail({
      resetLink: link,
      expiresAt,
    });

    let emailSkipped = false;
    try {
      const result = await sendEmail({ to: user.email, subject, html, text });
      emailSkipped = Boolean(result?.skipped);
      this.logger?.info(
        { user_id: user.id, email: user.email, skipped: emailSkipped },
        emailSkipped
          ? 'auth.forgotPassword reset link generated (email skipped — BREVO_API_KEY missing)'
          : 'auth.forgotPassword reset link emailed',
      );
    } catch (err) {
      // Don't leak send failures to the caller — keep the generic response so
      // we can't be used to probe email infra. Log loudly so ops can notice.
      this.logger?.error(
        { err, user_id: user.id, email: user.email },
        'auth.forgotPassword failed to send reset email',
      );
      emailSkipped = true;
    }

    if (env.NODE_ENV === 'production' || !emailSkipped) {
      return { ...RESET_GENERIC_RESPONSE };
    }
    // Non-prod fallback: when no email actually went out, surface the link so
    // dev can still complete the flow without an inbox.
    return {
      ...RESET_GENERIC_RESPONSE,
      dev_only: {
        warning: 'Email was not sent (provider not configured or send failed). Hidden in production.',
        reset_token: rawToken,
        reset_link: link,
        expires_at: expiresAt.toISOString(),
      },
    };
  }

  /**
   * Validate the reset token, set a new password, mark the token used, and
   * issue a fresh JWT (auto-login). Same password rules as signup.
   */
  async resetPassword({ token, password, confirm_password }) {
    if (typeof token !== 'string' || token.length < 32) {
      throw new AppError('Invalid or expired reset link', {
        statusCode: 400,
        code: 'INVALID_RESET_TOKEN',
      });
    }
    if (password !== confirm_password) {
      throw new AppError('Passwords do not match', {
        statusCode: 400,
        code: 'PASSWORD_MISMATCH',
      });
    }
    if (typeof password !== 'string' || password.length < 8) {
      throw new AppError('Password must be at least 8 characters', {
        statusCode: 400,
        code: 'WEAK_PASSWORD',
      });
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new AppError('Password must contain at least one letter and one digit', {
        statusCode: 400,
        code: 'WEAK_PASSWORD',
      });
    }

    if (!this.resetRepo) {
      throw new AppError('Password reset is not available', {
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
      });
    }

    const tokenHash = this._hashResetToken(token);
    const row = await this.resetRepo.findValidByHash(tokenHash);
    if (!row) {
      throw new AppError('Invalid or expired reset link', {
        statusCode: 400,
        code: 'INVALID_RESET_TOKEN',
      });
    }

    const user = await this.userRepo.findById(row.user_id);
    if (!user) {
      // User was deleted between issuance and use — treat as invalid.
      await this.resetRepo.markUsed(row.id);
      throw new AppError('Invalid or expired reset link', {
        statusCode: 400,
        code: 'INVALID_RESET_TOKEN',
      });
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.db.update(users).set({ password_hash }).where(eq(users.id, user.id));
    await this.resetRepo.markUsed(row.id);

    user.password_hash = password_hash; // not returned, but keep struct clean
    const now = new Date();
    await this.userRepo.updateLastLogin(user.id);
    user.last_login_at = now;

    const jwtToken = await this._issueToken(user);
    this.logger?.info({ user_id: user.id, email: user.email }, 'auth.resetPassword');
    return { user: strip(user), token: jwtToken };
  }
}
