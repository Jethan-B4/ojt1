-- BAC Resolution refinement:
-- - richer narrative fields (3 WHEREAS, NOW THEREFORE, RESOLVED-at)
-- - division scoping
-- - many-to-many PR attachments per resolution

alter table public.bac_resolution
add column if not exists division_id bigint references public.divisions(division_id),
add column if not exists whereas_1 text,
add column if not exists whereas_2 text,
add column if not exists whereas_3 text,
add column if not exists now_therefore_text text,
add column if not exists resolved_at_place text;

create table if not exists public.bac_resolution_prs (
  id bigint generated always as identity primary key,
  resolution_id bigint not null references public.bac_resolution(id) on delete cascade,
  pr_id bigint references public.purchase_requests(id),
  pr_no text not null,
  pr_date text,
  estimated_cost double precision default 0,
  end_user text,
  recommended_mode text
);

create index if not exists bac_resolution_prs_resolution_id_idx
on public.bac_resolution_prs(resolution_id);

