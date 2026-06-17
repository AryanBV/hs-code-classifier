# HS Code Classifier - API Documentation

## Overview

Prevyl's HS Code Classifier API classifies a natural-language product description to an Indian ITC-HS code. It runs the **classifier-v2** pipeline — a six-stage flow (L0 Normalization → L1 Triage → L2 Retrieval → L3 Rules filter → L4 Select → L5 Verifier) built on Gemini models plus pgvector retrieval over the Indian tariff catalogue. The endpoint returns one of three outcomes: a classification, a clarifying question, or a refusal.

**API Base URL**: `http://localhost:3001` (development) or your Railway URL (production)

**API Prefix**: `/api/classify`

---

## Authentication

The classify endpoints (`POST /api/classify`, `POST /api/classify/answer`) are intended to be reached only via the frontend BFF, which forwards an `x-internal-token` header. When `INTERNAL_API_TOKEN` is set the API requires an exact match, otherwise it responds `403 Forbidden`. In production a missing token causes the endpoint to fail closed (`503 Service not configured`). The health and job-poll endpoints are unauthenticated. Rate limiting is applied per IP address to prevent abuse.

---

## Rate Limiting

All requests are rate-limited to prevent abuse:
- **Global limit**: 100 requests per 15 minutes per IP address
- **Classify limit** (`/api/classify`, `/api/classify/answer`): a tighter per-IP cap (default 5 per minute) plus a global all-IPs ceiling (default 20 requests per minute). Exceeding the per-IP cap returns `429`; exceeding the global ceiling returns `503` (retryable).
- **Response headers**:
  - `X-RateLimit-Limit`: Maximum requests in window
  - `X-RateLimit-Remaining`: Remaining requests in window
  - `X-RateLimit-Reset`: Unix timestamp when limit resets

**Rate limit exceeded response** (HTTP 429):
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Max 100 requests per 15 minutes.",
  "retryAfter": 450,
  "resetTime": "2025-11-26T10:30:00.000Z"
}
```

---

## Endpoints

### 1. Health Check
Check if the API is running.

**Endpoint**: `GET /health`

**Response** (HTTP 200):
```json
{
  "status": "ok",
  "timestamp": "2025-11-26T05:28:28.860Z"
}
```

> A richer body (service name, environment shape, daily cost counter) is returned only when a valid `x-internal-token` header is presented. The classify router also exposes its own probe at `GET /api/classify/health`.

---

### 2. Classify
Classify a natural-language product description to an Indian ITC-HS code. Runs the classifier-v2 pipeline and returns one of three outcomes: a classification, a clarifying question, or a refusal.

**Endpoint**: `POST /api/classify`

**Request Body**:
```json
{
  "query": "ceramic brake pads for trucks",
  "previousAnswers": {}
}
```

**Parameters**:
- `query` (string, **required**): Natural-language product description (3–1000 characters).
- `previousAnswers` (object, optional): Map of `questionId → answerId` carried forward across a multi-turn classification (the wizard threads these).

**Headers**:
- `x-internal-token` (**required** when `INTERNAL_API_TOKEN` is configured): forwarded by the frontend BFF.

**Response** (HTTP 200) — the body is a flat DTO discriminated by `responseType`.

`responseType: "classification"`:
```json
{
  "responseType": "classification",
  "hsCode": "6813.20.00",
  "description": "Containing asbestos",
  "confidence": 90,
  "confidenceBand": "high",
  "reasoning": "...reasoning chain joined with newlines...",
  "alternatives": [
    { "code": "8708.30.00", "description": "Brakes and servo-brakes; parts thereof" }
  ],
  "isSixDigit": false,
  "exportPolicy": "Free",
  "policyCondition": null,
  "indiaSpecific": true,
  "selfConfidence": "HIGH",
  "citation": { },
  "components": null,
  "processingTimeMs": 26000
}
```

`responseType: "question"` (the pipeline needs a clarifying answer):
```json
{
  "responseType": "question",
  "question": "What is the primary material?",
  "options": [
    { "id": "ceramic", "label": "Ceramic" },
    { "id": "metal", "label": "Metal / sintered" },
    { "id": "other", "label": "Something else" }
  ],
  "questionId": "material",
  "discriminatingAttribute": "material",
  "trigger": "sibling",
  "processingTimeMs": 24000
}
```

`responseType: "refused"` (out of scope / not classifiable):
```json
{
  "responseType": "refused",
  "message": "This product is out of scope for ITC-HS classification.",
  "reason": "out_of_scope",
  "processingTimeMs": 8000
}
```

**Error** (HTTP 400 - Missing/Invalid Query):
```json
{
  "error": "Missing or invalid query parameter",
  "example": { "query": "ceramic brake pads for trucks" }
}
```

**Other responses**:
- `403` — `x-internal-token` missing or wrong.
- `503` (retryable) — classifier busy (concurrency/RPM gate), temporarily unavailable, timed out, or the daily free-classification limit was reached.

**Example**:
```bash
curl -X POST http://localhost:3001/api/classify \
  -H "Content-Type: application/json" \
  -H "x-internal-token: $INTERNAL_API_TOKEN" \
  -d '{"query": "cotton woven shirts for men"}'
