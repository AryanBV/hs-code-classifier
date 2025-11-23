# HS Code Classification AI - MVP Project Specification v2.0

**Last Updated:** November 22, 2025  
**Version:** 2.0 - Phase 1 Ready  
**Status:** Database Setup Complete - Ready for Backend Implementation  
**Target:** DPIIT Recognition + Startup India Seed Fund Scheme (SISFS)

---

## 📋 Project Overview

### Problem Statement
Indian exporters face ₹50,000-5,00,000 penalties for incorrect HS code classification. Manual classification takes 30+ minutes per product and requires expensive customs consultants (₹2,000-10,000 per classification). Current solutions are slow, expensive, and error-prone.

### Solution
AI-powered HS code classifier that:
- Reduces classification time from 30 minutes to under 2 minutes
- Provides transparent reasoning for each classification
- Adapts to country-specific HS code variations
- Learns from user corrections to improve accuracy over time
- Achieves 85%+ accuracy through hybrid approach (keyword matching + decision trees + AI)

### Target Market
- Primary: SME exporters in automotive parts sector
- Secondary: Exporters in machinery, electronics, textiles
- Market size: 1.4 lakh DPIIT-recognized exporters, 50,000+ SME exporters in India

### Business Model (Post-MVP)
- Freemium: Basic classification free (limited queries)
- Premium: ₹500-999/month for unlimited classifications
- Enterprise: Custom pricing for bulk/API access
- Manual review service: ₹500/product for uncertain cases

---

## 🎯 MVP Goals

### Primary Objectives
1. ✅ Build working MVP in 3-4 weeks
2. ⏳ Validate with 4-5 exporters to get feedback
3. ⏳ Achieve 70-85% accuracy in automotive parts category
4. ⏳ Prepare for DPIIT application (company incorporation after MVP validation)
5. ⏳ Create demo materials for SISFS incubator applications

### Success Metrics
- 70%+ accuracy on test dataset of 50 products (currently have 20)
- Average classification time < 30 seconds
- 4/5 exporters say "this would save me time"
- 3/5 exporters say "I'd pay for this"
- Zero critical bugs during demo

---

## ✅ COMPLETED WORK SUMMARY (Phase 0)

### Week 1: Project Setup & Manual Classification - COMPLETE

#### ✅ Project Infrastructure (November 21-22, 2025)
- [x] GitHub repository created: `hs-code-classifier`
- [x] Complete project structure (42 files)
  - Backend skeleton (Node.js + Express + TypeScript + Prisma)
  - Frontend skeleton (Next.js 14 + React 18 + TypeScript)
  - Data processing scripts (Python)
  - Documentation (PROJECT_SPEC, ARCHITECTURE, PHASE_TRACKER)
- [x] Git repository initialized with proper .gitignore
- [x] Initial commit pushed to GitHub

#### ✅ Database Setup (November 22, 2025)
- [x] Supabase account created
- [x] PostgreSQL database provisioned (Singapore region)
- [x] Prisma schema defined (4 tables):
  - `hs_codes` - HS code database with keywords
  - `decision_trees` - Category-specific decision logic
  - `user_classifications` - Classification history & feedback
  - `country_mappings` - India to other country HS code mappings
- [x] Database migrations executed (`npx prisma migrate dev --name init`)
- [x] 20 automotive products imported successfully
- [x] Prisma Studio verified - all tables created

#### ✅ Manual Classification Exercise (November 22, 2025)
- [x] 20 automotive products manually classified using ICEGATE portal
- [x] HS codes documented for all products
- [x] Patterns identified for decision tree logic
- [x] Data processed through scraper (310 keywords extracted)
- [x] JSON seed data generated: `hs_codes_seed.json`

#### ✅ Technology Stack Confirmed
- **Backend:** Node.js 18+, Express.js, TypeScript, Prisma ORM
- **Database:** PostgreSQL 15 (Supabase)
- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS
- **AI/ML:** OpenAI GPT-4o-mini API
- **Deployment:** Vercel (frontend), Railway/Render (backend)
- **Version Control:** Git + GitHub

#### ✅ Environment Setup
- [x] `.env` file configured with:
  - `DATABASE_URL` (Supabase connection string)
  - `OPENAI_API_KEY` (tested and verified)
  - `PORT=3000`
  - `NODE_ENV=development`
- [x] Backend dependencies installed (`npm install`)
- [x] Python dependencies installed for data processing

---

## 📊 YOUR 20 CLASSIFIED PRODUCTS (Reference Data)

### Test Dataset Summary
- **Total Products:** 20
- **Chapters Covered:** 5 (38, 40, 84, 85, 87)
- **Keywords Extracted:** 310 (avg 15.5 per product)
- **Data File:** `data/hs_codes_seed.json`

### Products by Chapter:

**Chapter 38 - Chemical Products (2 products)**
1. Radiator Coolant - Ethylene Glycol: `3820.00.00`
2. Brake Fluid DOT 4: `3819.00.10`

**Chapter 40 - Rubber Products (3 products)**
3. Timing Belt - Rubber: `4010.32.90`
4. CV Joint Boot Kit: `4016.93.90`
5. Radiator Hose - Silicone: `4009.31.00`

**Chapter 84 - Machinery & Parts (5 products)**
6. Engine Oil Filter - Paper Element: `8421.23.00`
7. Piston Rings Set: `8409.91.13`
8. Air Filter - Paper Element: `8421.31.00`
9. Ball Bearings - Deep Groove: `8482.10.20`
10. Fuel Pump - Electric: `8413.30.20`

**Chapter 85 - Electrical Equipment (5 products)**
11. LED Headlight Bulb - H4 Type: `8539.29.40`
12. Spark Plug - Copper Core: `8511.10.00`
13. Windshield Wiper Blades: `8512.40.00`
14. Headlight Assembly - Halogen: `8512.20.10`
15. Alternator - 12V 80A: `8511.50.00`

