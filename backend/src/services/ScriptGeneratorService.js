import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { creativeBundles } from '../db/schema.js';
import { generateImages } from './ImageGenerationService.js';
import { generateJSON } from './agent/llmClient.js';
import { PROMPTS } from './agent/prompts.js';

export class ScriptGeneratorService {
  async generateBundle(channel, trend) {
    const brandCtx = this._buildBrandContext(channel);
    const trendCtx = this._buildTrendContext(trend);

    const bundle = await generateJSON({
      model: 'mini',
      system: PROMPTS.GENERATE_REEL_BUNDLE,
      user: `Brand:\n${brandCtx}\n\nTrend:\n${trendCtx}\n\nAdaptation idea: ${trend.brand_fit?.adaptation_idea ?? 'Use the trend naturally for this brand'}`,
      temperature: 0.8,
      label: 'gen_reel',
    });

    const now = new Date();
    const row = {
      id: uuidv4(),
      organization_id: channel.organization_id,
      channel_id: channel.id,
      trend_candidate_id: trend.id ?? null,
      content_type: 'reel',
      hook: bundle.hook,
      script: bundle.script,
      caption: bundle.caption,
      hashtags: bundle.hashtags ?? [],
      scene_prompts: [],
      image_prompts: [],
      image_urls: [],
      voiceover_text: bundle.voiceover_text,
      video_url: null,
      thumbnail_url: null,
      status: 'draft',
      score_composite: null,
      score_breakdown: null,
      render_job_id: null,
      scheduled_publish_at: null,
      published_at: null,
      created_at: now,
      updated_at: now,
    };

    await db.insert(creativeBundles).values(row);
    return { ...row, cta: bundle.cta };
  }

