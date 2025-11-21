# System Architecture

**HS Code Classifier - AI-Powered Export Documentation Assistant**

Last Updated: November 21, 2024

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE LAYER                         │
│                      (Next.js 14 + TypeScript)                      │
│                                                                      │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Product Input  │  │   Smart Survey   │  │  Results Display │  │
│  │  & Country      │  │   (Dynamic)      │  │  + Reasoning     │  │
│  └─────────────────┘  └──────────────────┘  └──────────────────┘  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ HTTP/REST
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│                          API GATEWAY LAYER                           │
│                      (Express.js + TypeScript)                       │
│                                                                       │
│  POST /api/classify           GET /api/history                      │
│  POST /api/feedback           GET /api/categories                   │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
┌───────────▼──────────┐ ┌────▼────────┐ ┌──────▼────────────┐
│  KEYWORD MATCHER     │ │  DECISION   │ │   AI REASONER     │
│  (PostgreSQL FTS)    │ │  TREE       │ │   (OpenAI GPT-4o) │
│                      │ │  ENGINE     │ │                   │
│  • Extract keywords  │ │  • Load     │ │  • Advanced edge  │
│  • Full-text search  │ │    rules    │ │    cases          │
│  • Score matches     │ │  • Apply    │ │  • Generate       │
│  • Return top 5      │ │    logic    │ │    reasoning      │
│                      │ │  • Calculate│ │  • Confidence     │
│  Weight: 30%         │ │    score    │ │    scoring        │
│                      │ │             │ │                   │
│                      │ │  Weight: 40%│ │  Weight: 30%      │
└───────────┬──────────┘ └────┬────────┘ └──────┬────────────┘
            │                  │                  │
            └──────────────────┼──────────────────┘
                               │
                ┌──────────────▼──────────────┐
                │   CONFIDENCE AGGREGATOR     │
                │   • Combine 3 methods       │
                │   • Weighted scoring        │
                │   • Return top 3 results    │
                └──────────────┬──────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│                        DATABASE LAYER                                │
│                   (PostgreSQL 15 + Prisma ORM)                       │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   hs_codes   │  │  decision_   │  │  user_classifications    │  │
│  │              │  │   trees      │  │                          │  │
│  │ • 200-300    │  │              │  │  • History tracking      │  │
│  │   codes      │  │ • Automotive │  │  • User feedback         │  │
│  │ • Keywords   │  │   parts flow │  │  • Session data          │  │
│  │ • Hierarchy  │  │ • JSON rules │  │                          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   country_mappings                            │  │
│  │   • India → Destination code mappings                        │  │
│  │   • Import duty rates                                        │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack Rationale

### Frontend: Next.js 14 + TypeScript

**Why Next.js?**
- **Server-side rendering** for better SEO and initial load performance
- **API routes built-in** - can combine frontend/backend if needed for simpler deployment
- **Easy deployment** to Vercel (one-click from GitHub)
- **Modern React patterns** with App Router and Server Components
- **Developer familiarity** - Aryan already knows React
- **Industry standard** for production web applications

**Why TypeScript?**
- **Type safety** reduces bugs during development
- **Better IDE support** with autocomplete and inline documentation
- **Consistency** with backend (same language throughout)
- **Scales well** as codebase grows

### Backend: Node.js + Express.js + TypeScript

**Why Node.js?**
- **Same language** as frontend (JavaScript/TypeScript) - reduces context switching
- **Fast I/O operations** - perfect for API calls, database queries, and external API integration
- **Huge ecosystem** - NPM has libraries for everything we need
- **Easy deployment** - works on all major cloud platforms (Railway, Render, Heroku)
- **Developer familiarity** - Aryan already experienced with Node.js
- **Cost-effective** - free tier hosting available

**Why Express.js?**
- **Minimal and flexible** - not opinionated, easy to structure as needed
- **Battle-tested** - used by millions of production applications
- **Middleware ecosystem** - authentication, CORS, rate limiting all available
- **Simple REST API creation** - intuitive routing and request handling

### Database: PostgreSQL 15 + Prisma ORM

**Why PostgreSQL?**
- **Relational structure** - HS codes are inherently hierarchical (Chapter → Heading → Subheading)
- **Full-text search** - built-in FTS for keyword matching (critical for our algorithm)
- **JSON support** - can store questionnaire responses and decision trees as JSONB
- **Powerful indexing** - GIN indexes for array/text search, B-tree for exact matches
- **Free hosting** - Supabase offers 500MB free tier with good performance
- **Reliability** - mature, stable, production-ready
- **Scalable** - handles millions of rows efficiently

