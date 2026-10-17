-- 0021_push_subscriptions.sql
-- Web Push subscriptions (one row per browser/device the person enabled notifications on).
-- Written and read only by the service-role API; deleted when the push service reports the
-- subscription gone (404/410), and by DELETE /api/me (server/privacy.ts forgetUser).

create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  created_at      timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count   integer not null default 0
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
