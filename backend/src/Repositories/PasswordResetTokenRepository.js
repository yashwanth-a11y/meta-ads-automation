import { eq, and, isNull, gt, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { passwordResetTokens } from '../db/schema.js';

export class PasswordResetTokenRepository {
  constructor(db) {
    this.db = db;
  }

  async create({ user_id, token_hash, expires_at }) {
    const id = uuidv4();
    await this.db.insert(passwordResetTokens).values({
      id,
      user_id,
      token_hash,
      expires_at,
    });
    return id;
  }

  // Lookup by hash + must be unused + must not be expired. Returns the row or null.
  async findValidByHash(token_hash, now = new Date()) {
    const [row] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.token_hash, token_hash),
          isNull(passwordResetTokens.used_at),
          gt(passwordResetTokens.expires_at, now),
        ),
      )
      .limit(1);
    return row || null;
  }

  async markUsed(id) {
    await this.db
      .update(passwordResetTokens)
      .set({ used_at: new Date() })
      .where(eq(passwordResetTokens.id, id));
  }

  // Soft-revoke any other still-valid tokens for this user. Called when a new
  // reset is requested so the latest link is the only working one.
  async invalidateUserTokens(user_id, now = new Date()) {
    await this.db
      .update(passwordResetTokens)
      .set({ used_at: now })
      .where(
        and(
          eq(passwordResetTokens.user_id, user_id),
          isNull(passwordResetTokens.used_at),
        ),
      );
  }

  // Best-effort cleanup of expired rows (call from a cron later if needed).
  async deleteExpired(now = new Date()) {
    await this.db
      .delete(passwordResetTokens)
      .where(sql`${passwordResetTokens.expires_at} < ${now}`);
  }
}
