-- Minimal stand-in for the parts of a Supabase project the migrations depend on, so they
-- can be applied to a plain local Postgres in tests. Not used against a real project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

create schema if not exists storage;

create table if not exists storage.buckets (
  id              text primary key,
  name            text not null,
  public          boolean default false,
  file_size_limit bigint
);
