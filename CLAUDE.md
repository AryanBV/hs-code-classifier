# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HS Code Classifier - AI-powered export documentation assistant that classifies products into Harmonized System (HS) codes using a hybrid approach combining keyword matching, decision trees, and LLM reasoning. Targets Indian SME exporters, reducing classification time from 30 minutes to under 2 minutes.

## Build & Development Commands

### Backend (Express.js + TypeScript + Prisma)
```bash
cd backend
npm install                   # Install dependencies
npm run dev                   # Start dev server with hot reload (port 3001)
npm run build                 # Compile TypeScript to dist/
npm start                     # Run production build

# Database (Prisma + PostgreSQL/Supabase)
npm run prisma:generate       # Generate Prisma client after schema changes
npm run prisma:push           # Push schema changes to DB (development)
npm run prisma:migrate        # Run migrations (production)
npm run prisma:studio         # Open Prisma Studio GUI
npm run prisma:seed           # Seed database with HS codes
```

### Frontend (Next.js 14 + React 18)
```bash
cd frontend
npm install                   # Install dependencies
npm run dev                   # Start dev server (port 3000)
npm run build                 # Production build
npm run lint                  # ESLint
npm run type-check            # TypeScript validation (tsc --noEmit)
```

## Architecture

### Monorepo Structure
- `backend/` - Express.js REST API with Prisma ORM
- `frontend/` - Next.js 14 App Router with Tailwind/Shadcn UI
- Separate package.json files; no root package manager

### Classification Pipeline
The system uses a hybrid AI approach through multiple classification routes:
1. **Keyword-based** (`/api/classify`) - PostgreSQL FTS + fuzzy matching
2. **LLM-first** (`/api/classify-llm`) - GPT-4o primary classification
3. **Conversational** (`/api/classify-conversational`) - Multi-turn Q&A refinement
4. **Vector search** (`/api/vector-search`) - Semantic similarity matching

### Backend Service Layer (`backend/src/services/`)
Core classification orchestration:
- `ultimate-classifier.service.ts` - Main classifier entry point
- `llm-first-classifier.service.ts` - LLM-driven classification
- `llm-conversational-classifier.service.ts` - Multi-turn conversations
- `conversational-classifier.service.ts` - Question flow management

Supporting services:
- `keyword-matcher.service.ts` - Fuzzy keyword matching
- `hierarchy-analyzer.service.ts` - HS code hierarchy traversal
- `candidate-filter.service.ts` - Filters classification candidates
- `decision-tree.service.ts` - Rule-based classification
- `dynamic-question.service.ts` - Generates clarifying questions
- `exclusion-classifier.service.ts` - Handles "Other" codes classification
- `chapter-notes.service.ts` - Legal classification rules

### Database Schema (Prisma)
Key models in `backend/prisma/schema.prisma`:
- **HsCode** - Master codes with keywords, synonyms, descriptions
- **HsCodeHierarchy** - Parent/child relationships for code tree
- **ClassificationConversation** / **ConversationTurn** - Multi-turn state
- **ClassificationFeedback** - User feedback for accuracy improvement

### Frontend Structure
- `src/app/` - Next.js App Router pages
- `src/components/classify/` - Chat interface, confidence meters, reasoning panels
- `src/lib/api-client.ts` - Axios client for backend communication

## Environment Variables

### Backend (`backend/.env`)
```
DATABASE_URL=postgresql://...        # Supabase PostgreSQL connection
OPENAI_API_KEY=sk-proj-...          # OpenAI API key for GPT-4o
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000   # CORS origin
```

### Frontend (`frontend/.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## TypeScript Configuration
Both projects use strict mode with `strictNullChecks`, `noImplicitAny`, and `strictFunctionTypes` enabled. Path alias `@/*` maps to `./src/*`.

## Deployment
Production deployment configured for Railway.app. Backend serves API, frontend as separate service.
