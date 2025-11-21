# HS Code Classification AI - MVP Project Specification

**Last Updated:** November 21, 2024  
**Status:** Planning Complete - Ready to Start Implementation  
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
1. **Build working MVP** in 3-4 weeks
2. **Validate with 4-5 exporters** to get feedback
3. **Achieve 70-85% accuracy** in automotive parts category
4. **Prepare for DPIIT application** (company incorporation will happen AFTER MVP validation)
5. **Create demo materials** for SISFS incubator applications

### Success Metrics
- 70%+ accuracy on test dataset of 50 products
- Average classification time < 30 seconds
- 4/5 exporters say "this would save me time"
- 3/5 exporters say "I'd pay for this"
- Zero critical bugs during demo

---

## 🏗️ System Architecture

### High-Level Architecture
```
User Interface (React/Next.js)
    ↓
Backend API (Node.js + Express)
    ↓
Classification Engine (Hybrid AI)
    ├─→ Keyword Matcher (PostgreSQL full-text search)
    ├─→ Decision Tree Engine (Rule-based logic)
    └─→ AI Reasoning (OpenAI GPT-4o)
    ↓
Database Layer (PostgreSQL + Prisma)
    ├─→ HS Codes Database
    ├─→ Decision Trees
    ├─→ User Classifications History
    └─→ Country Mappings
    ↓
External APIs
    └─→ OpenAI API
```

### Data Flow Example
```
1. User Input: "Ceramic brake pads for motorcycles, finished product"
2. Category Detection: AI identifies "Automotive Parts"
3. Smart Questionnaire: 
   - Q1: Finished or raw? → Finished
   - Q2: Material? → 60% ceramic, 30% copper
   - Q3: Function? → Braking
4. Classification Engine (3 parallel methods):
   - Keyword Match: 8708.30.10 (85% confidence)
   - Decision Tree: 8708.30.10 (90% confidence)
   - AI Reasoning: 8708.30.10 (85% confidence)
5. Final Result: 8708.30.10 (90% confidence - all methods agree)
6. Country Mapping: India: 8708.30.10 → USA: 8708.30.50
7. Display with reasoning and alternatives
```

---

## 💻 Technology Stack

### Frontend
- **Framework:** Next.js 14 (React 18)
- **Language:** TypeScript
- **UI Library:** Shadcn/ui or Material-UI (MUI)
- **Styling:** Tailwind CSS
- **Deployment:** Vercel (free tier)

**Why Next.js:**
- Server-side rendering for better SEO
- API routes built-in (can combine frontend/backend if needed)
- Easy deployment to Vercel
- Aryan already knows React
- Industry standard for modern web apps

### Backend
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Language:** TypeScript (consistency with frontend)
- **ORM:** Prisma (type-safe database access)
- **Deployment:** Railway or Render (free tier)

**Why Node.js + Express:**
- Same language as frontend (JavaScript/TypeScript)
- Fast for I/O operations (API calls, DB queries)
- Huge ecosystem of libraries
- Aryan already knows it
- Easy to scale later

### Database
- **Database:** PostgreSQL 15
- **ORM:** Prisma
- **Hosting:** Supabase (free tier - 500MB)

**Why PostgreSQL:**
- Relational structure (HS codes are hierarchical)
- Full-text search for keyword matching
- JSON support for questionnaire responses
- Free hosting with good performance

### AI/ML
- **Primary:** OpenAI GPT-4o (latest model)
- **Usage:** Edge case classification + reasoning generation
- **Cost:** ₹500-1000/month during testing (limit to 20% of queries)

**Why GPT-4o:**
- Best reasoning capabilities
- Good at explaining decisions (builds trust)
- Reliable API
- Aryan already familiar with OpenAI

### Data Collection (One-time)
- **Language:** Python 3.9+
- **Libraries:** BeautifulSoup, Pandas
- **Purpose:** Scrape HS codes from ICEGATE

### Development Tools
- **Editor:** VS Code
- **Version Control:** Git + GitHub
- **API Testing:** Postman or Thunder Client
- **Database GUI:** Prisma Studio
- **Project Management:** GitHub Projects or Notion

### Deployment & Hosting
- Frontend: Vercel (auto-deploy from GitHub)
- Backend: Railway or Render
- Database: Supabase
- **Total Cost:** ₹0 (all free tiers) + ₹500-1000 for OpenAI

---

## 🗄️ Database Schema

