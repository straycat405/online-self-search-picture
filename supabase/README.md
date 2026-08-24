# Supabase setup

The application stays in mock-only mode until both public variables are present.

1. Create a Supabase project in the Seoul (`ap-northeast-2`) region.
2. Enable **Authentication > Providers > Anonymous Sign-Ins**.
3. Run the SQL migration in `migrations/202608240001_initial_mvp.sql`.
4. Copy the project URL and publishable key into `.env.local`.
5. Restart `pnpm dev`.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Never put the secret/service-role key in a `NEXT_PUBLIC_` variable. This MVP
uses the anonymous user's RLS-scoped session for database and Storage access.

The `search-photos` bucket is private. Upload paths are scoped to the anonymous
user id by RLS. Query photos expire after one hour and result rows after seven
days; a scheduled server/Edge Function must perform the actual cleanup through
the Storage API before a production launch.

The hardening migration limits each anonymous account to five jobs per hour and
only allows an upload when its job row already exists. Enable CAPTCHA before a
public launch; per-account quotas alone do not prevent repeated anonymous signups.
