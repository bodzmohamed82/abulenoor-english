# Osama Abulenoor — IGCSE English Platform

Real, deployable website: landing page + student login + student dashboard
(assignments download, solution upload, private quiz grades) + teacher admin
dashboard (publish assignments, view submissions, enter grades, see accounts).

## Modes
- **Live mode**: connected to a free Supabase project (auth, database, file
  storage). Fill `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `assets/js/config.js`.

## Going live (free tier, no paid services)
1. Create a free project at https://supabase.com (owner's own account).
2. SQL editor → paste and run `supabase/schema.sql`.
3. Project Settings → API → copy the Project URL and anon public key into
   `assets/js/config.js`. (The anon key is safe for browsers; row-level
   security in the schema restricts every student to their own data.)
4. Create accounts: `npm i @supabase/supabase-js`, copy
   `scripts/students.csv.example` to `students.csv`, fill 40 rows, then run
   `scripts/create-students.mjs` as its header says. The service key is used
   only in that script, never in the website. Hand credentials to students
   privately — never in group chats.
5. Deploy the folder as a static site on any free host: Netlify Drop,
   Vercel, Cloudflare Pages or GitHub Pages. No build step needed.
6. Optional: set `WHATSAPP_NUMBER` in `assets/js/config.js` to the teacher's
   own number for the contact button (his number, with his permission).

## Privacy model
Students authenticate with synthetic emails (username@students.abulenoor.app);
no real student email addresses are collected. Grades and submissions are
visible only to that student and the teacher (enforced by RLS policies).
