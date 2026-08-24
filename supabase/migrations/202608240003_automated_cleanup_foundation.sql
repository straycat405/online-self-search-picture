-- Enforce server-owned TTLs and support retryable Storage API cleanup.

alter table public.search_jobs
  alter column photo_object_path drop not null,
  add column photo_deleted_at timestamptz,
  add column cleanup_claimed_at timestamptz,
  add column cleanup_claimed_by uuid,
  add column cleanup_attempts integer not null default 0,
  add column cleanup_error text;

drop index if exists public.search_jobs_photo_cleanup_idx;
drop index if exists public.search_jobs_result_cleanup_idx;
create index search_jobs_photo_cleanup_idx
  on public.search_jobs (photo_delete_at)
  where photo_deleted_at is null;
create index search_jobs_result_cleanup_idx
  on public.search_jobs (result_delete_at)
  where result_delete_at is not null;

revoke insert, delete on public.search_jobs from authenticated;
revoke insert on public.search_candidates from authenticated;
drop policy if exists "users can create a bounded number of search jobs"
  on public.search_jobs;
drop policy if exists "users can delete their own search jobs"
  on public.search_jobs;
drop policy if exists "users can add candidates to their jobs"
  on public.search_candidates;

create or replace function public.create_search_job(
  job_mime_type text,
  job_file_size integer
)
returns table (job_id uuid, photo_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_job_id uuid := gen_random_uuid();
  extension text;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;
  if job_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'unsupported mime type';
  end if;
  if job_file_size <= 0 or job_file_size > 10485760 then
    raise exception 'invalid file size';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );
  if (
    select count(*)
    from public.search_jobs
    where user_id = current_user_id
      and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'search job rate limit exceeded';
  end if;

  extension := case job_mime_type
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    else 'jpg'
  end;
  photo_path := current_user_id::text || '/' || new_job_id::text || '/query.' || extension;

  insert into public.search_jobs (
    id,
    user_id,
    status,
    mode,
    mime_type,
    file_size,
    photo_object_path,
    provider_plan,
    created_at,
    photo_delete_at,
    result_delete_at
  ) values (
    new_job_id,
    current_user_id,
    'created',
    'mock',
    job_mime_type,
    job_file_size,
    photo_path,
    'mock',
    now(),
    now() + interval '1 hour',
    now() + interval '7 days'
  );

  job_id := new_job_id;
  return next;
end;
$$;

revoke all on function public.create_search_job(text, integer) from public;
grant execute on function public.create_search_job(text, integer) to authenticated;

revoke execute on function public.finish_search_job(uuid, text, text, timestamptz)
  from authenticated;

create or replace function public.fail_search_job(
  requested_job_id uuid,
  failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  update public.search_jobs
  set status = 'failed', error_code = left(coalesce(failure_code, 'search_failed'), 100)
  where id = requested_job_id
    and user_id = (select auth.uid())
    and status = 'searching';
  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

create or replace function public.save_search_results(
  requested_job_id uuid,
  candidate_payload jsonb,
  outcome_completed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owns_claimed_job boolean;
begin
  if candidate_payload is null
    or jsonb_typeof(candidate_payload) <> 'array'
    or jsonb_array_length(candidate_payload) > 50 then
    return false;
  end if;

  select true
  into owns_claimed_job
  from public.search_jobs
  where id = requested_job_id
    and user_id = (select auth.uid())
    and status = 'searching'
  for update;
  if not coalesce(owns_claimed_job, false) then
    return false;
  end if;

  insert into public.search_candidates (
    id,
    search_job_id,
    provider,
    match_type,
    tier,
    source_url,
    source_domain,
    thumbnail_url,
    title,
    found_at
  )
  select
    (candidate->>'id')::uuid,
    requested_job_id,
    left(candidate->>'provider', 100),
    candidate->>'match_type',
    candidate->>'tier',
    left(candidate->>'source_url', 2048),
    left(candidate->>'source_domain', 255),
    left(candidate->>'thumbnail_url', 2048),
    left(candidate->>'title', 500),
    (candidate->>'found_at')::timestamptz
  from jsonb_array_elements(candidate_payload) as candidate;

  update public.search_jobs
  set status = 'complete', completed_at = outcome_completed_at, error_code = null
  where id = requested_job_id
    and user_id = (select auth.uid())
    and status = 'searching';
  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function public.fail_search_job(uuid, text) from public;
revoke all on function public.save_search_results(uuid, jsonb, timestamptz) from public;
grant execute on function public.fail_search_job(uuid, text) to authenticated;
grant execute on function public.save_search_results(uuid, jsonb, timestamptz) to authenticated;

create or replace function public.mark_search_photo_deleted(requested_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  update public.search_jobs
  set
    photo_object_path = null,
    photo_deleted_at = coalesce(photo_deleted_at, now()),
    cleanup_claimed_at = null,
    cleanup_claimed_by = null,
    cleanup_error = null
  where id = requested_job_id
    and user_id = (select auth.uid())
    and (
      photo_object_path is null
      or not exists (
        select 1
        from storage.objects
        where bucket_id = 'search-photos'
          and name = public.search_jobs.photo_object_path
      )
    );
  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

create or replace function public.delete_search_job_if_photo_missing(
  requested_job_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  delete from public.search_jobs
  where id = requested_job_id
    and user_id = (select auth.uid())
    and (
      photo_object_path is null
      or not exists (
        select 1
        from storage.objects
        where bucket_id = 'search-photos'
          and name = public.search_jobs.photo_object_path
      )
    );
  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

revoke all on function public.mark_search_photo_deleted(uuid) from public;
revoke all on function public.delete_search_job_if_photo_missing(uuid) from public;
grant execute on function public.mark_search_photo_deleted(uuid) to authenticated;
grant execute on function public.delete_search_job_if_photo_missing(uuid) to authenticated;

create or replace function public.claim_expired_search_cleanup(
  requested_limit integer,
  worker_id uuid
)
returns table (
  job_id uuid,
  job_user_id uuid,
  photo_path text,
  delete_results boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimable as (
    select id
    from public.search_jobs
    where (
      (photo_deleted_at is null and photo_delete_at <= now())
      or result_delete_at <= now()
    )
      and (
        cleanup_claimed_at is null
        or cleanup_claimed_at < now() - interval '15 minutes'
      )
    order by least(photo_delete_at, result_delete_at)
    for update skip locked
    limit least(greatest(coalesce(requested_limit, 50), 1), 100)
  ), claimed as (
    update public.search_jobs as jobs
    set
      cleanup_claimed_at = now(),
      cleanup_claimed_by = worker_id,
      cleanup_attempts = cleanup_attempts + 1
    from claimable
    where jobs.id = claimable.id
    returning jobs.*
  )
  select
    claimed.id,
    claimed.user_id,
    claimed.photo_object_path,
    claimed.result_delete_at <= now()
  from claimed;
end;
$$;

create or replace function public.finish_expired_search_cleanup(
  requested_job_id uuid,
  worker_id uuid,
  photo_removed boolean,
  cleanup_failure text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  should_delete_results boolean;
  affected_rows integer;
begin
  if not photo_removed then
    update public.search_jobs
    set
      cleanup_claimed_at = null,
      cleanup_claimed_by = null,
      cleanup_error = left(coalesce(cleanup_failure, 'storage_remove_failed'), 500)
    where id = requested_job_id
      and cleanup_claimed_by = worker_id;
    return 'retry';
  end if;

  update public.search_jobs
  set
    photo_object_path = null,
    photo_deleted_at = coalesce(photo_deleted_at, now()),
    cleanup_error = null
  where id = requested_job_id
    and cleanup_claimed_by = worker_id;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    return 'lost_claim';
  end if;

  select result_delete_at <= now()
  into should_delete_results
  from public.search_jobs
  where id = requested_job_id
    and cleanup_claimed_by = worker_id;

  if coalesce(should_delete_results, false) then
    delete from public.search_jobs
    where id = requested_job_id
      and cleanup_claimed_by = worker_id
      and photo_deleted_at is not null;
    return 'job_deleted';
  end if;

  update public.search_jobs
  set cleanup_claimed_at = null, cleanup_claimed_by = null
  where id = requested_job_id
    and cleanup_claimed_by = worker_id;
  return 'photo_deleted';
end;
$$;

revoke all on function public.claim_expired_search_cleanup(integer, uuid) from public;
revoke all on function public.finish_expired_search_cleanup(uuid, uuid, boolean, text) from public;
grant execute on function public.claim_expired_search_cleanup(integer, uuid) to service_role;
grant execute on function public.finish_expired_search_cleanup(uuid, uuid, boolean, text) to service_role;

create or replace function public.list_orphan_search_photos(requested_limit integer)
returns table (photo_path text)
language sql
security definer
set search_path = ''
as $$
  select objects.name
  from storage.objects as objects
  where objects.bucket_id = 'search-photos'
    and objects.created_at <= now() - interval '2 hours'
    and not exists (
      select 1
      from public.search_jobs
      where search_jobs.photo_object_path = objects.name
    )
  order by objects.created_at
  limit least(greatest(coalesce(requested_limit, 50), 1), 100);
$$;

revoke all on function public.list_orphan_search_photos(integer) from public;
grant execute on function public.list_orphan_search_photos(integer) to service_role;
