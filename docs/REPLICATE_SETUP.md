# Replicate Video Generation Setup

## 🚀 Quick Start (3 minutes)

### 1. Get Your API Key

1. Go to [Replicate](https://replicate.com)
2. Sign up or log in
3. Go to [API tokens](https://replicate.com/account/api-tokens)
4. Copy your API token (looks like `r8_...`)

### 2. Add to Environment

Edit `backend/.env`:

```bash
REPLICATE_API_KEY=r8_...paste_your_token_here...
```

### 3. Test It!

Start your backend:
```bash
npm run dev
```

Create and render a video:
```bash
# Create creative
curl -X POST http://localhost:4000/api/v1/creatives/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "script": "A serene mountain landscape at sunrise with mist in the valleys. Camera pans slowly across the misty peaks as golden sunlight breaks through the clouds."
  }'

# Start rendering (use creative ID from above)
curl -X POST http://localhost:4000/api/v1/creatives/CREATIVE_ID/render \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# Check status (poll every 5 seconds)
curl http://localhost:4000/api/v1/creatives/CREATIVE_ID/render-status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

That's it! ✅

---

## 📊 Available Models

### Text-to-Video

| Model | Quality | Speed | Cost |
|-------|---------|-------|------|
| **Stable Video Diffusion** | Excellent | Medium | Low |
| Zeroscope V2 | Good | Fast | Medium |
| ModelScope | Good | Medium | Low |

**Recommended**: Stable Video Diffusion (default)

### Image-to-Video

| Model | Quality | Speed |
|-------|---------|-------|
| Stable Video Diffusion | Excellent | Medium |
| DynamiCrafter | Very Good | Slow |

---

## ⚙️ Configuration

Add to `.env`:

```bash
# Required
REPLICATE_API_KEY=r8_...

# Optional - Default: Stable Video Diffusion
REPLICATE_MODEL=stability-ai/stable-video-diffusion:3f0457e4619daec51aa397c8b0165c02076eb1f38efb033e6379d4374d7cc721

# Optional - Duration in seconds (default: 4)
REPLICATE_VIDEO_LENGTH=4

# Optional - Frames per second (default: 8)
REPLICATE_FPS=8
```

---

## 💰 Pricing

Replicate uses **API credits**:
- Stable Video Diffusion: ~$0.10-0.50 per video
- Zeroscope: ~$0.05-0.20 per video
- ModelScope: ~$0.03-0.10 per video

Check [pricing](https://replicate.com/pricing) for current rates.

---

## 🎯 Usage

### Text-to-Video

```bash
POST /api/v1/creatives/:creativeId/render
{
  "script": "Your prompt/script here"
}
```

### Image-to-Video

```bash
POST /api/v1/creatives/:creativeId/render-image-to-video
{
  "imageUrl": "https://example.com/image.jpg",
  "script": "Optional motion description"
}
```

---

## 📝 Prompt Tips

### Great Prompts ✅
```
A serene forest clearing with morning mist rising from the ground. 
Slow pan from left to right, then gentle zoom into the tree canopy. 
Golden hour sunlight filtering through the trees, warm and peaceful.
```

### Poor Prompts ❌
```
A forest
```

### Guidelines

1. **Be descriptive** - Include colors, lighting, mood
2. **Specify camera movement** - Pan, zoom, dolly, tracking
3. **Include action** - What's happening in the scene
4. **Set the style** - Cinematic, documentary, commercial, etc.

---

## 🔍 Troubleshooting

### "API key not configured"
```bash
# Check if REPLICATE_API_KEY is set
echo $REPLICATE_API_KEY

# Should output your token, not empty
```

### "Invalid API key"
1. Go to https://replicate.com/account/api-tokens
2. Get a fresh token
3. Update `.env`
4. Restart backend

### Generation takes too long
- Model is processing (normal, takes 1-5 minutes)
- Check status endpoint regularly
- Reduce video length if timing out

### No output video
Check the logs for the actual error message

---

## 📈 Monitor Costs

Check your [usage](https://replicate.com/account/usage) on Replicate dashboard.

Set alerts if you want to monitor spending:
```bash
# In your app, track calls
const calls = [];
calls.push({
  model: 'stable-video-diffusion',
  timestamp: new Date(),
  status: 'completed'
});

console.log(`Total generations: ${calls.length}`);
```

---

## 🔄 Provider Priority

The system tries providers in this order:

1. **Replicate** (if `REPLICATE_API_KEY` set)
2. **Models Lab** (if `MODELS_LAB_API_KEY` set)
3. **Kling** (if `KLING_KEYS` set)

---

## 📚 More Info

- [Replicate Docs](https://replicate.com/docs)
- [Stable Video Diffusion](https://replicate.com/stability-ai/stable-video-diffusion)
- [Zeroscope](https://replicate.com/arielreplicate/zeroscope-v2-xl)
- [ModelScope](https://replicate.com/camenduru/modelscope-text-to-video)

---

## ✅ Checklist

- [ ] Sign up at replicate.com
- [ ] Copy API token
- [ ] Add to `.env`: `REPLICATE_API_KEY=...`
- [ ] Restart backend: `npm run dev`
- [ ] Test with curl examples above
- [ ] Check logs for success
- [ ] Monitor costs on dashboard

You're all set! 🚀
