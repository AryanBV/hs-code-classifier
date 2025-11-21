# HS Code Classifier - Frontend

Next.js 14 frontend with TypeScript and Tailwind CSS

---

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS
- **UI Components:** Shadcn/ui
- **Icons:** Lucide React

---

## Setup Instructions

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Install Shadcn UI Components (Optional - Phase 2)

```bash
# Install individual components as needed
npx shadcn-ui@latest add button
npx shadcn-ui@latest add input
npx shadcn-ui@latest add card
npx shadcn-ui@latest add select
```

### 3. Configure Environment Variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
frontend/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx         # Root layout with header/footer
│   │   ├── page.tsx           # Homepage - classification form
│   │   ├── globals.css        # Tailwind imports + CSS variables
│   │   └── api/
│   │       └── classify/
│   │           └── route.ts   # API proxy to backend
│   │
│   ├── components/
│   │   ├── ui/                # Shadcn UI components (to be added)
│   │   ├── Header.tsx         # Site header
│   │   ├── ClassificationForm.tsx  # Multi-step form
│   │   └── ResultsDisplay.tsx      # Show HS code results
│   │
│   └── lib/
│       ├── api-client.ts      # Backend API calls
│       └── cn.ts              # Tailwind merge utility
│
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
├── postcss.config.mjs
├── components.json            # Shadcn UI config
└── .env.local.example
```

---

## Available Scripts

```bash
npm run dev          # Start development server (port 3000)
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # TypeScript type checking
```

---

## Components Overview

### `ClassificationForm`
Multi-step form for product classification:
- Step 1: Product description
- Step 2: Destination country
- Step 3: Dynamic questionnaire (Phase 2)

**Props:**
- `onSubmit: (data: FormData) => void`
- `isLoading: boolean`

### `ResultsDisplay`
Displays classification results:
- Top HS code with confidence badge
- Reasoning explanation
- Country mapping
- Alternative codes
- Feedback buttons

**Props:**
- `result: ClassificationResult`
- `onReset: () => void`

### `Header`
Site header with navigation:
- Classify (home)
- History (Phase 2)
- About (Phase 2)

---

## API Client

`src/lib/api-client.ts` provides functions to communicate with the backend:

```typescript
// Classify a product
const result = await classifyProduct({
  productDescription: "Ceramic brake pads",
  destinationCountry: "USA"
})

// Submit feedback
await submitFeedback({
  classificationId: "cls_123",
  feedback: "correct"
})

// Get classification history
const history = await getClassificationHistory(sessionId)

// Health check
const health = await healthCheck()
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:3001` |
| `NEXT_PUBLIC_APP_NAME` | Application name | `HS Code Classifier` |
| `NEXT_PUBLIC_APP_VERSION` | Version | `1.0.0` |

---

## Styling

### Tailwind CSS
- Utility-first CSS framework
- Custom color scheme via CSS variables
- Dark mode ready (via `class` strategy)

### CSS Variables (in `globals.css`)
All colors are defined as HSL CSS variables:
- `--background`
- `--foreground`
- `--primary`
- `--secondary`
- `--muted`
- `--accent`
- `--destructive`
- etc.

Can be customized for branding.

---

## Adding Shadcn UI Components (Phase 2)

```bash
# Add components as needed
npx shadcn-ui@latest add button
npx shadcn-ui@latest add input
npx shadcn-ui@latest add card
npx shadcn-ui@latest add select
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add accordion
npx shadcn-ui@latest add dialog
```

Components will be added to `src/components/ui/`

---

## Implementation Status

| Page/Component | Structure | Styling | Logic | Status |
|----------------|-----------|---------|-------|--------|
| `layout.tsx` | ✅ | ✅ | ✅ | Ready |
| `page.tsx` | ✅ | ✅ | ⏳ TODO | Skeleton |
| `ClassificationForm` | ✅ | ✅ | ⏳ TODO | Skeleton |
| `ResultsDisplay` | ✅ | ✅ | ⏳ TODO | Skeleton |
| `Header` | ✅ | ✅ | ✅ | Ready |
| `api-client.ts` | ✅ | N/A | ⏳ TODO | Skeleton |

---

## Phase 2 Implementation Tasks

### Week 3, Days 1-2: Frontend Setup
- [x] Initialize Next.js project
- [x] Set up TypeScript + Tailwind CSS
- [x] Create basic layout
- [ ] Install Shadcn UI components
- [ ] Test API connection to backend

### Week 3, Days 3-4: Classification Flow
- [ ] Implement `ClassificationForm` logic
- [ ] Add form validation
- [ ] Implement API calls in `api-client.ts`
- [ ] Add loading states
- [ ] Handle errors gracefully

### Week 3, Days 5-6: Results Display
- [ ] Implement `ResultsDisplay` logic
- [ ] Add country mapping display
- [ ] Implement feedback submission
- [ ] Add PDF export functionality
- [ ] Create classification history page

### Week 3, Day 7: Polish & Testing
- [ ] Responsive design testing
- [ ] Browser compatibility testing
- [ ] Performance optimization
- [ ] Error handling edge cases

---

## Testing Locally

### Test Frontend Only (without backend)
```bash
npm run dev
```

Form submission will show placeholder results.

### Test with Backend
1. Start backend server (port 3001)
2. Start frontend server (port 3000)
3. Ensure `NEXT_PUBLIC_API_URL=http://localhost:3001` in `.env.local`
4. Test full classification flow

---

## Build for Production

```bash
npm run build
npm run start
```

Deploy to Vercel:
```bash
# Connect to Vercel
vercel

# Deploy
vercel --prod
```

Set environment variable on Vercel:
- `NEXT_PUBLIC_API_URL` = your production backend URL

---

## Troubleshooting

### Issue: "Cannot find module '@/components/...'"
**Solution:** Check `tsconfig.json` has correct path alias:
```json
"paths": {
  "@/*": ["./src/*"]
}
```

### Issue: Tailwind styles not applying
**Solution:** Check `tailwind.config.ts` content paths include all files:
```ts
content: [
  './src/**/*.{js,ts,jsx,tsx,mdx}',
]
```

### Issue: API calls failing with CORS error
**Solution:** Ensure backend has CORS enabled for frontend URL:
```ts
// Backend: src/index.ts
app.use(cors({
  origin: 'http://localhost:3000'
}))
```

---

**Last Updated:** November 21, 2024
