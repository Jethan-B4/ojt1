-- Ensure a "Cancelled" status exists for soft-delete flows (PR/PO cancellation).
insert into public.status (status_name)
select 'Cancelled'
where not exists (
  select 1 from public.status where lower(status_name) = 'cancelled'
);

