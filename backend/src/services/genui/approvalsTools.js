// ─── Approvals tool implementations ───────────────────────────────────────────
import { desc, eq, and, isNull, gt } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { approvals, creativeBundles } from '../../db/schema.js';

export async function getPendingApprovals({ limit = 10 } = {}, orgId) {
  const now = new Date();

  const rows = await db
    .select({
      id: approvals.id,
      creative_bundle_id: approvals.creative_bundle_id,
      approver_email: approvals.approver_email,
      stage: approvals.stage,
      action: approvals.action,
      action_taken_at: approvals.action_taken_at,
      expires_at: approvals.expires_at,
      reminder_sent_at: approvals.reminder_sent_at,
      created_at: approvals.created_at,
    })
    .from(approvals)
    .where(and(
      eq(approvals.organization_id, orgId),
      isNull(approvals.action_taken_at),
      gt(approvals.expires_at, now),
    ))
    .orderBy(desc(approvals.created_at))
    .limit(Math.min(Number(limit) || 10, 20));

  if (!rows.length) {
    return { raw: [], eventType: 'stat', payload: [{ label: 'Pending Approvals', value: '0', delta: 'No approvals waiting — all clear!' }] };
  }

  // Fetch bundle hooks for context
  const bundleIds = rows.map((r) => r.creative_bundle_id).filter(Boolean);
  const bundleMap = {};
  if (bundleIds.length) {
    const bundles = await db
      .select({ id: creativeBundles.id, hook: creativeBundles.hook, content_type: creativeBundles.content_type })
      .from(creativeBundles)
      .where(eq(creativeBundles.organization_id, orgId));
    bundles.forEach((b) => { bundleMap[b.id] = b; });
  }

  const statItems = [
    { label: 'Pending Approvals', value: String(rows.length), delta: 'Awaiting reviewer action' },
    ...rows.slice(0, 8).map((r) => {
      const bundle = bundleMap[r.creative_bundle_id];
      const daysLeft = Math.ceil((new Date(r.expires_at).getTime() - Date.now()) / 86400000);
      return {
        label: bundle?.hook ? (bundle.hook.length > 50 ? bundle.hook.slice(0, 47) + '…' : bundle.hook) : `${r.stage} review`,
        value: r.approver_email ?? 'Pending reviewer',
        delta: `Stage: ${r.stage} · Expires in ${daysLeft}d${r.reminder_sent_at ? ' · Reminder sent' : ''}`,
      };
    }),
  ];

  return { raw: rows, eventType: 'stat', payload: statItems };
}

// Mutating — surface action buttons only
export async function approveContent(_input, _orgId) {
  return { raw: { queued: true }, eventType: null, payload: null };
}

export async function rejectContent(_input, _orgId) {
  return { raw: { queued: true }, eventType: null, payload: null };
}

export async function sendApprovalReminder(_input, _orgId) {
  return { raw: { queued: true }, eventType: null, payload: null };
}
