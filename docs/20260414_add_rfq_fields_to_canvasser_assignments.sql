-- Adds per-RFQ Quotation No. + index for canvassing release flow.
-- Run in Supabase SQL editor or via migration tooling.

alter table public.canvasser_assignments
add column if not exists quotation_no text;

alter table public.canvasser_assignments
add column if not exists rfq_index bigint;

create index if not exists canvasser_assignments_session_id_idx
on public.canvasser_assignments(session_id);

