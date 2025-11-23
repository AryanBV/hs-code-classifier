# Quick Deployment Steps - HS Code Classifier

## 🚀 Deploy in 30 Minutes

Follow these steps to deploy both backend and frontend to production.

---

## ✅ Preparation Checklist

Before you start, ensure you have:

- [ ] OpenAI API key (get from https://platform.openai.com/api-keys)
- [ ] Railway account (sign up at https://railway.app with GitHub)
- [ ] Vercel account (sign up at https://vercel.com with GitHub)
- [ ] Code committed to GitHub repository

---

## Part 1: Deploy Backend to Railway (15 min)

### Step 1: Create Railway Project

1. Go to https://railway.app
2. Click "Login" → Sign in with GitHub
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose `hs-code-classifier` repository
6. **IMPORTANT**: Set root directory to `backend`

### Step 2: Add PostgreSQL Database

1. In Railway project dashboard, click "+ New"
2. Select "Database" → "Add PostgreSQL"
3. Railway will automatically provision a PostgreSQL database
4. The `DATABASE_URL` will be auto-linked to your backend service

### Step 3: Configure Environment Variables

In Railway dashboard, click on your backend service → "Variables" tab:

Add these environment variables:

```env
# Database (Railway auto-generates this)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# OpenAI API Key (REPLACE WITH YOUR ACTUAL KEY!)
OPENAI_API_KEY=sk-proj-your-actual-openai-api-key-here

# Server Config
PORT=3001
NODE_ENV=production

# CORS - You'll update this after deploying frontend
FRONTEND_URL=http://localhost:3000
```

**CRITICAL**:
- Get your OpenAI API key from https://platform.openai.com/api-keys
- Don't use a placeholder - use your real API key!

### Step 4: Configure Build Settings

Railway should auto-detect, but verify in "Settings" → "Build":

**Build Command**:
```bash
npm install && npx prisma generate && npm run build
```

**Start Command**:
```bash
npx prisma db push && npx prisma db seed && npm start
```

### Step 5: Deploy Backend

1. Railway will automatically start deploying
2. Wait 3-5 minutes for deployment to complete
3. Check "Deployments" tab for progress
4. Look for "✓ Build successful" and "✓ Deployed"

###Step 6: Generate Public URL

1. In Railway dashboard, click on your backend service
2. Go to "Settings" → "Networking"
3. Click "Generate Domain"
4. Railway will provide a URL like: `https://hs-code-classifier-production.up.railway.app`

**📝 SAVE THIS URL - You'll need it for the frontend!**

### Step 7: Test Backend

Open your browser or use curl:

```bash
# Replace with YOUR actual Railway URL
curl https://your-backend.railway.app/health
```

You should see:
```json
{
  "status": "ok",
  "message": "HS Code Classifier API is running",
  "timestamp": "2024-11-23T..."
}
```

✅ **Backend deployment complete!**

---

## Part 2: Deploy Frontend to Vercel (10 min)

### Step 1: Create Vercel Project

1. Go to https://vercel.com
2. Click "Sign Up" → Sign in with GitHub
3. Click "Add New..." → "Project"
4. Import `hs-code-classifier` repository

### Step 2: Configure Project Settings

**Framework Preset**: Next.js (auto-detected)
**Root Directory**: `frontend` (IMPORTANT: click "Edit" and set this!)
**Build Command**: `npm run build` (auto-detected)
**Output Directory**: `.next` (auto-detected)
**Install Command**: `npm install` (auto-detected)

### Step 3: Add Environment Variable

**BEFORE clicking Deploy**, add environment variable:

In "Environment Variables" section:

**Name**: `NEXT_PUBLIC_API_URL`
**Value**: `https://your-backend.railway.app` (use YOUR Railway URL from Part 1!)

**Environments**: Check all three:
- ✅ Production
- ✅ Preview
- ✅ Development

**Example**:
```env
NEXT_PUBLIC_API_URL=https://hs-code-classifier-production.up.railway.app
```

### Step 4: Deploy Frontend

1. Click "Deploy"
2. Wait 2-3 minutes for build to complete
3. Vercel will show deployment progress
4. Look for "✓ Build Completed" and "Visit" button

### Step 5: Get Frontend URL

After deployment, Vercel shows your URL:
```
https://hs-code-classifier.vercel.app
```

Or your custom domain if you configured one.

**📝 SAVE THIS URL - You need to update backend CORS!**

✅ **Frontend deployment complete!**

---

## Part 3: Update Backend CORS (5 min)

### Step 1: Update Railway Environment Variables

1. Go back to Railway dashboard
2. Click on your backend service
3. Go to "Variables" tab
4. Find `FRONTEND_URL` variable
5. Click "Edit" (pencil icon)

### Step 2: Add Frontend URL

Update the value to include your Vercel URL:

```env
FRONTEND_URL=http://localhost:3000,https://hs-code-classifier.vercel.app
```

**Format**:
- Comma-separated list (no spaces!)
- Include `http://localhost:3000` if you want to test locally
- Include your Vercel URL
- Add custom domain if you have one

**Example**:
```env
FRONTEND_URL=https://hs-code-classifier.vercel.app,https://hscodeclassifier.com
```

### Step 3: Save and Redeploy

1. Click "Save" or "Update"
2. Railway will automatically redeploy (takes ~2 minutes)
3. Wait for "✓ Deployed" status

✅ **CORS configuration complete!**

---

## Part 4: Test Production Deployment (5 min)

### Test 1: Open Frontend

1. Visit your Vercel URL: `https://hs-code-classifier.vercel.app`
2. Homepage should load correctly
3. No console errors (press F12 → Console tab)

### Test 2: Classify a Product

1. Enter product description:
   ```
   Steel bolts M8 x 25mm, zinc plated, for automotive use
   ```

2. Select destination country: "United States"

3. Click "Classify Product"

4. Wait 3-10 seconds

5. You should see:
   - ✅ HS Code (e.g., `7318.15.20`)
   - ✅ Description
   - ✅ Confidence score
   - ✅ Reasoning (expandable)
   - ✅ Alternative codes

### Test 3: Check Network (DevTools)

1. Open Chrome DevTools (F12)
2. Go to "Network" tab
3. Submit classification again
4. Look for request to your Railway backend
5. Status should be `200 OK`
6. Response should contain classification data

### Test 4: Mobile Responsiveness

1. In Chrome DevTools, click device toolbar (Ctrl+Shift+M)
2. Test different device sizes:
   - iPhone SE (375px)
   - iPhone 12 Pro (390px)
   - iPad (768px)
   - Desktop (1920px)
3. Verify layout looks good on all sizes

✅ **If all tests pass, deployment is successful!**

---

## 🎉 You're Live!

Your application is now deployed and accessible to anyone:

**Frontend**: https://hs-code-classifier.vercel.app
**Backend API**: https://your-backend.railway.app/health

---

## 📊 Monitor Your Deployment

### Railway Monitoring

- **Logs**: Railway dashboard → Service → Logs
- **Metrics**: CPU, Memory, Network usage
- **Database**: Check Postgres tab for connection stats

### Vercel Monitoring

- **Analytics**: Vercel dashboard → Analytics
- **Logs**: Deployments → Click deployment → Function Logs
- **Performance**: Real-time Core Web Vitals

### OpenAI Usage

- **Dashboard**: https://platform.openai.com/usage
- **Costs**: Monitor daily usage
- **Estimated cost**: $0.001-0.003 per classification

---

## 🔧 Troubleshooting

### "Network Error" when classifying

**Cause**: Frontend can't reach backend or CORS issue

**Fix**:
1. Verify `NEXT_PUBLIC_API_URL` in Vercel is correct
2. Test backend directly: `curl https://your-backend.railway.app/health`
3. Check Railway logs for CORS errors
4. Ensure `FRONTEND_URL` in Railway includes your Vercel URL

### "OpenAI API Error"

**Cause**: Invalid or missing OpenAI API key

**Fix**:
1. Go to Railway → Variables
2. Check `OPENAI_API_KEY` is set correctly
3. Verify key is active at https://platform.openai.com/api-keys
4. Check you have credits: https://platform.openai.com/usage

### "Database Connection Failed"

**Cause**: PostgreSQL not linked or DATABASE_URL wrong

**Fix**:
1. Ensure PostgreSQL service exists in Railway project
2. Verify `DATABASE_URL=${{Postgres.DATABASE_URL}}` in variables
3. Check Railway logs for connection errors
4. Try redeploying backend

### Frontend Build Fails

**Cause**: Missing dependencies or TypeScript errors

**Fix**:
1. Check Vercel build logs for specific error
2. Verify `package.json` and `package-lock.json` are committed
3. Ensure root directory is set to `frontend`
4. Try "Redeploy" with cache cleared

---

## 💰 Cost Estimates

### Railway (Backend + Database)

- **Free Tier**: $5 credit/month
- **Typical Usage**: $3-5/month
- **Includes**: ~500 hours uptime + PostgreSQL database

### Vercel (Frontend)

- **Free Tier**: 100 GB bandwidth/month
- **Typical Usage**: $0/month (free tier sufficient)
- **Unlimited**: Deployments, builds, domains

### OpenAI API (GPT-4o-mini)

- **Per Classification**: $0.001 - $0.003
- **100 classifications**: ~$0.10 - $0.30
- **1000 classifications**: ~$1 - $3

**Total Monthly Cost (low traffic)**: $3-8/month

---

## 🔒 Security Checklist

- [ ] OpenAI API key stored in Railway environment (not in code)
- [ ] `.env` files gitignored (never committed)
- [ ] CORS restricted to your frontend domain only
- [ ] HTTPS enforced (automatic on Railway + Vercel)
- [ ] Database credentials secured (Railway managed)
- [ ] No secrets in frontend code

---

## 🚀 Next Steps

1. **Share with beta testers**: Send them your Vercel URL
2. **Monitor performance**: Check Railway + Vercel dashboards daily
3. **Track costs**: Monitor OpenAI usage
4. **Collect feedback**: Use console logs to see user interactions
5. **Custom domain** (optional): Add your own domain in Vercel settings

---

## 📚 Full Documentation

For detailed guides, see:
- [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md) - Comprehensive 2000+ line guide
- [frontend/PRODUCTION-DEPLOYMENT-CHECKLIST.md](./frontend/PRODUCTION-DEPLOYMENT-CHECKLIST.md) - Frontend checklist

---

## 🆘 Need Help?

- **Railway Discord**: https://discord.gg/railway
- **Vercel Discord**: https://discord.gg/vercel
- **Railway Docs**: https://docs.railway.app
- **Vercel Docs**: https://vercel.com/docs

---

**Last Updated**: November 23, 2024
**Status**: Production Deployment Ready
