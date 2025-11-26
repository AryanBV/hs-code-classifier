# Production Quick Reference Card

## Production API URLs

**Development (Local)**:
```
http://localhost:3001
```

**Production (Railway)**:
```
https://[your-railway-url]
```

---

## Essential API Endpoints

### 1. Health Check
```bash
GET /health
# Response: {"status":"ok","message":"...","timestamp":"..."}
```

### 2. Semantic Search
```bash
POST /api/vector-search/search
{
  "query": "fresh vegetables",
  "limit": 5,
  "threshold": 0.3
}
```

### 3. Find Similar Codes
```bash
GET /api/vector-search/similar/0804.50.10?limit=5
```

### 4. Batch Search
```bash
POST /api/vector-search/batch-search
{
  "queries": ["wheat", "coffee"],
  "limit": 3
}
```

### 5. Hybrid Search
```bash
POST /api/vector-search/hybrid-search
{
  "query": "agricultural products",
  "keywords": ["fruit", "grain"],
  "limit": 5
}
```

### 6. Get Statistics
```bash
GET /api/vector-search/stats
# Response: {"totalCodes":10468,"codesWithEmbeddings":10468,"completeness":100}
```

### 7. Generate Embedding
```bash
POST /api/vector-search/embedding
{
  "text": "test commodity"
}
```

---

## Environment Variables (Production)

```
DATABASE_URL=postgresql://...@db.supabase.co:5432/postgres
DIRECT_URL=postgresql://...@db.supabase.co:6543/postgres
NODE_ENV=production
PORT=3001
OPENAI_API_KEY=sk-proj-...
FRONTEND_URL=https://your-oversell-domain.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
SESSION_SECRET=[secure-32-char-string]
LOG_LEVEL=info
```

---

## Pre-Deployment Checklist

- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] All environment variables gathered (see RAILWAY-DEPLOYMENT-GUIDE.md)
- [ ] Supabase database URL verified
- [ ] OpenAI API key valid and has credits
- [ ] SESSION_SECRET generated (32+ characters)
- [ ] GitHub repository up to date
- [ ] Railway account created
- [ ] `.env.production` NOT committed to git

---

## Deployment Steps (Summary)

1. **Gather Values**
   - DATABASE_URL from Supabase
   - DIRECT_URL (port 6543 version)
   - OPENAI_API_KEY
   - Generate SESSION_SECRET

2. **Railway Setup**
   - Create new project connected to GitHub repo
   - Set root directory to `backend` (if needed)
   - Build command: `npm run build`
   - Start command: `npm start`

3. **Add Environment Variables**
   - In Railway dashboard → Variables tab
   - Add all vars from `.env.production.example`

4. **Deploy**
   - Push code: `git push origin main`
   - OR manually trigger in Railway dashboard
   - Monitor logs for 2-5 minutes

5. **Validate**
   - Test health endpoint
   - Test semantic search
   - Check stats endpoint
   - Verify rate limiting headers

---

## Verification Tests

### Quick Health Test
```bash
curl https://[railway-url]/health
```

### Full Endpoint Test
```bash
#!/bin/bash
BASE_URL="https://[railway-url]"

echo "1. Health Check..."
curl -s $BASE_URL/health | jq .

echo "2. Stats..."
curl -s $BASE_URL/api/vector-search/stats | jq .

echo "3. Semantic Search..."
curl -s -X POST $BASE_URL/api/vector-search/search \
  -H "Content-Type: application/json" \
  -d '{"query":"fresh vegetables","limit":3}' | jq .

echo "4. Similar Codes..."
curl -s "$BASE_URL/api/vector-search/similar/0804.50.10?limit=3" | jq .

echo "5. Rate Limit Headers..."
curl -i -s $BASE_URL/health | grep X-RateLimit
```

---

## Troubleshooting Commands

### Check Build Errors
```bash
npm run build
```

### Check TypeScript
```bash
npx tsc --noEmit
```

### Test Database Connection
```bash
npm run prisma:migrate
```

### View Migration Status
```bash
npm run prisma:studio
```

