-- 0001_extensions.sql
-- Base extensions. Supabase ships most of these; `if not exists` keeps this idempotent.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- case-insensitive text (codes, emails)

-- Dedicated schema for helper functions so they are easy to find and grant.
create schema if not exists app;

comment on schema app is
  'SafaiSeva helper functions and internal plumbing (principal resolution, collection-date math, guards).';
