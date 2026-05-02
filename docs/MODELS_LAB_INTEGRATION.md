# Models Lab API Integration Guide

## Overview

This project now supports video generation through **Models Lab API**, in addition to the existing Kling integration. Models Lab provides:

- **Text-to-Video Generation**: Create videos from text prompts/scripts
- **Image-to-Video Generation**: Animate still images into videos
- **Multiple Models**: Support for different model variants (standard, pro, image-to-video)

## Setup

### 1. Get Your API Key

Contact Models Lab or use the provided API key:

```
G9Ulw1bl1INYsIfO8X4tUDqUiunVcY9wtlQ9ywZoKETe2Vf6TFLfSDnN7f9Q
```

### 2. Configure Environment Variables

Add to your `.env` file:

```bash
# Required
MODELS_LAB_API_KEY=G9Ulw1bl1INYsIfO8X4tUDqUiunVcY9wtlQ9ywZoKETe2Vf6TFLfSDnN7f9Q

# Optional (with defaults)
MODELS_LAB_BASE_URL=https://api.models.run/v1
MODELS_LAB_MODEL=kling-v2-master
MODELS_LAB_DURATION=5
MODELS_LAB_ASPECT_RATIO=9:16
MODELS_LAB_NUM_OUTPUTS=1
```

### 3. Verify Integration

The CreativeService will automatically:
- Prefer Models Lab if `MODELS_LAB_API_KEY` is set
- Fall back to Kling if Models Lab is not configured
- Fail gracefully with clear error messages if neither is available

## API Usage

### Text-to-Video Generation

**Endpoint**: `POST /creatives/:creativeId/render`

```bash
curl -X POST http://localhost:3000/creatives/abc123/render \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "script": "A serene forest landscape with sunlight filtering through the trees. Pan across the canopy with birds flying in the distance."
  }'
```

**Response**:
```json
{
  "job": {
    "jobId": "xyz789",
    "status": "queued",
    "creativeId": "abc123"
  }
}
```

### Image-to-Video Generation

**Endpoint**: `POST /creatives/:creativeId/render-image-to-video`

```bash
curl -X POST http://localhost:3000/creatives/abc123/render-image-to-video \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://example.com/image.jpg",
    "script": "Animate this image with a slow pan and subtle motion"
  }'
```

**Response**:
```json
{
  "job": {
    "jobId": "xyz789",
    "status": "queued",
    "creativeId": "abc123",
    "generationType": "image-to-video"
  }
}
```

### Check Render Status

**Endpoint**: `GET /creatives/:creativeId/render-status`

```bash
curl http://localhost:3000/creatives/abc123/render-status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response**:
```json
{
  "render": {
    "jobId": "xyz789",
    "status": "processing",
    "progress": 45,
    "videoUrl": null,
    "error": null
  }
}
```

Possible statuses:
- `idle` - No render job
- `queued` - Waiting to start
- `processing` - Currently generating (progress 0-100)
- `completed` - Done (videoUrl available)
- `failed` - Error occurred (check error field)

## Models

### Text-to-Video Models

| Model | Description | Best For |
|-------|-------------|----------|
| `kling-v2-master` | Standard text-to-video | General purpose videos |
| `kling-v2-pro` | Professional mode | Higher quality outputs |

### Image-to-Video Model

| Model | Description |
|-------|-------------|
| `kling-image-to-video` | Convert images to animated videos | Still image animation |

### Selecting a Model

Set via environment variable:
```bash
MODELS_LAB_MODEL=kling-v2-pro
```

Or the service uses `kling-v2-master` by default.

## Configuration Options

### Video Duration
- **Min**: 1 second
- **Max**: 10 seconds
- **Default**: 5 seconds
- **Env**: `MODELS_LAB_DURATION=5`

### Aspect Ratios
- `9:16` - Vertical (mobile/social) — **Default**
- `16:9` - Horizontal (widescreen)
- `1:1` - Square (social media)

```bash
MODELS_LAB_ASPECT_RATIO=9:16
```

### Number of Outputs
Generate multiple video variations in one request (default 1):

```bash
MODELS_LAB_NUM_OUTPUTS=3
```

## Service Architecture

### CreativeService Flow

```
1. startRender() / startImageToVideoRender()
   ↓
2. _runRenderPipeline() / _runImageToVideoRenderPipeline()
   ↓
3. Check if Models Lab configured → Use Models Lab
   Or fallback to Kling if available
   ↓
4. _runModelsLabRender() / _runModelsLabImageToVideoRender()
   ↓
