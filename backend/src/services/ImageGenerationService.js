import { env } from '../config/env.js';

// DALL-E 3 image sizes supported
const DALLE_SIZE_SQUARE = '1024x1024';
const DALLE_SIZE_PORTRAIT = '1024x1792'; // ideal for Instagram portrait posts
const DALLE_SIZE_LANDSCAPE = '1792x1024';

/**
 * Build a brand-aware image generation prompt.
 * Injects brand colors, style, logo instructions, and content direction.
 */
function buildBrandAwarePrompt(basePrompt, brandAssets = {}, brandContext = {}) {
  const parts = [basePrompt.trim()];

  const style = brandAssets.brand_style || brandContext.tone || 'professional and modern';
  parts.push(`Visual style: ${style}`);

  if (brandAssets.primary_color) {
    parts.push(`Primary brand color: ${brandAssets.primary_color}`);
  }
  if (brandAssets.secondary_color) {
    parts.push(`Secondary brand color: ${brandAssets.secondary_color}`);
  }
  if (brandAssets.colors?.length) {
    parts.push(`Brand color palette: ${brandAssets.colors.slice(0, 3).join(', ')}`);
  }
  if (brandContext.niche) {
    parts.push(`Industry/niche: ${brandContext.niche}`);
  }

  // Always request high quality social media format
  parts.push(
    'High quality, photorealistic, suitable for Instagram. No text overlays unless specified. Clean composition.',
  );

  // Never include the logo in the AI prompt — logos are composited separately
  return parts.join('. ');
}

/**
 * Generate images using DALL-E 3 (OpenAI).
 * Returns array of image URLs.
 */
async function generateWithDallE3(prompts, options = {}) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');

  const size = options.size || DALLE_SIZE_PORTRAIT;
  const quality = options.quality || 'hd';
  const urls = [];

  for (const prompt of prompts) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: prompt.slice(0, 4000),
        n: 1,
        size,
        quality,
        response_format: 'url',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`DALL-E 3 error ${res.status}: ${body}`);
    }

    const data = await res.json();
    const url = data?.data?.[0]?.url;
    if (!url) throw new Error('DALL-E 3 returned no image URL');
    urls.push(url);
  }

  return urls;
}

/**
 * Generate images using Replicate (Flux / SDXL fallback).
 * Returns array of image URLs.
 */
async function generateWithReplicate(prompts, options = {}) {
  const token = env.REPLICATE_API_KEY;
  if (!token) throw new Error('REPLICATE_API_KEY not set');

  // flux-schnell for speed, flux-dev for quality
  const model = options.replicateModel || 'black-forest-labs/flux-schnell';
  const urls = [];

  for (const prompt of prompts) {
    // Create prediction
    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${token}`,
      },
      body: JSON.stringify({
        version: model.includes(':') ? model.split(':')[1] : undefined,
        model: model.includes(':') ? undefined : model,
        input: {
          prompt: prompt.slice(0, 2000),
          aspect_ratio: options.aspect_ratio || '4:5',
          output_format: 'webp',
          output_quality: 90,
          num_inference_steps: options.quality === 'hd' ? 4 : 4,
        },
      }),
    });

    if (!createRes.ok) {
      const body = await createRes.text();
      throw new Error(`Replicate create error ${createRes.status}: ${body}`);
    }

    const prediction = await createRes.json();
    const predId = prediction.id;
    if (!predId) throw new Error('Replicate returned no prediction ID');

    // Poll until done
    let imageUrl = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise((r) => setTimeout(r, 3000));

      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${predId}`, {
        headers: { Authorization: `Token ${token}` },
      });

      const pollData = await pollRes.json();
      if (pollData.status === 'succeeded') {
        imageUrl = Array.isArray(pollData.output) ? pollData.output[0] : pollData.output;
        break;
      }
      if (pollData.status === 'failed' || pollData.status === 'canceled') {
        throw new Error(`Replicate prediction ${predId} ${pollData.status}: ${pollData.error || ''}`);
      }
    }

    if (!imageUrl) throw new Error(`Replicate prediction ${predId} timed out`);
    urls.push(imageUrl);
  }

  return urls;
}

