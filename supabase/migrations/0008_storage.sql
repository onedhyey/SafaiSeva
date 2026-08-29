-- 0008_storage.sql
-- Private bucket for handover evidence (audit B2). Only the service-role API reads or
-- writes it; there are no anon/authenticated storage policies, so it is closed to clients.

insert into storage.buckets (id, name, public, file_size_limit)
values ('evidence', 'evidence', false, 26214400)   -- 25 MB per object
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
