import OpenAI from 'openai';
import { env } from '../../config/env.js';

// Single provider, single default model. Aliases let call sites stay readable
// and let us swap a model in one place when we upgrade specific tasks later.
const MODELS = {
  mini: 'gpt-4o-mini',  // default for everything — classification, scoring, gen, decisions
  full: 'gpt-4o',       // reserved for future upgrades on creative-heavy tasks
};

let _client = null;
function client() {
  if (!_client) {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not set — cannot call OpenAI');
    }
    _client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return _client;
}

function logUsage(label, usage) {
  if (!usage) return;
  const { prompt_tokens, completion_tokens, prompt_tokens_details } = usage;
  const cached = prompt_tokens_details?.cached_tokens ?? 0;
  console.log(
    `[OpenAI] ${label} in=${prompt_tokens} out=${completion_tokens} cached=${cached}`,
  );
}

/**
 * Generate a JSON object via Chat Completions with response_format=json_object.
 *
 * Place the static system prompt FIRST in the system message so OpenAI's
 * automatic prefix caching (≥1024 tokens) kicks in across calls. Per-call
 * dynamic data goes in the user message.
 *
 * @param {object} opts
 * @param {'mini'|'full'} [opts.model='mini'] - Alias or raw model id.
 * @param {string|{cached: string, dynamic?: string}} opts.system
 *   String → used as-is. Object → `cached` is the static prefix, `dynamic` is
 *   appended after a separator (still inside the system message).
 * @param {string} opts.user
 * @param {number} [opts.temperature=0.4]
 * @param {number} [opts.maxTokens]
 * @param {string} [opts.label]
 */
export async function generateJSON({
  model = 'mini',
  system,
  user,
  temperature = 0.4,
  maxTokens,
  label = 'json',
}) {
  const modelId = MODELS[model] ?? model;

  const systemContent = typeof system === 'string'
    ? system
    : `${system.cached}${system.dynamic ? `\n\n---\n${system.dynamic}` : ''}`;

  const params = {
    model: modelId,
    temperature,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: user },
    ],
  };
  if (maxTokens) params.max_tokens = maxTokens;

  const response = await client().chat.completions.create(params);
  logUsage(label, response.usage);

  const content = response.choices?.[0]?.message?.content ?? '';
  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`OpenAI returned invalid JSON: ${err.message}\nRaw: ${content.slice(0, 500)}`);
  }
}

/**
 * Free-form text generation (no JSON forcing).
 */
export async function generateText({
  model = 'mini',
  system,
  user,
  temperature = 0.7,
  maxTokens,
  label = 'text',
}) {
  const modelId = MODELS[model] ?? model;

  const systemContent = typeof system === 'string'
    ? system
    : `${system.cached}${system.dynamic ? `\n\n---\n${system.dynamic}` : ''}`;

  const params = {
    model: modelId,
    temperature,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: user },
    ],
  };
  if (maxTokens) params.max_tokens = maxTokens;

  const response = await client().chat.completions.create(params);
  logUsage(label, response.usage);
  return response.choices?.[0]?.message?.content ?? '';
}

export const llm = { generateJSON, generateText, MODELS };
