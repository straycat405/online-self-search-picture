-- MVP data model for anonymous, short-lived photo searches.
-- Run this migration on a Supabase project in ap-northeast-2 (Seoul).

create extension if not exists pgcrypto;

create table public.search_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'created' check (
    status in ('created', 'photo_uploaded', 'searching', 'complete', 'partial', 'failed', 'expired')
  ),
  mode text not null default 'mock' check (mode in ('mock', 'live')),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  file_size integer not null check (file_size > 0 and file_size <= 10485760),
  photo_object_path text not null,
  provider_plan text not null default 'mock',
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  photo_delete_at timestamptz not null default (now() + interval '1 hour'),
  result_delete_at timestamptz not null default (now() + interval '7 days'),
  unique (user_id, photo_object_path)
);

create index search_jobs_user_created_idx
  on public.search_jobs (user_id, created_at desc);
create index search_jobs_photo_cleanup_idx
  on public.search_jobs (photo_delete_at)
  where status <> 'expired';
create index search_jobs_result_cleanup_idx
  on public.search_jobs (result_delete_at)
  where status <> 'expired';

create table public.search_candidates (
  id uuid primary key default gen_random_uuid(),
  search_job_id uuid not null references public.search_jobs(id) on delete cascade,
  provider text not null,
  match_type text not null check (match_type in ('exact', 'partial', 'face')),
  tier text not null check (tier in ('strong', 'review')),
  source_url text not null,
  source_domain text not null,
  thumbnail_url text not null,
  title text not null,
  found_at timestamptz not null,
  user_verdict text check (user_verdict in ('self', 'not_self')),
  created_at timestamptz not null default now()
);

create index search_candidates_job_idx
  on public.search_candidates (search_job_id, created_at);

alter table public.search_jobs enable row level security;
alter table public.search_candidates enable row level security;

revoke all on public.search_jobs from anon, authenticated;
revoke all on public.search_candidates from anon, authenticated;
grant select, insert, delete on public.search_jobs to authenticated;
grant update (status, completed_at, error_code) on public.search_jobs to authenticated;
grant select, insert on public.search_candidates to authenticated;
grant update (user_verdict) on public.search_candidates to authenticated;

create policy "users can create their own search jobs"
on public.search_jobs for insert to authenticated
with check ((select auth.uid()) is not null and user_id = (select auth.uid()));

create policy "users can read their own search jobs"
on public.search_jobs for select to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()));

create policy "users can delete their own search jobs"
on public.search_jobs for delete to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()));

create policy "users can update their own search jobs"
on public.search_jobs for update to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()))
with check ((select auth.uid()) is not null and user_id = (select auth.uid()));

create policy "users can add candidates to their jobs"
on public.search_candidates for insert to authenticated
with check (
  exists (
    select 1 from public.search_jobs
    where search_jobs.id = search_candidates.search_job_id
      and search_jobs.user_id = (select auth.uid())
  )
);

create policy "users can read candidates for their jobs"
on public.search_candidates for select to authenticated
using (
  exists (
    select 1 from public.search_jobs
    where search_jobs.id = search_candidates.search_job_id
      and search_jobs.user_id = (select auth.uid())
  )
);

create policy "users can label candidates for their jobs"
on public.search_candidates for update to authenticated
using (
  exists (
    select 1 from public.search_jobs
    where search_jobs.id = search_candidates.search_job_id
      and search_jobs.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.search_jobs
    where search_jobs.id = search_candidates.search_job_id
      and search_jobs.user_id = (select auth.uid())
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'search-photos',
  'search-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "users can upload photos into their own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'search-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "users can read photos in their own folder"
on storage.objects for select to authenticated
using (
  bucket_id = 'search-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "users can delete photos in their own folder"
on storage.objects for delete to authenticated
using (
  bucket_id = 'search-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Do not delete rows from storage.objects directly. A scheduled Edge Function or
-- trusted server job must remove expired objects through the Storage API, then
-- delete/expire search_jobs. Anonymous auth users should be cleaned separately.