5. modelsLabGenerateAndPoll() / modelsLabGenerateImageToVideoAndPoll()
   ↓
6. Poll status every 3 seconds until complete/failed
   ↓
7. Return video URL or error message
```

### Error Handling

The system handles:
- **Insufficient balance/credits**: Suggests topping up account
- **Invalid API key**: Clear authorization error
- **Invalid input** (prompt/image): Validation error messages
- **Timeout**: After ~10 minutes of polling
- **Network errors**: Retries automatically

Errors are logged and returned to the client with:
- Clear error message
- Suggestions for resolution
- Request context for debugging

## Prompt Engineering Tips

### Text-to-Video Prompts

Good prompts are **specific, visual, and action-oriented**:

```
❌ "A video about nature"
✅ "Cinematic aerial shot of misty mountains at sunrise, camera slowly zooming out to reveal a vast valley below with deer grazing in the foreground"
```

Guidelines:
- Be specific about scene composition
- Include camera movement (pan, zoom, dolly)
- Describe lighting and mood
- Mention any key subjects/objects
- Use cinematic language

### Image-to-Video Prompts

Describe how the image should animate:

```
❌ "Move the image"
✅ "Slow cinematic pan from left to right across the landscape, with subtle wind motion in the trees and birds flying across the sky"
```

## Troubleshooting

### Video generation fails immediately

**Check**:
1. `MODELS_LAB_API_KEY` is set and valid
2. Account has sufficient balance/credits
3. Script/image URL is valid

**Error Message**: Check the render status error field for details

### Video generation times out

**Possible causes**:
- Models Lab API is experiencing delays
- Very long videos or complex prompts
- Network connectivity issues

**Solution**: Increase timeout in `modelsLabClient.js` if needed, or reduce prompt complexity

### Wrong model is being used

**Ensure** environment variable is set:
```bash
echo $MODELS_LAB_MODEL
# Should output your model, not empty
```

**Check** in code: `resolveModelsLabConfig()` returns the config being used

## Performance Considerations

- **Polling interval**: 3 seconds between status checks
- **Max polling attempts**: 200 (≈10 minutes)
- **API timeout**: 30 seconds per request
- **Prompt limit**: 2500 characters

## Switching Between Providers

### Kling Only
```bash
# Don't set MODELS_LAB_API_KEY
KLING_ACCESS_KEY=xxx
KLING_SECRET_KEY=yyy
```

### Models Lab Only (Recommended)
```bash
# Set Models Lab
MODELS_LAB_API_KEY=xxx

# Don't set Kling keys
```

### Kling Fallback
```bash
# If Models Lab fails, Kling is used as fallback
MODELS_LAB_API_KEY=xxx  # Primary
KLING_ACCESS_KEY=yyy   # Fallback
KLING_SECRET_KEY=zzz
```

## Integration with GPT-4o Mini

For **prompt refinement** or **script generation** using GPT-4o mini before sending to Models Lab:

```javascript
// Example: Enhance user prompt before video generation
async enhancePrompt(userInput) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: `Enhance this for video generation:\n${userInput}`
    }]
  });
  return response.choices[0].message.content;
}
```

## API Response Examples

### Successful Generation
```json
{
  "render": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "progress": 100,
    "videoUrl": "https://models.run/videos/xyz789.mp4",
    "error": null
  }
}
```

### In Progress
```json
{
  "render": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "processing",
    "progress": 67,
    "videoUrl": null,
    "error": null
  }
}
```

### Failed Generation
```json
{
  "render": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "failed",
    "progress": 0,
    "videoUrl": null,
    "error": "Insufficient account balance. Top up credits in your Models Lab dashboard."
  }
}
```

## Development Testing

### Local Testing Without Real API

For testing without consuming API credits, you can mock the Models Lab client:

```javascript
// In development only
if (process.env.NODE_ENV === 'development' && process.env.MOCK_VIDEO_GENERATION === 'true') {
  // Use mock implementation that returns fake video URLs
}
```

## Next Steps

1. ✅ Set `MODELS_LAB_API_KEY` in your environment
2. ✅ Create a creative with `/creatives/generate`
3. ✅ Start rendering with `/creatives/:id/render`
4. ✅ Poll status with `/creatives/:id/render-status`
5. ✅ (Optional) Try image-to-video with `/creatives/:id/render-image-to-video`

## Support

For Models Lab API issues:
- Check [Models Lab Documentation](https://models.run/docs)
- Review error messages in the `error` field of render status
- Check backend logs with `docker logs <container>` or `npm run dev`
