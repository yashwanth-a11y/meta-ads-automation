# Code Examples - Video Generation Integration

## Table of Contents

1. [Basic Usage](#basic-usage)
2. [Text-to-Video](#text-to-video)
3. [Image-to-Video](#image-to-video)
4. [Prompt Enhancement](#prompt-enhancement)
5. [Error Handling](#error-handling)
6. [Advanced Patterns](#advanced-patterns)

---

## Basic Usage

### Using CreativeService Directly

```javascript
import { CreativeService } from './services/CreativeService.js';

// Initialize service
const creativeService = new CreativeService({ logger: console });

// Create a creative
const creative = await creativeService.generate('org-123', {
  script: 'A serene forest landscape with morning mist...'
});

console.log('Creative ID:', creative.id);
console.log('Script:', creative.script);
```

---

## Text-to-Video

### Basic Flow

```javascript
import { CreativeService } from './services/CreativeService.js';

const service = new CreativeService({ logger: console });

// Step 1: Create creative
const creative = await service.generate('org-id', {
  script: 'A bustling city street at night with neon lights'
});

// Step 2: Start rendering
const job = service.startRender('org-id', creative.id, {
  script: creative.script
});

console.log('Render started:', job.jobId);

// Step 3: Poll for completion
let status = { status: 'processing', progress: 0 };
while (status.status === 'processing') {
  await new Promise(r => setTimeout(r, 2000));
  status = service.renderStatus('org-id', creative.id);
  console.log(`Progress: ${status.progress}%`);
}

if (status.status === 'completed') {
  console.log('Video URL:', status.videoUrl);
} else {
  console.error('Generation failed:', status.error);
}
```

### With Express/Fastify Routes

```javascript
// GET /creatives/:id/render-status
app.get('/creatives/:id/render-status', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;
    
    const status = service.renderStatus(orgId, id);
    return res.json({ render: status });
  } catch (err) {
    return res.status(404).json({ error: err.message });
  }
});

// POST /creatives/:id/render
app.post('/creatives/:id/render', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;
    
    const job = service.startRender(orgId, id, {
      script: req.body.script
    });
    
    return res.json({ job });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});
```

### With Custom Prompt Building

```javascript
import { buildModelsLabPrompt } from './services/modelsLabClient.js';

// User provides simple script
const userScript = "A cat playing with a ball";

// Build cinematic prompt
const cinemaPrompt = buildModelsLabPrompt(userScript);
console.log(cinemaPrompt);
// Output:
// Generate cinematic video footage based on this script...
// SCRIPT:
// A cat playing with a ball
// ...
```

---

## Image-to-Video

### Basic Image Animation

```javascript
const job = service.startImageToVideoRender('org-id', creative.id, {
  imageUrl: 'https://example.com/image.jpg',
  script: 'Slow pan across the landscape with gentle motion'
});

console.log('Image-to-video started:', job.jobId);
console.log('Generation type:', job.generationType); // 'image-to-video'

// Poll same as text-to-video
const status = service.renderStatus('org-id', creative.id);
```

### Multiple Images in Sequence

```javascript
const images = [
  'https://example.com/img1.jpg',
  'https://example.com/img2.jpg',
  'https://example.com/img3.jpg'
];

const videos = await Promise.all(
  images.map((imageUrl, idx) =>
    // Create creative for each image
    service.generate('org-id', {
      script: `Image sequence part ${idx + 1}`
    }).then(creative => 
      // Start image-to-video render
      service.startImageToVideoRender('org-id', creative.id, {
        imageUrl,
        script: `Animate this image with smooth motion`
      })
    )
  )
);

console.log('Started', videos.length, 'image-to-video renders');
```

---

## Prompt Enhancement

### Auto-Enhance Before Rendering

```javascript
import {
  resolveOpenAIConfig,
  createOpenAIClient,
  enhancePromptForVideo
} from './services/promptEnhancerService.js';

async function enhancedRender(orgId, creativeId, userScript) {
  // Check if GPT enhancement is available
  const openaiCfg = resolveOpenAIConfig();
  let enhancedScript = userScript;
  
  if (openaiCfg) {
    console.log('Enhancing prompt with GPT-4o Mini...');
    const client = createOpenAIClient(openaiCfg);
    
    try {
      enhancedScript = await enhancePromptForVideo(
        client,
        userScript,
        openaiCfg
      );
      console.log('Enhanced script:', enhancedScript);
    } catch (err) {
      console.warn('Enhancement failed, using original:', err.message);
      // Falls back to original
    }
  }
  
  // Use enhanced script
  return service.startRender(orgId, creativeId, {
    script: enhancedScript
  });
}

// Usage
const job = await enhancedRender('org-id', 'creative-id', 'A cat playing');
```

### Generate Prompt from Description

```javascript
import {
  generateVideoPrompt,
  createOpenAIClient,
  resolveOpenAIConfig
} from './services/promptEnhancerService.js';

const openaiCfg = resolveOpenAIConfig();
const client = createOpenAIClient(openaiCfg);

const description = "A sunset beach scene";
const style = "tropical paradise, cinematic";

const fullPrompt = await generateVideoPrompt(
  client,
  description,
  style,
  openaiCfg
);

console.log('Generated prompt:', fullPrompt);
// A wide shot of a pristine tropical beach with white sand...
```

### A/B Test Variations

```javascript
import {
  generatePromptVariations,
  createOpenAIClient,
  resolveOpenAIConfig
} from './services/promptEnhancerService.js';

const openaiCfg = resolveOpenAIConfig();
const client = createOpenAIClient(openaiCfg);

const basePrompt = "A forest landscape";

// Generate 3 variations
const variations = await generatePromptVariations(
  client,
  basePrompt,
  3,
  openaiCfg
);

// Start render for each variation
const jobs = await Promise.all(
  variations.map(async (prompt, idx) => {
    const creative = await service.generate('org-id', { script: prompt });
    return service.startRender('org-id', creative.id);
  })
);

console.log('Started', jobs.length, 'A/B test renders');
```

### Script Analysis

```javascript
import {
  analyzeScript,
  createOpenAIClient,
  resolveOpenAIConfig
} from './services/promptEnhancerService.js';

const openaiCfg = resolveOpenAIConfig();
const client = createOpenAIClient(openaiCfg);

const script = "A cat playing with a ball";

const analysis = await analyzeScript(client, script, openaiCfg);

console.log('Clarity:', analysis.clarity); // 1-10
console.log('Cinematic potential:', analysis.cinematicPotential); // 1-10
console.log('Visual details:', analysis.visualDetails); // 1-10
console.log('Suggestions:', analysis.suggestions); // ["Add...", "Consider..."]
console.log('Enhanced version:', analysis.enhancedVersion);
```

---

## Error Handling

### Handling Generation Failures

```javascript
import { formatModelsLabRenderError } from './services/modelsLabClient.js';

async function safeRender(orgId, creativeId, script) {
  try {
    const job = service.startRender(orgId, creativeId, { script });
    return { success: true, jobId: job.jobId };
  } catch (err) {
    // Format for user display
    const userMessage = formatModelsLabRenderError(err);
    
    // Log with context
    console.error('Render failed:', {
      error: err.message,
      userMessage,
      creativeId,
      orgId
    });
    
    return {
      success: false,
      message: userMessage,
      statusCode: 400
    };
  }
}
```

### Polling with Error Handling

```javascript
async function pollUntilComplete(orgId, creativeId, maxWaitSeconds = 600) {
  const startTime = Date.now();
  const maxWait = maxWaitSeconds * 1000;
  
  while (Date.now() - startTime < maxWait) {
    try {
      const status = service.renderStatus(orgId, creativeId);
      
      if (status.status === 'completed') {
        return { success: true, videoUrl: status.videoUrl };
      }
      
      if (status.status === 'failed') {
        return {
          success: false,
          error: status.error || 'Generation failed'
        };
      }
      
      // Still processing
      console.log(`Progress: ${status.progress}%`);
      await new Promise(r => setTimeout(r, 3000));
      
    } catch (err) {
      console.error('Error polling status:', err);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  
  return {
    success: false,
    error: `Timeout: video generation took longer than ${maxWaitSeconds}s`
  };
}
```

### Graceful Degradation

```javascript
async function generateWithFallback(orgId, script) {
  const openaiCfg = resolveOpenAIConfig();
  
  let finalScript = script;
  
  // Try to enhance if available
  if (openaiCfg) {
    try {
      const client = createOpenAIClient(openaiCfg);
      finalScript = await enhancePromptForVideo(client, script, openaiCfg);
      console.log('✅ Prompt enhanced');
    } catch (err) {
      console.warn('⚠️ Enhancement unavailable, using original');
      // Continue with original script
    }
  }
  
  // Render with enhanced or original script
  const creative = await service.generate(orgId, { script: finalScript });
  const job = service.startRender(orgId, creative.id);
  
  return job;
}
```

---

## Advanced Patterns

### Batch Processing

```javascript
async function batchGenerateVideos(orgId, scripts, options = {}) {
  const concurrency = options.concurrency || 3;
  const queue = [...scripts];
  const results = [];
  
  const processOne = async () => {
    while (queue.length > 0) {
      const script = queue.shift();
      try {
        const creative = await service.generate(orgId, { script });
        const job = service.startRender(orgId, creative.id);
        results.push({ success: true, script, jobId: job.jobId });
      } catch (err) {
        results.push({ success: false, script, error: err.message });
      }
    }
  };
  
  // Process in parallel
  await Promise.all(Array(concurrency).fill().map(() => processOne()));
  
  return results;
}

// Usage
const scripts = [
  "A forest at sunrise",
  "An ocean wave",
  "Mountains at sunset"
];

const jobs = await batchGenerateVideos('org-id', scripts, { concurrency: 2 });
console.log(`Started ${jobs.filter(j => j.success).length}/${scripts.length} jobs`);
```

### Webhook Notifications

```javascript
// When rendering completes, send webhook
async function notifyOnCompletion(orgId, creativeId, webhookUrl) {
  const pollInterval = 3000;
  const maxAttempts = 200;
  
  for (let i = 0; i < maxAttempts; i++) {
    const status = service.renderStatus(orgId, creativeId);
    
    if (status.status === 'completed' || status.status === 'failed') {
      // Send webhook
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creativeId,
          status: status.status,
          videoUrl: status.videoUrl,
          error: status.error,
          timestamp: new Date().toISOString()
        })
      });
      
      return;
    }
    
    await new Promise(r => setTimeout(r, pollInterval));
  }
}

// Usage
notifyOnCompletion('org-id', 'creative-id', 'https://app.example.com/webhook/video-ready');
```

### Caching Enhancements

```javascript
import crypto from 'crypto';

class PromptEnhancementCache {
  constructor() {
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
  }
  
  getKey(prompt) {
    return crypto
      .createHash('sha256')
      .update(prompt.trim())
      .digest('hex');
  }
  
  async get(client, prompt, cfg) {
    const key = this.getKey(prompt);
    
    if (this.cache.has(key)) {
      this.hits++;
      console.log(`Cache hit (${this.hits}/${this.hits + this.misses})`);
      return this.cache.get(key);
    }
    
    this.misses++;
    const enhanced = await enhancePromptForVideo(client, prompt, cfg);
    this.cache.set(key, enhanced);
    
    return enhanced;
  }
  
  stats() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total * 100).toFixed(1) : 0;
    return { hits: this.hits, misses: this.misses, hitRate: `${hitRate}%` };
  }
}

// Usage
const cache = new PromptEnhancementCache();

const enhanced1 = await cache.get(client, "A forest", openaiCfg);
const enhanced2 = await cache.get(client, "A forest", openaiCfg); // Cache hit!

console.log(cache.stats());
// { hits: 1, misses: 1, hitRate: '50.0%' }
```

### Monitoring & Analytics

```javascript
class VideoGenerationMetrics {
  constructor() {
    this.metrics = {
      totalRequests: 0,
      successfulGenerations: 0,
      failedGenerations: 0,
      averageDuration: 0,
      totalDuration: 0,
      errorCounts: {}
    };
  }
  
  recordStart(creativeId) {
    this.metrics.totalRequests++;
    return Date.now();
  }
  
  recordSuccess(startTime) {
    this.metrics.successfulGenerations++;
    const duration = Date.now() - startTime;
    this.updateAverageDuration(duration);
  }
  
  recordFailure(error) {
    this.metrics.failedGenerations++;
    const errorType = error.message.split(':')[0] || 'unknown';
    this.metrics.errorCounts[errorType] = 
      (this.metrics.errorCounts[errorType] || 0) + 1;
  }
  
  updateAverageDuration(duration) {
    this.metrics.totalDuration += duration;
    this.metrics.averageDuration = 
      this.metrics.totalDuration / this.metrics.successfulGenerations;
  }
  
  getReport() {
    const successRate = 
      (this.metrics.successfulGenerations / this.metrics.totalRequests * 100)
      .toFixed(1);
    
    return {
      ...this.metrics,
      successRate: `${successRate}%`,
      averageDurationSeconds: (this.metrics.averageDuration / 1000).toFixed(1)
    };
  }
}

// Usage
const metrics = new VideoGenerationMetrics();

const start = metrics.recordStart(creativeId);
try {
  // ... do generation ...
  metrics.recordSuccess(start);
} catch (err) {
  metrics.recordFailure(err);
}

console.log(metrics.getReport());
// {
//   totalRequests: 10,
//   successfulGenerations: 8,
//   failedGenerations: 2,
//   successRate: '80.0%',
//   averageDurationSeconds: '45.2',
//   errorCounts: { 'Insufficient balance': 2 }
// }
```

---

## Complete Example: Full Workflow

```javascript
import { CreativeService } from './services/CreativeService.js';
import {
  resolveOpenAIConfig,
  createOpenAIClient,
  enhancePromptForVideo
} from './services/promptEnhancerService.js';

class VideoGenerationWorkflow {
  constructor() {
    this.creativeService = new CreativeService({ logger: console });
    this.openaiCfg = resolveOpenAIConfig();
  }
  
  async generateVideo(orgId, userInput) {
    console.log('🎬 Starting video generation workflow...');
    
    // Step 1: Get user input
    let script = userInput.script.trim();
    console.log('📝 User input:', script);
    
    // Step 2: Enhance prompt (optional)
    if (this.openaiCfg) {
      console.log('✨ Enhancing prompt...');
      const client = createOpenAIClient(this.openaiCfg);
      script = await enhancePromptForVideo(client, script, this.openaiCfg);
      console.log('🎨 Enhanced:', script);
    }
    
    // Step 3: Create creative
    console.log('📋 Creating creative...');
    const creative = await this.creativeService.generate(orgId, { script });
    console.log('✅ Creative created:', creative.id);
    
    // Step 4: Start rendering
    console.log('🎥 Starting render...');
    const job = this.creativeService.startRender(orgId, creative.id);
    console.log('⏳ Render started:', job.jobId);
    
    // Step 5: Poll until complete
    console.log('👀 Polling for completion...');
    const result = await this.pollUntilDone(orgId, creative.id);
    
    if (result.success) {
      console.log('🎉 Success! Video URL:', result.videoUrl);
      return { success: true, videoUrl: result.videoUrl, creativeId: creative.id };
    } else {
      console.error('❌ Failed:', result.error);
      return { success: false, error: result.error, creativeId: creative.id };
    }
  }
  
  async pollUntilDone(orgId, creativeId, timeoutSeconds = 600) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutSeconds * 1000) {
      const status = this.creativeService.renderStatus(orgId, creativeId);
      
      if (status.status === 'completed') {
        return { success: true, videoUrl: status.videoUrl };
      }
      
      if (status.status === 'failed') {
        return { success: false, error: status.error };
      }
      
      console.log(`  Progress: ${status.progress}%`);
      await new Promise(r => setTimeout(r, 3000));
    }
    
    return { success: false, error: 'Timeout' };
  }
}

// Usage
const workflow = new VideoGenerationWorkflow();

const result = await workflow.generateVideo('org-123', {
  script: 'A beautiful sunset over the ocean with birds flying'
});

console.log(result);
```

---

## Best Practices

1. **Always handle errors** - Video generation can fail for multiple reasons
2. **Use reasonable timeouts** - 10 minutes is standard, adjust for your needs
3. **Cache enhancements** - Don't re-process the same prompt
4. **Monitor metrics** - Track success rates and common errors
5. **Test prompts** - Quality prompts = quality videos
6. **Rate limit requests** - Respect API rate limits
7. **Log context** - Include org/creative IDs in logs for debugging
8. **Provide feedback** - Show users progress and clear error messages

---

## Common Patterns Summary

| Pattern | Use Case |
|---------|----------|
| Basic Flow | Simple video generation |
| Batch Processing | Generate multiple videos |
| A/B Testing | Test different prompt variations |
| Auto-Enhancement | Improve vague user inputs |
| Webhooks | Notify external systems |
| Caching | Avoid re-processing same prompts |
| Monitoring | Track performance and errors |
| Fallback | Graceful degradation |

All these patterns are production-ready and can be combined for complex workflows!
