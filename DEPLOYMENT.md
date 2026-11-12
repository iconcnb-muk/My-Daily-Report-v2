# My Daily Report — cloud setup and deployment

## 1. Create the Supabase project
1. Create a project at https://supabase.com/dashboard.
2. In **SQL Editor**, run `supabase/migrations/001_cloud_accounts_and_data.sql`.
3. In **Authentication → URL Configuration**, set the production Site URL and add your local and production redirect URLs.
4. In **Project Settings → API**, copy the Project URL and anon/public key.
5. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
6. Never use the `service_role` key in this frontend project.

## 2. Run locally
```bash
npm install
npm run dev
```

## 3. Promote the first administrator
After creating your account, find its UUID in Supabase Authentication → Users, then run this in SQL Editor (replace the UUID):
```sql
update public.profiles set role = 'admin' where id = 'YOUR-AUTH-USER-UUID';
```
To grant developer access, set role to `developer`. Keep this permission limited to trusted maintainers.

## 4. Deploy publicly
Build with `npm run build`, then deploy the `dist/` directory to Vercel, Netlify, Cloudflare Pages, or another static host. Add the two VITE_ environment variables in the hosting provider's project settings and rebuild. Configure the production domain in Supabase Auth URL settings.

## 5. Data, backups and synchronization
The app stores a JSON snapshot per authenticated user in `public.app_data`; row-level security restricts access to the matching auth user. The browser autosaves locally and synchronizes the snapshot to Supabase after edits and when the app is opened. This is last-write-wins snapshot sync, not collaborative real-time editing; avoid simultaneous edits to the same account on multiple devices. Enable Supabase's database backups/PITR according to your plan and retention needs. Also periodically export project data from Supabase. A local JSON export is not a substitute for a database backup.

## Security notes
- Supabase Auth handles password hashing and session tokens; passwords are not stored in the app's local profile.
- The anon key is public by design. Database RLS is the security boundary.
- Never expose a service-role key in frontend environment variables.
- Assign `admin` and `developer` roles only from the trusted Supabase SQL Editor or a separately secured server-side process.
- The developer panel intentionally exposes diagnostics and local backup/restore only; it does not expose secrets or bypass RLS.