**Chapter 87 - Vehicles & Parts (5 products)**
16. Ceramic Brake Pads for Motorcycles: `8708.30.00`
17. Disc Brake Rotors - Cast Iron: `8708.30.00`
18. Shock Absorber - Hydraulic: `8708.80.00`
19. Clutch Plate Assembly: `8708.93.00`
20. Exhaust Muffler - Stainless Steel: `8708.92.00`

### Key Insights from Manual Classification:
- **Finished products dominate** (19/20) vs raw materials
- **Material composition matters** for edge cases (ceramic brake pads)
- **Function determines classification** when material is ambiguous
- **Common confusion points:**
  - Filters: Chapter 8421 (mechanical filters) vs 8708 (vehicle parts)
  - Lighting: Chapter 8512 (vehicle lighting) vs 8539 (bulbs/lamps)
  - Bearings: Chapter 8482 (bearings) vs 8708 (vehicle parts)
  - Rubber parts: Chapter 40 (rubber) vs 8708 (vehicle parts)

---

## 🏗️ System Architecture

### High-Level Architecture
```
User Interface (React/Next.js)
    ↓
Backend API (Node.js + Express)
    ↓
Classification Engine (Hybrid AI)
    ├─→ Keyword Matcher (30% weight) - PostgreSQL full-text search
    ├─→ Decision Tree Engine (40% weight) - Rule-based logic
    └─→ AI Reasoning (30% weight) - OpenAI GPT-4o-mini
    ↓
Confidence Scorer (Combines all 3 methods)
    ↓
Database Layer (PostgreSQL + Prisma)
    ├─→ HS Codes Database (20 products currently)
    ├─→ Decision Trees (to be built in Phase 1)
    ├─→ User Classifications History (empty, will populate during testing)
    └─→ Country Mappings (to be added later)
    ↓
External APIs
    └─→ OpenAI API (GPT-4o-mini)
```

### Data Flow Example
```
1. User Input: "Ceramic brake pads for motorcycles, finished product"
2. Category Detection: AI identifies "Automotive Parts"
3. Smart Questionnaire (future): 
   - Q1: Finished or raw? → Finished
   - Q2: Material? → 60% ceramic, 30% copper
   - Q3: Function? → Braking
4. Classification Engine (3 parallel methods):
   - Keyword Match: 8708.30.00 (85% confidence)
   - Decision Tree: 8708.30.00 (90% confidence)
   - AI Reasoning: 8708.30.00 (85% confidence)
5. Final Result: 8708.30.00 (87% confidence - weighted average)
6. Country Mapping (future): India: 8708.30.00 → USA: 8708.30.50
7. Display with reasoning and alternatives
```

---

## 🗄️ Database Schema (Implemented)

### Table 1: hs_codes (20 rows currently)
```sql
CREATE TABLE hs_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) NOT NULL,              -- "8708.30.00"
  chapter VARCHAR(2) NOT NULL,            -- "87"
  heading VARCHAR(4) NOT NULL,            -- "8708"
  subheading VARCHAR(6) NOT NULL,         -- "870830"
  country_code VARCHAR(2) NOT NULL,       -- "IN" (India)
  description TEXT NOT NULL,              -- Full product description
  keywords TEXT[],                        -- ["brake", "pad", "vehicle", "motorcycle"]
  common_products TEXT[],                 -- ["Ceramic Brake Pads for Motorcycles"]
  parent_code VARCHAR(20),                -- For hierarchy (NULL for now)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes created:
CREATE INDEX idx_keywords ON hs_codes USING GIN (keywords);
CREATE INDEX idx_code ON hs_codes (code);
CREATE INDEX idx_country ON hs_codes (country_code);
```

### Table 2: decision_trees (empty, to be populated)
```sql
CREATE TABLE decision_trees (
  id SERIAL PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL,    -- "Automotive Parts"
  decision_flow JSONB NOT NULL,           -- Complete question flow + rules
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Table 3: user_classifications (empty, will populate during testing)
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
```

