-- Bound paid privacy scans per anonymous/authenticated user without storing images.

create table public.privacy_scan_quotas (
  user_id uuid not null references auth.users(id) on delete cascade,
  quota_date date not null default current_date,
  scan_count integer not null default 0 check (scan_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, quota_date)
);

alter table public.privacy_scan_quotas enable row level security;
revoke all on public.privacy_scan_quotas from anon, authenticated;

create or replace function public.claim_privacy_scan()
returns table (allowed boolean, remaining integer, resets_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_count integer;
  daily_limit constant integer := 5;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text || current_date::text, 0)
  );

  delete from public.privacy_scan_quotas
  where user_id = current_user_id
    and quota_date < current_date - 31;

  select scan_count
  into current_count
  from public.privacy_scan_quotas
  where user_id = current_user_id
    and quota_date = current_date;

  current_count := coalesce(current_count, 0);
  if current_count >= daily_limit then
    return query select false, 0, (current_date + 1)::timestamptz;
    return;
  end if;

  insert into public.privacy_scan_quotas (user_id, quota_date, scan_count, updated_at)
  values (current_user_id, current_date, 1, now())
  on conflict (user_id, quota_date)
  do update set
    scan_count = public.privacy_scan_quotas.scan_count + 1,
    updated_at = now()
  returning scan_count into current_count;

  return query
  select true, greatest(daily_limit - current_count, 0), (current_date + 1)::timestamptz;
end;
$$;

revoke all on function public.claim_privacy_scan() from public;
grant execute on function public.claim_privacy_scan() to authenticated;
