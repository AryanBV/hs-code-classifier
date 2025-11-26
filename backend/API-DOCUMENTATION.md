# HS Code Classifier - API Documentation

## Overview

The HS Code Classifier API provides semantic search capabilities for Harmonized System (HS) product codes using vector embeddings and AI-powered natural language processing.

**API Base URL**: `http://localhost:3001` (development) or your Railway URL (production)

**API Prefix**: `/api/vector-search`

---

## Authentication

Currently, the API is **publicly accessible** without authentication. Rate limiting is applied per IP address to prevent abuse.

---

## Rate Limiting

All requests are rate-limited to prevent abuse:
- **Default limit**: 100 requests per 15 minutes per IP address
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
  "message": "HS Code Classifier API is running",
  "timestamp": "2025-11-26T05:28:28.860Z"
}
```

---

### 2. Semantic Search
Find HS codes based on semantic similarity to a natural language query.

**Endpoint**: `POST /api/vector-search/search`

**Request Body**:
```json
{
  "query": "fresh vegetables",
  "limit": 5,
  "threshold": 0.3
}
```

**Parameters**:
- `query` (string, **required**): Natural language description of the product
- `limit` (integer, optional): Maximum number of results to return (default: 10, max: 50)
- `threshold` (number, optional): Minimum similarity score (0-1, default: 0.5)

**Response** (HTTP 200):
```json
{
  "success": true,
  "query": "fresh vegetables",
  "resultCount": 5,
  "results": [
    {
      "id": 596,
      "code": "0810.40.00",
      "description": "and other fruits of the Free",
      "descriptionClean": "and other fruits of the Free",
      "chapter": "08",
      "heading": "0810.40",
      "subheading": "0810.40.00",
      "country_code": "IN",
      "similarity": "0.488"
    }
    // ... more results
  ]
}
```

**Error** (HTTP 400 - Empty Query):
```json
{
  "error": "Query is required and must not be empty"
}
```

**Example**:
```bash
curl -X POST http://localhost:3001/api/vector-search/search \
  -H "Content-Type: application/json" \
  -d '{"query": "cotton textiles", "limit": 5}'
```

---

### 3. Hybrid Search
Combine semantic search with keyword filtering.

**Endpoint**: `POST /api/vector-search/hybrid-search`

**Request Body**:
```json
{
  "query": "agricultural products",
  "keywords": ["fruit", "grain"],
  "limit": 5,
  "threshold": 0.3
}
```

**Parameters**:
- `query` (string, **required**): Natural language description
- `keywords` (array of strings, optional): Keywords to filter results
- `limit` (integer, optional): Maximum number of results (default: 10)
- `threshold` (number, optional): Minimum similarity score (default: 0.5)

**Response** (HTTP 200):
```json
{
  "success": true,
  "query": "agricultural products",
  "keywordsApplied": 2,
  "resultCount": 5,
  "results": [
    // ... filtered results containing keywords
  ]
}
```

**Example**:
```bash
curl -X POST http://localhost:3001/api/vector-search/hybrid-search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "textile products",
    "keywords": ["cotton", "synthetic"],
    "limit": 10
  }'
```

---

### 4. Find Similar Codes
Find HS codes similar to a given HS code.

**Endpoint**: `GET /api/vector-search/similar/:hsCode`

**URL Parameters**:
- `hsCode` (string, **required**): HS code to find similarities for (e.g., "0804.50.10")

**Query Parameters**:
- `limit` (integer, optional): Maximum results (default: 10)
- `threshold` (number, optional): Minimum similarity score (default: 0.5)

**Response** (HTTP 200):
```json
{
  "success": true,
  "hsCode": "0804.50.10",
  "resultCount": 3,
  "results": [
    {
      "id": 560,
      "code": "0804.40.00",
      "description": "Avocados Free",
      "descriptionClean": "Avocados Free",
      "chapter": "08",
      "heading": "0804.40",
      "subheading": "0804.40.00",
      "country_code": "IN",
      "similarity": "0.763"
    }
    // ... more results
  ]
}
```

**Error** (HTTP 500 - Code Not Found):
```json
{
  "error": "Finding similar codes failed",
  "message": "Finding similar codes failed: HS Code not found: 9999.99.99"
}
```

**Example**:
```bash
curl "http://localhost:3001/api/vector-search/similar/0804.50.10?limit=5&threshold=0.6"
```

---

### 5. Batch Search
Search for multiple queries in a single request.

**Endpoint**: `POST /api/vector-search/batch-search`

**Request Body**:
```json
{
  "queries": ["wheat grains", "coffee beans", "plastic materials"],
  "limit": 3,
  "threshold": 0.3
}
```

**Parameters**:
- `queries` (array of strings, **required**): Array of search queries
- `limit` (integer, optional): Maximum results per query (default: 10)
- `threshold` (number, optional): Minimum similarity score (default: 0.5)

**Response** (HTTP 200):
```json
{
  "success": true,
  "queryCount": 2,
  "results": {
    "wheat grains": {
      "resultCount": 3,
      "matches": [
        {
          "id": 757,
          "code": "1001.11.00",
          "description": "Durum wheat : -- Seed Free",
          "descriptionClean": "Durum wheat : -- Seed Free",
          "chapter": "10",
          "heading": "1001.11",
          "subheading": "1001.11.00",
          "country_code": "IN",
          "similarity": "0.5459"
        }
        // ... more results for this query
      ]
    },
    "coffee beans": {
      "resultCount": 3,
      "matches": [
        // ... results for coffee beans
      ]
    }
  }
}
```

**Error** (HTTP 400 - Empty Array):
```json
{
  "error": "Queries array is required and must not be empty"
}
```

**Example**:
```bash
curl -X POST http://localhost:3001/api/vector-search/batch-search \
  -H "Content-Type: application/json" \
  -d '{
    "queries": ["iron ore", "copper wire", "aluminum sheets"],
    "limit": 5
  }'