### Table 4: country_mappings (empty, to be added later)
```sql
CREATE TABLE country_mappings (
  id SERIAL PRIMARY KEY,
  india_code VARCHAR(20) NOT NULL,        -- "8708.30.00"
  country VARCHAR(50) NOT NULL,           -- "USA", "EU", "UK"
  local_code VARCHAR(20) NOT NULL,        -- "8708.30.50"
  import_duty_rate VARCHAR(50),           -- "2.5%"
  special_requirements TEXT,              -- "CE marking required"
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 💻 Technology Stack (Confirmed)

### Backend
- **Runtime:** Node.js 18+ ✅
- **Framework:** Express.js ✅
- **Language:** TypeScript (strict mode) ✅
- **ORM:** Prisma ✅
- **Database:** PostgreSQL 15 (Supabase) ✅
- **API Testing:** Postman or Thunder Client
- **Deployment:** Railway or Render (free tier)

### Frontend
- **Framework:** Next.js 14 (App Router) ✅
- **Language:** TypeScript ✅
- **UI Library:** Shadcn/ui (configured) ✅
- **Styling:** Tailwind CSS ✅
- **Deployment:** Vercel (free tier)

### AI/ML
- **Primary:** OpenAI GPT-4o-mini ✅ (NOT GPT-4o)
- **Model:** `gpt-4o-mini`
- **Cost:** $0.15 per 1M input tokens (~10x cheaper than GPT-4o)
- **Usage:** Edge case classification + reasoning generation (20% of queries max)
- **Monthly Cost (Development):** ₹500-1,000
- **Monthly Cost (Production):** ₹2,000-5,000

### Development Tools
- **Editor:** VS Code ✅
- **Version Control:** Git + GitHub ✅
- **Database GUI:** Prisma Studio ✅
- **Project Management:** GitHub Projects or Notion

---

## 💰 Cost Control & Rate Limiting Strategy

### OpenAI Cost Protection

**CRITICAL CONCERN:** Preventing DDoS attacks and runaway API costs

#### Implementation Strategy:

**1. Model Selection** ✅
- Use **GPT-4o-mini** instead of GPT-4o (10x cheaper)
- Cost: $0.15 per 1M input tokens vs $2.50 for GPT-4o
- Quality: Sufficient for HS code classification

**2. Rate Limiting (Required Implementation)**
```typescript
// backend/src/utils/rate-limiter.ts
export const rateLimits = {
  MAX_REQUESTS_PER_HOUR: 100,           // Per IP/session
  MAX_REQUESTS_PER_DAY: 500,            // Per IP/session
  MAX_DAILY_COST: 5,                    // $5 USD limit
  AI_USAGE_PERCENTAGE: 0.20,            // Only 20% of classifications use AI
};
```

**3. OpenAI Account Limits** (Set in OpenAI Dashboard)
- Hard limit: $10/month during development
- Email alerts at $5 threshold
- Separate API key for production vs testing

**4. Caching Strategy**
```typescript
// Cache classifications in database
// If same product description seen before, return cached result
// No need to call OpenAI again
```

**5. Fallback Logic**
```typescript
// Classification priority:
// 1. Try keyword matching (free, instant)
// 2. Try decision tree (free, instant)
// 3. If confidence < 70%, then call AI
// 4. If AI fails, return best guess from steps 1-2
```

**6. Request Validation**
```typescript
// Block suspicious requests:
// - Empty descriptions
// - Duplicate requests (< 5 seconds apart)
// - Requests from blocked IPs
// - Requests exceeding daily limit
```

#### Cost Estimates:

**Development Phase (3-4 weeks):**
- 20 products × 10 test iterations = 200 classifications
- AI calls (20% of 200) = 40 calls
- Average cost per call: ₹0.50
- **Total:** ₹500-1,000

**Testing Phase (Exporter validation):**
- 5 exporters × 20 products each = 100 classifications
- AI calls (20%) = 20 calls
- **Total:** ₹300-500

**Production (First month):**
- 1,000 classifications
- AI calls (20%) = 200 calls
- **Total:** ₹3,000-5,000

#### Protection Checklist:
- [ ] Set OpenAI account limit to $10/month
- [ ] Implement rate limiting middleware
- [ ] Add cost tracking in database
- [ ] Cache all AI responses
- [ ] Only use AI for confidence boost (< 70%)
- [ ] Monitor daily costs via dashboard
- [ ] Set up email alerts

---

## 📅 PHASE-WISE IMPLEMENTATION PLAN

### ✅ PHASE 0: Manual Classification & Setup (Week 1) - COMPLETE

**Status:** ✅ 100% Complete (November 21-22, 2025)

#### Completed Tasks:
- [x] Project structure created (42 files)
- [x] GitHub repository initialized
- [x] Documentation written (PROJECT_SPEC, ARCHITECTURE, PHASE_TRACKER)
- [x] 20 automotive products manually classified
- [x] Data processed (keywords extracted, JSON generated)
- [x] Supabase database created
- [x] Database schema migrated
- [x] 20 products imported to database
- [x] OpenAI API key configured and tested
- [x] Backend dependencies installed
- [x] Prisma Studio verified

**Output:**
- Complete project skeleton ready for development
- Test dataset with 20 real HS codes
- Database populated and ready
- Development environment configured

---

### ⏳ PHASE 1: Backend Development (Week 2) - CURRENT PHASE

**Status:** 🚀 Ready to Start (November 23-29, 2025)  
**Goal:** Build working classification API with 70%+ accuracy

#### Day 1-2: Keyword Matcher Service (30% Weight)

**Objective:** Implement full-text search based classification

**Implementation:**
```typescript
// backend/src/services/keyword-matcher.service.ts

export async function keywordMatch(
  productDescription: string
): Promise<KeywordMatchResult[]> {
  // 1. Extract keywords from description
  // 2. Query hs_codes table using PostgreSQL full-text search
  // 3. Calculate match scores based on keyword overlap
  // 4. Return top 5 matches with confidence scores
  
  // Weight: 30% of final confidence
}
```

**Key Features:**
- PostgreSQL `ts_vector` for full-text search
- Keyword extraction (remove stopwords)
- TF-IDF scoring for relevance
- Fuzzy matching for typos

**Testing:**
- Test with all 20 products
- Target: 60%+ top-1 accuracy
- Benchmark: < 1 second response time

**Deliverables:**
- [ ] `keyword-matcher.service.ts` implemented
- [ ] Unit tests for keyword extraction
- [ ] Accuracy report on 20 products

---

#### Day 3-4: Decision Tree Service (40% Weight)

**Objective:** Rule-based classification using product attributes

**Implementation:**
```typescript
// backend/src/services/decision-tree.service.ts

export async function decisionTreeClassify(
  productDescription: string,
  attributes: ProductAttributes
): Promise<DecisionTreeResult> {
  // 1. Load decision tree for detected category (e.g., "Automotive Parts")
  // 2. Apply rules based on:
  //    - Material composition
  //    - Finished vs raw
  //    - Primary function
  // 3. Return suggested HS codes with confidence
  
  // Weight: 40% of final confidence
}
```

**Decision Tree Structure (Automotive Parts):**
```json
{
  "category": "Automotive Parts",
  "rules": [
    {
      "condition": {
        "keywords": ["brake", "pad"],
        "finished": true
      },
      "result": {
        "code": "8708.30.00",
        "confidence": 90
      }
    },
    {
      "condition": {
        "keywords": ["filter", "oil", "paper"],
        "finished": true
      },
      "result": {
        "code": "8421.23.00",
        "confidence": 85
      }
    }
  ]
}
```

**Testing:**
- Build decision tree from your 20 classified products
- Test logic: if keywords match + attributes match → predict code
- Target: 70%+ top-1 accuracy

**Deliverables:**
- [ ] `decision-tree.service.ts` implemented
- [ ] Decision tree for automotive parts (JSON in database)
- [ ] Rule builder utility
- [ ] Accuracy report on 20 products

---

#### Day 5-6: AI Classifier Service (30% Weight)

**Objective:** GPT-4o-mini for edge cases and reasoning

**Implementation:**
```typescript
// backend/src/services/ai-classifier.service.ts

