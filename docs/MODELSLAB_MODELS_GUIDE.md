# ModelsLab Models Guide

## 🎬 All Available Models

### Text-to-Video Models

| Model | Speed | Quality | Cost/sec | Best For |
|-------|-------|---------|----------|----------|
| **Kling V2 Master** (Default) | ⚡ Fast | ⭐⭐⭐⭐ High | $0.02 | General use, testing |
| **Kling V2 Pro** | 🐢 Medium | ⭐⭐⭐⭐⭐ Very High | $0.04 | Premium quality videos |
| **Kling V1** | ⚡ Fast | ⭐⭐⭐ Good | $0.02 | Stable, reliable |
| **WAN 2.1** | 🚀 Very Fast | ⭐⭐⭐ Good | $0.01 | Quick testing, budget |
| **WAN 1** | 🚀 Very Fast | ⭐⭐⭐ Good | $0.01 | Budget option |
| **Stable Video Diffusion** | 🐢 Medium | ⭐⭐⭐⭐ High | $0.03 | Different style |
| **ModelScope** | 🐢 Medium | ⭐⭐⭐ Good | $0.02 | Alternative option |

### Image-to-Video Models

| Model | Speed | Quality | Cost/sec | Best For |
|-------|-------|---------|----------|----------|
| **Kling Image-to-Video** | 🐢 Medium | ⭐⭐⭐⭐ High | $0.02 | Animate images |
| **Kling Image-to-Video Pro** | 🐢 Slow | ⭐⭐⭐⭐⭐ Very High | $0.04 | Premium image animations |

### Animation Models

| Model | Speed | Quality | Cost/sec | Best For |
|-------|-------|---------|----------|----------|
| **AnimateDiff** | 🐢 Medium | ⭐⭐⭐ Good | $0.02 | Animate prompts |

---

## 💰 Cost Analysis for Your $10 Credit

### 30-Second Video Pricing

| Model | Cost | Videos with $10 |
|-------|------|-----------------|
| **WAN 2.1** (Cheapest) | $0.30 | ~33 videos ✅ |
| **Kling V1** | $0.60 | ~16 videos ✅ |
| **Kling V2 Master** (Default) | $0.60 | ~16 videos ✅ |
| **Stable Video** | $0.90 | ~11 videos ✅ |
| **Kling V2 Pro** | $1.20 | ~8 videos 🟡 |

**Recommendation**: Start with **Kling V2 Master** or **WAN 2.1** for best balance.

---

## 🚀 How to Use Different Models

### Option 1: Set Default Model in `.env`

Edit `backend/.env`:

```bash
# Use WAN 2.1 (cheapest)
MODELS_LAB_MODEL=wan2.1

# Or use Kling V2 Pro (highest quality)
MODELS_LAB_MODEL=kling-v2-pro

# Or use Kling V1 (stable)
MODELS_LAB_MODEL=kling-v1

# Or use Stable Video Diffusion
MODELS_LAB_MODEL=stable-video-diffusion
```

Then restart backend:
```bash
npm run dev
```

All new videos will use the selected model.

### Option 2: Test Multiple Models

Generate videos with different models to compare:

```bash
# 1. Generate with Kling V2 Master (default)
curl -X POST http://localhost:4000/api/v1/creatives/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"script":"A serene mountain landscape at sunrise"}'
# Note: Copy creative ID

# 2. Render with default model
curl -X POST http://localhost:4000/api/v1/creatives/CREATIVE_ID_1/render \
  -H "Authorization: Bearer YOUR_TOKEN" -d '{}'

# 3. Change model in .env to WAN 2.1
# MODELS_LAB_MODEL=wan2.1

# 4. Restart backend: npm run dev

# 5. Generate another creative
curl -X POST http://localhost:4000/api/v1/creatives/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"script":"A serene mountain landscape at sunrise"}'

# 6. Render with WAN 2.1
curl -X POST http://localhost:4000/api/v1/creatives/CREATIVE_ID_2/render \
  -H "Authorization: Bearer YOUR_TOKEN" -d '{}'

# Compare the results!
```

---

## 🎯 Model Selection Tips

### For Testing & Experimenting
```bash
MODELS_LAB_MODEL=wan2.1  # $0.01/sec - Ultra budget friendly
```
- Generate many videos to find what works
- A/B test different prompts
- Quick iterations

### For Production Videos (Balanced)
```bash
MODELS_LAB_MODEL=kling-v2-master  # $0.02/sec (DEFAULT)
```
- Great quality for the price
- Good speed
- Best overall balance
- **Recommended for most use cases**

### For Premium Quality
```bash
MODELS_LAB_MODEL=kling-v2-pro  # $0.04/sec
```
- Highest quality output
- Slower generation
- Double the cost
- For final, polished videos

### For Stable Reliability
```bash
MODELS_LAB_MODEL=kling-v1  # $0.02/sec
```
- Battle-tested, very stable
- Consistent results
- Same speed as V2 Master

