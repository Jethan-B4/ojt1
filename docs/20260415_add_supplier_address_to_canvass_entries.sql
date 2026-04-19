-- Adds supplier address field for BAC manual encoding in collect canvass step.
-- Run in Supabase SQL editor or via migration tooling.

alter table public.canvass_entries
add column if not exists supplier_address text;