export async function aiClassify(
  productDescription: string,
  context: ClassificationContext
): Promise<AIClassificationResult> {
  // 1. Build prompt with:
  //    - Product description
  //    - Material, function, type
  //    - Your 20 classified examples (few-shot learning)
  // 2. Call OpenAI GPT-4o-mini API
  // 3. Parse JSON response
  // 4. Extract: suggested code, reasoning, confidence
  
  // Weight: 30% of final confidence
  // Rate limit: Max 20% of classifications
}
```

**Prompt Template:**
```typescript
const prompt = `You are an HS code classification expert for Indian exports.

Given this product:
Description: ${description}
Material: ${material}
Type: ${type}
Function: ${function}

Classify it using the Indian HS code system.

Reference examples:
${fewShotExamples}

Return JSON:
{
  "code": "8708.30.00",
  "reasoning": "This is a finished brake component...",
  "confidence": 85,
  "alternatives": [
    {"code": "8421.23.00", "reason": "Could be filter-related"}
  ]
}`;
```

**Rate Limiting Implementation:**
```typescript
// Only call AI if:
// 1. Keyword + Decision Tree confidence < 70%
// 2. User hasn't exceeded daily limit (100 requests)
// 3. Daily cost < $5

if (combinedConfidence < 70 && withinLimits) {
  const aiResult = await aiClassify(description, context);
  // Use AI result to boost confidence
}
```

**Testing:**
- Test with all 20 products
- Measure: accuracy, response time, cost
- Target: 75%+ top-1 accuracy
- Budget: < $2 for all tests

**Deliverables:**
- [ ] `ai-classifier.service.ts` implemented
- [ ] Rate limiter middleware
- [ ] Cost tracking utility
- [ ] Prompt optimization based on tests
- [ ] Accuracy + cost report

---

#### Day 7: Integration & Testing

**Objective:** Combine all 3 methods and achieve 70%+ accuracy

**Implementation:**
```typescript
// backend/src/services/confidence-scorer.service.ts

export async function classifyProduct(
  productDescription: string
): Promise<FinalClassificationResult> {
  // 1. Run keyword matcher (always)
  const keywordResult = await keywordMatch(description);
  
  // 2. Run decision tree (always)
  const treeResult = await decisionTreeClassify(description, attributes);
  
  // 3. Calculate combined confidence
  let combinedScore = 
    keywordResult.confidence * 0.30 +
    treeResult.confidence * 0.40;
  
  // 4. If confidence < 70%, call AI
  let aiResult = null;
  if (combinedScore < 70) {
    aiResult = await aiClassify(description, context);
    combinedScore = 
      keywordResult.confidence * 0.30 +
      treeResult.confidence * 0.40 +
      aiResult.confidence * 0.30;
  }
  
  // 5. Return final result with reasoning
  return {
    code: treeResult.code,  // Highest weighted method
    confidence: combinedScore,
    reasoning: aiResult?.reasoning || treeResult.reasoning,
    alternatives: [...],
    methods_used: ["keyword", "decision_tree", aiResult ? "ai" : null]
  };
}
```

**Testing Checklist:**
- [ ] Test all 20 products end-to-end
- [ ] Calculate accuracy (correct #1 result / 20)
- [ ] Measure average response time
- [ ] Measure total OpenAI cost
- [ ] Test rate limiting (simulate 100+ requests)
- [ ] Test with edge cases (ambiguous products)

**Target Metrics:**
- **Accuracy:** 70%+ top-1, 90%+ top-3
- **Response Time:** < 10 seconds per classification
- **AI Usage:** < 30% of classifications
- **Cost:** < $2 for 20-product test suite

**Deliverables:**
- [ ] `confidence-scorer.service.ts` implemented
- [ ] Complete accuracy report (CSV/Excel)
- [ ] Performance benchmarks
- [ ] Cost analysis
- [ ] Bug fixes based on testing

---

#### API Endpoints (Backend)

**Implement these routes:**

**1. POST /api/classify**
```json
Request:
{
  "description": "Ceramic brake pads for motorcycles",
  "material": "60% ceramic, 30% copper",
  "type": "Finished Product",
  "function": "Braking",
  "country": "IN"
}

Response:
{
  "code": "8708.30.00",
  "confidence": 87,
  "reasoning": "This is a finished brake component for motor vehicles...",
  "alternatives": [
    {"code": "8421.23.00", "confidence": 45}
  ],
  "methods_used": ["keyword", "decision_tree", "ai"]
}
```

**2. POST /api/feedback**
```json
Request:
{
  "classification_id": "abc123",
  "feedback": "correct" | "incorrect",
  "corrected_code": "8708.40.00"  // if incorrect
}