### Table 1: hs_codes
```sql
CREATE TABLE hs_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) NOT NULL,              -- "8708.30.10"
  chapter VARCHAR(2) NOT NULL,            -- "87"
  heading VARCHAR(4) NOT NULL,            -- "8708"
  subheading VARCHAR(6) NOT NULL,         -- "8708.30"
  country_code VARCHAR(2) NOT NULL,       -- "IN", "US", "EU"
  description TEXT NOT NULL,              -- Full official description
  keywords TEXT[],                        -- ["brake", "pad", "vehicle", "motorcycle"]
  common_products TEXT[],                 -- ["brake pads", "disc brakes"]
  parent_code VARCHAR(20),                -- For hierarchy
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_keywords ON hs_codes USING GIN (keywords);
CREATE INDEX idx_code ON hs_codes (code);
CREATE INDEX idx_country ON hs_codes (country_code);
```

### Table 2: decision_trees
```sql
CREATE TABLE decision_trees (
  id SERIAL PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL,    -- "Automotive Parts"
  decision_flow JSONB NOT NULL,           -- Complete question flow + rules
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Example decision_flow structure:
{
  "questions": [
    {
      "id": "q1",
      "text": "Is this a finished product or raw material?",
      "type": "single_choice",
      "options": ["Finished", "Raw"],
      "next_question_map": {
        "Finished": "q2",
        "Raw": "q3"
      }
    }
  ],
  "rules": [
    {
      "conditions": {
        "q1": "Finished",
        "keywords": ["brake", "pad"]
      },
      "suggested_codes": ["8708.30.10"],
      "confidence_boost": 10
    }
  ]
}
```

### Table 3: user_classifications
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

### Table 4: country_mappings
```sql
CREATE TABLE country_mappings (
  id SERIAL PRIMARY KEY,
  india_code VARCHAR(20) NOT NULL,        -- "8708.30.10"
  country VARCHAR(50) NOT NULL,           -- "USA", "EU", "UK"
  local_code VARCHAR(20) NOT NULL,        -- "8708.30.50"
  import_duty_rate VARCHAR(50),           -- "2.5%"
  special_requirements TEXT,              -- "CE marking required"
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_india_code ON country_mappings (india_code);
CREATE INDEX idx_country ON country_mappings (country);
```

---

## 📊 Phase-Wise Implementation Plan

### PHASE 0: Manual Classification & Validation (Week 1)
**Goal:** Understand the problem deeply before coding

#### Day 1: Manual Classification Exercise
- [ ] List 20 automotive products from Amar Jyothi Spare Parts
- [ ] For each product, document:
  - Product name and detailed description
  - Material composition (if known)
  - Finished product vs raw material
  - Primary function
- [ ] Manually find HS codes using ICEGATE portal
- [ ] Document reasoning for each classification
- [ ] **Output:** Spreadsheet with 20 products + HS codes + reasoning

#### Day 2: Decision Tree Mapping
- [ ] Analyze patterns from 20 classified products
- [ ] Identify decision logic:
  - What questions would narrow down the code?
  - What product attributes matter most?
- [ ] Create hand-drawn/digital flowchart
- [ ] **Output:** Decision tree for automotive parts category

#### Days 3-4: Database Setup & Data Collection
- [ ] Set up Supabase account
- [ ] Create PostgreSQL database
- [ ] Create all 4 tables (schema above)
- [ ] Scrape/collect 200-300 automotive HS codes from ICEGATE
- [ ] Structure data with keywords and descriptions
- [ ] Import into database
- [ ] **Output:** Database with 200-300 HS codes ready to query

#### Days 5-7: Algorithm Testing (Manual)
- [ ] Test keyword matching logic on paper:
  - Extract keywords from product descriptions
  - Match against your database keywords
  - Calculate match scores
- [ ] Test decision tree logic on paper:
  - Walk through 10 products using your flowchart
  - See if it leads to correct codes
- [ ] Document accuracy: X/20 correct classifications
- [ ] **Output:** Validated classification logic ready to code

**Week 1 Milestone:** Test dataset ready, classification logic validated, database populated

---

### PHASE 1: Backend Foundation (Week 2)
**Goal:** Build working API that can classify HS codes

#### Days 1-2: Backend Setup
- [ ] Initialize Node.js + Express project
- [ ] Set up TypeScript configuration
- [ ] Install dependencies:
  - express
  - prisma
  - @prisma/client
  - openai
  - cors
  - dotenv
- [ ] Set up Prisma connection to Supabase
- [ ] Create basic Express server with health check endpoint
- [ ] **Output:** Backend server running locally

