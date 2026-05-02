import { eq, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { users } from '../db/schema.js';

export class UserRepository {
  constructor(db) {
    this.db = db;
  }

  async create({ first_name, last_name, email, phone, password_hash }) {
    const id = uuidv4();
    await this.db.insert(users).values({
      id,
      first_name,
      last_name,
      email: email.toLowerCase(),
      phone,
      password_hash,
    });
    return this.findById(id);
  }

  async findById(id) {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row || null;
  }

  // Case-insensitive lookup. We always store lowercased, but compare with
  // lower() on both sides so an upgrade that introduces mixed-case rows still
  // resolves correctly.
  async findByEmail(email) {
    const [row] = await this.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`)
      .limit(1);
    return row || null;
  }

  async updateLastLogin(id) {
    await this.db
      .update(users)
      .set({ last_login_at: new Date() })
      .where(eq(users.id, id));
  }
}
