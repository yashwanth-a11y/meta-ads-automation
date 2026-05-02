# Video Generation Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Configure Models Lab API (60 seconds)

Add to your `.env` file:

```bash
MODELS_LAB_API_KEY=G9Ulw1bl1INYsIfO8X4tUDqUiunVcY9wtlQ9ywZoKETe2Vf6TFLfSDnN7f9Q
MODELS_LAB_MODEL=kling-v2-master
MODELS_LAB_DURATION=5
MODELS_LAB_ASPECT_RATIO=9:16
```

### Step 2: Start the Backend (30 seconds)

```bash
cd backend
npm install  # If not already done
npm run dev
```

Check that it starts without errors. Should see: "Server running on..."

### Step 3: Create a Creative (30 seconds)

```bash
curl -X POST http://localhost:3000/api/creatives/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "script": "A serene mountain landscape at sunrise with birds flying overhead. Pan across the misty valleys as the sun breaks through the clouds."
  }'
```

You'll get:
```json
{
  "creative": {
    "id": "abc-123",
    "script": "...",
    "createdAt": "2026-05-03T..."
  }
}
```

**Save the `id`** - you'll need it next.

### Step 4: Start Video Generation (20 seconds)

```bash
curl -X POST http://localhost:3000/api/creatives/abc-123/render \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"script": "..."}'
```

Response:
```json
{
  "job": {
    "jobId": "xyz-789",
    "status": "queued",
    "creativeId": "abc-123"
  }
}
```

### Step 5: Check Status (Poll every 5 seconds)

```bash
curl http://localhost:3000/api/creatives/abc-123/render-status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Status Flow**:
- `queued` → `processing` (0-100%) → `completed` (video ready!)
- If something goes wrong: → `failed` (check error message)

Once `status: "completed"`, you'll see `videoUrl` with your generated video!

## 📝 Write Good Prompts

### Template

```
[SCENE DESCRIPTION]
A serene forest clearing with morning mist rising from the ground.

[CAMERA MOVEMENT]
Slow pan from left to right, then gentle zoom into the tree canopy.

[LIGHTING & MOOD]
Golden hour sunlight filtering through the trees, warm and peaceful.

[ACTION & DETAILS]
Birds chirping, gentle breeze rustling leaves, sunlight reflecting off water.

[STYLE]
Cinematic, nature documentary, serene and contemplative.
```

### Examples

**Good ✅**
```
Aerial shot of a bustling city at night. Camera slowly pans across 
illuminated skyscrapers and streets filled with traffic. Cinematic, 
professional lighting, dynamic movement.
```

**Bad ❌**
```
A city
```

## 🎯 Common Use Cases

### Product Demo
```
Close-up of a modern smartwatch being placed on a wrist. 
Screen lights up showing colorful interface. 
Slow rotation of the device. Bright, clean, professional lighting.
```

### Travel Content
```
Wide shot of a tropical beach with white sand and turquoise water. 
Camera zooms in on palm trees swaying gently. 
Golden sunset lighting, warm and inviting mood.
```

### Social Media Ad
```
Quick cuts of a person drinking coffee. 
Upbeat motion. Bright, clean aesthetic. 
Professional slow-motion, social media friendly aspect ratio.
```

## 🎬 Image-to-Video (Animation)

Want to animate a still image?

```bash
curl -X POST http://localhost:3000/api/creatives/abc-123/render-image-to-video \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://example.com/photo.jpg",
    "script": "Slow pan across the landscape with gentle motion in the trees"
  }'
```

## 🔧 Troubleshooting

### "API Key error" or "unauthorized"
```bash
# Check your key is set
echo $MODELS_LAB_API_KEY

# If empty, add to .env and restart
MODELS_LAB_API_KEY=G9Ulw1bl1INYsIfO8X4tUDqUiunVcY9wtlQ9ywZoKETe2Vf6TFLfSDnN7f9Q
```

### "Insufficient balance"
Your Models Lab account needs credits. Check at models.run/billing

### Video generation times out
- Try a shorter video (MODELS_LAB_DURATION=3)
- Simplify your prompt
- Check if the Models Lab service is down

### Wrong video format
Set in `.env`:
```bash
MODELS_LAB_ASPECT_RATIO=9:16    # Mobile vertical
MODELS_LAB_ASPECT_RATIO=16:9    # Widescreen
MODELS_LAB_ASPECT_RATIO=1:1     # Square
```

## 🎓 Optional: Enhance with GPT-4o Mini

Want to auto-improve prompts? Add GPT-4o Mini:

```bash
OPENAI_API_KEY=sk-proj-your-key
```

Then import:
```javascript
import { enhancePromptForVideo } from './services/promptEnhancerService.js';
```

See `docs/GPT_4O_MINI_INTEGRATION.md` for details.

## 📊 API Reference (Quick)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/creatives/generate` | POST | Create a new creative |
| `/creatives/:id` | GET | Get creative details |
| `/creatives/:id/render` | POST | Start text-to-video |
| `/creatives/:id/render-image-to-video` | POST | Start image-to-video |
| `/creatives/:id/render-status` | GET | Check generation status |
| `/creatives/:id/regenerate` | POST | Update script |

See `docs/MODELS_LAB_INTEGRATION.md` for full API docs.

## 🎯 Next Steps

1. ✅ Set API key in `.env`
2. ✅ Create a creative
3. ✅ Start rendering
4. ✅ Check status (refresh every 5s)
5. ✅ Get video URL when done
6. ✅ (Optional) Try image-to-video
7. ✅ (Optional) Add GPT-4o Mini enhancement

## 💡 Pro Tips

1. **Cache your videos** - Don't re-generate the same prompt
2. **Test locally first** - Use simple prompts to test before production
3. **Monitor costs** - Keep an eye on Models Lab API usage
4. **Batch requests** - Generate multiple videos together
5. **A/B test** - Try different prompt styles to see what works
6. **Use templates** - Build reusable prompt templates for your use case

## 🔗 Helpful Links

- [Models Lab Docs](https://models.run/docs)
- [Full Integration Guide](./MODELS_LAB_INTEGRATION.md)
- [GPT-4o Mini Enhancement](./GPT_4O_MINI_INTEGRATION.md)
- [API Errors & Troubleshooting](./MODELS_LAB_INTEGRATION.md#troubleshooting)

## ❓ Still Stuck?

1. Check `.env` file has all required variables
2. Restart the backend server
3. Check backend logs: `npm run dev` output
4. Verify API key is valid: models.run/dashboard
5. Check Models Lab service status

**Need help?** Check the full docs in `/docs/` or reach out!

## 🎉 Success!

Once you see a video URL in render-status, you've got it working! 🎬

Now start building amazing video generation features!
