# BOQ.ai

BOQ.ai is a hackathon-ready construction BOQ, GRN, inventory, consumption, and compliance demo that puts five AI agents on a 3-minute workflow:

- Invoice Vision extracts supplier invoice fields and line items.
- Material Matcher reconciles invoice descriptions to the master material library.
- Compliance Auditor verifies Test Certificates and TDS documents.
- BOQ Normalizer maps messy Excel BOQs into structured packages, headlines, and line items.
- Issue Vision extracts material issue vouchers so consumption updates inventory.

## Stack

- Next.js 16 App Router, TypeScript, React 19
- Supabase Postgres, Storage, permissive demo RLS
- Tailwind v4, shadcn/ui, lucide-react, sonner
- OpenAI SDK with `gpt-4o` vision and `gpt-4o-mini` structured extraction
- SheetJS, jsPDF, jspdf-autotable

## Environment

Create `.env.local` from `.env.local.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY` in client code.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and sign in with:

```text
demo / demo
```

## Database

Apply migrations in Supabase SQL Editor:

- `supabase/migrations/001_boqai_init.sql`
- `supabase/migrations/002_boq.sql`
- `supabase/migrations/003_grn_inventory_expansion.sql`

Then seed the demo:

```bash
npx tsx scripts/seed-demo.ts
```

The seed creates sites, suppliers, 30 materials, BOQ rows, committed GRNs, compliance documents, DC/doc slots, and material consumption rows.

## Demo Loop

1. Dashboard: show live KPIs and AI capability pills.
2. GRN: upload or manually enter an invoice, watch Vision and Matcher logs, review matched materials, commit.
3. Inventory: verify GRN inflows and consumption outflows update available stock and value.
4. Consumption: upload or manually enter material issues and commit outflows.
5. Compliance: upload or re-audit docs and show flagged AI findings.
6. MIR Reports: select a GRN date and download the verified report PDF or matrix Excel.
7. BOQ: import Excel and show the Normalizer column map.

## Screenshots

![Dashboard](public/screenshots/dashboard.svg)

![GRN AI Flow](public/screenshots/grn-flow.svg)

![MIR Report](public/screenshots/mir-report.svg)

## Useful Commands

```bash
npm run lint
npm run build
npx tsx scripts/seed-demo.ts
```

## Deploy To Netlify

This repo is ready for GitHub-backed Netlify deploys.

Netlify settings:

- Base directory: leave blank
- Build command: `npm run build`
- Publish directory: `.next`
- Node version: `22`

Required Netlify environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
```

Before the first production deploy, apply all Supabase migrations listed above in the target Supabase project, keep the private Storage bucket `boqai-docs` available, and optionally run `npx tsx scripts/seed-demo.ts` locally against that Supabase project.

Local demo support files are generated outside the repo at `C:\Users\DK\Desktop\Projects\Codex BOQ\Demo Documents`.
