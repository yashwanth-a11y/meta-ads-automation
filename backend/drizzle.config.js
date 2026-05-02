import 'dotenv/config';

const dbCredentials = process.env.DATABASE_URL
  ? { url: process.env.DATABASE_URL, ssl: process.env.DB_SSL === 'true' }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'Automation_Meta_Ads',
      ssl: process.env.DB_SSL === 'true',
    };

/** @type {import('drizzle-kit').Config} */
export default {
  schema: './src/db/schema.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials,
  verbose: true,
  strict: true,
};