```

---

### 6. Generate Embedding
Generate an embedding for a given text (useful for testing).

**Endpoint**: `POST /api/vector-search/embedding`

**Request Body**:
```json
{
  "text": "test commodity"
}
```

**Parameters**:
- `text` (string, **required**): Text to generate embedding for

**Response** (HTTP 200):
```json
{
  "success": true,
  "text": "test commodity",
  "embeddingDimensions": 1536,
  "embedding": [
    -0.021840647,
    0.0056652563,
    // ... first 10 dimensions only (full embedding has 1536 values)
  ],
  "fullEmbeddingLength": 1536
}
```

**Error** (HTTP 400 - Empty Text):
```json
{
  "error": "Text is required and must not be empty"
}
```

**Example**:
```bash
curl -X POST http://localhost:3001/api/vector-search/embedding \
  -H "Content-Type: application/json" \
  -d '{"text": "organic cotton fabric"}'
```

---

### 7. System Statistics
Get overall system statistics.

**Endpoint**: `GET /api/vector-search/stats`

**Response** (HTTP 200):
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

**Example**:
```bash
curl http://localhost:3001/api/vector-search/stats
```

---

## Response Format

All successful responses follow this format:

```json
{
  "success": true,
  "data": {}
}
```

All error responses follow this format:

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200  | Success |
| 400  | Bad Request (invalid parameters) |
| 404  | Not Found (route not found) |
| 429  | Too Many Requests (rate limited) |
| 500  | Internal Server Error |

---

## Similarity Scores

Similarity scores are calculated using **cosine similarity** on vector embeddings:
- **Range**: 0 to 1
- **1.0**: Identical (same meaning)
- **0.5**: Moderate similarity
- **0.0**: No similarity

### Recommended Thresholds:
- **High precision** (find exact matches): threshold = 0.7+
- **Balanced**: threshold = 0.5 (default)
- **High recall** (find all related items): threshold = 0.3-0.4

---

## Example Integration

### Python
```python
import requests

api_url = "http://localhost:3001/api/vector-search/search"
payload = {
    "query": "plastic bottles",
    "limit": 5,
    "threshold": 0.5
}

response = requests.post(api_url, json=payload)
results = response.json()

for result in results['results']:
    print(f"{result['code']}: {result['description']} (similarity: {result['similarity']})")
```

### JavaScript/Node.js
```javascript
const axios = require('axios');

const apiUrl = 'http://localhost:3001/api/vector-search/search';
const payload = {
  query: 'plastic bottles',
  limit: 5,
  threshold: 0.5
};

axios.post(apiUrl, payload)
  .then(response => {
    response.data.results.forEach(result => {
      console.log(`${result.code}: ${result.description} (similarity: ${result.similarity})`);
    });
  })
  .catch(error => console.error(error));
```

### cURL
```bash
curl -X POST http://localhost:3001/api/vector-search/search \
  -H "Content-Type: application/json" \
  -d '{"query":"plastic bottles","limit":5}'
```

---

## Best Practices

1. **Use specific queries**: More descriptive queries yield better results
   - ✅ Good: "waterproof cotton fabric suitable for outdoor use"
   - ❌ Poor: "fabric"

2. **Adjust threshold based on use case**:
   - Use lower thresholds for exploratory searches
   - Use higher thresholds for precise matching

3. **Use batch search for efficiency**: When searching for multiple items, use batch-search endpoint instead of multiple individual requests

4. **Limit result sets**: Use the `limit` parameter to reduce response size and improve performance

5. **Handle rate limits gracefully**: Implement exponential backoff when receiving 429 responses

6. **Cache results**: Store frequently searched queries to reduce API calls

---

## Support & Issues

For issues or questions, refer to:
- API logs on Railway dashboard
- GitHub repository (if available)
- Check rate limit status in response headers

---

## Version History

- **v1.0** (2025-11-26): Initial release
  - Semantic search with vector embeddings
  - 10,468 HS codes indexed
  - 6 core endpoints
  - Rate limiting enabled
