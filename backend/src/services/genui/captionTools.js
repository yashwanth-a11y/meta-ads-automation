// ─── Caption & hashtag generation tool implementation ─────────────────────────
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { channels } from '../../db/schema.js';

export async function generateCaption({ topic, channel_name, tone, platform = 'instagram', include_hashtags = true, include_cta = true } = {}, orgId, openai) {
  if (!topic) {
    return {
      raw: null,
      eventType: 'stat',
      payload: [{ label: 'Caption Generation', value: 'Topic required', delta: 'Tell me what the post is about' }],
    };
  }

  // Pull brand context from the matching channel
  let brandContext = {};
  try {
    const allChannels = await db
      .select({ brand_name: channels.brand_name, niche: channels.niche, tone: channels.tone, brand_description: channels.brand_description, target_audience: channels.target_audience, blocked_topics: channels.blocked_topics })
      .from(channels)
      .where(eq(channels.organization_id, orgId))
      .limit(10);

    if (allChannels.length) {
      let ch = allChannels[0];
      if (channel_name) {
        const found = allChannels.find((c) => (c.brand_name ?? '').toLowerCase().includes(channel_name.toLowerCase()));
        if (found) ch = found;
      }
      brandContext = ch;
    }
  } catch { /* non-fatal */ }

  const effectiveTone = tone ?? brandContext.tone ?? 'engaging and professional';
  const brandName = brandContext.brand_name ?? 'the brand';
  const niche = brandContext.niche ?? '';
  const guidelines = brandContext.brand_description ?? '';
  const audienceStr = brandContext.target_audience ? brandContext.target_audience.slice(0, 200) : '';
  const blockedTopics = Array.isArray(brandContext.blocked_topics) && brandContext.blocked_topics.length
    ? `Avoid topics: ${brandContext.blocked_topics.join(', ')}`
    : '';

  const systemPrompt = `You are a social media copywriter for ${brandName}${niche ? ` (${niche})` : ''}.
Tone: ${effectiveTone}
Platform: ${platform}
${guidelines ? `Brand description: ${guidelines}` : ''}
${audienceStr ? `Target audience: ${audienceStr}` : ''}
${blockedTopics}

Write an Instagram caption for the given topic. Return a JSON object with:
{
  "caption": "the full caption text — 2–4 short paragraphs, ${include_cta ? 'end with a CTA,' : 'no CTA,'} conversational, no filler phrases",
  "hashtags": ${include_hashtags ? '["#tag1", "#tag2", ...] — 15–20 relevant hashtags mixing popular and niche' : '[]'},
  "alt_versions": ["shorter alt caption 1", "shorter alt caption 2"]
}`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 700,
      temperature: 0.85,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Write a caption about: ${topic}` },
      ],
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(resp.choices[0]?.message?.content ?? '{}');
    const caption = result.caption ?? '';
    const hashtags = Array.isArray(result.hashtags) ? result.hashtags : [];

    const statItems = [
      { label: `Caption for "${topic.length > 40 ? topic.slice(0, 37) + '…' : topic}"`, value: brandName, delta: `${effectiveTone} · ${platform}` },
      { label: '📝 Caption', value: caption.length > 150 ? caption.slice(0, 147) + '…' : caption },
      ...(hashtags.length ? [{ label: '🏷️ Hashtags', value: hashtags.slice(0, 8).join(' '), delta: `${hashtags.length} hashtags total` }] : []),
      ...(result.alt_versions?.length ? [{ label: '✏️ Alt version', value: result.alt_versions[0]?.length > 120 ? result.alt_versions[0].slice(0, 117) + '…' : result.alt_versions[0] ?? '' }] : []),
    ];

    return { raw: result, eventType: 'stat', payload: statItems };
  } catch (err) {
    return {
      raw: null,
      eventType: 'stat',
      payload: [{ label: 'Caption Generation Failed', value: err.message ?? 'Unknown error', delta: 'Try again' }],
    };
  }
}