**Why Prisma ORM?**
- **Type-safe queries** - auto-generated TypeScript types from schema
- **Intuitive API** - cleaner than raw SQL for common operations
- **Migration system** - version control for database schema changes
- **Prisma Studio** - free GUI for database inspection during development
- **Active development** - well-maintained with strong community

### AI/ML: OpenAI GPT-4o

**Why OpenAI GPT-4o?**
- **Best-in-class reasoning** - excels at classification tasks with explanation
- **Structured outputs** - can return JSON with confidence scores and reasoning
- **Context understanding** - interprets product descriptions naturally
- **Transparent** - generates human-readable reasoning (builds user trust)
- **Reliable API** - 99.9% uptime, well-documented
- **Developer familiarity** - Aryan already experienced with OpenAI API
- **Cost-effective for MVP** - ₹500-1000/month if limited to 20% of queries

**Strategic usage:**
- Used **only for edge cases** where keyword + rule-based methods are uncertain
- Primary classification uses **free methods** (keyword + decision trees)
- AI provides the **"reasoning layer"** to explain why a code was chosen

---

## Database Schema

### Table 1: `hs_codes`

**Purpose:** Store HS code master data with keywords for matching

```sql
CREATE TABLE hs_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) NOT NULL,              -- "8708.30.10"
  chapter VARCHAR(2) NOT NULL,            -- "87" (Vehicles)
  heading VARCHAR(4) NOT NULL,            -- "8708" (Parts & accessories)
  subheading VARCHAR(6) NOT NULL,         -- "8708.30" (Brakes & parts)
  country_code VARCHAR(2) NOT NULL,       -- "IN", "US", "EU"
  description TEXT NOT NULL,              -- Official description
  keywords TEXT[],                        -- ["brake", "pad", "vehicle", "motorcycle"]
  common_products TEXT[],                 -- ["brake pads", "disc brakes"]
  parent_code VARCHAR(20),                -- For hierarchy (8708 is parent of 8708.30)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_keywords ON hs_codes USING GIN (keywords);
CREATE INDEX idx_code ON hs_codes (code);
CREATE INDEX idx_country ON hs_codes (country_code);
```

**Key Features:**
- **GIN index on keywords** - enables fast full-text search
- **Hierarchical structure** - parent_code links to higher-level codes
- **Array storage** - PostgreSQL native array for keywords/products
- **Country-specific** - same product may have different codes in different countries

### Table 2: `decision_trees`

**Purpose:** Store category-specific decision logic and rules

