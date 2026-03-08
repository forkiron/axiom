# Supabase setup for HackCanada

This app stores **AI Test Analyzer** adjustment factors in Supabase so they are shared for everyone and aggregated per school (weighted average when multiple analyses exist).

## 1. Create a Supabase project

- Go to [supabase.com](https://supabase.com) and create a new project (or use an existing one).
- In **Project Settings → API**: copy
  - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
  - **service_role** key (under "Project API keys") → `SUPABASE_SERVICE_ROLE_KEY`  
  ⚠️ Never expose the service role key in the browser; it’s only used in the Next.js API route.

## 2. Run the migration

**Option A – From the repo (easiest)**

1. In Supabase: **Settings → Database** → copy the **Connection string** (URI, with your password).
2. In your project root, run once (replace with your real password):

```bash
SUPABASE_DB_URL="postgresql://postgres:YOUR-PASSWORD@db.YOUR-PROJECT-REF.supabase.co:5432/postgres" npm run supabase:migrate
```

**Option B – Supabase dashboard**

**SQL Editor** → New query → paste and run the contents of  
`supabase/migrations/20240307000000_school_adjustment_submissions.sql`.

## 3. Env vars

Add to `.env` (see `.env.example`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Restart the dev server after changing env.

## 4. Supabase MCP in Cursor (optional)

To manage the project from Cursor (create project, run migrations, run SQL):

1. Get a Supabase **access token**: [Supabase Account → Access Tokens](https://supabase.com/dashboard/account/tokens).
2. In Cursor: **Settings → MCP** (or Cursor Settings → Features → MCP). Add the Supabase MCP server and set:
   - `SUPABASE_ACCESS_TOKEN` (or `--access-token`) to your token.
3. After that you can use Supabase MCP tools in the agent to create projects, apply migrations, and query the DB.

---

**Flow:**

- **Test Analyzer**: user runs an exam → LLM returns `adjustmentFactor` → user picks a school and clicks “Save” → `POST /api/school-adjustment` inserts a row in `school_adjustment_submissions`.
- **Map**: on load, `GET /api/school-adjustment` returns `{ [schoolId]: weightedAverage }`. When you click a school, the detail panel shows that value (and “AI Adjustment Factor”).
- Multiple submissions for the same school are combined as a **weighted average** (default weight 1 per submission).
