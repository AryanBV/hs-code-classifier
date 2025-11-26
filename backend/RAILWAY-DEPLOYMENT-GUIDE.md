# Railway Deployment Execution Guide

This guide walks you through the actual steps to deploy the HS Code Classifier backend to Railway production.

---

## Prerequisites

Before starting deployment, ensure you have:

- [x] Backend code prepared and tested locally (Phase 5.1 complete)
- [x] GitHub repository set up with the code
- [ ] Railway account created (https://railway.app)
- [ ] Railway CLI installed (optional but recommended)
- [ ] Production environment variables ready (see `.env.production.example`)

---

## Step 1: Prepare Production Environment Variables

### 1.1 Gather Required Values

You'll need these values before deployment:

```
DATABASE_URL=postgresql://[postgres-user]:[password]@db.supabase.co:5432/postgres
DIRECT_URL=postgresql://[postgres-user]:[password]@db.supabase.co:6543/postgres
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SESSION_SECRET=[generate-32-character-random-string]
FRONTEND_URL=https://your-oversell-domain.com (or http://localhost:3000 for now)
```

**How to generate SESSION_SECRET:**
```bash
# Option 1: Using OpenSSL
openssl rand -base64 32

# Option 2: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Option 3: Using Python
python -c "import secrets; print(secrets.token_hex(32))"
```

### 1.2 Get Supabase Database URLs

1. Log into Supabase dashboard (https://supabase.com)
2. Select your production project
3. Go to **Settings** → **Database**
4. Copy the connection string (this is your `DATABASE_URL`)
5. In the connection string, note the host: `db.supabase.co`
6. For `DIRECT_URL`, change the port from `5432` to `6543` in the connection string
7. Example transformation:
   ```
   Original: postgresql://postgres:pwd@db.supabase.co:5432/postgres
   DATABASE_URL: postgresql://postgres:pwd@db.supabase.co:5432/postgres
   DIRECT_URL: postgresql://postgres:pwd@db.supabase.co:6543/postgres
   ```

### 1.3 Get OpenAI API Key

1. Log into OpenAI dashboard (https://platform.openai.com)
2. Go to **API keys** section
3. Create a new secret key (or use existing production key)
4. Copy the key: `sk-proj-xxxxx...`

---

## Step 2: Create Railway Project

### 2.1 Login to Railway

Go to https://railway.app and log in with your GitHub account.

### 2.2 Create New Project

1. Click **New Project** button (top right)
2. Choose **Deploy from GitHub repo**
3. Select your GitHub repository containing the backend code
4. Railway will auto-detect it's a Node.js project
5. Confirm the repository and branch selection

### 2.3 Configure Service

After Railway connects to your repository:

1. A new service will be created automatically
2. Go to the service settings
3. Set **Root Directory** to `backend` (if your repo has multiple services)
4. Configure build and start commands:
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`

---

## Step 3: Add Environment Variables

### 3.1 In Railway Dashboard

1. Go to your project dashboard
2. Click on your backend service
3. Navigate to the **Variables** tab
4. Click **Add Variable** for each required environment variable

### 3.2 Add Each Variable

Add these variables one by one (copy from your gathered values):

```
DATABASE_URL = postgresql://...
DIRECT_URL = postgresql://...
NODE_ENV = production
PORT = 3001
OPENAI_API_KEY = sk-proj-...
FRONTEND_URL = https://your-oversell-domain.com
RATE_LIMIT_WINDOW_MS = 900000
RATE_LIMIT_MAX_REQUESTS = 100
SESSION_SECRET = [your-generated-secret]
LOG_LEVEL = info
```

**⚠️ IMPORTANT**: Do NOT commit environment variables to git. Only add them in Railway dashboard.

---

## Step 4: Verify Railway Configuration

### 4.1 Check Build Settings

1. Go to **Settings** tab in your service
2. Verify:
   - **Node.js version**: 18.0.0 or later
   - **npm version**: 9.0.0 or later
   - **Build command**: `npm run build`
   - **Start command**: `npm start`

### 4.2 Check Deployment Trigger

1. In **Deployments** tab, you should see automatic deployments triggered by git pushes
2. Railway automatically deploys when you push to your configured branch (usually `main` or `master`)

---

## Step 5: Deploy to Production

### Option A: Automatic Deployment (Recommended)

1. Make sure all environment variables are set in Railway
2. Commit and push your code to the main branch:
   ```bash
   git add .
   git commit -m "Prepare backend for production deployment"
   git push origin main
   ```
3. Railway automatically detects the push and starts deployment
4. Watch the deployment logs in Railway dashboard

### Option B: Manual Deployment via Railway CLI

```bash
# Install Railway CLI (if not already installed)
npm install -g @railway/cli

# Login to Railway
railway login

# Link local project to Railway
railway link

# Deploy
railway up
```

### Option C: Manual Deployment via Dashboard

1. Go to Railway dashboard → Your Service → Deployments
2. Click **Deploy** button
3. Select the branch and commit to deploy
4. Click **Deploy Now**

---

## Step 6: Monitor Deployment

### 6.1 Watch Logs

1. Go to **Deployments** tab
2. Click on the active deployment
3. Watch the logs scroll as build progresses
4. Expected build time: 2-5 minutes

### 6.2 Check Status

Look for these lines in the logs:

```
✓ Compiling dependencies
✓ Building application
✓ Starting Node.js server
Server running on port 3001
Database connected successfully
```

### 6.3 Get Production URL

After successful deployment:

1. Go to your service page
2. Find the **Public URL** section
3. It will look like: `https://hs-classifier-api.railway.app`
4. **Save this URL** - you'll need it for frontend integration

---

## Step 7: Post-Deployment Validation

Once deployment is complete and server is running, validate all endpoints:

### 7.1 Health Check

```bash
curl https://[railway-url]/health
```

Expected response:
```json
{
  "status": "ok",
  "message": "HS Code Classifier API is running",
  "timestamp": "2025-11-26T10:30:00.000Z"
}
```

### 7.2 Test Semantic Search

```bash
curl -X POST https://[railway-url]/api/vector-search/search \
  -H "Content-Type: application/json" \
  -d '{"query":"fresh vegetables","limit":5}'
```

Expected: Array of 5 HS codes with descriptions and similarity scores

### 7.3 Test Statistics

```bash
curl https://[railway-url]/api/vector-search/stats
```

Expected response:
```json
{
  "success": true,
  "stats": {
    "totalCodes": 10468,
    "codesWithEmbeddings": 10468,
    "completeness": 100
  }
}
```

### 7.4 Test Similar Codes

```bash
curl "https://[railway-url]/api/vector-search/similar/0804.50.10?limit=3"
```

Expected: Array of similar HS codes

### 7.5 Test Batch Search

```bash
curl -X POST https://[railway-url]/api/vector-search/batch-search \
  -H "Content-Type: application/json" \
  -d '{
    "queries": ["wheat grains", "coffee beans"],
    "limit": 3
  }'
```

Expected: Results for both queries

### 7.6 Test Rate Limiting

Make multiple rapid requests and check for `X-RateLimit-*` headers:

```bash
curl -i https://[railway-url]/api/vector-search/stats
```

Look for headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1234567890
```

---

## Step 8: Configure CORS for Frontend

Once Oversell domain is available:

1. Go to Railway dashboard → Your Service → Variables
2. Update `FRONTEND_URL`:
   ```
   FRONTEND_URL = https://your-oversell-domain.com
   ```
3. Railway automatically redeploys with new CORS origin
4. Frontend can now make requests to the API

---

## Monitoring & Maintenance

### Daily Checks

1. Monitor Railway dashboard for errors
2. Check memory usage (should stay under 512MB)
3. Monitor API response times
4. Review error logs

### Weekly Checks

1. Review logs for error patterns
2. Check database query performance
3. Monitor API usage trends
4. Verify all endpoints still working

### Update Process

When making code changes:

```bash
# 1. Make changes locally
# 2. Test locally: npm run build && npm run dev
# 3. Commit changes
git add .
git commit -m "Add new feature or fix"

# 4. Push to main branch
git push origin main

# 5. Railway automatically deploys
# 6. Monitor in Railway dashboard
# 7. Verify in production: curl https://[railway-url]/health
```

---

## Troubleshooting

### Build Fails

Check Railway logs for specific error. Common issues:

```bash
# Check for TypeScript errors locally
npm run build

# Verify dependencies installed
npm install

# Check Node version
node --version  # Should be 18+
npm --version   # Should be 9+
```

### Database Connection Error

1. Verify `DATABASE_URL` and `DIRECT_URL` are correct
2. Check Supabase is running
3. Test connection locally first:
   ```bash
   npm run prisma:migrate
   ```

### API Returns 500 Errors

1. Check Railway logs for error details
2. Verify OpenAI API key is valid
3. Check database has 10,468 codes with embeddings:
   ```
   GET /api/vector-search/stats
   ```

### Rate Limiting Too Strict

1. Go to Railway Variables
2. Adjust `RATE_LIMIT_MAX_REQUESTS`:
   - Current: 100 per 15 minutes
   - Increase to: 200 per 15 minutes
3. Or adjust `RATE_LIMIT_WINDOW_MS` for longer window

### Slow Responses

1. Check database performance in Supabase dashboard
2. Review Railway CPU/Memory usage
3. Consider upgrading Railway plan if needed
4. Monitor query complexity

---

## Rollback Procedure

If deployment has critical issues:

1. Go to Railway dashboard → Deployments
2. Find the previous working deployment
3. Click **Revert**
4. Deployment instantly reverts to previous version
5. Check logs to confirm it's working

---

## Success Criteria ✅

Backend deployment is successful when:

- [ ] Health check returns 200 with `"status":"ok"`
- [ ] Semantic search returns results with similarity scores
- [ ] All 7 endpoints are accessible
- [ ] Rate limiting headers present in responses
- [ ] Database shows 10,468 codes with 100% embeddings
- [ ] No errors in deployment logs
- [ ] Response times acceptable (<1s for queries)

---

## Next Steps

Once deployment verified:

1. **Record Production URL**: `https://[railway-url]`
2. **Share with Frontend Team**: Provide URL to Oversell UI developers
3. **Update FRONTEND_URL**: When Oversell domain is ready
4. **Begin UI Development**: Frontend can integrate with production API
5. **Monitor Performance**: Check logs daily, watch for errors

---

## Support & Resources

- Railway docs: https://docs.railway.app
- API documentation: See [API-DOCUMENTATION.md](./API-DOCUMENTATION.md)
- Supabase docs: https://supabase.com/docs
- OpenAI API: https://platform.openai.com/docs
- This checklist: [DEPLOYMENT-CHECKLIST.md](./DEPLOYMENT-CHECKLIST.md)

---

## Production Configuration Summary

**What's Deployed**:
- Node.js backend running Express.js
- Vector search with pgvector database
- Rate limiting (100 requests/15 minutes per IP)
- CORS configured for Oversell frontend
- Automatic deployments from git pushes

**What's NOT in Repo** (for security):
- `.env.production` (only `.env.production.example` is committed)
- API keys, secrets, database URLs
- All configured only in Railway dashboard

**Production Guarantees**:
- 99.9% uptime SLA (Railway standard)
- Automatic scaling if traffic increases
- Automated backups via Supabase
- 10,468 HS codes fully indexed with embeddings
- All semantic search fully functional

---

**Last Updated**: 2025-11-26
**Status**: Ready for Production Deployment ✅
