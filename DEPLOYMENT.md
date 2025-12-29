# Deploying to Vercel

This guide will help you deploy the Team Polling App to Vercel.

## Prerequisites

1. A Vercel account (sign up at https://vercel.com)
2. Vercel CLI installed: `npm install -g vercel`
3. Git repository with your code

## Required Services

### 1. Vercel KV (Redis Database)

Vercel KV is required for storing session data.

1. Go to your Vercel dashboard
2. Navigate to Storage > Create Database
3. Select **KV** (Redis)
4. Name it (e.g., "polling-app-kv")
5. Create the database

### 2. Vercel Blob (File Storage)

Vercel Blob is required for storing uploaded images and videos.

1. Go to your Vercel dashboard
2. Navigate to Storage > Create Database
3. Select **Blob**
4. Name it (e.g., "polling-app-blob")
5. Create the storage

## Deployment Steps

### Option 1: Deploy via Vercel Dashboard (Recommended)

1. Push your code to GitHub/GitLab/Bitbucket

2. Go to https://vercel.com/new

3. Import your repository

4. Vercel will auto-detect the settings from `vercel.json`

5. **Connect Storage**:
   - In your project settings, go to Storage tab
   - Connect the KV database you created
   - Connect the Blob storage you created

6. Click **Deploy**

### Option 2: Deploy via CLI

1. Install dependencies:

   ```bash
   npm install
   ```

2. Login to Vercel:

   ```bash
   vercel login
   ```

3. Link to a new project:

   ```bash
   vercel link
   ```

4. Create KV and Blob storage as described above in the Vercel dashboard

5. Deploy:

   ```bash
   vercel --prod
   ```

6. Go to your project dashboard and connect the storage services

## Environment Variables

The KV and Blob storage credentials are automatically added by Vercel when you connect them. You don't need to manually set environment variables.

## Post-Deployment

1. Visit your deployed URL
2. Test the host login with:
   - Username: `GrowthBossHosting`
   - Password: `y&%)U#2+${QF/wG7`
3. Test creating a session and uploading media

## Important Notes

- **Session Expiry**: Sessions expire after 24 hours
- **File Size Limits**:
  - Free tier: Up to 100MB per file
  - Pro tier: Up to 500MB per file
- **Polling Interval**: Results update every 2 seconds (you can adjust in the code)
- **Database Limits**: Free tier includes 256MB storage

## Troubleshooting

### "Session not found" error

- Sessions expire after 24 hours
- Host needs to create a new session

### Media upload fails

- Check file size is under the limit
- Verify Blob storage is connected in project settings

### Results not updating

- Check browser console for errors
- Verify KV database is connected

## Cost Estimates

**Free Tier Includes:**

- Vercel KV: 256MB storage, 30,000 commands/month
- Vercel Blob: 100GB bandwidth/month
- Vercel Hosting: 100GB bandwidth/month

For typical usage (small team, occasional polls):

- **Free tier should be sufficient**

For production use with many teams:

- Consider upgrading to Pro tier ($20/month)

## Support

For issues with Vercel services:

- Vercel Docs: https://vercel.com/docs
- Vercel Support: https://vercel.com/support
