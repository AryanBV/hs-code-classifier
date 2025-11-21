# HS Code Classifier - AI-Powered Export Documentation Assistant

> **Reducing HS code classification from 30 minutes to 2 minutes using hybrid AI**

---

## The Problem

Indian exporters face **₹50,000-5,00,000 penalties** for incorrect HS code classification. Manual classification takes **30+ minutes per product** and requires expensive customs consultants (₹2,000-10,000 per classification). Current solutions are slow, expensive, and error-prone.

**Our solution:** AI-powered HS code classifier that achieves **85%+ accuracy** in under 2 minutes, with transparent reasoning and country-specific code mapping.

---

## Tech Stack

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat&logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=flat&logo=next.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=flat&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat&logo=prisma&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-412991?style=flat&logo=openai&logoColor=white)

### Frontend
- **Next.js 14** with React 18
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **Shadcn/ui** for UI components

### Backend
- **Node.js 18+** with Express.js
- **TypeScript** for consistency
- **Prisma ORM** for type-safe database access

### Database
- **PostgreSQL 15** on Supabase
- Full-text search for keyword matching
- JSONB for decision trees

### AI/ML
- **OpenAI GPT-4o** for edge case classification
- Hybrid approach: Keyword matching (30%) + Decision trees (40%) + AI reasoning (30%)

---

## Project Structure

```
hs-code-classifier/
├── README.md                  # This file
├── docs/                      # Documentation
│   ├── PROJECT_SPEC.md       # Complete project specification
│   ├── ARCHITECTURE.md       # System architecture & tech stack details
│   └── PHASE_TRACKER.md      # 4-week development progress tracker
├── backend/                   # Node.js + Express backend (Coming in Phase 1)
│   ├── src/
│   │   ├── routes/           # API routes
│   │   ├── services/         # Classification logic
│   │   ├── utils/            # Helper functions
│   │   └── index.ts          # Entry point
│   ├── prisma/
│   │   └── schema.prisma     # Database schema
│   ├── package.json
│   └── tsconfig.json
├── frontend/                  # Next.js frontend (Coming in Phase 2)
│   ├── src/
│   │   ├── app/              # Next.js app directory
│   │   ├── components/       # React components
│   │   └── lib/              # Utilities
│   ├── package.json
│   └── tsconfig.json
└── data/                      # Data collection scripts (Phase 0)
    ├── scraper.py            # ICEGATE scraper
    ├── test_dataset.csv      # Manual classification dataset
    └── hs_codes_raw.json     # Scraped HS codes
```

---

## How It Works

```
User Input → Category Detection (AI) → Smart Questionnaire → Classification Engine
    ↓
3 Parallel Methods:
    • Keyword Matching (PostgreSQL FTS)
    • Decision Tree Rules
    • AI Reasoning (GPT-4o)
    ↓
Confidence Aggregation → Country Mapping → Final Result with Reasoning
```

**Classification Time:** < 30 seconds
**Target Accuracy:** 85%+ for automotive parts
**Supported Categories:** Starting with automotive parts (Chapter 87), expanding to machinery, electronics

---

## Current Status

**Phase 0: Manual Classification & Validation (Week 1)** - IN PROGRESS

We're following a methodical 4-week MVP development process:

1. **Week 1 (Phase 0):** Manual classification, decision tree creation, database setup
2. **Week 2 (Phase 1):** Backend API development
3. **Week 3 (Phase 2):** Frontend development
4. **Week 4 (Phase 3):** Exporter validation & feedback

See [docs/PHASE_TRACKER.md](docs/PHASE_TRACKER.md) for detailed progress.

---

## Setup Instructions

### Prerequisites
- Node.js 18+
- Python 3.9+ (for data scraping)
- PostgreSQL 15
- OpenAI API key

### Installation

**Coming in Phase 1** (Week 2)

Full setup instructions will be added once backend and frontend are initialized.

For now, refer to [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md) for the complete development plan.

---

## Database Schema

The system uses 4 main tables:

1. **hs_codes** - Master HS code database with keywords
2. **decision_trees** - Category-specific decision logic
3. **user_classifications** - Classification history & feedback
4. **country_mappings** - India → Destination country code mappings

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed schema.

---

## API Endpoints (Coming in Phase 1)

- `POST /api/classify` - Classify product and get HS code
- `POST /api/feedback` - Submit user feedback
- `GET /api/categories` - Get available product categories
- `GET /api/history` - Get classification history

---

## Target Market

- **Primary:** SME exporters in automotive parts sector
- **Secondary:** Exporters in machinery, electronics, textiles
- **Market Size:** 1.4 lakh DPIIT-recognized exporters, 50,000+ SME exporters in India

---

## Business Model (Post-MVP)

- **Freemium:** Basic classification free (limited queries)
- **Premium:** ₹500-999/month for unlimited classifications
- **Enterprise:** Custom pricing for bulk/API access
- **Manual Review:** ₹500/product for uncertain cases

---

## Roadmap

### Phase 0 (Week 1) - IN PROGRESS
- [x] Project specification complete
- [x] Architecture documentation
- [ ] Manual classification of 20 products
- [ ] Decision tree creation
- [ ] Database setup with 200-300 HS codes

### Phase 1 (Week 2)
- [ ] Backend API development
- [ ] Classification algorithm implementation
- [ ] OpenAI integration

### Phase 2 (Week 3)
- [ ] Frontend development
- [ ] Dynamic questionnaire
- [ ] Results display with reasoning

### Phase 3 (Week 4)
- [ ] Exporter validation (4-5 exporters)
- [ ] Feedback collection
- [ ] MVP refinement

### Post-MVP
- [ ] Company incorporation
- [ ] DPIIT recognition application
- [ ] SISFS seed funding application

---

## Contributing

This is currently a solo founder project building towards DPIIT recognition and Startup India Seed Fund Scheme (SISFS) application.

Once the MVP is validated, contributions will be welcome.

---

## Building Towards

**DPIIT Recognition** - Demonstrating innovation in export compliance
**SISFS Seed Funding** - ₹20 lakhs grant for 8-month development through recognized incubators

This MVP will be validated with 4-5 real exporters before formal company incorporation.

---

## Documentation

- **[PROJECT_SPEC.md](docs/PROJECT_SPEC.md)** - Complete project specification, problem validation, and implementation plan
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System architecture, tech stack rationale, database design, API design
- **[PHASE_TRACKER.md](docs/PHASE_TRACKER.md)** - Week-by-week progress tracking and milestone checklist

---

## License

MIT License - See LICENSE file for details

---

## Contact

**Developer:** Aryan
**Location:** Bengaluru, Karnataka
**Family Business:** Amar Jyothi Spare Parts, Madikeri

---

**Status:** Pre-MVP (Week 1 of 4)
**Last Updated:** November 21, 2024

*Building the future of export documentation, one classification at a time.*