Response:
{
  "message": "Feedback recorded. Thank you!"
}
```

**3. GET /api/history/:session_id**
```json
Response:
{
  "classifications": [
    {
      "id": "abc123",
      "description": "Brake pads...",
      "suggested_code": "8708.30.00",
      "confidence": 87,
      "timestamp": "2025-11-23T10:30:00Z"
    }
  ]
}
```

**4. GET /api/categories**
```json
Response:
{
  "categories": [
    {
      "name": "Automotive Parts",
      "chapter": "87",
      "product_count": 20
    }
  ]
}
```

---

### PHASE 1 Completion Criteria:

**Before moving to Phase 2, you must have:**
- [ ] All 3 classification methods working
- [ ] 70%+ accuracy on 20-product test set
- [ ] Rate limiting implemented and tested
- [ ] All 4 API endpoints working
- [ ] Response time < 10 seconds
- [ ] OpenAI cost < ₹2,000 for development
- [ ] Code committed to GitHub
- [ ] Documentation updated

**Phase 1 Milestone:** Backend API that correctly classifies 14+ out of 20 products

---

### ⏳ PHASE 2: Frontend Development (Week 3)

**Status:** Not Started  
**Timeline:** November 30 - December 6, 2025  
**Goal:** Build user-friendly web interface

#### Day 1-2: Frontend Setup & Basic UI

**Tasks:**
- Install Next.js dependencies
- Set up Tailwind CSS theme
- Install Shadcn UI components
- Create layout structure
- Build header and footer
- Homepage with hero section

**Deliverables:**
- [ ] Next.js app running locally
- [ ] Professional homepage
- [ ] Navigation structure
- [ ] Responsive design (mobile-friendly)

---

#### Day 3-4: Classification Flow

**Tasks:**
- Build multi-step form:
  - Step 1: Product description (textarea)
  - Step 2: Destination country (dropdown)
  - Step 3: Optional attributes (material, type, function)
- Connect to backend API
- Loading states during classification
- Error handling

**Deliverables:**
- [ ] Working classification form
- [ ] API integration
- [ ] Smooth UX transitions

---

#### Day 5-6: Results Display & Features

**Tasks:**
- Build results page:
  - Top HS code with confidence badge
  - Reasoning explanation
  - Alternative codes (2nd, 3rd options)
  - Country mapping (if applicable)
  - Export as PDF button
- Classification history:
  - Show past 10 classifications
  - Click to view details
- Feedback mechanism (correct/incorrect)

**Deliverables:**
- [ ] Professional results display
- [ ] PDF export functionality
- [ ] History tracking
- [ ] Feedback collection

---

#### Day 7: Polish & Testing

**Tasks:**
- Responsive design (test on mobile)
- Fix UI bugs
- Add animations/transitions
- Optimize performance
- SEO basics (meta tags)
- Deploy to Vercel

**Deliverables:**
- [ ] Production-ready frontend
- [ ] Deployed to Vercel
- [ ] Public URL for testing

---

### ⏳ PHASE 3: Exporter Validation (Week 4)

**Status:** Not Started  
**Timeline:** December 7-13, 2025  
**Goal:** Test with real exporters and collect feedback

#### Day 1-2: Prepare Demo Materials

**Tasks:**
- Record 2-minute demo video
- Create one-pager PDF:
  - Problem we're solving
  - How it works (3 screenshots)
  - Benefits (time saved, accuracy)
  - Call to action (try it free)
- Prepare 5 sample products for demo
- Set up analytics (track usage patterns)

**Deliverables:**
- [ ] Demo video (< 2 minutes)
- [ ] One-pager PDF
- [ ] Analytics dashboard

---

#### Day 3-5: Exporter Meetings

**Tasks:**
- Schedule meetings with 4-5 exporters:
  - Amar Jyothi Spare Parts (family business) ✅
  - 3-4 Peenya industrial area exporters
- Let them use the tool with their actual products
- Screen record sessions (with permission)
- Take detailed notes:
  - What worked well?
  - What confused them?
  - What's missing?
  - Would they pay? How much?
- Collect written testimonials

**Deliverables:**
- [ ] 4-5 validation sessions completed
- [ ] Screen recordings
- [ ] Detailed feedback notes
- [ ] 3+ testimonials (written/video)

---

#### Day 6-7: Incorporate Feedback & Refine

**Tasks:**
- Analyze feedback patterns
- Prioritize changes (must-have vs nice-to-have)
- Fix critical bugs
- Add most-requested features
- Re-test with 1-2 exporters if major changes

**Deliverables:**
- [ ] Feedback analysis report
- [ ] Bug fixes deployed
- [ ] Feature updates implemented
- [ ] Re-validation complete

---

### PHASE 3 Completion Criteria:

**Before applying to DPIIT, you must have:**
- [ ] 4+ exporter validation sessions
- [ ] 3+ positive testimonials
- [ ] Documented pain points and solutions
- [ ] Demonstrated time savings (before/after)
- [ ] Demonstrated accuracy on real products
- [ ] Product-market fit evidence

**Phase 3 Milestone:** Validated MVP with real exporter feedback

---

## 🚀 POST-MVP: DPIIT & SISFS APPLICATIONS

### Timeline: December 2025 - March 2026

#### Step 1: Company Formation (Week 5)

**Tasks:**
- Decide entity type: Private Limited vs LLP
  - **Private Limited:** ₹12,000 (recommended for funding)
  - **LLP:** ₹8,000 (simpler, but harder to raise funding)
- Register company online (MCA portal)
- Get Certificate of Incorporation
- Open business bank account
- Get PAN and TAN

**Timeline:** 7-10 working days  
**Cost:** ₹12,000-15,000

**Deliverables:**
- [ ] Certificate of Incorporation
- [ ] PAN card
- [ ] Business bank account
- [ ] GST registration (if needed)

---

#### Step 2: DPIIT Recognition Application (Week 6)

**Portal:** https://www.startupindia.gov.in/

**Requirements:**
- Certificate of Incorporation (< 10 years old)
- Company description (innovation pitch)
- Working prototype/MVP (your web app)
- Team details (founder background)

**Application Process:**
1. Register on Startup India portal
2. Fill DPIIT recognition form
3. Upload documents:
   - Certificate of Incorporation
   - Self-declaration (no prior entity)
   - Business description (500 words)
   - Innovation description (500 words)
   - Demo video (2 minutes)
   - Exporter testimonials (PDF)
4. Submit application
5. Wait for approval (10-15 working days)

**Benefits of DPIIT Recognition:**
- Tax exemptions (3 years)
- Fast-track patent applications
- Self-certification under labor laws
- Access to government tenders
- Eligibility for SISFS and other schemes

**Timeline:** 2-3 weeks  
**Cost:** Free

**Deliverables:**
- [ ] DPIIT recognition certificate
- [ ] Startup India dashboard access

---

#### Step 3: SISFS Application via Incubator (Weeks 7-12)

**Portal:** https://seedfund.startupindia.gov.in/

**Funding Amount:** ₹20 lakhs (no equity dilution)  
**Duration:** 8-12 months

**Eligibility:**
- DPIIT-recognized startup ✅
- Incorporated < 2 years ago ✅
- Working prototype ✅
- Accepted by SISFS-approved incubator

**Step 3a: Apply to Incubators (Weeks 7-8)**

**Top Bangalore Incubators:**
1. **NSRCEL (IIM Bangalore)** - Premier choice
2. **T-Hub Bangalore** - Tech-focused
3. **DERBI Foundation** - MSME focus
4. **Conquest Startup Hub** - Early-stage

**Application Requirements:**
- Business plan (15-20 pages)
- Pitch deck (10-15 slides)
- Financial projections (3 years)
- Team CVs
- MVP demo
- Exporter testimonials
- Market research

**Timeline:** 4-6 weeks for selection  
**Cost:** Free (most incubators)

**Step 3b: SISFS Application (Weeks 9-12)**

**Once accepted by incubator:**
1. Incubator submits application to SISFS
2. Initial review (2 weeks)
3. Pitch to evaluation committee
4. Due diligence (4-6 weeks)
5. Approval and fund disbursement

**Funding Structure:**
- Seed: ₹10 lakhs (Milestone 1)
- Validation: ₹10 lakhs (Milestone 2)

**Milestones (Example):**
- **Milestone 1:** Beta launch, 100+ users, 10+ paying customers (3 months)
- **Milestone 2:** 500+ users, 50+ paying customers, ₹2 lakh ARR (6 months)

**Timeline:** 2-3 months  
**Success Rate:** 10-15% of applicants

---

### Pitch Deck Structure (For Incubator + SISFS):

**Slide 1: Problem**
- HS code classification: 30 minutes → penalties up to ₹5 lakhs
- 50,000+ SME exporters struggle daily
- Current solutions: expensive consultants (₹2,000-10,000 per product)

**Slide 2: Solution**
- AI-powered classifier: 30 minutes → 2 minutes
- 85% accuracy through hybrid approach
- Transparent reasoning builds trust

**Slide 3: Product Demo**
- Screenshots of classification flow
- Results display with reasoning
- Mobile-responsive design

**Slide 4: Market Opportunity**
- 1.4 lakh DPIIT exporters
- Addressable market: ₹500 crore (assuming ₹10,000/year per exporter)
- TAM → SAM → SOM breakdown

**Slide 5: Business Model**
- Freemium: Free basic (10 classifications/month)
- Premium: ₹500-999/month unlimited
- Enterprise: Custom pricing for API access
- Manual review: ₹500/product for uncertain cases

**Slide 6: Traction**
- MVP built in 4 weeks
- 20-product test dataset (85% accuracy)
- 4-5 exporter validations
- 3+ testimonials
- X% would pay for product

**Slide 7: Technology**
- Hybrid AI: Keyword (30%) + Decision Tree (40%) + GPT-4o-mini (30%)
- PostgreSQL + Prisma + Next.js stack
- Scalable architecture (handle 10,000+ users)

**Slide 8: Competitive Landscape**
- Consultant-based: Expensive, slow, not scalable
- Other AI tools: Generic, not India-specific, no transparency
- **Our advantage:** India-focused, transparent reasoning, affordable

**Slide 9: Go-to-Market**
- Phase 1: Bangalore Peenya exporters (automotive)
- Phase 2: Expand to machinery, electronics
- Phase 3: Pan-India via partnerships
- Channels: Trade associations, export councils, digital ads

**Slide 10: Team**
- Aryan: AI/ML Engineer, Full-Stack Developer
- Domain expertise: Family automotive business
- Technical skills: 2+ years algo trading, competitive programming
- Future: Hire domain expert (customs/logistics)

**Slide 11: Financials**
- Seed funding ask: ₹20 lakhs (SISFS)
- Use of funds:
  - ₹8 lakhs: Team (1 developer + 1 domain expert, 8 months)
  - ₹5 lakhs: Marketing & customer acquisition
  - ₹3 lakhs: Infrastructure (AWS, OpenAI API)
  - ₹2 lakhs: Legal, compliance, operations
  - ₹2 lakhs: Contingency
- Revenue projections:
  - Month 3: ₹50,000 (50 users @ ₹1,000/month)
  - Month 6: ₹2 lakhs (200 users)
  - Month 12: ₹10 lakhs (1,000 users)

**Slide 12: Milestones**
- Milestone 1 (3 months): 100+ users, 10+ paying, ₹50k MRR
- Milestone 2 (6 months): 500+ users, 50+ paying, ₹2 lakh MRR
- Milestone 3 (12 months): 1,000+ users, 200+ paying, ₹10 lakh MRR

**Slide 13: Vision**
- Year 1: HS code classification leader in India
- Year 2: Expand to full export documentation suite
- Year 3: International expansion (ASEAN, Middle East)

**Slide 14: Ask**
- SISFS seed funding: ₹20 lakhs
- Incubator support: Mentorship, network, resources
- Next steps: Pilot with 50 exporters in Bangalore

**Slide 15: Thank You**
- Contact details
- Demo link
- Q&A

---

## 📊 Current Status Summary

### What's Complete: ✅

**Infrastructure:**
- [x] GitHub repository with 42 files
- [x] Backend skeleton (Node.js + Express + TypeScript)
- [x] Frontend skeleton (Next.js 14)
- [x] Database schema (4 tables)
- [x] Documentation (PROJECT_SPEC v2.0, ARCHITECTURE, PHASE_TRACKER)

**Database:**
- [x] Supabase PostgreSQL database provisioned
- [x] Prisma migrations executed
- [x] 20 automotive products imported
- [x] Tables verified in Prisma Studio

**Test Data:**
- [x] 20 products manually classified
- [x] 5 chapters covered (38, 40, 84, 85, 87)
- [x] 310 keywords extracted
- [x] Decision patterns identified

**Environment:**
- [x] `.env` configured (DATABASE_URL, OPENAI_API_KEY)
- [x] npm dependencies installed
- [x] OpenAI API tested and working

---

### What's Next: ⏳

**Immediate (This Week - Phase 1 Days 1-2):**
- [ ] Implement keyword matcher service
- [ ] Test with 20 products
- [ ] Measure accuracy (target 60%+)

**This Month (Phase 1 - Week 2):**
- [ ] Complete all 3 classification methods
- [ ] Achieve 70%+ accuracy
- [ ] Build 4 API endpoints
- [ ] Implement rate limiting

**Next Month (Phases 2-3):**
- [ ] Build frontend UI
- [ ] Deploy to Vercel
- [ ] Validate with 4-5 exporters
- [ ] Collect testimonials

**Following Months (Post-MVP):**
- [ ] Register company
- [ ] Apply for DPIIT recognition
- [ ] Apply to incubator
- [ ] Submit SISFS application

---

## 🎯 Success Definition

### MVP is successful if:
1. ✅ 70%+ accuracy on 50-product test dataset (currently 20)
2. ✅ Average classification time < 30 seconds
3. ✅ 4/5 exporters say it saves time
4. ✅ 3/5 exporters willing to pay
5. ✅ Zero critical bugs during demo
6. ✅ Can confidently pitch to DPIIT evaluators

### MVP fails if:
1. ❌ Accuracy < 60% after all optimizations
2. ❌ 0/5 exporters see value
3. ❌ Classification takes > 2 minutes per product
4. ❌ Too complex for exporters to use
5. ❌ Realize there's no real problem to solve

**In case of failure:** Pivot based on exporter feedback. They might reveal a different, more valuable pain point (e.g., finding buyers, payment collection, documentation automation).

---

## 🗂️ Project File Structure (Current)

```
hs-code-classifier/
├── README.md                           ✅ Updated with project overview
├── .gitignore                          ✅ Comprehensive ignore rules
├── CHANGELOG.md                        ✅ Version 0.1.0 logged
│
├── docs/
│   ├── PROJECT_SPEC.md                 ✅ Original v1.0
│   ├── PROJECT_SPEC_v2.0.md            ✅ This document
│   ├── ARCHITECTURE.md                 ✅ System design
│   └── PHASE_TRACKER.md                ✅ Progress tracking
│
├── backend/
│   ├── package.json                    ✅ Dependencies installed
│   ├── tsconfig.json                   ✅ TypeScript config
│   ├── .env                            ✅ Configured (not committed)
│   ├── .env.example                    ✅ Template for setup
│   ├── README.md                       ✅ Backend instructions
│   │
│   ├── prisma/
│   │   ├── schema.prisma               ✅ 4 tables defined
│   │   ├── seed.ts                     ✅ Imports 20 products
│   │   └── migrations/                 ✅ Initial migration done
│   │
│   └── src/
│       ├── index.ts                    ✅ Express server skeleton
│       ├── types/
│       │   └── classification.types.ts ✅ TypeScript interfaces
│       ├── utils/
│       │   ├── logger.ts               ✅ Logging utility
│       │   └── prisma.ts               ✅ Prisma client
│       ├── routes/
│       │   └── classify.routes.ts      ⏳ TODO: Implement endpoints
│       └── services/
│           ├── keyword-matcher.service.ts      ⏳ TODO: Day 1-2
│           ├── decision-tree.service.ts        ⏳ TODO: Day 3-4
│           ├── ai-classifier.service.ts        ⏳ TODO: Day 5-6
│           └── confidence-scorer.service.ts    ⏳ TODO: Day 7
│
├── frontend/
│   ├── package.json                    ✅ Dependencies defined
│   ├── tsconfig.json                   ✅ TypeScript config
│   ├── next.config.js                  ✅ Next.js config
│   ├── tailwind.config.ts              ✅ Tailwind setup
│   ├── .env.local.example              ✅ Template
│   ├── README.md                       ✅ Frontend instructions
│   │
│   └── src/
│       ├── app/
│       │   ├── layout.tsx              ✅ Root layout
│       │   ├── page.tsx                ✅ Homepage skeleton
│       │   ├── globals.css             ✅ Tailwind imports
│       │   └── api/classify/
│       │       └── route.ts            ⏳ TODO: API proxy
│       ├── components/
│       │   ├── Header.tsx              ⏳ TODO: Phase 2
│       │   ├── ClassificationForm.tsx  ⏳ TODO: Phase 2
│       │   ├── ResultsDisplay.tsx      ⏳ TODO: Phase 2
│       │   └── ui/                     ✅ Shadcn placeholder
│       └── lib/
│           ├── api-client.ts           ⏳ TODO: Phase 2
│           └── cn.ts                   ✅ Tailwind utility
│
└── data/
    ├── scraper.py                      ✅ Fixed version working
    ├── test_dataset.csv                ✅ 20 products with HS codes
    ├── hs_codes_seed.json              ✅ Generated, imported to DB
    ├── requirements.txt                ✅ pandas installed
    └── README.md                       ✅ Data processing guide
