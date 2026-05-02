import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { creativeBundles } from '../db/schema.js';
import { env } from '../config/env.js';

// gpt-4o for script generation — better creative quality than mini
const SCRIPT_MODEL = 'gpt-4o';
// gpt-4o-mini for scoring — fast and cheap
const SCORE_MODEL = 'gpt-4o-mini';

async function _openaiJSON(model, systemPrompt, userPrompt) {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set');
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${body}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

export class ScriptGeneratorService {
  async generateBundle(channel, trend) {
    const brandCtx = this._buildBrandContext(channel);
    const trendCtx = this._buildTrendContext(trend);

    const bundle = await _openaiJSON(
      SCRIPT_MODEL,
      `You are an expert viral content creator for Instagram Reels and short-form video ads.
Create content that is platform-native, emotionally resonant, and brand-safe.

Rules:
- Hook captures attention in 3 seconds — use curiosity, contrast, or a bold statement
- Script is 15–45 seconds when read aloud at natural pace (50–120 words)
- Voiceover uses [pause] for 0.5s pauses and [emphasis] around stressed words
- Scene prompts are cinematic and specific for AI image generation (Flux/Stable Diffusion)
- Caption ≤2200 chars, conversational, ends with a question or CTA
- Hashtags: 5 niche + 5 broad, no # symbol, as an array
- Never quote source content verbatim — transform it
- Feel native to Instagram, not like an ad

Return JSON with exactly these keys:
{
  "hook": string,
  "script": string,
  "voiceover_text": string,
  "caption": string,
  "hashtags": string[],
  "scene_prompts": string[5],
  "cta": string
}`,
      `Brand:\n${brandCtx}\n\nTrend:\n${trendCtx}\n\nAdaptation idea: ${trend.brand_fit?.adaptation_idea ?? 'Use the trend naturally for this brand'}`,
    );

    const now = new Date();
    const row = {
      id: uuidv4(),
      organization_id: channel.organization_id,
      channel_id: channel.id,
      trend_candidate_id: trend.id ?? null,
      hook: bundle.hook,
      script: bundle.script,
      caption: bundle.caption,
      hashtags: bundle.hashtags ?? [],
      scene_prompts: bundle.scene_prompts ?? [],
      voiceover_text: bundle.voiceover_text,
      video_url: null,
      thumbnail_url: null,
      status: 'draft',
      score_composite: null,
      score_breakdown: null,
      render_job_id: null,
      created_at: now,
      updated_at: now,
    };

    await db.insert(creativeBundles).values(row);
    return { ...row, cta: bundle.cta };
  }

  async scoreBundle(bundle, channel) {
    let scores;
    try {
      scores = await _openaiJSON(
        SCORE_MODEL,
        `You are a content quality scorer. Score the creative bundle 0–10 per dimension.
Return JSON with exactly these keys:
{
  "trend_relevance": number,
  "viral_hook": number,
  "clarity": number,
  "audience_fit": number,
  "platform_fit": number,
  "brand_safety": number,
  "composite": number,
  "rationale": string
}`,
        `Brand: ${channel.brand_name} | Industry: ${channel.industry ?? 'general'} | Audience: ${channel.target_audience ?? 'general'}

Hook: ${bundle.hook}
Script: ${bundle.script}
Caption: ${bundle.caption}`,
      );
    } catch (err) {
      console.error('[ScriptGenerator] scoreBundle failed:', err.message);
      return null;
    }

    await db
      .update(creativeBundles)
      .set({ score_composite: String(scores.composite ?? 0), score_breakdown: scores, updated_at: new Date() })
      .where(eq(creativeBundles.id, bundle.id));

    return scores;
  }

  async regenerateBundle(bundleId, organizationId, rejectionReason) {
    const [existing] = await db
      .select()
      .from(creativeBundles)
      .where(and(eq(creativeBundles.id, bundleId), eq(creativeBundles.organization_id, organizationId)));

    if (!existing) throw new Error(`Bundle ${bundleId} not found`);

    const bundle = await _openaiJSON(
      SCRIPT_MODEL,
      `You are an expert viral content creator regenerating a rejected creative.
Apply the rejection feedback and significantly improve the content.
Return JSON with exactly these keys: hook, script, voiceover_text, caption, hashtags (array), scene_prompts (array of 5), cta`,
      `Original hook: ${existing.hook}
Original script: ${existing.script}
Original caption: ${existing.caption}

Rejection reason: ${rejectionReason ?? 'No specific reason — make it more engaging and platform-native'}`,
    );

    const now = new Date();
    await db
      .update(creativeBundles)
      .set({
        hook: bundle.hook,
        script: bundle.script,
        caption: bundle.caption,
        hashtags: bundle.hashtags ?? existing.hashtags,
        scene_prompts: bundle.scene_prompts ?? existing.scene_prompts,
        voiceover_text: bundle.voiceover_text,
        status: 'draft',
        score_composite: null,
        score_breakdown: null,
        updated_at: now,
      })
      .where(eq(creativeBundles.id, bundleId));

    return { ...existing, ...bundle, id: bundleId };
  }

  _buildBrandContext(channel) {
    return [
      `Brand: ${channel.brand_name}`,
      channel.brand_description ? `Description: ${channel.brand_description}` : null,
      channel.industry          ? `Industry: ${channel.industry}`             : null,
      channel.niche             ? `Niche: ${channel.niche}`                   : null,
      channel.tone              ? `Tone: ${channel.tone}`                     : null,
      channel.language          ? `Language: ${channel.language}`             : null,
      channel.target_audience   ? `Audience: ${channel.target_audience}`      : null,
      channel.products?.length  ? `Products: ${channel.products.join(', ')}`  : null,
      channel.blocked_topics?.length
        ? `NEVER mention: ${channel.blocked_topics.join(', ')}`
        : null,
    ].filter(Boolean).join('\n');
  }

  _buildTrendContext(trend) {
    const lines = [
      `Title: ${trend.title}`,
      trend.summary        ? `Summary: ${trend.summary}`                          : null,
      trend.source_name    ? `Source: ${trend.source_name} (${trend.source_type})`: null,
      trend.classification ? `Type: ${trend.classification}`                       : null,
    ];
    if (trend.emotional_dna) {
      const d = trend.emotional_dna;
      if (d.core_emotion)      lines.push(`Core emotion: ${d.core_emotion}`);
      if (d.visual_signature)  lines.push(`Visual style: ${d.visual_signature}`);
      if (d.themes?.length)    lines.push(`Themes: ${d.themes.join(', ')}`);
    }
    return lines.filter(Boolean).join('\n');
  }
}

export const scriptGeneratorService = new ScriptGeneratorService();
