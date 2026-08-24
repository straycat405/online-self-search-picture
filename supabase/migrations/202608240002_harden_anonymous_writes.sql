-- Track jobs before upload and bound direct anonymous writes for the MVP.

create or replace function public.can_create_search_job(requested_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    requested_user_id = (select auth.uid())
    and (
      select count(*)
      from public.search_jobs
      where user_id = requested_user_id
        and created_at > now() - interval '1 hour'
    ) < 5;
$$;

revoke all on function public.can_create_search_job(uuid) from public;
grant execute on function public.can_create_search_job(uuid) to authenticated;

drop policy if exists "users can create their own search jobs" on public.search_jobs;
create policy "users can create a bounded number of search jobs"
on public.search_jobs for insert to authenticated
with check (
  (select auth.uid()) is not null
  and user_id = (select auth.uid())
  and public.can_create_search_job(user_id)
);

drop policy if exists "users can upload photos into their own folder" on storage.objects;
create policy "users can upload a photo for a recorded job"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'search-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.search_jobs
    where search_jobs.user_id = (select auth.uid())
      and search_jobs.photo_object_path = name
      and search_jobs.status = 'created'
  )
);

revoke update (status, completed_at, error_code) on public.search_jobs from authenticated;

create or replace function public.claim_search_job(requested_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  update public.search_jobs
  set status = 'searching'
  where id = requested_job_id
    and user_id = (select auth.uid())
    and status = 'created';
  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

create or replace function public.finish_search_job(
  requested_job_id uuid,
  outcome text,
  outcome_error_code text default null,
  outcome_completed_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  if outcome not in ('complete', 'failed') then
    return false;
  end if;

  update public.search_jobs
  set
    status = outcome,
    error_code = case when outcome = 'failed' then outcome_error_code else null end,
    completed_at = case when outcome = 'complete' then outcome_completed_at else null end
  where id = requested_job_id
    and user_id = (select auth.uid())
    and status = 'searching';
  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

revoke all on function public.claim_search_job(uuid) from public;
revoke all on function public.finish_search_job(uuid, text, text, timestamptz) from public;
grant execute on function public.claim_search_job(uuid) to authenticated;
grant execute on function public.finish_search_job(uuid, text, text, timestamptz) to authenticated;

-- CAPTCHA is still required before a public launch because an attacker can
-- otherwise create many anonymous accounts and receive a fresh per-user quota.
