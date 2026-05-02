/**
 * Prompt Enhancement Service using GPT-4o Mini
 * Refines user scripts/prompts for better video generation results
 */

import axios from 'axios';

import { env } from '../config/env.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/** Match CreativeService script cap when streaming. */
const STORYBOARD_SCRIPT_MAX_CHARS = 12000;

function storyboardBriefMessages(brief, style = 'cinematic') {
  const trimmed = typeof brief === 'string' ? brief.trim() : '';
  if (!trimmed) throw new Error('Brief is required');

  const tone = style && String(style).trim() ? String(style).trim() : 'cinematic, clear, direct';

  const systemPrompt = `You are a scriptwriter for short-form social video ads and text-to-video storyboards.

From the user's brief (product, offer, audience, or story idea), write ONE production-ready script that includes:
- Section or scene labels where helpful (e.g. HOOK, VALUE, CTA)
- Narration in quotation marks for spoken lines
- On-screen text cues labeled clearly
- Optional timing hints like (2 sec) on key beats
- Enough visual and mood detail for a video model to follow

Output ONLY the script—no title line, no meta commentary, no markdown fences.
Tone / style: ${tone}
Keep the full script under 4000 characters.`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: trimmed },
  ];
}

/** Uses validated env: OPENAI_MODEL defaults to gpt-4o-mini in config/env.js. */
export function resolveOpenAIConfig() {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  return {
    apiKey,
    model: env.OPENAI_MODEL,
  };
}

/**
 * Create OpenAI API client
 */
