# My Daily Report — v2.0.0

Bengali daily/monthly reporting application upgraded with Supabase-backed accounts, per-user cloud snapshots, role-aware administration, developer tools, and benchmark checks.

## Stack
- React 19 + TypeScript + Vite
- Supabase Auth (email/password) and PostgreSQL via the Supabase REST API
- PostgreSQL Row Level Security (RLS) for user-owned report data
- Progressive Web App (PWA), PDF/text export

## Quick start
1. Copy `.env.example` to `.env.local` and configure the Supabase Project URL and anon/public key.
2. Run `supabase/migrations/001_cloud_accounts_and_data.sql` in Supabase SQL Editor.
3. Run `npm install`, then `npm run dev`.
4. Register using an email address. If email confirmation is enabled, confirm the message before signing in.

Without Supabase environment variables, the original local-only mode remains available for preview; it does not provide cloud accounts or synchronization.

## Main files
- `src/App.tsx`: original reporting UI plus cloud snapshot sync and privileged panels.
- `src/CloudAuthGate.tsx`: registration, login, password recovery and account gate.
- `src/cloud.ts`: small Supabase Auth/REST client; only the public anon key is used.
- `src/benchmarks.ts`: benchmark definitions and evaluation logic.
- `supabase/migrations/`: database schema, role profile trigger, and RLS policies.
- `DEPLOYMENT.md`: Supabase setup, first admin, and public hosting steps.

## Data behavior
- Each signed-in account owns one `app_data` JSONB snapshot. RLS prevents a user from reading or writing another user's row.
- The browser keeps a local cache and debounces cloud saves after edits. On sign-in/reload, the newest saved cloud snapshot is loaded.
- First-time cloud sign-in seeds the account from the previously active local profile in that browser if no cloud snapshot exists.
- This is snapshot-based, last-write-wins synchronization, not collaborative real-time editing. If the same account is edited simultaneously on multiple devices, refresh before editing on the second device to avoid overwriting a newer snapshot.
- The developer menu exports/imports a JSON snapshot. That export contains personal information; protect it.

## Roles
- `user`: own report only.
- `admin`: admin user directory and role management.
- `developer`: admin capabilities plus developer diagnostics and local backup/restore.

Assign the first privileged account only through the Supabase SQL Editor as documented in `DEPLOYMENT.md`. Never put a Supabase service-role key in frontend code or `VITE_` variables.

## Tests and build
```bash
npm test
npm run build
```

The benchmark test suite covers positive-value day counting, checkbox day counting, leap-year proportional targets, future months, and Bengali numeral parsing.
