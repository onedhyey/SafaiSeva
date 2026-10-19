-- 0025_rate_limits.sql
-- Shared hit counters for the API rate limiter (server/rateLimit.ts). The API runs as a
-- Vercel function, so express-rate-limit's default in-memory store would only count per
-- instance; this table makes the caps hold across instances.
--
-- One row per (limiter prefix + caller identity) fixed window. rate_limit_hit() is a
-- single atomic upsert, so concurrent requests from the same caller can't both slip under
-- the cap. Closed to anon/authenticated — only the service-role API touches it.

create table if not exists public.rate_limit_hits (
  key      text primary key,
  hits     integer not null,
  reset_at timestamptz not null
);
create index if not exists rate_limit_hits_reset_at_idx on public.rate_limit_hits(reset_at);
alter table public.rate_limit_hits enable row level security;

-- Count one hit for p_key and return the window's running total and reset time. An expired
-- window restarts at 1. Roughly 1 call in 100 also sweeps rows expired for over a day, so
-- the table stays bounded without a cron job.
create or replace function public.rate_limit_hit(p_key text, p_window_ms integer)
returns table (hits integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if random() < 0.01 then
    delete from public.rate_limit_hits r where r.reset_at < now() - interval '1 day';
  end if;

  return query
  insert into public.rate_limit_hits as r (key, hits, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update set
    hits     = case when r.reset_at <= now() then 1 else r.hits + 1 end,
    reset_at = case when r.reset_at <= now() then excluded.reset_at else r.reset_at end
  returning r.hits, r.reset_at;
end;
$$;

-- Undo one hit (express-rate-limit calls this for skipped/failed requests when configured).
create or replace function public.rate_limit_decrement(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.rate_limit_hits set hits = greatest(hits - 1, 0)
  where key = p_key and reset_at > now();
$$;

revoke all on function public.rate_limit_hit(text, integer) from public, anon, authenticated;
revoke all on function public.rate_limit_decrement(text) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer) to service_role;
grant execute on function public.rate_limit_decrement(text) to service_role;
