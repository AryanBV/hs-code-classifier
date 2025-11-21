# Phase Tracker

**HS Code Classifier - 4-Week MVP Development**

Last Updated: November 21, 2024

---

## Overview

This document tracks the progress of the 4-week MVP development cycle. Each phase has clear deliverables and success criteria.

---

## Phase 0: Manual Classification & Validation 🔄

**Timeline:** Week 1 (Days 1-7)
**Status:** ✅ IN PROGRESS
**Goal:** Understand the problem deeply before coding

### Tasks

#### Day 1: Manual Classification Exercise
- [ ] List 20 automotive products from Amar Jyothi Spare Parts
- [ ] Document each product:
  - Product name and detailed description
  - Material composition (if known)
  - Finished product vs raw material
  - Primary function
- [ ] Manually find HS codes using ICEGATE portal
- [ ] Document reasoning for each classification
- [ ] **Deliverable:** Spreadsheet with 20 products + HS codes + reasoning

#### Day 2: Decision Tree Mapping
- [ ] Analyze patterns from 20 classified products
- [ ] Identify decision logic:
  - What questions would narrow down the code?
  - What product attributes matter most?
- [ ] Create hand-drawn/digital flowchart
- [ ] **Deliverable:** Decision tree for automotive parts category

#### Days 3-4: Database Setup & Data Collection
- [ ] Set up Supabase account
- [ ] Create PostgreSQL database
- [ ] Create all 4 tables (hs_codes, decision_trees, user_classifications, country_mappings)
- [ ] Scrape/collect 200-300 automotive HS codes from ICEGATE
- [ ] Structure data with keywords and descriptions
- [ ] Import into database
- [ ] **Deliverable:** Database with 200-300 HS codes ready to query

#### Days 5-7: Algorithm Testing (Manual)
- [ ] Test keyword matching logic on paper:
  - Extract keywords from product descriptions
  - Match against your database keywords
  - Calculate match scores
- [ ] Test decision tree logic on paper:
  - Walk through 10 products using your flowchart
  - See if it leads to correct codes
- [ ] Document accuracy: X/20 correct classifications
- [ ] **Deliverable:** Validated classification logic ready to code

### Success Criteria
- ✅ 20 manually classified products with reasoning
- ✅ Decision tree flowchart completed
- ✅ Database populated with 200-300 codes
- ✅ Manual testing shows 70%+ accuracy potential

### Blockers & Notes
- None yet

---

## Phase 1: Backend Development 📋

**Timeline:** Week 2 (Days 8-14)
**Status:** ⏳ NOT STARTED
**Goal:** Build working API that can classify HS codes

### Tasks

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
- [ ] **Deliverable:** Backend server running locally

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
- [ ] **Deliverable:** POST /api/classify endpoint working

#### Days 5-6: OpenAI Integration
- [ ] Set up OpenAI SDK
- [ ] Create prompt template for HS classification
- [ ] Build AI reasoning function:
  - Call GPT-4o with product details
  - Parse JSON response
  - Extract code + reasoning
- [ ] Integrate AI as 3rd classification method
- [ ] Final confidence scorer (keyword 30% + rules 40% + AI 30%)
- [ ] **Deliverable:** AI-enhanced classification working

#### Day 7: Testing & Refinement
- [ ] Test all 20 products from Week 1
- [ ] Calculate accuracy: correct #1 result / total
- [ ] Fix obvious bugs
- [ ] Optimize response time (target < 10 seconds)
- [ ] **Deliverable:** API with 70%+ accuracy

### Success Criteria
- ✅ POST /api/classify endpoint working
- ✅ 70%+ accuracy on test dataset
- ✅ Response time < 30 seconds
- ✅ All 3 classification methods integrated

### Blockers & Notes
- TBD

---

## Phase 2: Frontend Development 📋

**Timeline:** Week 3 (Days 15-21)
**Status:** ⏳ NOT STARTED
**Goal:** Build user interface with dynamic questionnaire

### Tasks

#### Days 1-2: Frontend Setup
- [ ] Initialize Next.js project
- [ ] Set up TypeScript + Tailwind CSS
- [ ] Install UI library (Shadcn/ui or MUI)
- [ ] Create basic layout:
  - Header with logo/title
  - Main content area
  - Footer
- [ ] Create homepage with description
- [ ] **Deliverable:** Frontend running locally

#### Days 3-4: Classification Flow
- [ ] Build multi-step form:
  - Step 1: Product description input
  - Step 2: Destination country dropdown
  - Step 3: Dynamic questionnaire (based on category)
  - Step 4: Results display
- [ ] Connect to backend API
- [ ] Add loading states
- [ ] Handle errors gracefully
- [ ] **Deliverable:** End-to-end classification working in UI

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
- [ ] **Deliverable:** Professional-looking UI

#### Day 7: End-to-End Testing
- [ ] Test complete user journey
- [ ] Fix UI bugs
- [ ] Optimize performance
- [ ] Test on mobile devices
- [ ] **Deliverable:** Production-ready frontend

