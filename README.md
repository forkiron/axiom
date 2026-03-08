# AXIOM

> **Standardize school performance signals across Canada**

AI-powered test difficulty evaluation, school-level adjustment factors, and an interactive Canada school map with a built-in school agent.

---
<img width="1440" height="778" alt="heroherocanada" src="https://github.com/user-attachments/assets/41955e3c-64bb-4cfb-9bc0-53b2124cec11" />


## 🤩 Features

| Feature | Description |
|---------|-------------|
| **AI Test Evaluator** | Upload a test PDF or notes to estimate inherent difficulty with specialist analyzer routing |
| **School Adjustment Model** | Computes school-aware adjustment factors using difficulty + province/school rating context |
| **Interactive School Map** | Explore schools across supported provinces with heat layers, search, and school detail cards |
| **School Agent Chat** | Ask natural-language school queries and get clickable school cards that pan directly on the map |
| **GPA Calculator** | Estimate adjusted marks using stored school adjustment data |
| **Supabase-Backed Sharing** | Persist and aggregate school adjustment submissions across users |

---

## 🚀 Local Setup

### Prerequisites
- Node.js 18+
- npm
- Gemini API key (`GEMINI_API_KEY`)
- Backboard API key (`BACKBOARD_API_KEY`) for tool-orchestrated school agent + analyzer routing
- Supabase project (optional, for shared adjustment persistence)

### Project Setup

```bash
npm install
```

**`.env` Configuration (copy from `.env.example`):**

```env
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_public_token_here
GEMINI_API_KEY=your_gemini_api_key_here

NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
# SUPABASE_DB_URL=postgresql://...

BACKBOARD_API_KEY=your_backboard_api_key_here
BACKBOARD_ASSISTANT_ID=
BACKBOARD_THREAD_ID=
BACKBOARD_SYSTEM_PROMPT=
BACKBOARD_ANALYZER_ASSISTANT_ID=
BACKBOARD_ANALYZER_THREAD_ID=
BACKBOARD_ANALYZER_SYSTEM_PROMPT=

MAP_PAGE_MONTHLY_LIMIT=40000
MAP_PAGE_IP_WINDOW_MS=60000
MAP_PAGE_IP_MAX_REQUESTS=90
```

**Run:**

```bash
npm run dev      # local dev server
npm run build    # production build check
npm run start    # run production build
```

### Supabase Migration (Optional but Recommended)

```bash
SUPABASE_DB_URL="postgresql://postgres:YOUR-PASSWORD@db.YOUR-PROJECT-REF.supabase.co:5432/postgres" npm run supabase:migrate
```

See [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) for full setup details.

---

## Usage

1. **Open Globe View** - Navigate to `/globe`
2. **Explore Schools** - Search by school/city/province and click schools on the map
3. **Open Analyzer Overlay** - Use Test Evaluator or GPA Calculator tabs
4. **Analyze a Test** - Upload PDF/notes + select school to generate difficulty and adjustment
5. **Save Adjustment Data** - Persist school-level adjustments (if Supabase is configured)
6. **Ask School Agent** - Use the bottom chat box for ranking/filter/detail queries
7. **Click School Cards** - Jump map focus to specific returned schools and cycle with arrow keys

---

## Tech Stack

| Component | Technologies |
|-----------|-------------|
| Frontend | Next.js 16, React 19, Tailwind CSS, Framer Motion |
| Mapping/3D | Mapbox GL / MapLibre GL, react-map-gl, deck.gl, three.js, react-three-fiber |
| AI | Gemini (`@google/genai`), Backboard SDK |
| Data/Storage | Supabase (`@supabase/supabase-js`), JSON/CSV data pipelines |
| Tooling | TypeScript, PostCSS, Node scripts |
