# Aura Flex Team Dashboard

Internal web app for the Aura Flex creative pipeline and business health.
Design: locked canvas "Aura Flex Team Dashboard". Rules: project files 07 (handoff), 08 (build approach), 09 (data model, decisions, checker).

- Next.js (App Router) · Supabase (database + logins, project `bqgshjxksppkxktlgtbv`) · Vercel (hosting)
- `npm run dev` — local · `npm run check` — types, lint, tests · `tests/db_rules.sql` — database rule test (rolls back)
- `supabase/migrations/` — every database change, in order

Login: one-click email link. Only emails a founder added in Settings can log in.
Founders see every tab; copywriters only Copywriting; editors only Editing.
