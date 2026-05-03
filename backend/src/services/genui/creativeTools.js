// ─── Creative & ad builder tool implementations ───────────────────────────────
// Each export is a pure async function.
// createAdDraft receives the openai client as a third argument since it's
// the only tool that calls the LLM directly.

import { desc, eq, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { creativeBundles } from '../../db/schema.js';

const AD_MODEL = 'gpt-4o-mini';

export async function topCreativesByMetric({ metric = 'clicks', limit = 5 } = {}, orgId) {
  const bundles = await db
    .select({
      id: creativeBundles.id,
      hook: creativeBundles.hook,
      status: creativeBundles.status,
      score: creativeBundles.score_composite,
      channel_id: creativeBundles.channel_id,
    })
    .from(creativeBundles)
    .where(eq(creativeBundles.organization_id, orgId))
    .orderBy(desc(creativeBundles.score_composite))
    .limit(Math.min(Number(limit) || 5, 20));

  const chartData = bundles.map((b, i) => ({
    name: b.hook ? (b.hook.length > 40 ? b.hook.slice(0, 40) + '…' : b.hook) : `Creative ${i + 1}`,
    Score: Number(b.score ?? 0),
    Status: b.status,
  }));

  return {
    raw: bundles,
    eventType: 'chart',
    payload: {
      chartType: 'bar',
      title: `Top ${limit} Creatives by Quality Score`,
      data: chartData,
      xKey: 'name',
      yKeys: ['Score'],
      unit: '/10',
    },
  };
}

export async function getAdExamples({ limit = 3 } = {}, orgId) {
  const examples = await db
    .select({ hook: creativeBundles.hook, script: creativeBundles.script, caption: creativeBundles.caption })
    .from(creativeBundles)
    .where(and(eq(creativeBundles.organization_id, orgId), eq(creativeBundles.status, 'published')))
    .orderBy(desc(creativeBundles.score_composite))
    .limit(Math.min(Number(limit) || 3, 5));

  return { raw: examples, eventType: null, payload: null };
}

export async function createAdDraft(
  { brief, objective, audience, budget, schedule, additional_context } = {},
  _orgId,
  openai,
) {
  const prompt = `Create a Meta Ads draft for the following brief:

Brief: ${brief}
Objective: ${objective}
Target Audience: ${audience}
Budget: ${budget}
Schedule: ${schedule ?? 'Not specified'}
${additional_context ? `Additional context: ${additional_context}` : ''}

Respond with a JSON object with this exact structure:
{
  "objective": "...",
  "audience": "...",
  "budget": "...",
  "schedule": "...",
  "headlines": ["...", "...", "..."],
  "primaryTexts": ["...", "...", "..."],
  "cta": "...",
  "riskFlags": []
}

- 3 headline variants (max 40 chars each)
- 3 primary text variants (max 150 chars each, conversational)
- CTA: one of LEARN_MORE, SIGN_UP, GET_QUOTE, CONTACT_US, MESSAGE_US, BOOK_NOW, SHOP_NOW
- riskFlags: array of strings for any Meta policy concerns (empty if none)`;

  const response = await openai.chat.completions.create({
    model: AD_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  let draft = {};
  try {
    const text = response.choices[0]?.message?.content ?? '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    draft = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    draft = { objective, audience, budget, schedule: schedule ?? '', headlines: [], primaryTexts: [], cta: 'LEARN_MORE', riskFlags: [] };
  }

  return { raw: draft, eventType: 'ad_draft', payload: draft };
}