### Validate Environment
```bash
node -e "console.log('Node:', process.version); console.log('npm:', require('child_process').execSync('npm -v').toString());"
```

---

## Response Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Normal response |
| 400 | Bad Request | Check request body |
| 404 | Not Found | Endpoint doesn't exist |
| 429 | Rate Limited | Wait before retrying |
| 500 | Server Error | Check Railway logs |

---

## Rate Limiting

**Current Settings**:
- Limit: 100 requests per IP
- Window: 15 minutes (900,000 ms)
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

**To Adjust**:
1. Go to Railway dashboard → Variables
2. Edit `RATE_LIMIT_MAX_REQUESTS` (increase to 200, 300, etc.)
3. Save (automatic redeploy)

---

## CORS Configuration

**Currently Accepts From**:
- http://localhost:3000 (development)
- https://your-oversell-domain.com (from FRONTEND_URL env var)

**To Update**:
1. Railway dashboard → Variables
2. Change `FRONTEND_URL` to production domain
3. Automatic redeploy happens

---

## Production Monitoring

### Daily Checks
- [ ] Visit: https://[railway-url]/health
- [ ] Check Railway dashboard for errors
- [ ] Monitor memory usage (should be <512MB)
- [ ] Review logs for errors

### Weekly Checks
- [ ] Run full endpoint test suite
- [ ] Review error patterns in logs
- [ ] Check API response times
- [ ] Verify database connectivity

### Monthly Tasks
- [ ] Review and adjust rate limiting if needed
- [ ] Monitor OpenAI API usage and costs
- [ ] Check for security updates

---

## Common Issues & Fixes

### "Rate limit exceeded"
- Wait 15 minutes and retry
- Or increase `RATE_LIMIT_MAX_REQUESTS` in Railway

### "HS Code not found"
- Code format should be like: `0804.50.10`
- Not all codes may be in database (but should have 10,468)

### "Database connection failed"
- Verify Supabase connection is up
- Check DATABASE_URL and DIRECT_URL are correct
- Test from Railway logs

### "OpenAI API error"
- Verify API key is valid
- Check account has credits
- Verify model name is correct (text-embedding-3-small)

### "Slow responses"
- Check Supabase performance
- Monitor Railway CPU/memory
- Review query complexity
- Consider upgrading Railway tier

---

## Git Deployment Workflow

```bash
# 1. Make changes locally
# 2. Test locally
npm run build
npm run dev

# 3. Commit
git add .
git commit -m "Description of changes"

# 4. Push to main
git push origin main

# 5. Watch Railway dashboard
# 6. Railway automatically deploys (2-5 minutes)

# 7. Verify in production
curl https://[railway-url]/health
```

---

## Files Reference

- **API Documentation**: [API-DOCUMENTATION.md](./API-DOCUMENTATION.md)
- **Deployment Checklist**: [DEPLOYMENT-CHECKLIST.md](./DEPLOYMENT-CHECKLIST.md)
- **Deployment Guide**: [RAILWAY-DEPLOYMENT-GUIDE.md](./RAILWAY-DEPLOYMENT-GUIDE.md)
- **Environment Template**: [.env.production.example](./.env.production.example)

---

## Important Notes

⚠️ **DO NOT**:
- Commit `.env.production` to git
- Share API keys or database URLs
- Use production API key in development
- Deploy without testing locally first

✅ **DO**:
- Keep environment variables in Railway dashboard only
- Test locally before pushing to main
- Monitor logs after deployment
- Review rate limiting for your use case
- Use HTTPS for all API calls

---

## Support

For detailed information, see:
- [RAILWAY-DEPLOYMENT-GUIDE.md](./RAILWAY-DEPLOYMENT-GUIDE.md) - Full deployment steps
- [API-DOCUMENTATION.md](./API-DOCUMENTATION.md) - API endpoint reference
- [DEPLOYMENT-CHECKLIST.md](./DEPLOYMENT-CHECKLIST.md) - Validation checklist

---

**Last Updated**: 2025-11-26
**Status**: Production Ready ✅
