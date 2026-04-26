alter table if exists public.deliveries
add column if not exists expected_delivery_date date;

create index if not exists deliveries_expected_delivery_date_idx
  on public.deliveries(expected_delivery_date);