/**
 * Generate images using ModelsLab text-to-image.
 * Returns array of image URLs.
 */
async function generateWithModelsLab(prompts, options = {}) {
  const apiKey = env.MODELS_LAB_API_KEY;
  if (!apiKey) throw new Error('MODELS_LAB_API_KEY not set');

  const urls = [];

  for (const prompt of prompts) {
    const res = await fetch('https://modelslab.com/api/v6/images/text2img', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: apiKey,
        prompt: prompt.slice(0, 2000),
        negative_prompt: 'blurry, low quality, watermark, text',
        width: options.width || '768',
        height: options.height || '1024',
        samples: '1',
        num_inference_steps: '30',
        guidance_scale: 7.5,
        safety_checker: 'yes',
        multi_lingual: 'no',
        panorama: 'no',
        self_attention: 'no',
        upscale: 'no',
        embeddings_model: null,
        lora_model: null,
        tomesd: 'yes',
        clip_skip: '2',
        use_karras_sigmas: 'yes',
        scheduler: 'UniPCMultistepScheduler',
        webhook: null,
        track_id: null,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ModelsLab error ${res.status}: ${body}`);
    }

    const data = await res.json();
    if (data.status === 'error') throw new Error(`ModelsLab: ${data.message}`);

    // If processing, poll the fetch endpoint
    if (data.status === 'processing' && data.fetch_result) {
      let imageUrl = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise((r) => setTimeout(r, 5000));
        const fetchRes = await fetch(data.fetch_result, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: apiKey }),
        });
        const fetchData = await fetchRes.json();
        if (fetchData.status === 'success' && fetchData.output?.[0]) {
          imageUrl = fetchData.output[0];
          break;
        }
        if (fetchData.status === 'error') throw new Error(`ModelsLab fetch: ${fetchData.message}`);
      }
      if (!imageUrl) throw new Error('ModelsLab image generation timed out');
      urls.push(imageUrl);
    } else if (data.output?.[0]) {
      urls.push(data.output[0]);
    } else {
      throw new Error('ModelsLab returned no image URL');
    }
  }

  return urls;
}

/**
 * Main image generation service.
 * Priority: DALL-E 3 → Replicate Flux → ModelsLab
 *
 * @param {string[]} prompts - Array of text prompts (1 for image_post, 3-8 for carousel)
 * @param {object} brandAssets - Channel brand_assets { logo_url, colors, primary_color, brand_style }
 * @param {object} brandContext - Channel fields { niche, tone, brand_name }
 * @param {object} options - { size, quality, aspect_ratio }
 * @returns {Promise<string[]>} Array of image URLs
 */
export async function generateImages(prompts, brandAssets = {}, brandContext = {}, options = {}) {
  const enrichedPrompts = prompts.map((p) =>
    buildBrandAwarePrompt(p, brandAssets, brandContext),
  );

  // Try DALL-E 3 first (best quality, most brand-aware)
  if (env.OPENAI_API_KEY) {
    try {
      return await generateWithDallE3(enrichedPrompts, options);
    } catch (err) {
      console.warn('[ImageGeneration] DALL-E 3 failed, trying Replicate:', err.message);
    }
  }

  // Replicate Flux fallback
  if (env.REPLICATE_API_KEY) {
    try {
      return await generateWithReplicate(enrichedPrompts, options);
    } catch (err) {
      console.warn('[ImageGeneration] Replicate failed, trying ModelsLab:', err.message);
    }
  }

  // ModelsLab last resort
  if (env.MODELS_LAB_API_KEY) {
    return await generateWithModelsLab(enrichedPrompts, options);
  }

  throw new Error(
    'Image generation requires OPENAI_API_KEY (DALL-E 3), REPLICATE_API_KEY, or MODELS_LAB_API_KEY',
  );
}

export const imageGenerationService = { generateImages };
