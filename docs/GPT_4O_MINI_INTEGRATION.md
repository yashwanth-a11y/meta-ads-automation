# GPT-4o Mini Integration Guide

## Overview

GPT-4o Mini can enhance your video generation by:

1. **Refining user prompts** - Make vague descriptions more detailed and cinematic
2. **Generating full prompts** - Create detailed video prompts from short descriptions
3. **Script analysis** - Evaluate scripts and suggest improvements
4. **Prompt variations** - Generate A/B test variations for testing different styles

## Setup

### 1. Get OpenAI API Key

1. Go to [OpenAI API Keys](https://platform.openai.com/api/keys)
2. Create a new API key
3. Copy the key

### 2. Configure Environment Variables

Add to your `.env`:

```bash
# Required
OPENAI_API_KEY=sk-proj-...your-api-key...

# Optional
OPENAI_MODEL=gpt-4o-mini  # Default model
```

### 3. Install/Verify Dependencies

Axios is already in the dependencies:

```bash
npm list axios
# Should show axios is installed
```

## Usage Examples

### 1. Enhance User Prompt

When a user provides a vague prompt, enhance it for better video generation:

```javascript
import { 
  resolveOpenAIConfig, 
  createOpenAIClient, 
  enhancePromptForVideo 
} from './services/promptEnhancerService.js';

// In your route handler
const openaiCfg = resolveOpenAIConfig();
if (openaiCfg) {
  const client = createOpenAIClient(openaiCfg);
  const enhancedPrompt = await enhancePromptForVideo(
    client,
    request.body.script,
    openaiCfg
  );
  // Use enhancedPrompt with Models Lab API
}
```

### 2. Generate Full Prompt from Description

```javascript
const generatedPrompt = await generateVideoPrompt(
  client,
  "A cat playing with a ball in a sunny room",
  "cinematic and professional",
  openaiCfg
);
```

### 3. Analyze and Improve Scripts

```javascript
const analysis = await analyzeScript(client, script, openaiCfg);
console.log(analysis);
// {
//   clarity: 8,
//   cinematicPotential: 7,
//   visualDetails: 6,
//   suggestions: [
//     "Add more specific location details",
//     "Include camera movement instructions"
//   ],
//   enhancedVersion: "..."
// }
```

### 4. Generate A/B Test Variations

```javascript
const variations = await generatePromptVariations(
  client,
  "A sunrise over mountains",
  3,  // Generate 3 variations
  openaiCfg
);
// ["cinematic sunrise variant", "golden hour variant", "dramatic lighting variant"]
```

## Integration with CreativeService

### Option 1: Auto-enhance on Render

Modify `_runModelsLabRender()` to enhance prompts:

```javascript
async _runModelsLabRender(map, creativeId, jobId, cfg, row) {
  let prompt = buildModelsLabPrompt(row.script);
  
  // Enhance with GPT-4o Mini if available
  const openaiCfg = resolveOpenAIConfig();
  if (openaiCfg) {
    const client = createOpenAIClient(openaiCfg);
    prompt = await enhancePromptForVideo(client, prompt, openaiCfg);
  }
  
  // Continue with enhanced prompt...
}
```

### Option 2: Separate Enhancement Endpoint

Add a new route:

```javascript
app.post('/:creativeId/enhance-prompt', async (request) => {
  const orgId = requireTenant(request);
  const { creativeId } = request.params;
  const creative = service.get(orgId, creativeId);
  
  const openaiCfg = resolveOpenAIConfig();
  if (!openaiCfg) {
    throw new Error('GPT-4o Mini not configured');
  }
  
  const client = createOpenAIClient(openaiCfg);
  const enhanced = await enhancePromptForVideo(
    client,
    creative.script,
    openaiCfg
  );
  
  // Update creative with enhanced script
  creative.script = enhanced;
  
  return { creative };
});
```

### Option 3: Preview Enhancement

Let users preview enhancement before rendering:

```javascript
app.post('/:creativeId/preview-enhancement', async (request) => {
  const creative = service.get(orgId, creativeId);
  
  const openaiCfg = resolveOpenAIConfig();
  const client = createOpenAIClient(openaiCfg);
  
  const original = creative.script;
  const enhanced = await enhancePromptForVideo(client, original, openaiCfg);
  
  return { 
    original, 
    enhanced,
    isEnhanced: original !== enhanced 
  };
});
```

## Cost Optimization

### Using gpt-4o-mini

GPT-4o-mini is cost-effective:
- Input: ~$0.15 per 1M tokens
- Output: ~$0.60 per 1M tokens
- Average enhancement: ~500 tokens = ~$0.0005

### Caching Enhancements

Cache enhanced prompts to avoid re-processing:

```javascript
class EnhancementCache {
  constructor() {
    this.cache = new Map();
  }
  
  getKey(prompt) {
    return crypto.createHash('sha256').update(prompt).digest('hex');
  }
  
  get(prompt) {
    return this.cache.get(this.getKey(prompt));
  }
  
  set(prompt, enhanced) {
    this.cache.set(this.getKey(prompt), enhanced);
  }
}
```

### Rate Limiting

Implement rate limiting to avoid excessive API calls:

```javascript
const enhancementLimiter = {
  calls: new Map(),
  
  async checkLimit(userId) {
    const key = userId;
    const now = Date.now();
    const hour = 3600000; // 1 hour
    
    if (!this.calls.has(key)) this.calls.set(key, []);
    
    const times = this.calls.get(key).filter(t => now - t < hour);
    if (times.length >= 20) throw new Error('Enhancement limit exceeded');
    
    times.push(now);
    this.calls.set(key, times);
  }
};
```

## Prompt Engineering Best Practices

### Good Enhancement Prompts

The system includes a default prompt that encourages:

✅ **Visual Details**
- Composition and framing
- Lighting and mood
- Color palette

✅ **Camera Movement**
- Pan, zoom, dolly
- Speed and timing
- Dynamic vs static

✅ **Action & Pacing**
- Key actions and transitions
- Timing and rhythm
- Scene flow

❌ **Avoid**
- Too many subjects
- Conflicting instructions
- Vague directions

## Environment Variables

```bash
# Required for enhancement features
OPENAI_API_KEY=sk-proj-...

# Optional
OPENAI_MODEL=gpt-4o-mini          # Default
GPT4O_ENHANCEMENT_ENABLED=true     # Enable auto-enhancement
GPT4O_CACHE_ENHANCEMENTS=true      # Cache results
```

## Troubleshooting

### Enhancement returns original prompt

**Check**:
1. `OPENAI_API_KEY` is set correctly
2. API key has credits/quota
3. API is not rate limited

**Debug**:
```javascript
const openaiCfg = resolveOpenAIConfig();
console.log('OpenAI config:', openaiCfg ? 'configured' : 'NOT configured');
```

### API Rate Limiting

If you hit rate limits:

1. Reduce enhancement frequency
2. Increase cache hit rate
3. Batch requests
4. Wait and retry with exponential backoff

### Cost Concerns

Monitor usage:

```bash
# View OpenAI API usage
curl https://api.openai.com/v1/usage \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

## Advanced: Custom Enhancement Profiles

Create domain-specific prompts:

```javascript
export const ENHANCEMENT_PROFILES = {
  'product-demo': `You are a product video specialist...`,
  'travel-vlog': `You are a travel cinematographer...`,
  'tutorial': `You are an educational content creator...`,
  'commercial': `You are a professional commercial director...`,
};

async function enhanceWithProfile(client, prompt, profile, cfg) {
  const systemPrompt = ENHANCEMENT_PROFILES[profile] || ENHANCEMENT_PROFILES['product-demo'];
  // Use custom system prompt for enhancement
}
```

## Monitoring & Analytics

Track enhancement effectiveness:

```javascript
const analytics = {
  totalEnhancements: 0,
  averageTokensAdded: 0,
  enhancementToRenderRatio: 0,
  
  record(original, enhanced) {
    this.totalEnhancements++;
    const tokensAdded = enhanced.split(' ').length - original.split(' ').length;
    this.averageTokensAdded = (this.averageTokensAdded + tokensAdded) / this.totalEnhancements;
  }
};
```

## Integration Checklist

- [ ] OpenAI API key configured
- [ ] `promptEnhancerService.js` imported
- [ ] Enhancement endpoint added (optional)
- [ ] Caching implemented (optional)
- [ ] Rate limiting configured (optional)
- [ ] Monitoring setup (optional)
- [ ] Cost monitoring enabled
- [ ] User documentation updated

## Performance Tips

1. **Cache aggressively** - Same prompts don't need re-enhancement
2. **Batch requests** - Enhance multiple prompts in parallel
3. **Set timeouts** - Fail fast if API is slow
4. **Use streaming** - For long prompts (via OpenAI streaming)
5. **Compress prompts** - Remove redundancy before sending

## Next Steps

1. Set `OPENAI_API_KEY` in environment
2. Test with `curl` or Postman:
   ```bash
   POST /creatives/123/preview-enhancement
   {
     "script": "A cat playing with a ball"
   }
   ```
3. Monitor costs and performance
4. Adjust enhancement profiles based on results
5. Consider auto-enhancement in production

## Support

For OpenAI issues:
- [OpenAI API Docs](https://platform.openai.com/docs/api-reference)
- [GPT-4o-mini Guide](https://platform.openai.com/docs/guides/gpt-4o-mini)
- [Rate Limiting](https://platform.openai.com/docs/guides/rate-limits)