```

---

### 3. Answer (continue classification)
Continue a classification after the user answers a clarifying question. The answered question is folded back into `previousAnswers` and the pipeline is re-entered.

**Endpoint**: `POST /api/classify/answer`

**Request Body**:
```json
{
  "originalQuery": "ceramic brake pads for trucks",
  "questionId": "material",
  "answerId": "ceramic",
  "previousAnswers": {},
  "rounds": 1
}
```

**Parameters**:
- `originalQuery` (string, **required**): The original product description.
- `questionId` (string, **required**): The id of the question being answered.
- `answerId` (string, **required**): The selected option id.
- `previousAnswers` (object, optional): Answers accumulated so far.
- `rounds` (integer, optional): Multi-turn round counter threaded by the wizard.

**Headers**:
- `x-internal-token` (**required** when `INTERNAL_API_TOKEN` is configured).

**Response** (HTTP 200): same flat `responseType` DTO as `POST /api/classify` — a follow-up `question`, a final `classification`, or a `refused`.

**Error** (HTTP 400 - Missing Parameters):
```json
{
  "error": "Missing required parameters",
  "required": ["originalQuery", "questionId", "answerId"]
}
```

**Example**:
```bash
curl -X POST http://localhost:3001/api/classify/answer \
  -H "Content-Type: application/json" \
  -H "x-internal-token: $INTERNAL_API_TOKEN" \
  -d '{
    "originalQuery": "ceramic brake pads for trucks",
    "questionId": "material",
    "answerId": "ceramic"
  }'
```

---

### 4. Classify Health
Health check for the classification router.

**Endpoint**: `GET /api/classify/health`

**Response** (HTTP 200):
```json
{
  "status": "ok",
  "service": "hs-code-classifier",
  "timestamp": "2025-11-26T05:28:28.860Z"
}
```

**Example**:
```bash
curl http://localhost:3001/api/classify/health
```

---

## Response Format

A successful classification response is a flat DTO discriminated by `responseType` (`"classification" | "question" | "refused"`) — see the **Classify** endpoint above for each shape.

Error responses follow this format:

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

Some errors add a `retryable` boolean (e.g. the `503` busy/timeout/limit cases) so clients know whether to retry.

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200  | Success |
| 400  | Bad Request (invalid parameters) |
| 403  | Forbidden (`x-internal-token` missing or wrong) |
| 404  | Not Found (route not found) |
| 429  | Too Many Requests (per-IP rate limit) |
| 500  | Internal Server Error |
| 503  | Service Unavailable (busy / RPM ceiling / timeout / daily limit / not configured) — usually `retryable` |

---

## Retrieval Internals

The L2 retrieval stage combines pgvector HNSW similarity (`gemini-embedding-001` @1536-dim) with Postgres full-text search, then re-ranks the candidates with a Gemini-Flash rerank. Vector similarity uses **cosine similarity** (0 = unrelated, 1 = identical). These are internal pipeline knobs — they are not exposed as request parameters on the public classify API.

---

## Example Integration

### Python
```python
import os
import requests

api_url = "http://localhost:3001/api/classify"
headers = {"x-internal-token": os.environ["INTERNAL_API_TOKEN"]}
payload = {"query": "plastic bottles for packaging"}

response = requests.post(api_url, json=payload, headers=headers)
result = response.json()

if result["responseType"] == "classification":
    print(f"{result['hsCode']}: {result['description']} (confidence: {result['confidence']})")
elif result["responseType"] == "question":
    print(f"Need more info: {result['question']}")
else:
    print(f"Refused: {result['message']}")
```

### JavaScript/Node.js
```javascript
const axios = require('axios');

const apiUrl = 'http://localhost:3001/api/classify';
const headers = { 'x-internal-token': process.env.INTERNAL_API_TOKEN };
const payload = { query: 'plastic bottles for packaging' };

axios.post(apiUrl, payload, { headers })
  .then(({ data }) => {
    if (data.responseType === 'classification') {
      console.log(`${data.hsCode}: ${data.description} (confidence: ${data.confidence})`);
    } else if (data.responseType === 'question') {
      console.log(`Need more info: ${data.question}`);
    } else {
      console.log(`Refused: ${data.message}`);
    }
  })
  .catch(error => console.error(error));
```

### cURL
```bash
curl -X POST http://localhost:3001/api/classify \
  -H "Content-Type: application/json" \
  -H "x-internal-token: $INTERNAL_API_TOKEN" \
  -d '{"query":"plastic bottles for packaging"}'
```

---

## Best Practices

1. **Use specific queries**: More descriptive queries yield better results
   - ✅ Good: "waterproof cotton fabric suitable for outdoor use"
   - ❌ Poor: "fabric"

2. **Handle all three `responseType`s**: Be ready to render a `classification`, ask the user a follow-up `question`, or surface a `refused` message — the pipeline returns whichever fits.

3. **Continue questions via `/answer`**: When you receive a `question`, post the chosen `answerId` (with its `questionId` and the original query) to `POST /api/classify/answer` to advance the classification.

4. **Expect latency**: The pipeline runs several model calls; median latency is roughly 26s. Use generous client timeouts and show progress.

5. **Handle rate limits gracefully**: Implement exponential backoff when receiving `429` or retryable `503` responses.

6. **Forward the internal token**: Send `x-internal-token` from your server-side BFF — do not expose it to the browser.

---

## Support & Issues

For issues or questions, refer to:
- API logs on Railway dashboard
- GitHub repository (if available)
- Check rate limit status in response headers

---

## Version History

- **v2** (current): classifier-v2 pipeline
  - Six-stage flow (L0 Normalization → L1 Triage → L2 Retrieval → L3 Rules filter → L4 Select → L5 Verifier) on Gemini models
  - 12,460 eight-digit ITC-HS tariff lines in the catalogue
  - Endpoints: `POST /api/classify`, `POST /api/classify/answer`, `GET /api/classify/health`, plus top-level `GET /health`
  - Internal-token gate + rate limiting enabled