```sql
CREATE TABLE decision_trees (
  id SERIAL PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL,    -- "Automotive Parts"
  decision_flow JSONB NOT NULL,           -- Complete question flow + rules
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Example `decision_flow` structure:**

```json
{
  "questions": [
    {
      "id": "q1",
      "text": "Is this a finished product or raw material?",
      "type": "single_choice",
      "options": ["Finished Product", "Raw Material", "Component"],
      "next_question_map": {
        "Finished Product": "q2",
        "Raw Material": "q3",
        "Component": "q2"
      }
    },
    {
      "id": "q2",
      "text": "What is the primary function?",
      "type": "single_choice",
      "options": ["Braking", "Engine", "Transmission", "Suspension", "Lighting"],
      "next_question_map": {
        "Braking": "q4",
        "Engine": null
      }
    }
  ],
  "rules": [
    {
      "conditions": {
        "q1": "Finished Product",
        "q2": "Braking",
        "keywords": ["pad", "ceramic"]
      },
      "suggested_codes": ["8708.30.10"],
      "confidence_boost": 15
    }
  ]
}
```

### Table 3: `user_classifications`

**Purpose:** Track all classification attempts for learning and improvement

```sql
CREATE TABLE user_classifications (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(100),                -- Anonymous user tracking
  product_description TEXT NOT NULL,
  category_detected VARCHAR(100),
  questionnaire_answers JSONB,
  suggested_hs_code VARCHAR(20),
  confidence_score INTEGER,               -- 0-100
  country_code VARCHAR(2),
  user_feedback VARCHAR(20),              -- "correct", "incorrect", "unsure"
  corrected_code VARCHAR(20),             -- If user provides correction
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_session ON user_classifications (session_id);
CREATE INDEX idx_suggested_code ON user_classifications (suggested_hs_code);
```

**Usage:**
- **Analytics** - which codes are most requested
- **Learning** - user corrections improve algorithm
- **Validation** - measure real-world accuracy

### Table 4: `country_mappings`

**Purpose:** Map India HS codes to destination country codes

```sql
CREATE TABLE country_mappings (
  id SERIAL PRIMARY KEY,
  india_code VARCHAR(20) NOT NULL,        -- "8708.30.10"
  country VARCHAR(50) NOT NULL,           -- "USA", "EU", "UK", "UAE"
  local_code VARCHAR(20) NOT NULL,        -- "8708.30.50" (USA equivalent)
  import_duty_rate VARCHAR(50),           -- "2.5%" or "Free under FTA"
  special_requirements TEXT,              -- "CE marking required for EU"
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_india_code ON country_mappings (india_code);
CREATE INDEX idx_country ON country_mappings (country);
```

**Relationships:**

```
hs_codes (1) ──┐
               ├──> country_mappings (N)
               │
               └──> user_classifications (N)

decision_trees (1) ───> user_classifications (N)
```

---

## API Design

### REST Endpoints

#### 1. **POST /api/classify**

**Purpose:** Main classification endpoint

**Request:**
```json
{
  "productDescription": "Ceramic brake pads for motorcycles, finished product",
  "destinationCountry": "USA",
  "questionnaireAnswers": {
    "q1": "Finished Product",
    "q2": "Braking",
    "q3": "60% ceramic, 30% copper"
  }
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "hsCode": "8708.30.10",
      "description": "Brakes and servo-brakes; parts thereof - Mounted brake linings",
      "confidence": 90,
      "reasoning": "Product is a finished brake component made primarily of ceramic composite...",
      "countryMapping": {
        "india": "8708.30.10",
        "usa": "8708.30.50",
        "importDuty": "2.5%"
      }
    },
    {
      "hsCode": "8708.30.90",
      "description": "Other brakes and parts",
      "confidence": 65,
      "reasoning": "Alternative if product doesn't meet mounted brake lining criteria..."
    }
  ],
  "classificationId": "cls_abc123",
  "timestamp": "2024-11-21T10:30:00Z"
}
```

#### 2. **POST /api/feedback**

**Purpose:** Submit user feedback on classification

**Request:**
```json
{
  "classificationId": "cls_abc123",
  "feedback": "correct",
  "correctedCode": null
}
```

**Response:**
```json
{
  "success": true,
  "message": "Feedback recorded"
}
```

#### 3. **GET /api/categories**

**Purpose:** Get available product categories

**Response:**
```json
{
  "categories": [
    {
      "name": "Automotive Parts",
      "chapterRange": "87",
      "available": true
    }
  ]
}
```

#### 4. **GET /api/history**

**Purpose:** Get user's classification history

**Query Params:** `?sessionId=session_xyz&limit=10`

**Response:**
```json
{
  "history": [
    {
      "id": "cls_abc123",
      "productDescription": "Ceramic brake pads...",
      "suggestedCode": "8708.30.10",
      "confidence": 90,
      "timestamp": "2024-11-21T10:30:00Z"
    }
  ]
}
```

---

## Data Flow

### End-to-End Classification Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: User Input                                                  │
├─────────────────────────────────────────────────────────────────────┤
│ Input: "Ceramic brake pads for motorcycles, finished product"      │
│ Country: "USA"                                                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│ STEP 2: Category Detection (AI)                                    │
├─────────────────────────────────────────────────────────────────────┤
│ OpenAI quick classification: "Automotive Parts"                    │
│ → Load decision tree for "Automotive Parts"                        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│ STEP 3: Smart Questionnaire                                        │
├─────────────────────────────────────────────────────────────────────┤
│ Q1: Finished or raw? → "Finished Product"                         │
│ Q2: Primary function? → "Braking"                                 │
│ Q3: Material composition? → "60% ceramic, 30% copper"             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
┌───────────▼──────────┐ ┌────▼────────┐ ┌──────▼────────────┐
│ METHOD 1:            │ │ METHOD 2:   │ │ METHOD 3:         │
│ Keyword Match        │ │ Decision    │ │ AI Reasoning      │
├──────────────────────┤ │ Tree        │ │                   │
│ Extract: ["brake",   │ ├─────────────┤ ├───────────────────┤
│  "pad", "ceramic",   │ │ Rules match:│ │ GPT-4o analyzes   │
│  "motorcycle"]       │ │             │ │ full context      │
│                      │ │ IF finished │ │                   │
│ FTS Query:           │ │ AND braking │ │ Returns:          │
│ SELECT * FROM        │ │ AND ceramic │ │ {                 │
│ hs_codes WHERE       │ │ THEN 8708.  │ │   code: "8708.30" │
│ keywords @>          │ │   30.10     │ │   reasoning: "..."│
│ '{brake,pad}'        │ │             │ │   confidence: 85  │
│                      │ │ Confidence: │ │ }                 │
│ Result: 8708.30.10   │ │ 90          │ │                   │
│ Confidence: 85       │ │             │ │                   │
└───────────┬──────────┘ └────┬────────┘ └──────┬────────────┘
            │                  │                  │
            └──────────────────┼──────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│ STEP 4: Confidence Aggregation                                     │
├─────────────────────────────────────────────────────────────────────┤
│ Weighted Score = (Keyword × 0.30) + (Rules × 0.40) + (AI × 0.30)  │
│                = (85 × 0.30) + (90 × 0.40) + (85 × 0.30)          │
│                = 25.5 + 36 + 25.5 = 87                            │
│                                                                     │
│ All 3 methods agree → High confidence: 90                         │
│ Top result: 8708.30.10                                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│ STEP 5: Country Mapping                                            │
├─────────────────────────────────────────────────────────────────────┤
│ Lookup: india_code="8708.30.10" AND country="USA"                 │
│ Result: USA code = "8708.30.50"                                   │
│         Import duty = "2.5%"                                       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│ STEP 6: Store Classification                                       │
├─────────────────────────────────────────────────────────────────────┤
│ INSERT INTO user_classifications (...)                            │
│ Generate classification ID: "cls_abc123"                           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│ STEP 7: Return Results                                             │
├─────────────────────────────────────────────────────────────────────┤
│ {                                                                   │
│   "hsCode": "8708.30.10",                                          │
│   "confidence": 90,                                                │
│   "reasoning": "All three methods agree: keyword matching found... │
│   "countryMapping": { "usa": "8708.30.50", "duty": "2.5%" }      │
│   "alternatives": [ "8708.30.90" (65%) ]                          │
│ }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Performance Targets

- **Total classification time:** < 30 seconds
  - Keyword matching: ~2 seconds
  - Decision tree: ~1 second
  - AI reasoning: ~10-20 seconds (longest step)
  - Country mapping: ~1 second
- **Database queries:** < 5 per classification
- **API calls:** 1 OpenAI call per classification (can be skipped for high-confidence cases)

### Error Handling

- If **keyword match confidence < 50%** → Rely more on AI
- If **all methods disagree** → Return top 3 results with lower confidence
- If **OpenAI API fails** → Fall back to keyword + rules only
- If **no results found** → Suggest similar codes from parent heading

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           PRODUCTION                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Frontend (Vercel)                Backend (Railway/Render)         │
│  ┌─────────────────┐              ┌─────────────────────┐         │
│  │  Next.js App    │──────────────│  Express API        │         │
│  │  Static files   │   REST API   │  Classification     │         │
│  │  CDN cached     │              │  Logic              │         │
│  └─────────────────┘              └──────────┬──────────┘         │
│                                               │                     │
│                                    ┌──────────┴──────────┐         │
│                                    │                     │         │
│                        ┌───────────▼────────┐ ┌─────────▼────────┐│
│                        │ PostgreSQL         │ │ OpenAI API       ││
│                        │ (Supabase)         │ │                  ││
│                        │ • Free 500MB       │ │ • Pay per token  ││
│                        └────────────────────┘ └──────────────────┘│
└─────────────────────────────────────────────────────────────────────┘

Domain: hscodeclassifier.com (optional for MVP)
SSL: Automatic (Vercel + Railway both provide free SSL)
Cost: ₹0 for infrastructure + ₹500-1000 for OpenAI
```

---

## Security Considerations

- **API rate limiting** - prevent abuse (e.g., 100 requests/hour per IP)
- **Environment variables** - OpenAI key, database URL stored securely
- **Input sanitization** - prevent SQL injection in product descriptions
- **CORS configuration** - only allow requests from frontend domain
- **Session anonymization** - don't collect PII without consent

---

## Future Scalability

### Phase 2+ Enhancements

1. **Caching layer** (Redis) for frequently queried codes
2. **Background jobs** (Bull/BullMQ) for batch classifications
3. **Image classification** - add computer vision for product images
4. **Multi-language support** - Hindi/regional languages
5. **Bulk upload** - CSV import for multiple products
6. **API access** - rate-limited API keys for B2B clients

### Database Optimizations

- **Partitioning** `user_classifications` by month (when > 1M rows)
- **Read replicas** for analytics queries
- **Materialized views** for common aggregations

---

**See [PROJECT_SPEC.md](PROJECT_SPEC.md) for complete project details and phase-wise implementation plan.**
