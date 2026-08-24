# Supabase setup

The application stays in mock-only mode until both public variables are present.

1. Create a Supabase project in the Seoul (`ap-northeast-2`) region.
2. Enable **Authentication > Providers > Anonymous Sign-Ins**.
3. Run the SQL migrations in filename order (`001`, `002`, then `003`).
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

## Automated cleanup

Migration `202608240003_automated_cleanup_foundation.sql` makes TTL values
server-owned, prevents clients from deleting a job before its Storage object,
and adds leased cleanup RPCs. The `cleanup-expired-searches` Edge Function then:

- removes query photos through the Storage API after one hour;
- retries partial failures on the next scheduled run;
- deletes job/result rows after seven days only after photo removal is confirmed.

Deployment requires three manual hosted-project steps:

1. Apply migration `003` in SQL Editor.
2. Deploy `functions/cleanup-expired-searches` with JWT verification disabled and
   set a random `CLEANUP_CRON_SECRET` in Edge Function secrets.
3. Fill in and run `setup/schedule_cleanup.sql.example`, using the same random
   secret. Copy it to a `*.local.sql` file before filling values; these files are
   gitignored and must never be committed.

The recommended schedule is every five minutes. This is best-effort on the Free
plan: a paused project catches up after resume, so it is not a strict deletion SLA.
Do not manually delete anonymous Auth users until the orphan-photo sweep has been
deployed and verified; deleting an Auth user cascades its job rows first.

## Hosted verification

After deployment, confirm an unauthenticated function request returns `401`, a
request carrying `x-cleanup-secret` returns `200`, and scheduled invocations
appear every five minutes. To smoke-test expiry without uploading a real photo,
run the INSERT in `setup/verify_cleanup.sql.example`, wait at least six minutes,
and run its final SELECT. The fixture count must change from `1` to `0`.

Search providers execute only after the server downloads the caller's private
Storage object into memory and confirms that its byte length matches the
server-owned job metadata. Provider adapters receive these bytes directly; the
application does not create a public photo URL for provider integration.