#### Days 3-4: Core Classification Logic
- [ ] Build keyword matching algorithm:
  - Extract keywords from description
  - Query hs_codes table using full-text search
  - Return top 5 matches with scores
- [ ] Build decision tree engine:
  - Load decision tree from database
  - Apply rules based on questionnaire answers
  - Return suggested codes
- [ ] Combine both methods:
  - Calculate weighted confidence score
  - Return top 3 results
- [ ] **Output:** POST /api/classify endpoint working

#### Days 5-6: OpenAI Integration
- [ ] Set up OpenAI SDK
- [ ] Create prompt template for HS classification
- [ ] Build AI reasoning function:
  - Call GPT-4o with product details
  - Parse JSON response
  - Extract code + reasoning
- [ ] Integrate AI as 3rd classification method
- [ ] Final confidence scorer (keyword 30% + rules 40% + AI 30%)
- [ ] **Output:** AI-enhanced classification working

#### Day 7: Testing & Refinement
- [ ] Test all 20 products from Week 1
- [ ] Calculate accuracy: correct #1 result / total
- [ ] Fix obvious bugs
- [ ] Optimize response time (target < 10 seconds)
- [ ] **Output:** API with 70%+ accuracy

**Week 2 Milestone:** Working backend API that classifies with 70%+ accuracy

---

### PHASE 2: Frontend & Smart Questionnaire (Week 3)
**Goal:** Build user interface with dynamic questionnaire

#### Days 1-2: Frontend Setup
- [ ] Initialize Next.js project
- [ ] Set up TypeScript + Tailwind CSS
- [ ] Install UI library (Shadcn/ui or MUI)
- [ ] Create basic layout:
  - Header with logo/title
  - Main content area
  - Footer
- [ ] Create homepage with description
- [ ] **Output:** Frontend running locally

#### Days 3-4: Classification Flow
- [ ] Build multi-step form:
  - Step 1: Product description input
  - Step 2: Destination country dropdown
  - Step 3: Dynamic questionnaire (based on category)
  - Step 4: Results display
- [ ] Connect to backend API
- [ ] Add loading states
- [ ] Handle errors gracefully
- [ ] **Output:** End-to-end classification working in UI

#### Days 5-6: Results Display & UX Polish
- [ ] Build results page:
  - Top HS code with confidence badge
  - Reasoning explanation (why this code)
  - Alternative codes (2nd and 3rd options)
  - Country mapping (India code → destination code)
  - Export as PDF button
- [ ] Add classification history:
  - Show past 10 classifications
  - Click to view details
- [ ] Responsive design (mobile-friendly)
- [ ] **Output:** Professional-looking UI

#### Day 7: End-to-End Testing
- [ ] Test complete user journey
- [ ] Fix UI bugs
- [ ] Optimize performance
- [ ] Test on mobile devices
- [ ] **Output:** Production-ready frontend

**Week 3 Milestone:** Complete web app ready for exporter testing

---

### PHASE 3: Exporter Validation (Week 4)
**Goal:** Test with real exporters and collect feedback

#### Days 1-2: Prepare Demo Materials
- [ ] Record 2-minute demo video
- [ ] Create one-pager PDF:
  - Problem we're solving
  - How it works
  - Benefits
  - Ask for feedback
- [ ] Prepare 5 sample products for demo
- [ ] Set up analytics (track usage patterns)
- [ ] **Output:** Demo kit ready

#### Days 3-5: Exporter Meetings
- [ ] Meet with 4-5 exporters:
  - Amar Jyothi Spare Parts (family business)
  - 3-4 Peenya industrial area exporters
- [ ] Let them use the tool with their actual products
- [ ] Screen record sessions
- [ ] Take detailed notes:
  - What worked well?
  - What confused them?
  - What's missing?
  - Would they pay? How much?
- [ ] Collect written testimonials
- [ ] **Output:** 4-5 validation sessions completed

#### Days 6-7: Incorporate Feedback
- [ ] Analyze feedback
- [ ] Prioritize changes (must-have vs nice-to-have)
- [ ] Fix critical bugs
- [ ] Add most-requested features
- [ ] Re-test with 1-2 exporters if major changes
- [ ] **Output:** MVP refined based on real user feedback

**Week 4 Milestone:** Validated MVP ready for DPIIT application

---

### POST-MVP: DPIIT & SISFS Applications
**Goal:** Get recognition and funding