export function createOpenAIClient(cfg) {
  return axios.create({
    baseURL: OPENAI_API_URL.replace('/chat/completions', ''),
    headers: {
      'Authorization': `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
}

/**
 * System prompt for video generation enhancement
 */
const VIDEO_ENHANCEMENT_SYSTEM = `You are an expert video production script writer. Your task is to enhance user-provided scripts or prompts for professional video generation.

Enhance scripts by:
- Adding visual details and composition guidance
- Specifying camera movements (pan, zoom, dolly, tracking)
- Including lighting and mood descriptions
- Describing action, pacing, and transitions
- Using cinematic and evocative language
- Keeping the original message/intent intact

Output ONLY the enhanced prompt, no explanations or meta-commentary.
Limit output to 2500 characters.`;

/**
 * Enhance a script/prompt using GPT-4o Mini for better video generation
 * @param {{ throwOnFailure?: boolean }} [options] — if throwOnFailure, errors propagate instead of returning the original script
 */
export async function enhancePromptForVideo(client, originalPrompt, cfg, options = {}) {
  const throwOnFailure = Boolean(options.throwOnFailure);

  if (!originalPrompt || typeof originalPrompt !== 'string') {
    return originalPrompt;
  }

  const trimmed = originalPrompt.trim();
  if (!trimmed) return '';

  try {
    const response = await client.post('/chat/completions', {
      model: cfg.model,
      messages: [
        {
          role: 'system',
          content: VIDEO_ENHANCEMENT_SYSTEM,
        },
        {
          role: 'user',
          content: trimmed,
        },
      ],
      temperature: 0.7,
      max_tokens: 2048,
    });

    if (!response.data?.choices?.[0]?.message?.content) {
      if (throwOnFailure) {
        throw new Error('OpenAI returned no enhanced text');
      }
      return trimmed;
    }

    const enhanced = response.data.choices[0].message.content.trim();
    return enhanced || trimmed;
  } catch (err) {
    if (throwOnFailure) {
      const apiMsg =
        err.response?.data?.error?.message ??
        (typeof err.response?.data?.error === 'string' ? err.response.data.error : null);
      throw new Error(apiMsg || err.message || 'OpenAI request failed');
    }
    console.warn('Failed to enhance prompt with GPT-4o Mini:', err.message);
    return trimmed;
  }
}

/**
 * Turn a short product/story brief into a voiceover + storyboard script for the Creatives pipeline.
 */
export async function generateStoryboardScriptFromBrief(client, brief, cfg, style = 'cinematic') {
  const messages = storyboardBriefMessages(brief, style);
  const trimmed = typeof brief === 'string' ? brief.trim() : '';

  try {
    const response = await client.post('/chat/completions', {
      model: cfg.model,
      messages,
      temperature: 0.75,
      max_tokens: 2048,
    });

    if (!response.data?.choices?.[0]?.message?.content) {
      throw new Error('OpenAI returned no script');
    }

    const text = response.data.choices[0].message.content.trim();
    return text || trimmed;
  } catch (err) {
    const apiMsg =
      err.response?.data?.error?.message ??
      (typeof err.response?.data?.error === 'string' ? err.response.data.error : null);
    throw new Error(apiMsg || err.message || 'OpenAI request failed');
  }
}

/**
 * Stream script tokens from OpenAI Chat Completions (SSE). Stops at STORYBOARD_SCRIPT_MAX_CHARS.
 * @param {{ onDelta?: (s: string) => void; signal?: AbortSignal }} [options]
 */
export async function streamStoryboardScriptFromBrief(brief, cfg, style = 'cinematic', options = {}) {
  const { onDelta, signal } = options;
  const messages = storyboardBriefMessages(brief, style);

  const res = await fetch(OPENAI_API_URL, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: 0.75,
      max_tokens: 2048,
      stream: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = `OpenAI HTTP ${res.status}`;
    try {
      const j = JSON.parse(text);
      if (j?.error?.message) msg = j.error.message;
    } catch {
      if (text) msg = text.slice(0, 400);
    }
    throw new Error(msg);
  }

  if (!res.body) throw new Error('OpenAI returned no response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let emitted = 0;

  const emit = async (piece) => {
    if (!piece) return true;
    if (emitted >= STORYBOARD_SCRIPT_MAX_CHARS) return false;
    const rest = STORYBOARD_SCRIPT_MAX_CHARS - emitted;
    const use = piece.length > rest ? piece.slice(0, rest) : piece;
    onDelta?.(use);
    emitted += use.length;
    if (emitted >= STORYBOARD_SCRIPT_MAX_CHARS) {
      await reader.cancel().catch(() => {});
      return false;
    }
    return true;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const nl = buffer.indexOf('\n');
        if (nl < 0) break;
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        line = line.trim();
        if (!line || line.startsWith(':')) continue;
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const json = JSON.parse(payload);
          const piece = json.choices?.[0]?.delta?.content;
          if (typeof piece === 'string' && piece.length > 0) {
            const cont = await emit(piece);
            if (!cont) return;
          }
        } catch {
          /* ignore malformed SSE JSON */
        }
      }
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    throw err;
  }
}

/**
 * Generate a video prompt from a short description
 * Useful when user provides minimal input
 */
export async function generateVideoPrompt(client, description, style = 'cinematic', cfg) {
  if (!description || typeof description !== 'string') {
    throw new Error('Description is required');
  }

  const systemPrompt = `You are a creative director specializing in video production. Generate a detailed, cinematic video prompt based on the user's description and style.

Style: ${style || 'professional and cinematic'}

Output ONLY the enhanced prompt, no explanations.
Limit output to 2500 characters.`;

  try {
    const response = await client.post('/chat/completions', {
      model: cfg.model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: description,
        },
      ],
      temperature: 0.8,
      max_tokens: 1000,
    });

    if (!response.data?.choices?.[0]?.message?.content) {
      throw new Error('No content in response');
    }

    return response.data.choices[0].message.content.trim();
  } catch (err) {
    throw new Error(`Failed to generate video prompt: ${err.message}`);
  }
}

/**
 * Analyze a script and suggest improvements
 */
export async function analyzeScript(client, script, cfg) {
  if (!script || typeof script !== 'string') {
    throw new Error('Script is required');
  }

  const systemPrompt = `You are a video production expert. Analyze the provided script and provide structured feedback for video generation.

Provide feedback in this JSON format:
{
  "clarity": "score 1-10",
  "cinematicPotential": "score 1-10",
  "visualDetails": "score 1-10",
  "suggestions": ["suggestion1", "suggestion2", ...],
  "enhancedVersion": "improved script"
}`;

  try {
    const response = await client.post('/chat/completions', {
      model: cfg.model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: script,
        },
      ],
      temperature: 0.5,
      max_tokens: 1500,
    });

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('No content in response');

    // Try to parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return {
      analysis: content,
      enhancedVersion: script,
    };
  } catch (err) {
    throw new Error(`Failed to analyze script: ${err.message}`);
  }
}

/**
 * Generate multiple prompt variations for A/B testing
 */
export async function generatePromptVariations(client, basePrompt, count = 3, cfg) {
  if (!basePrompt || typeof basePrompt !== 'string') {
    throw new Error('Base prompt is required');
  }

  const systemPrompt = `You are a creative director. Generate ${count} distinct but related video prompts based on the provided description.
Each should be suitable for video generation but with different creative approaches, moods, or perspectives.

Output format: Return ONLY a JSON array of prompts, no explanations.
Example: ["prompt1", "prompt2", "prompt3"]`;

  try {
    const response = await client.post('/chat/completions', {
      model: cfg.model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: basePrompt,
        },
      ],
      temperature: 0.9,
      max_tokens: 2000,
    });

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('No content in response');

    // Try to parse JSON array
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const variations = JSON.parse(jsonMatch[0]);
      return Array.isArray(variations) ? variations : [basePrompt];
    }

    return [basePrompt];
  } catch (err) {
    throw new Error(`Failed to generate variations: ${err.message}`);
  }
}