```

---

## 🔧 Development Environment

### Prerequisites (All Installed ✅)
- Node.js 18+
- npm 9+
- Python 3.9+
- Git
- VS Code
- Prisma CLI
- PostgreSQL client (via Supabase)

### Environment Variables (Configured ✅)

**Backend `.env`:**
```bash
DATABASE_URL="postgresql://postgres:[password]@[host].supabase.co:5432/postgres"
OPENAI_API_KEY="sk-proj-..."
PORT=3000
NODE_ENV="development"
```

**Frontend `.env.local`:**
```bash
NEXT_PUBLIC_API_URL="http://localhost:3000/api"
```

### Running the Project

**Backend:**
```bash
cd backend
npm run dev          # Start Express server (port 3000)
npx prisma studio    # Open database GUI (port 5555)
```

**Frontend:**
```bash
cd frontend
npm run dev          # Start Next.js (port 3001)
```

**Database:**
```bash
cd backend
npx prisma migrate dev      # Run migrations
npx prisma generate         # Generate Prisma client
npx ts-node prisma/seed.ts  # Seed database
```

---

## 📝 Key Learnings from Phase 0

### Technical Insights:
1. **PostgreSQL full-text search** is powerful for keyword matching
2. **Prisma ORM** makes database operations type-safe and easy
3. **HS code hierarchy** matters (Chapter → Heading → Subheading)
4. **Keywords extraction** requires stopword filtering

### Domain Insights:
1. **Material composition** is critical for ambiguous cases
2. **Finished vs Raw** is a major decision point
3. **Primary function** often determines classification
4. **Common confusions:**
   - Filters: Mechanical (8421) vs Vehicle Parts (8708)
   - Lighting: Bulbs (8539) vs Assemblies (8512)
   - Rubber parts: Rubber (40) vs Vehicle Parts (8708)

### Cost Insights:
1. **GPT-4o-mini** is sufficient (10x cheaper than GPT-4o)
2. **Rate limiting is essential** to prevent cost overruns
3. **Caching saves money** (don't re-classify same products)
4. **Keyword + rules should handle 80%** of classifications (AI for 20%)

---

## ⚠️ Critical Reminders

### For Development:
1. **Test with real data** from Day 1 (your 20 products)
2. **Focus on accuracy over features** (85% in 1 category > 60% in 5)
3. **Keep it simple** (resist feature creep)
4. **Document decisions** (why X over Y)
5. **Commit frequently** to GitHub

### For Testing:
1. **Let exporters use their own products** (not your sample data)
2. **Screen record sessions** (invaluable for debugging)
3. **Ask open-ended questions** ("What would you change?" not "Do you like it?")
4. **Document exact feedback** (quotes are powerful for DPIIT pitch)
5. **Be prepared to pivot** (if exporters have different pain points)

### For Cost Control:
1. **Monitor OpenAI costs daily** (set alerts at $5)
2. **Rate limit aggressively** (100 requests/hour max)
3. **Cache everything** (database is cheaper than AI calls)
4. **Use AI sparingly** (only when confidence < 70%)
5. **Test with GPT-4o-mini** (never GPT-4o in production)

### For DPIIT/SISFS:
1. **Don't incorporate until MVP validated** (save ₹12k)
2. **Exporter testimonials are gold** (get them in writing)
3. **Demo video matters** (invest time in making it clear)
4. **Show traction** (4-5 exporters tested = strong signal)
5. **Deep > broad** (expert in automotive > generalist)

---

## 📞 Contact & Support

### Developer
- **Name:** Aryan
- **Role:** Founder & Solo Developer
- **Background:** AI/ML Engineer, Full-Stack Developer (Graduating 2025)
- **Location:** Bengaluru, Karnataka, India
- **Family Business:** Amar Jyothi Spare Parts, Madikeri, Karnataka

### Project Links
- **GitHub:** `hs-code-classifier` (private repository)
- **Supabase:** Database provisioned (Singapore region)
- **OpenAI:** API key configured (GPT-4o-mini model)
- **Vercel:** To be deployed in Phase 2

### Timeline
- **Project Start:** November 21, 2025
- **Phase 0 Complete:** November 22, 2025 ✅
- **Phase 1 Target:** November 29, 2025 ⏳
- **MVP Target:** December 13, 2025
- **DPIIT Application:** January 2026
- **SISFS Application:** February-March 2026

---

## ✅ Handoff Checklist (For New Conversation)

When starting a new conversation, the AI assistant should know:

**Project Context:**
- [x] HS code classification MVP for Indian exporters
- [x] Building towards DPIIT recognition and SISFS seed funding
- [x] Target: 70-85% accuracy, < 30 seconds per classification
- [x] Current focus: Backend development (Phase 1)

**Technical Stack:**
- [x] Backend: Node.js + Express + TypeScript + Prisma + PostgreSQL (Supabase)
- [x] Frontend: Next.js 14 + React 18 + TypeScript + Tailwind + Shadcn UI
- [x] AI: OpenAI GPT-4o-mini (cost-controlled with rate limiting)

**Current Status:**
- [x] Phase 0 complete (setup + manual classification)
- [x] Database ready with 20 products
- [x] Ready to implement keyword matcher (Phase 1 Day 1-2)

**Cost Concerns:**
- [x] Must implement rate limiting (prevent DDoS → high OpenAI costs)
- [x] Use GPT-4o-mini (10x cheaper than GPT-4o)
- [x] Target: < 20% of classifications use AI
- [x] Daily limit: $5 USD max

**Next Steps:**
- [ ] Implement keyword matcher service (Day 1-2)
- [ ] Implement decision tree service (Day 3-4)
- [ ] Implement AI classifier with rate limiting (Day 5-6)
- [ ] Integration & testing (Day 7)

**Key Files:**
- `docs/PROJECT_SPEC_v2.0.md` - This document (complete reference)
- `data/hs_codes_seed.json` - 20 classified products
- `backend/prisma/schema.prisma` - Database schema
- `backend/src/services/*.ts` - Services to implement

**Preferences:**
- Developer prefers: Direct, honest feedback
- No unnecessary code without discussion
- Phase-wise implementation (not big-bang)
- Testing at each step before proceeding
- Focus on development, not theory

---

## 📊 Version History

- **v1.0 (Nov 21, 2025):** Initial specification - planning phase
- **v2.0 (Nov 22, 2025):** Updated after Phase 0 completion
  - Added: Completed work summary
  - Added: 20 classified products reference
  - Added: Detailed Phase 1 implementation guide
  - Added: Cost control & rate limiting strategy
  - Added: OpenAI GPT-4o-mini setup
  - Updated: Timeline from 2024 to 2025
  - Added: Post-MVP roadmap (DPIIT, SISFS)
  - Status: Ready for Phase 1 backend development

---

## 🚦 CURRENT STATUS: Ready for Phase 1 - Backend Development

**You are here:** Phase 1, Day 1 - Keyword Matcher Implementation  
**Next action:** Implement keyword-matcher.service.ts  
**Timeline:** 2 hours to build, 30 minutes to test  
**Success criteria:** 60%+ top-1 accuracy on 20 products

---

**End of Project Specification Document v2.0**

*This document should be provided at the start of every new conversation to maintain context. It contains everything needed to continue development from the current state.*

*Last updated: November 22, 2025 by Aryan*