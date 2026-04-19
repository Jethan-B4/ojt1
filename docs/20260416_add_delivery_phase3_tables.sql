create table if not exists public.deliveries (
  id bigint generated always as identity primary key,
  po_id bigint references public.purchase_orders(id),
  po_no text not null,
  supplier text,
  office_section text,
  division_id bigint references public.divisions(division_id),
  status_id bigint not null references public.status(id) default 16,
  delivery_no text not null unique,
  dr_no text,
  soa_no text,
  notes text,
  created_by bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.iar_documents (
  id bigint generated always as identity primary key,
  delivery_id bigint not null references public.deliveries(id) on delete cascade,
  iar_no text,
  po_no text,
  invoice_no text,
  invoice_date text,
  requisitioning_office text,
  responsibility_center text,
  inspected_at text,
  received_at text,
  inspector_name text,
  supply_officer_name text,
  created_by bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.loa_documents (
  id bigint generated always as identity primary key,
  delivery_id bigint not null references public.deliveries(id) on delete cascade,
  loa_no text,
  po_no text,
  invoice_no text,
  invoice_date text,
  accepted_at text,
  accepted_by_name text,
  accepted_by_title text,
  created_by bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.dv_documents (
  id bigint generated always as identity primary key,
  delivery_id bigint not null references public.deliveries(id) on delete cascade,
  dv_no text,
  fund_cluster text,
  ors_no text,
  payee text,
  payee_tin text,
  address text,
  particulars text,
  responsibility_center text,
  mfo_pap text,
  amount_due text,
  mode_of_payment text,
  certified_by text,
  approved_by text,
  created_by bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists deliveries_status_id_idx on public.deliveries(status_id);
create index if not exists deliveries_division_id_idx on public.deliveries(division_id);
create unique index if not exists iar_documents_delivery_id_uidx on public.iar_documents(delivery_id);
create unique index if not exists loa_documents_delivery_id_uidx on public.loa_documents(delivery_id);
create unique index if not exists dv_documents_delivery_id_uidx on public.dv_documents(delivery_id);

