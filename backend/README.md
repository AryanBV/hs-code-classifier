# HS Code Classifier - Backend API

Node.js + Express backend with Prisma ORM for HS code classification.

---

## Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Language:** TypeScript (strict mode)
- **ORM:** Prisma
- **Database:** PostgreSQL 15 (Supabase)
- **AI:** OpenAI GPT-4o

---

## Prerequisites

- Node.js 18+ and npm 9+
- PostgreSQL database (Supabase recommended)
- OpenAI API key

---

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
# Supabase PostgreSQL connection string
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"

# OpenAI API key
OPENAI_API_KEY="sk-proj-your-api-key-here"

# Server config
PORT=3001
NODE_ENV="development"
FRONTEND_URL="http://localhost:3000"
```

**Getting your Supabase DATABASE_URL:**
1. Go to [https://supabase.com](https://supabase.com)
2. Create a new project (free tier)
3. Go to Project Settings > Database
4. Copy the "Connection string" under "Connection pooling"
5. Replace `[YOUR-PASSWORD]` with your database password

### 3. Generate Prisma Client

```bash
npm run prisma:generate
```

This creates the TypeScript types from your schema.

### 4. Run Database Migrations

**Option A: Using Prisma Migrate (Recommended for production)**

```bash
npm run prisma:migrate
```

This will:
- Create migration files in `prisma/migrations/`
- Apply migrations to your database
- Generate Prisma Client

**Option B: Using Prisma DB Push (Quick for development)**

```bash
npm run prisma:push
```

This directly pushes schema changes to the database without creating migration files.

### 5. Add GIN Index for Keywords (Manual Step)

Prisma doesn't support GIN indexes declaratively, so run this SQL manually:

```sql
-- Connect to your Supabase SQL Editor and run:
CREATE INDEX idx_keywords ON hs_codes USING GIN (keywords);
```

**Why GIN index?**
- Enables fast full-text search on the `keywords` array
- Critical for the keyword matching algorithm (30% of classification confidence)

### 6. Open Prisma Studio (Optional)

View and edit your database through a GUI:

```bash
npm run prisma:studio
```

This opens [http://localhost:5555](http://localhost:5555)

---

## Database Schema

### Tables Overview

1. **hs_codes** - Master HS code database (200-300 codes for automotive parts)
2. **decision_trees** - Category-specific decision logic (JSON)
3. **user_classifications** - Classification history and user feedback
4. **country_mappings** - India → Destination country code mappings

### Relationships

```
hs_codes (1) ──┐
               ├──> country_mappings (N)
               └──> user_classifications (N) [via suggested_hs_code]

