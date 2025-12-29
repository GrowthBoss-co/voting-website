# Free Deployment Guide - Hybrid Setup (ImgBB + Cloudinary)

Deploy your Team Polling App to Vercel **100% FREE** using a smart hybrid approach:

- **Images** → ImgBB (unlimited)
- **Videos** → Cloudinary (compressed to fit free tier)

## What You'll Need (All Free)

1. **Vercel Account** (Free Hobby tier)
2. **Upstash Account** (Free Redis database)
3. **ImgBB Account** (Free UNLIMITED image storage)
4. **Cloudinary Account** (Free video storage with compression)
5. **GitHub Account** (for code hosting)

---

## Step 1: Set Up Upstash Redis (Free)

1. Go to https://upstash.com/
2. Sign up for a free account (no credit card required)
3. Click **Create Database**
4. Choose:
   - **Name**: `polling-app-sessions`
   - **Region**: Choose closest to you
   - **Type**: Regional (Free)
5. Click **Create**
6. On the database page, scroll to **REST API** section
7. **Copy and save**:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

**Free Tier:**

- 10,000 commands per day
- 256 MB storage

---

## Step 2: Set Up ImgBB for Images (Free Unlimited)

1. Go to https://imgbb.com/
2. Sign up for a free account (no credit card required)
3. Go to https://api.imgbb.com/
4. Click **Get API Key**
5. **Copy and save**: `IMGBB_API_KEY`

**Free Tier:**

- ✅ Unlimited storage
- ✅ Unlimited bandwidth
- ✅ Unlimited uploads
- ✅ Handles all images

---

## Step 3: Set Up Cloudinary for Videos (Free)

1. Go to https://cloudinary.com/
2. Sign up for a free account (no credit card required)
3. After login, go to **Dashboard**
4. **Copy and save**:
   - `Cloud Name` (e.g., "dx1a2b3c4")
   - `API Key` (e.g., "123456789012345")
   - `API Secret` (click "eye" icon to reveal)

**Free Tier:**

- 25 GB storage
- 25 GB bandwidth/month
- **Auto-compression** keeps you within limits!

---

## Step 4: Push Code to GitHub

1. **Initialize Git**:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Create a new GitHub repository**:
   - Go to https://github.com/new
   - Name it (e.g., "team-polling-app")
   - Click **Create repository**

3. **Push your code**:
   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/team-polling-app.git
   git branch -M main
   git push -u origin main
   ```

---

## Step 5: Deploy to Vercel

1. Go to https://vercel.com/
2. Sign up/login (free account)
3. Click **Add New** → **Project**
4. **Import** your GitHub repository
5. Vercel will auto-detect settings from `vercel.json`

**BEFORE clicking Deploy**, add environment variables:

### Add Environment Variables

In the Vercel project configuration, click **Environment Variables** and add **ALL 6** variables:

| Name                       | Value             | Where to find             |
| -------------------------- | ----------------- | ------------------------- |
| `UPSTASH_REDIS_REST_URL`   | `https://...`     | From Upstash dashboard    |
| `UPSTASH_REDIS_REST_TOKEN` | `AY...`           | From Upstash dashboard    |
| `IMGBB_API_KEY`            | `abc123def...`    | From ImgBB API page       |
| `CLOUDINARY_CLOUD_NAME`    | `dx1a2b3c4`       | From Cloudinary dashboard |
| `CLOUDINARY_API_KEY`       | `123456789012345` | From Cloudinary dashboard |
| `CLOUDINARY_API_SECRET`    | `your-secret`     | From Cloudinary dashboard |

**Make sure all 6 are added!**

6. Click **Deploy**

---

## Step 6: Test Your Deployment

1. Once deployed, visit your URL (e.g., `your-app.vercel.app`)
2. Click **Host Session**
3. Login:
   - Username: `GrowthBossHosting`
   - Password: `y&%)U#2+${QF/wG7`
4. Upload an **image** → Goes to ImgBB
5. Upload a **video** → Goes to Cloudinary (auto-compressed to 720p)
6. Test voting!

---

## How the Hybrid System Works

**When you upload media:**

```
Image file (JPG, PNG, GIF)
  ↓
  → ImgBB (unlimited bandwidth)
  ↓
  Stored forever, unlimited views ✅

Video file (MP4, MOV, etc.)
  ↓
  → Cloudinary with auto-compression
  ↓
  Compressed to 720p (~70% size reduction)
  ↓
  Stored within free tier limits ✅
```

**Result:** Best of both worlds!

---

## Cost Breakdown (100% FREE!)

**For 30 polls/week with 15 people:**

| Service                 | Your Usage       | Free Tier     | Status        |
| ----------------------- | ---------------- | ------------- | ------------- |
| **Upstash**             | ~7,260 req/month | 300,000/month | ✅ 2.4% used  |
| **ImgBB** (images)      | Unlimited        | Unlimited     | ✅ No limits! |
| **Cloudinary** (videos) | ~15 GB/month     | 25 GB/month   | ✅ 60% used   |
| **Vercel**              | ~5 GB/month      | 100 GB/month  | ✅ 5% used    |

**Total Cost: $0/month FOREVER** 🎉

---

## Automatic Compression

Videos are automatically compressed to:

- **Max resolution**: 720p (HD quality)
- **Quality**: Auto-optimized
- **Size reduction**: ~70-80% smaller
- **15 videos/week**: ~15 GB/month (well within 25 GB free tier!)

**No action needed** - compression happens automatically on upload!

---

## Troubleshooting

### "Session not found" error

- Check Upstash environment variables in Vercel
- Redeploy after adding env variables

### Image upload fails

- Verify `IMGBB_API_KEY` is correct (no spaces)
- Check https://api.imgbb.com/ to verify API key is active

### Video upload fails

- Check all 3 Cloudinary variables are correct
- Verify API Secret has no spaces
- Make sure video is under 100 MB before upload

### Can't access environment variables

- Go to Vercel: **Settings** → **Environment Variables**
- All 6 variables must be added for **Production**
- Redeploy the project after adding

---

## Updating Your App

```bash
# Make changes locally
git add .
git commit -m "Update description"
git push

# Vercel auto-deploys!
```

---

## Usage Recommendations

**To stay 100% free:**

- ✅ Mix of images and videos (perfect!)
- ✅ Up to 30 polls/week
- ✅ Keep videos under 5 minutes each
- ✅ Auto-compression handles the rest

**If you exceed Cloudinary limits:**

- You'll get an email warning
- Videos still work, but you may need to upgrade
- Cloudinary Plus: $89/year ($7.42/month)

---

## Why This Hybrid Approach?

| Method              | Images       | Videos           | Monthly Cost        |
| ------------------- | ------------ | ---------------- | ------------------- |
| **Only Cloudinary** | Limited      | Limited          | Free (tight limits) |
| **Only ImgBB**      | Unlimited    | ❌ Not supported | Won't work          |
| **Hybrid (This!)**  | ✅ Unlimited | ✅ Compressed    | ✅ $0/month         |

**Best of both worlds!**

---

## Need Help?

**Common Issues:**

1. **Deployment fails**: Check all 6 env variables
2. **Images won't upload**: Verify ImgBB API key
3. **Videos won't upload**: Verify Cloudinary credentials
4. **Sessions not persisting**: Check Upstash credentials

**Support:**

- Vercel: https://vercel.com/docs
- Upstash: https://docs.upstash.com
- ImgBB: https://api.imgbb.com/
- Cloudinary: https://cloudinary.com/documentation
