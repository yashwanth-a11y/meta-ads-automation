// ─── Media generation tool implementations ────────────────────────────────────
// Image and carousel generation are mutating (trigger async jobs).
// Video script generation is a direct query tool using OpenAI.

export async function generateVideoScript({ topic, channel_tone, duration_seconds = 30, content_type = 'reel' } = {}, _orgId, openai) {
  if (!topic) {
    return {
      raw: null,
      eventType: 'stat',
      payload: [{ label: 'Script Generation', value: 'Topic required', delta: 'Provide a topic to generate a video script' }],
    };
  }

  const tone = channel_tone ?? 'engaging and professional';
  const maxWords = Math.round(duration_seconds * 2.5); // approx 150 wpm

  const prompt = `You are a short-form video script writer specialised in Instagram Reels and YouTube Shorts for Indian brands.

Write a ${duration_seconds}-second ${content_type} script about: "${topic}"
Tone: ${tone}
Target word count: ~${maxWords} words (spoken at normal pace)

Return a JSON object with these exact keys:
{
  "hook": "First 3 seconds — the attention-grabbing opener",
  "body": "Main content in 2-4 punchy segments",
  "cta": "Call to action (last 3-5 seconds)",
  "voiceover": "Full voiceover text to be read aloud",
  "on_screen_text": ["text overlay 1", "text overlay 2"],
  "hashtags": ["#tag1", "#tag2", "#tag3"]
}`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 800,
      temperature: 0.8,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const script = JSON.parse(resp.choices[0]?.message?.content ?? '{}');

    const statItems = [
      { label: '🎬 Hook', value: script.hook ?? '—' },
      { label: '📝 Voiceover', value: script.voiceover ? (script.voiceover.length > 120 ? script.voiceover.slice(0, 117) + '…' : script.voiceover) : '—' },
      { label: '📣 CTA', value: script.cta ?? '—' },
      { label: '🏷️ Hashtags', value: Array.isArray(script.hashtags) ? script.hashtags.slice(0, 5).join(' ') : '—' },
    ];

    return { raw: script, eventType: 'stat', payload: statItems };
  } catch (err) {
    return {
      raw: null,
      eventType: 'stat',
      payload: [{ label: 'Script Generation Failed', value: err.message ?? 'Unknown error', delta: 'Try again with a clearer topic' }],
    };
  }
}

// Mutating — trigger image generation jobs via action buttons
export async function generateImage(_input, _orgId) {
  return { raw: { queued: true }, eventType: null, payload: null };
}

export async function generateCarousel(_input, _orgId) {
  return { raw: { queued: true }, eventType: null, payload: null };
}