### Success Criteria
- ✅ Complete user flow working
- ✅ Responsive design (desktop + mobile)
- ✅ Clean, professional UI
- ✅ Error handling in place

### Blockers & Notes
- TBD

---

## Phase 3: Exporter Validation 📋

**Timeline:** Week 4 (Days 22-28)
**Status:** ⏳ NOT STARTED
**Goal:** Test with real exporters and collect feedback

### Tasks

#### Days 1-2: Prepare Demo Materials
- [ ] Record 2-minute demo video
- [ ] Create one-pager PDF:
  - Problem we're solving
  - How it works
  - Benefits
  - Ask for feedback
- [ ] Prepare 5 sample products for demo
- [ ] Set up analytics (track usage patterns)
- [ ] **Deliverable:** Demo kit ready

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
- [ ] **Deliverable:** 4-5 validation sessions completed

#### Days 6-7: Incorporate Feedback
- [ ] Analyze feedback
- [ ] Prioritize changes (must-have vs nice-to-have)
- [ ] Fix critical bugs
- [ ] Add most-requested features
- [ ] Re-test with 1-2 exporters if major changes
- [ ] **Deliverable:** MVP refined based on real user feedback

### Success Criteria
- ✅ 4/5 exporters say "this would save me time"
- ✅ 3/5 exporters say "I'd pay for this"
- ✅ Written testimonials collected
- ✅ MVP refined based on feedback
- ✅ Zero critical bugs

### Blockers & Notes
- TBD

---

## Post-MVP: DPIIT & SISFS Applications 📋

**Timeline:** Months 2-4
**Status:** ⏳ NOT STARTED
**Goal:** Get recognition and funding

### Company Formation
- [ ] Decide on entity type (Private Limited vs LLP)
- [ ] Register company (₹12k for Pvt Ltd, ₹8k for LLP)
- [ ] Get Certificate of Incorporation
- [ ] **Timeline:** 7-10 days

### DPIIT Recognition Application
- [ ] Register on Startup India portal
- [ ] Fill DPIIT recognition form
- [ ] Upload documents:
  - Certificate of Incorporation
  - Business description (innovation pitch)
  - Demo video
  - Exporter testimonials
- [ ] Submit application
- [ ] **Timeline:** 10-15 working days for approval

### SISFS Application (through Incubator)
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
- [ ] **Timeline:** 1-2 months for approval

### Success Criteria
- ✅ DPIIT recognition obtained
- ✅ Incubator acceptance
- ✅ SISFS seed funding application submitted
- ✅ Funding received (₹20 lakhs)

---

## Progress Summary

| Phase | Status | Completion | Next Milestone |
|-------|--------|------------|----------------|
| Phase 0: Manual Classification | 🔄 IN PROGRESS | 0% | Complete 20 product classification |
| Phase 1: Backend Development | ⏳ NOT STARTED | 0% | Initialize backend project |
| Phase 2: Frontend Development | ⏳ NOT STARTED | 0% | Initialize Next.js project |
| Phase 3: Exporter Validation | ⏳ NOT STARTED | 0% | Prepare demo materials |
| Post-MVP: DPIIT/SISFS | ⏳ NOT STARTED | 0% | Company incorporation |

---

## Key Metrics Tracking

### Technical Metrics
- [ ] Classification accuracy: **Target 70-85%** | Current: TBD
- [ ] Response time: **Target <30s** | Current: TBD
- [ ] Database size: **Target 200-300 codes** | Current: 0

### Business Metrics
- [ ] Exporters validated: **Target 4-5** | Current: 0
- [ ] Positive feedback rate: **Target 80%** | Current: TBD
- [ ] Willingness to pay: **Target 60%** | Current: TBD

### Funding Progress
- [ ] DPIIT recognition: ⏳ Pending MVP
- [ ] Incubator acceptance: ⏳ Pending MVP
- [ ] SISFS funding: ⏳ Pending incubator

---

## Risk Register

| Risk | Impact | Mitigation | Status |
|------|--------|------------|--------|
| Accuracy < 70% after optimization | High | Focus on single category, improve decision trees | Monitoring |
| OpenAI API costs exceed budget | Medium | Limit to 20% of queries, implement caching | Controlled |
| Exporters don't see value | Critical | Validate problem deeply in Phase 0 | Active |
| Technical blockers (API limits, DB) | Medium | Use free tiers, fallback strategies | Prepared |
| Timeline slippage | Medium | Weekly milestones, daily progress tracking | Active |

---

## Weekly Standup Questions

**Every Friday, ask:**
1. What did I complete this week?
2. What's blocked or behind schedule?
3. What's the plan for next week?
4. Do I need to adjust the timeline?

---

**For detailed task breakdown, see [PROJECT_SPEC.md](PROJECT_SPEC.md)**
**For technical architecture, see [ARCHITECTURE.md](ARCHITECTURE.md)**