---

## 📊 Quick Comparison

### Kling V2 Master vs. Kling V2 Pro

**V2 Master:**
- Fast generation (10-15 min for 30s)
- High quality ⭐⭐⭐⭐
- $0.02/sec (affordable)
- Best for volume

**V2 Pro:**
- Slower generation (20-30 min for 30s)
- Very high quality ⭐⭐⭐⭐⭐
- $0.04/sec (premium)
- Best for final output

### WAN 2.1 vs. Kling Models

**WAN 2.1:**
- Fastest generation ⚡
- Good quality (not quite Kling)
- $0.01/sec (cheapest!)
- Perfect for testing

**Kling:**
- Balanced speed/quality
- High quality output ⭐⭐⭐⭐
- $0.02/sec (good price)
- Great all-arounder

---

## 🔄 Image-to-Video Model Selection

### Standard Image-to-Video
```bash
MODELS_LAB_MODEL=kling-image-to-video
```
- Good quality animations
- Medium speed
- $0.02/sec
- Best for most images

### Pro Image-to-Video
```bash
MODELS_LAB_MODEL=kling-image-to-video-pro
```
- Premium quality animations
- Slower generation
- $0.04/sec
- For high-value images

---

## 💡 Usage Strategy for Your $10

### Budget Plan (Maximize Video Count)
```
Model: WAN 2.1
Strategy: Generate 30+ test videos, find best performing ones
Cost: ~$0.30 per 30-sec video
Result: 33 videos to test
```

### Balanced Plan (Quality + Quantity) ✅ RECOMMENDED
```
Model: Kling V2 Master (default)
Strategy: Generate 8-12 final videos, iterate 1-2 times
Cost: ~$0.60 per 30-sec video
Result: 16 videos with good quality
```

### Premium Plan (Quality Focus)
```
Model: Kling V2 Pro
Strategy: Generate 6-8 final polished videos
Cost: ~$1.20 per 30-sec video
Result: 8 videos with excellent quality
```

---

## 🧪 A/B Testing Setup

Test multiple models with the same prompt:

```bash
# 1. Create one creative
PROMPT="A serene mountain landscape at sunrise with mist in the valleys. Camera pans slowly across the misty peaks as golden sunlight breaks through the clouds."

curl -X POST http://localhost:4000/api/v1/creatives/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d "{\"script\":\"$PROMPT\"}"
# Copy creative ID

# 2. Test with 3 different models
# Edit .env and restart for each:

# Test 1: WAN 2.1
MODELS_LAB_MODEL=wan2.1
npm run dev
# curl -X POST http://localhost:4000/api/v1/creatives/CREATIVE_ID/render ...

# Test 2: Kling V2 Master (default)
MODELS_LAB_MODEL=kling-v2-master
npm run dev
# curl -X POST http://localhost:4000/api/v1/creatives/CREATIVE_ID/render ...

# Test 3: Kling V2 Pro
MODELS_LAB_MODEL=kling-v2-pro
npm run dev
# curl -X POST http://localhost:4000/api/v1/creatives/CREATIVE_ID/render ...

# Compare all 3 results!
```

---

## 📝 Model Selection by Use Case

### Social Media Ads
```bash
MODELS_LAB_MODEL=kling-v2-master  # Best balance
```
- Good quality for thumbnails
- Fast generation
- Cost-effective

### Product Demos
```bash
MODELS_LAB_MODEL=kling-v2-pro  # Premium quality
```
- High quality matters
- Budget allows it
- Professional output

### YouTube Shorts / TikTok
```bash
MODELS_LAB_MODEL=wan2.1  # Fast & cheap
```
- Generate many variations
- Quick iteration
- Budget-friendly

### Website Hero Videos
```bash
MODELS_LAB_MODEL=kling-v2-master  # Balanced
```
- Good quality
- Not too slow
- Cost-effective

### Marketing Campaigns
```bash
MODELS_LAB_MODEL=kling-v2-pro  # Premium
```
- Highest quality needed
- Professional standards
- Worth the investment

---

## ✅ Current Setup

Your `.env` has:
```bash
MODELS_LAB_MODEL=kling-v2-master  # DEFAULT
```

To switch models, edit this line and restart:
```bash
npm run dev
```

---

## 🎬 Ready to Test Models?

Try with different models and see which one you prefer!

```bash
# Current setup uses Kling V2 Master
# To test another: edit MODELS_LAB_MODEL in .env and restart
```

---

## 📞 Model Support

All models are maintained by ModelsLab. If a model fails:
1. Check your account balance (https://modelslab.com)
2. Verify API key is correct
3. Try another model to isolate the issue
4. Contact ModelsLab support if persistent

---

**Recommendation**: Start with **Kling V2 Master** (default) and experiment with other models as you explore! 🎥