decision_trees (1) ───> user_classifications (N) [via category_detected]
```

---

## Running the Server

### Development Mode (with hot reload)

```bash
npm run dev
```

Server runs at [http://localhost:3001](http://localhost:3001)

### Production Build

```bash
npm run build
npm start
```

---

## Project Structure

```
backend/
├── src/
│   ├── routes/              # API route handlers
│   │   ├── classify.ts      # POST /api/classify
│   │   ├── feedback.ts      # POST /api/feedback
│   │   └── history.ts       # GET /api/history
│   ├── services/            # Business logic
│   │   ├── keywordMatcher.ts    # Keyword matching algorithm
│   │   ├── decisionTree.ts      # Decision tree engine
│   │   ├── aiReasoning.ts       # OpenAI integration
│   │   └── classifier.ts        # Main classification orchestrator
│   ├── utils/               # Helper functions
│   │   ├── extractKeywords.ts
│   │   ├── confidenceScore.ts
│   │   └── logger.ts
│   ├── middleware/          # Express middleware
│   │   ├── errorHandler.ts
│   │   ├── rateLimiter.ts
│   │   └── cors.ts
│   ├── config/              # Configuration
│   │   └── database.ts
│   └── index.ts             # Entry point
├── prisma/
│   ├── schema.prisma        # Database schema
│   ├── migrations/          # Migration history
│   └── seed.ts              # Seed data script
├── dist/                    # Compiled JavaScript (after build)
├── package.json
├── tsconfig.json
├── .env
└── README.md
```

---

## Prisma Commands Reference

### Generate Prisma Client
```bash
npm run prisma:generate
```

### Create and apply migrations
```bash
npm run prisma:migrate
```

### Push schema changes (no migration files)
```bash
npm run prisma:push
```

### Open Prisma Studio GUI
```bash
npm run prisma:studio
```

### Seed the database
```bash
npm run prisma:seed
```

### Reset database (CAUTION: deletes all data)
```bash
npx prisma migrate reset
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-proj-...` |
| `PORT` | Server port | `3001` |
| `NODE_ENV` | Environment | `development` or `production` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:3000` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window (ms) | `900000` (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |
| `SESSION_SECRET` | Session secret key | Random string |

---

## Database Seeding (Phase 0 - Week 1)

Create `prisma/seed.ts` to populate initial data:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed HS codes (automotive parts)
  await prisma.hsCode.createMany({
    data: [
      {
        code: '8708.30.10',
        chapter: '87',
        heading: '8708',
        subheading: '8708.30',
        countryCode: 'IN',
        description: 'Brakes and servo-brakes; parts thereof - Mounted brake linings',
        keywords: ['brake', 'pad', 'lining', 'mounted', 'vehicle', 'automotive'],
        commonProducts: ['brake pads', 'brake linings', 'disc brake pads'],
        parentCode: '8708.30'
      },
      // Add more codes...
    ]
  });

  // Seed decision tree for automotive parts
  await prisma.decisionTree.create({
    data: {
      categoryName: 'Automotive Parts',
      decisionFlow: {
        questions: [
          {
            id: 'q1',
            text: 'Is this a finished product or raw material?',
            type: 'single_choice',
            options: ['Finished Product', 'Raw Material', 'Component'],
          }
        ],
        rules: [
          {
            conditions: {
              q1: 'Finished Product',
              keywords: ['brake', 'pad']
            },
            suggested_codes: ['8708.30.10'],
            confidence_boost: 15
          }
        ]
      }
    }
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Run seed:
```bash
npm run prisma:seed
```

---

## Testing Database Connection

Create a quick test script `test-db.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.hsCode.count();
  console.log(`✅ Database connected! HS codes count: ${count}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Run:
```bash
npx ts-node test-db.ts
```

---

## Migration Workflow

1. **Modify schema**: Edit `prisma/schema.prisma`
2. **Create migration**: `npm run prisma:migrate`
3. **Name your migration**: e.g., "add_hs_codes_table"
4. **Prisma generates**:
   - SQL migration file in `prisma/migrations/`
   - Updated Prisma Client types
5. **Migration auto-applies** to your database

---

## Common Issues & Solutions

### Issue: "Environment variable not found: DATABASE_URL"
**Solution:** Make sure `.env` file exists in `backend/` directory and contains `DATABASE_URL`

### Issue: "Cannot connect to database"
**Solution:**
- Check your Supabase project is running
- Verify DATABASE_URL format
- Check firewall/network settings

### Issue: "Error: P1001 - Can't reach database server"
**Solution:**
- Verify your Supabase password is correct
- Check if you're using connection pooling URL (port 5432, not 6543)

### Issue: GIN index not working for keywords
**Solution:** Run the manual SQL command in Supabase SQL Editor:
```sql
CREATE INDEX idx_keywords ON hs_codes USING GIN (keywords);
```

---

## Next Steps (Phase 1 - Week 2)

1. ✅ Database schema created
2. ✅ Prisma ORM configured
3. ⏳ Build Express server (`src/index.ts`)
4. ⏳ Implement classification logic (`src/services/`)
5. ⏳ Create API routes (`src/routes/`)
6. ⏳ Test with 20 products from Phase 0

---

## Useful Links

- [Prisma Docs](https://www.prisma.io/docs)
- [Express.js Docs](https://expressjs.com/)
- [Supabase Docs](https://supabase.com/docs)
- [OpenAI API Docs](https://platform.openai.com/docs)

---

**Last Updated:** November 21, 2024