#### Company Formation
- [ ] Decide on entity type (Private Limited vs LLP)
- [ ] Register company (₹12k for Pvt Ltd, ₹8k for LLP)
- [ ] Get Certificate of Incorporation
- [ ] Timeline: 7-10 days

#### DPIIT Recognition Application
- [ ] Register on Startup India portal
- [ ] Fill DPIIT recognition form
- [ ] Upload documents:
  - Certificate of Incorporation
  - Business description (innovation pitch)
  - Demo video
  - Exporter testimonials
- [ ] Submit application
- [ ] Timeline: 10-15 working days for approval

#### SISFS Application (through Incubator)
- [ ] Research Bangalore incubators:
  - NSRCEL (IIM Bangalore) - top tier
  - T-Hub Bangalore
  - DERBI Foundation
  - Conquest Startup Hub
- [ ] Prepare pitch deck:
  - Problem & solution
  - Market opportunity
  - MVP demo
  - Exporter validation
  - Team (your background)
  - Funding ask (₹20 lakhs for 8 months)
  - Milestones & roadmap
- [ ] Apply to 2-3 incubators
- [ ] Pitch to incubator selection committee
- [ ] Timeline: 1-2 months for approval

**Expected Timeline:** 3-4 months from MVP completion to SISFS funding

---

## 🎯 Category Focus Strategy

### Primary Category: Automotive Parts (Chapter 87)
**Why this first:**
- Domain expertise (Amar Jyothi Spare Parts)
- Can validate with family business
- Clear product hierarchy
- Less ambiguity than textiles/food
- High export volume (₹15,000+ crore annually)
- Easier to get exporter feedback

**Common Products:**
- Brake components (pads, discs, drums, fluid, cables)
- Engine parts (pistons, valves, gaskets, filters)
- Lighting equipment (headlights, indicators, bulbs)
- Filters (oil, air, fuel)
- Suspension parts (shock absorbers, springs)
- Transmission components

**HS Code Range:** Primarily 8708.xx.xx

**Target Accuracy:** 85%+ for this category

### Future Categories (Post-MVP)
1. **Machinery Parts (Chapter 84)** - similar logic to auto parts
2. **Electronics (Chapter 85)** - complements machinery
3. **Textiles (Chapters 61-63)** - only after mastering 3 categories
4. **Agricultural Products** - long-term expansion

**Expansion Strategy:** Master one category deeply before adding next

---

## 🚫 Critical Decisions Made

### What We're NOT Doing (For MVP)

❌ **NOT using n8n** in the backend
- Reason: Adds latency, complexity, no real benefit
- n8n is for connecting services, not custom business logic
- Direct API calls are faster and more maintainable

❌ **NOT building for all categories** at once
- Reason: 85% accuracy in 1 category > 60% in 5 categories
- Depth > breadth for MVP validation
- Easier to expand sequentially

❌ **NOT building image classification** in MVP
- Reason: Text + questionnaire is enough to validate
- Images add complexity (vision AI, file upload, storage)
- Can add in Phase 2 after MVP validation

❌ **NOT building document parsing** in MVP
- Reason: Manual text input is sufficient for validation
- Document parsing is complex (OCR, PDF handling)
- Can add in Phase 2

❌ **NOT incorporating company** before MVP validation
- Reason: Save ₹12k if idea doesn't validate
- Test with exporters first, then formalize
- Company needed only for DPIIT application

❌ **NOT building mobile app** for MVP
- Reason: Responsive web app is sufficient
- Mobile app requires separate development effort
- Web app works on mobile browsers

---

## 📈 Current Progress

### Completed ✅
- [x] Problem validation (HS code classification is real pain point)
- [x] Market research (export volumes, exporter needs)
- [x] Technology stack decided
- [x] System architecture designed
- [x] Database schema finalized
- [x] Phase-wise roadmap created
- [x] Category focus strategy (automotive parts)
- [x] Testing strategy defined
- [x] DPIIT/SISFS requirements researched
- [x] Critical decisions documented

### In Progress 🔄
- [ ] None - ready to start Day 1

### Not Started ⏳
- [ ] Manual classification exercise (Day 1)
- [ ] Decision tree mapping (Day 2)
- [ ] Database setup (Days 3-4)
- [ ] Backend development (Week 2)
- [ ] Frontend development (Week 3)
- [ ] Exporter validation (Week 4)

**Current Status:** Planning complete, ready to begin implementation

---

## 🚀 Next Steps (Starting Point)

### Immediate Action (Day 1 - Tomorrow)
**Task:** Manual Classification Exercise

