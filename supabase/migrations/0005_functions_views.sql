-- 0005_functions_views.sql
-- Principal resolution, geofence / collection-window helpers, and reporting views.
--
-- app.uid() is the single point where a request is mapped to a users.id. It reads the
-- Supabase request JWT claims and accepts EITHER a Clerk subject OR a device id. This is
-- the mechanism that lets authentication be switched on later with no schema change
-- (audit I4): the open demo puts {"device_id": "..."} in the claims; Clerk mode puts
-- {"sub": "user_..."}; every RLS policy just calls app.uid().
--
-- The lookup helpers are SECURITY DEFINER with an empty search_path so that, when they are
-- called from an RLS policy running as `anon`/`authenticated`, they can read the base
-- tables without recursing into those tables' own policies.

create or replace function app.jwt_claims()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

create or replace function app.uid()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from public.users u
  where
    (
      (app.jwt_claims() ? 'sub')
      and u.clerk_user_id = (app.jwt_claims() ->> 'sub')
    )
    or
    (
      (app.jwt_claims() ? 'device_id')
      and u.device_id = (app.jwt_claims() ->> 'device_id')
    )
  limit 1;
$$;

-- Is the current request acting for this household? (membership check)
create or replace function app.is_household_member(h_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = h_id
      and m.user_id = app.uid()
  );
$$;

-- ---------------------------------------------------------------------------------------
-- Collection window: is `ts` within the household's local [start, end) hours?
-- ---------------------------------------------------------------------------------------
create or replace function app.in_collection_window(h_id uuid, ts timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select h.collection_start_hour
           <= extract(hour from timezone('Asia/Kolkata', ts))::int
     and extract(hour from timezone('Asia/Kolkata', ts))::int
           < h.collection_end_hour
  from public.households h
  where h.id = h_id;
$$;

-- ---------------------------------------------------------------------------------------
-- Geofence: point inside the household polygon if present, else inside the ward bbox.
-- Ray-casting over a GeoJSON-style [[lng,lat], ...] ring.
-- ---------------------------------------------------------------------------------------
create or replace function app.point_in_ring(ring jsonb, lat double precision, lng double precision)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  n int := jsonb_array_length(ring);
  i int := 0;
  j int;
  xi double precision; yi double precision;
  xj double precision; yj double precision;
  inside boolean := false;
begin
  if n is null or n < 3 then
    return false;
  end if;
  j := n - 1;
  while i < n loop
    xi := (ring -> i -> 0)::text::double precision;  -- lng
    yi := (ring -> i -> 1)::text::double precision;  -- lat
    xj := (ring -> j -> 0)::text::double precision;
    yj := (ring -> j -> 1)::text::double precision;
    if ((yi > lat) <> (yj > lat))
       and (lng < (xj - xi) * (lat - yi) / nullif(yj - yi, 0) + xi) then
      inside := not inside;
    end if;
    j := i;
    i := i + 1;
  end loop;
  return inside;
end;
$$;

create or replace function app.point_in_geofence(h_id uuid, lat double precision, lng double precision)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  poly jsonb;
  w record;
begin
  if lat is null or lng is null then
    return false;
  end if;

  select geofence_polygon into poly from public.households where id = h_id;
  if poly is not null then
    if jsonb_typeof(poly -> 0 -> 0) = 'number' then
      return app.point_in_ring(poly, lat, lng);
    else
      return app.point_in_ring(poly -> 0, lat, lng);
    end if;
  end if;

  select wa.min_lat, wa.max_lat, wa.min_lng, wa.max_lng
    into w
  from public.households h
  join public.wards wa on wa.id = h.ward_id
  where h.id = h_id;

  if not found then
    return false;
  end if;
  return lat between w.min_lat and w.max_lat
     and lng between w.min_lng and w.max_lng;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Views  (RLS of base tables is re-applied via security_invoker in 0006_rls.sql)
-- ---------------------------------------------------------------------------------------

-- Balance = settled ledger sum; pending = not-yet-effective earn rows (24h hold).
create or replace view public.v_household_balance as
select
  h.id   as household_id,
  h.code as household_code,
  coalesce(sum(l.amount) filter (where l.effective_at <= now()), 0)                as settled_balance,
  coalesce(sum(l.amount) filter (where l.effective_at > now() and l.amount > 0), 0) as pending_credits,
  coalesce(sum(l.amount) filter (where l.entry_type in ('earn','milestone')), 0)   as lifetime_earned,
  coalesce(-sum(l.amount) filter (where l.entry_type = 'spend'), 0)                as lifetime_spent
from public.households h
left join public.credit_ledger l on l.household_id = h.id
group by h.id, h.code;

comment on view public.v_household_balance is
  'Authoritative balance. settled_balance is spendable now; pending_credits clear at settle_at.';

-- Human-review queue for karmacharis (audit A4).
create or replace view public.v_review_queue as
select
  hv.id                as handover_id,
  hv.household_id,
  hh.code              as household_code,
  hh.address,
  wa.name              as ward_name,
  hv.collection_date,
  hv.attempt,
  hv.declared_streams,
  hv.decision_reason_code,
  hv.decision_reason_text,
  hv.created_at,
  ve.overall_confidence,
  ve.recapture_likelihood,
  ve.per_stream,
  coalesce(
    (select array_agg(distinct ff.signal)
       from public.fraud_flags ff
      where ff.handover_id = hv.id),
    '{}'::text[]
  )                    as fraud_signals
from public.handovers hv
join public.households hh on hh.id = hv.household_id
join public.wards wa on wa.id = hh.ward_id
left join lateral (
  select * from public.verification_events e
  where e.handover_id = hv.id
  order by e.created_at desc
  limit 1
) ve on true
where hv.status = 'in_review'
order by hv.created_at asc;

-- Helper functions must be callable by the RLS-evaluating roles.
grant usage on schema app to anon, authenticated, service_role;
grant execute on function
  app.jwt_claims(),
  app.uid(),
  app.is_household_member(uuid),
  app.in_collection_window(uuid, timestamptz),
  app.point_in_ring(jsonb, double precision, double precision),
  app.point_in_geofence(uuid, double precision, double precision)
to anon, authenticated, service_role;
