// ─── Audience preset tool implementations ────────────────────────────────────
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { audiencePresets } from '../../db/schema.js';

export async function getAudiencePresets({ limit = 10 } = {}, orgId) {
  const rows = await db
    .select({
      id: audiencePresets.id,
      name: audiencePresets.name,
      description: audiencePresets.description,
      targeting_spec: audiencePresets.targeting_spec,
      created_at: audiencePresets.created_at,
    })
    .from(audiencePresets)
    .where(eq(audiencePresets.organization_id, orgId))
    .orderBy(desc(audiencePresets.created_at))
    .limit(Math.min(Number(limit) || 10, 20));

  if (!rows.length) {
    return {
      raw: [],
      eventType: 'stat',
      payload: [{ label: 'Audience Presets', value: '0 saved', delta: 'Create audience presets in Settings → Audiences or type "create audience preset"' }],
    };
  }

  const statItems = [
    { label: 'Saved Audience Presets', value: String(rows.length) },
    ...rows.map((r) => {
      const spec = r.targeting_spec ?? {};
      const parts = [
        spec.age_min && spec.age_max ? `Age ${spec.age_min}–${spec.age_max}` : null,
        Array.isArray(spec.geo_locations?.cities) && spec.geo_locations.cities.length ? spec.geo_locations.cities.map((c) => c.name ?? c).slice(0, 2).join(', ') : (spec.geo_locations?.countries ? spec.geo_locations.countries.slice(0, 2).join(', ') : null),
        spec.genders ? (spec.genders.includes(1) && spec.genders.includes(2) ? 'All genders' : spec.genders.includes(1) ? 'Men' : 'Women') : null,
      ].filter(Boolean);

      return {
        label: r.name,
        value: parts.join(' · ') || 'No targeting details',
        delta: r.description ?? '',
      };
    }),
  ];

  return { raw: rows, eventType: 'stat', payload: statItems };
}

// Mutating — surface action button only
export async function createAudiencePreset(_input, _orgId) {
  return { raw: { queued: true }, eventType: null, payload: null };
}