**Process:**
1. Go to Amar Jyothi Spare Parts or list 20 common automotive parts
2. For each product, document:
   - Product name
   - Detailed description (material, function, condition)
   - Material composition (if known)
   - Finished product or raw material?
   - Primary function/use case
3. Visit ICEGATE portal: https://www.icegate.gov.in/
4. Search for each product and find its HS code
5. Document the reasoning (why this code was assigned)
6. Create spreadsheet with all 20 products

**Example Entry:**
```
Product: Ceramic brake pads for motorcycles
Description: Finished product, 60% ceramic composite, 30% copper, 10% organic binding agents
Material: Ceramic composite
Condition: Finished product (retail-ready)
Function: Friction/braking
ICEGATE Search: "brake pads motorcycle"
HS Code: 8708.30.10
Reasoning: Chapter 87 (vehicle parts) → 8708 (parts & accessories) → 30 (brakes) → 10 (finished goods)
```

**Output:** Spreadsheet with 20 classified products (this becomes your test dataset)

**Time Estimate:** 4-6 hours

---

### GitHub Repository Setup

**Recommended Repo Structure:**
```
hs-code-classifier/
├── README.md                  # Project overview & setup instructions
├── docs/                      # Documentation
│   ├── PROJECT_SPEC.md       # This document
│   ├── ARCHITECTURE.md       # System architecture details
│   └── API.md                # API documentation
├── backend/                   # Node.js + Express backend
│   ├── src/
│   │   ├── routes/           # API routes
│   │   ├── services/         # Business logic
│   │   ├── utils/            # Helper functions
│   │   └── index.ts          # Entry point
│   ├── prisma/
│   │   └── schema.prisma     # Database schema
│   ├── package.json
│   └── tsconfig.json
├── frontend/                  # Next.js frontend
│   ├── src/
│   │   ├── app/              # Next.js app directory
│   │   ├── components/       # React components
│   │   └── lib/              # Utilities
│   ├── package.json
│   └── tsconfig.json
├── data/                      # Data collection scripts
│   ├── scraper.py            # ICEGATE scraper
│   ├── test_dataset.csv      # 20 test products
│   └── hs_codes_raw.json     # Scraped HS codes
└── .gitignore
```

**Initial Commit Checklist:**
- [ ] Create README.md with project description
- [ ] Add .gitignore (node_modules, .env, etc.)
- [ ] Add this PROJECT_SPEC.md to docs/
- [ ] Create folder structure
- [ ] Push to GitHub

---

## 📚 Key Resources

### Official Resources
- **ICEGATE Portal:** https://www.icegate.gov.in/ (HS code lookup)
- **Startup India Portal:** https://www.startupindia.gov.in/
- **SISFS Portal:** https://seedfund.startupindia.gov.in/
- **DPIIT Guidelines:** Available on Startup India website

### Technical Documentation
- **OpenAI API Docs:** https://platform.openai.com/docs
- **Prisma Docs:** https://www.prisma.io/docs
- **Next.js Docs:** https://nextjs.org/docs
- **Express.js Docs:** https://expressjs.com/

### Deployment Platforms
- **Vercel:** https://vercel.com/
- **Railway:** https://railway.app/
- **Supabase:** https://supabase.com/

---

## ⚠️ Critical Reminders

### For Technical Development
1. **Test with real data** from Day 1 (20 products from Amar Jyothi)
2. **Focus on accuracy over features** (85% in 1 category > 60% in 5)
3. **Keep it simple** (resist feature creep)
4. **Document decisions** (why you chose X over Y)
5. **Version control everything** (commit frequently)