  async scoreBundle(bundle, channel) {
    let scores;
    try {
      scores = await generateJSON({
        model: 'mini',
        system: PROMPTS.SCORE_BUNDLE,
        user: `Brand: ${channel.brand_name} | Industry: ${channel.industry ?? 'general'} | Audience: ${channel.target_audience ?? 'general'}

Hook: ${bundle.hook}
Script: ${bundle.script}
Caption: ${bundle.caption}`,
        label: 'score_bundle',
      });
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

    const bundle = await generateJSON({
      model: 'mini',
      system: PROMPTS.REGENERATE_BUNDLE,
      user: `Original hook: ${existing.hook}
Original script: ${existing.script}
Original caption: ${existing.caption}

Rejection reason: ${rejectionReason ?? 'No specific reason — make it more engaging and platform-native'}`,
      temperature: 0.8,
      label: 'regen_bundle',
    });

    const now = new Date();
    await db
      .update(creativeBundles)
      .set({
        hook: bundle.hook,
        script: bundle.script,
        caption: bundle.caption,
        hashtags: bundle.hashtags ?? existing.hashtags,
        voiceover_text: bundle.voiceover_text,
        status: 'draft',
        score_composite: null,
        score_breakdown: null,
        updated_at: now,
      })
      .where(eq(creativeBundles.id, bundleId));

    return { ...existing, ...bundle, id: bundleId };
  }

  // Called only after content is approved — right before video render
  async generateScenePrompts(bundle, channel) {
    const prompts = await generateJSON({
      model: 'mini',
      system: PROMPTS.GENERATE_SCENE_PROMPTS,
      user: `Brand: ${channel.brand_name} | Tone: ${channel.tone ?? 'professional'}
Hook: ${bundle.hook}
Script: ${bundle.script}`,
      label: 'scene_prompts',
    });

    const scenes = prompts.scene_prompts ?? [];
    await db.update(creativeBundles)
      .set({ scene_prompts: scenes, updated_at: new Date() })
      .where(eq(creativeBundles.id, bundle.id));

    return scenes;
  }

  /**
   * Generate a single image post bundle (image_post content type).
   * Produces: image_prompt, caption, hashtags, alt_text, then generates the image.
   */
  async generateImageBundle(channel, trend) {
    const brandCtx = this._buildBrandContext(channel);
    const trendCtx = this._buildTrendContext(trend);
    const brandAssets = channel.brand_assets ?? {};

    const bundle = await generateJSON({
      model: 'mini',
      system: PROMPTS.GENERATE_IMAGE_BUNDLE,
      user: `Brand:\n${brandCtx}\n\nBrand assets: ${brandAssets.logo_url ? 'logo provided' : 'no logo'}, colors: ${brandAssets.colors?.join(', ') || brandAssets.primary_color || 'not specified'}\n\nTrend:\n${trendCtx}\n\nAdaptation idea: ${trend.brand_fit?.adaptation_idea ?? 'Use the trend visually for this brand'}`,
      temperature: 0.8,
      label: 'gen_image_bundle',
    });

    // Generate the actual image using the AI prompt
    let imageUrls = [];
    try {
      imageUrls = await generateImages(
        [bundle.image_prompt],
        brandAssets,
        { niche: channel.niche, tone: channel.tone, brand_name: channel.brand_name },
        { size: '1024x1792', quality: 'hd' },
      );
    } catch (err) {
      console.error('[ScriptGenerator] Image generation failed, saving bundle without image:', err.message);
    }

    const now = new Date();
    const row = {
      id: uuidv4(),
      organization_id: channel.organization_id,
      channel_id: channel.id,
      trend_candidate_id: trend.id ?? null,
      content_type: 'image_post',
      hook: bundle.hook,
      script: bundle.image_prompt,
      caption: bundle.caption,
      hashtags: bundle.hashtags ?? [],
      scene_prompts: [],
      image_prompts: [bundle.image_prompt],
      image_urls: imageUrls,
      voiceover_text: null,
      video_url: null,
      thumbnail_url: imageUrls[0] ?? null,
      status: imageUrls.length ? 'ready' : 'draft',
      score_composite: null,
      score_breakdown: null,
      render_job_id: null,
      scheduled_publish_at: null,
      published_at: null,
      created_at: now,
      updated_at: now,
    };

    await db.insert(creativeBundles).values(row);
    return { ...row, cta: bundle.cta };
  }

  /**
   * Generate a carousel post bundle (3–8 slides, each with image + caption).
   */
  async generateCarouselBundle(channel, trend, slideCount = 5) {
    const count = Math.min(8, Math.max(3, slideCount));
    const brandCtx = this._buildBrandContext(channel);
    const trendCtx = this._buildTrendContext(trend);
    const brandAssets = channel.brand_assets ?? {};

    const bundle = await generateJSON({
      model: 'mini',
      system: PROMPTS.GENERATE_CAROUSEL_BUNDLE,
      user: `Brand:\n${brandCtx}\n\nTrend:\n${trendCtx}\n\nSlide count: ${count}\n\nAdaptation idea: ${trend.brand_fit?.adaptation_idea ?? 'Create an educational or inspiring carousel for this brand'}`,
      temperature: 0.8,
      label: 'gen_carousel',
    });

    const slides = (bundle.slides ?? []).slice(0, count);
    const imagePrompts = slides.map((s) => s.image_prompt);

    // Generate all carousel images
    let imageUrls = [];
    try {
      imageUrls = await generateImages(
        imagePrompts,
        brandAssets,
        { niche: channel.niche, tone: channel.tone, brand_name: channel.brand_name },
        { size: '1024x1024', quality: 'standard' },
      );
    } catch (err) {
      console.error('[ScriptGenerator] Carousel image generation failed:', err.message);
    }

    const now = new Date();
    const row = {
      id: uuidv4(),
      organization_id: channel.organization_id,
      channel_id: channel.id,
      trend_candidate_id: trend.id ?? null,
      content_type: 'carousel',
      hook: bundle.hook,
      script: slides.map((s, i) => `Slide ${i + 1}: ${s.slide_caption}`).join('\n'),
      caption: bundle.overall_caption,
      hashtags: bundle.hashtags ?? [],
      scene_prompts: [],
      image_prompts: imagePrompts,
      image_urls: imageUrls,
      voiceover_text: null,
      video_url: null,
      thumbnail_url: imageUrls[0] ?? null,
      status: imageUrls.length ? 'ready' : 'draft',
      score_composite: null,
      score_breakdown: null,
      render_job_id: null,
      scheduled_publish_at: null,
      published_at: null,
      created_at: now,
      updated_at: now,
    };

    await db.insert(creativeBundles).values(row);
    return { ...row, slides, cta: bundle.cta };
  }

  /**
   * Pick content type for a channel run based on content_mix weights.
   * Uses weighted random selection so mix targets are respected over time.
   */
  pickContentType(channel) {
    const mix = channel.content_mix ?? { reel: 40, image_post: 40, carousel: 20 };
    const types = Object.keys(mix).filter((k) => (mix[k] ?? 0) > 0);
    if (!types.length) return 'reel';

    const total = types.reduce((sum, t) => sum + (mix[t] ?? 0), 0);
    let rand = Math.random() * total;
    for (const type of types) {
      rand -= mix[type] ?? 0;
      if (rand <= 0) return type;
    }
    return types[types.length - 1];
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
