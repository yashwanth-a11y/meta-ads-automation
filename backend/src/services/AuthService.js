import bcrypt from 'bcryptjs';
import { AppError } from '../lib/errors.js';

const BCRYPT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// E.164: '+' then country digit (1-9) then up to 14 more digits.
const PHONE_RE = /^\+[1-9]\d{1,14}$/;

function strip(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user;
  return rest;
}

export class AuthService {
  /**
   * @param {object} deps
   * @param {import('../Repositories/UserRepository.js').UserRepository} deps.userRepository
   * @param {{ sign: (payload, opts?) => Promise<string> }} deps.jwt  Fastify's app.jwt
   * @param {object} deps.logger
   */
  constructor({ userRepository, jwt, logger }) {
    this.userRepo = userRepository;
    this.jwt = jwt;
    this.logger = logger;
  }

  // --- Validation helpers ---

  _validateSignup({ first_name, last_name, email, phone, password, confirm_password }) {
    if (!first_name?.trim() || !last_name?.trim()) {
      throw new AppError('First name and last name are required', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
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
    this._validateSignup(payload);

    const existing = await this.userRepo.findByEmail(payload.email);
    if (existing) {
      throw new AppError('An account with this email already exists', {
        statusCode: 409,
        code: 'EMAIL_TAKEN',
      });
    }

    const password_hash = await bcrypt.hash(payload.password, BCRYPT_ROUNDS);
    const user = await this.userRepo.create({
      first_name: payload.first_name.trim(),
      last_name: payload.last_name.trim(),
      email: payload.email,
      phone: payload.phone,
      password_hash,
    });

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

    const user = await this.userRepo.findByEmail(email);
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
}