### For Exporter Validation
1. **Let them use their own products** (not your sample data)
2. **Screen record sessions** (invaluable for debugging)
3. **Ask open-ended questions** (not "Do you like it?" but "What would you change?")
4. **Document exact feedback** (quotes are powerful for DPIIT pitch)
5. **Be prepared to pivot** (if exporters say HS codes aren't their top pain)

### For DPIIT/SISFS Applications
1. **Don't incorporate until MVP is validated** (save ₹12k)
2. **Exporter testimonials are gold** (get them in writing)
3. **Demo video matters** (invest time in making it clear)
4. **Show traction** (4-5 exporters tested it = strong signal)
5. **Deep > broad** (expert in automotive > generalist in everything)

---

## 💰 Cost Breakdown

### Pre-Company Formation (MVP Phase)
- Development: ₹0 (your time)
- Hosting: ₹0 (free tiers)
- OpenAI API: ₹500-1,000 (during testing)
- Domain: ₹500-800/year (optional for MVP)
- Exporter meetings travel: ₹2,000-3,000
- **Total: ₹3,000-5,000**

### Post-MVP (Company Formation)
- Company registration: ₹12,000 (Pvt Ltd) or ₹8,000 (LLP)
- GST registration: ₹0 (if needed later)
- **Total: ₹8,000-12,000**

### Monthly Operational (Post-Launch)
- Hosting: ₹0-2,000 (can stay on free tiers initially)
- OpenAI API: ₹2,000-5,000 (based on usage)
- Domain + email: ₹100-300
- **Total: ₹2,000-7,000/month**

---

## 🎓 Learning Outcomes (For Job Applications)

### Technical Skills Gained
- Full-stack web development (React + Node.js)
- TypeScript in production
- Database design & optimization (PostgreSQL + Prisma)
- AI/LLM integration (OpenAI API)
- RESTful API design
- Cloud deployment (Vercel + Railway)
- Version control with Git

### Product Skills Gained
- User research & validation
- MVP development methodology
- Product roadmapping
- Feature prioritization
- User testing & feedback collection

### Domain Knowledge Gained
- Export documentation & compliance
- HS code classification system
- Government startup schemes (DPIIT, SISFS)
- B2B SaaS product development

**All of this strengthens your 6-12 LPA job applications.**

---

## 📞 Contact & Support

### Developer
- **Name:** Aryan
- **Role:** Founder & Developer
- **Background:** AI/ML Engineer, Full-Stack Developer
- **Location:** Bengaluru, Karnataka
- **Family Business:** Amar Jyothi Spare Parts, Madikeri

### Project Status
- **Timeline:** 4 weeks to validated MVP
- **Target Launch:** December 2024
- **DPIIT Application:** January 2025
- **SISFS Application:** February-March 2025

---

## ✅ Pre-Development Checklist

Before starting Day 1, ensure:

### Environment Setup
- [ ] Node.js 18+ installed
- [ ] VS Code installed with extensions (ESLint, Prettier, Prisma)
- [ ] Git installed and configured
- [ ] GitHub account ready
- [ ] Python 3.9+ installed (for data scraping)
- [ ] Postman or Thunder Client installed (API testing)

### Accounts Created
- [ ] GitHub account
- [ ] Supabase account (free tier)
- [ ] OpenAI account with API key ($5 credit minimum)
- [ ] Vercel account (for deployment)
- [ ] Railway or Render account (for backend)

### Knowledge Prerequisites
- [ ] Comfortable with React & Next.js
- [ ] Comfortable with Node.js & Express
- [ ] Basic understanding of PostgreSQL
- [ ] Familiar with REST APIs
- [ ] Basic Git/GitHub workflow
- [ ] Comfortable with TypeScript (or willing to learn as you go)

### Access to Data
- [ ] Access to Amar Jyothi Spare Parts product catalog
- [ ] Or ability to list 20 common automotive parts
- [ ] Access to ICEGATE portal for HS code lookup
- [ ] Ability to contact 4-5 exporters for validation

---

## 🎯 Success Definition

### MVP is successful if:
1. ✅ 70%+ accuracy on 50-product test dataset
2. ✅ Average classification time < 30 seconds
3. ✅ 4/5 exporters say it saves time
4. ✅ 3/5 exporters willing to pay
5. ✅ Zero critical bugs during demo
6. ✅ You can confidently pitch it to DPIIT evaluators

### MVP fails if:
1. ❌ Accuracy < 60% after all optimizations
2. ❌ 0/5 exporters see value
3. ❌ Classification takes > 2 minutes per product
4. ❌ Too complex for exporters to use
5. ❌ You realize there's no real problem to solve

**In case of failure:** Pivot based on exporter feedback. They might reveal a different, more valuable pain point (e.g., finding buyers, payment collection, documentation automation).

---

## 📝 Version History

- **v1.0 (Nov 21, 2024):** Initial specification after comprehensive planning discussion
- Planning phase complete
- Ready to begin Day 1 implementation

---

## 🚦 Current Status: READY TO START

**Next Action:** Begin Day 1 - Manual Classification Exercise

**Reminder:** Don't start coding yet. Understand the problem first by manually classifying 20 products. This is the foundation of everything else.

---

**End of Project Specification Document**

*This document should be referenced at the start of every new conversation or when context is lost. It contains everything needed to continue development from the current state.*