// Dev-only helper: prints the decrypted Meta access token for the active
// ad account of an organization. Use only on your own dev machine for
// debugging — never commit the token, never expose this as an HTTP endpoint.
//
//   node scripts/dump-meta-token.js <organization_id>
//
// Tip: organization_id == users.id (each user is their own org). Grab it
// from the JWT payload your frontend already stores in localStorage,
// or from a recent campaigns row's organization_id.

import 'dotenv/config';
import { db } from '../src/db/index.js';
import { metaAdAccounts } from '../src/db/schema.js';
import { decryptToken } from '../src/utils/encryption.js';
import { and, eq } from 'drizzle-orm';

const orgId = process.argv[2];
if (!orgId) {
  console.error('Usage: node scripts/dump-meta-token.js <organization_id>');
  process.exit(1);
}

const [row] = await db
  .select()
  .from(metaAdAccounts)
  .where(and(eq(metaAdAccounts.organization_id, orgId), eq(metaAdAccounts.status, 'active')))
  .limit(1);

if (!row) {
  console.error(`No active Meta ad account for org ${orgId}`);
  process.exit(1);
}

const token = decryptToken(row.access_token_encrypted);
console.log(JSON.stringify(
  {
    ad_account_id: row.ad_account_id,
    ad_account_name: row.ad_account_name,
    page_id: row.page_id,
    currency: row.currency,
    access_token: token,
  },
  null,
  2,
));
process.exit(0);
