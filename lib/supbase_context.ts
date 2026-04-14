export const SUPABASE_SCHEMA_SQL = String.raw`-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
--
-- BAC resolution refinement context:
-- - bac_resolution now supports standalone creation and richer narrative fields.
-- - bac_resolution_prs links one BAC resolution to many PR rows
--   (expected to be same-division in application logic).
--
-- Possible next schema hardening:
-- - unique (resolution_id, pr_no) on bac_resolution_prs
-- - check constraints for non-empty whereas_1/2/3 and now_therefore_text

CREATE TABLE public.aaa_documents (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  session_id bigint,
  aaa_no text,
  prepared_by bigint,
  prepared_at timestamp with time zone,
  file_url text,
  particulars text,
  CONSTRAINT aaa_documents_pkey PRIMARY KEY (id),
  CONSTRAINT aaa_documents_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.canvass_sessions(id),
  CONSTRAINT aaa_documents_prepared_by_fkey FOREIGN KEY (prepared_by) REFERENCES public.users(id)
);
CREATE TABLE public.bac_resolution (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  session_id bigint,
  resolution_no text,
  division_id bigint,
  prepared_by bigint,
  resolved_at timestamp with time zone,
  resolved_at_place text,
  whereas_1 text,
  whereas_2 text,
  whereas_3 text,
  now_therefore_text text,
  notes text,
  mode text,
  CONSTRAINT bac_resolution_pkey PRIMARY KEY (id),
  CONSTRAINT bac_resolution_prepared_by_fkey FOREIGN KEY (prepared_by) REFERENCES public.users(id),
  CONSTRAINT bac_resolution_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.canvass_sessions(id),
  CONSTRAINT bac_resolution_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(division_id)
);
CREATE TABLE public.bac_resolution_prs (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  resolution_id bigint NOT NULL,
  pr_id bigint,
  pr_no text NOT NULL,
  pr_date text,
  estimated_cost double precision DEFAULT '0'::double precision,
  end_user text,
  recommended_mode text,
  CONSTRAINT bac_resolution_prs_pkey PRIMARY KEY (id),
  CONSTRAINT bac_resolution_prs_resolution_id_fkey FOREIGN KEY (resolution_id) REFERENCES public.bac_resolution(id),
  CONSTRAINT bac_resolution_prs_pr_id_fkey FOREIGN KEY (pr_id) REFERENCES public.purchase_requests(id)
);
CREATE TABLE public.canvass_entries (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  session_id bigint,
  item_no bigint,
  description text,
  unit text,
  quantity bigint,
  supplier_name text,
  unit_price double precision,
  total_price double precision,
  is_winning boolean,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  tin_no text,
  delivery_days text,
  assignment_id bigint,
  CONSTRAINT canvass_entries_pkey PRIMARY KEY (id),
  CONSTRAINT canvass_entries_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.canvass_sessions(id),
  CONSTRAINT canvass_entries_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.canvasser_assignments(id)
);
CREATE TABLE public.canvass_sessions (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  pr_id bigint,
  stage text,
  released_by bigint,
  deadline timestamp with time zone,
  status text,
  bac_no text UNIQUE,
  CONSTRAINT canvass_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT canvass_sessions_pr_id_fkey FOREIGN KEY (pr_id) REFERENCES public.purchase_requests(id),
  CONSTRAINT canvass_sessions_released_by_fkey FOREIGN KEY (released_by) REFERENCES public.users(id)
);
CREATE TABLE public.canvasser_assignments (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  session_id bigint,
  division_id bigint,
  canvasser_id bigint,
  quotation_no text,
  rfq_index bigint,
  released_at timestamp with time zone,
  returned_at timestamp with time zone,
  status text,
  CONSTRAINT canvasser_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT canvasser_assignments_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.canvass_sessions(id),
  CONSTRAINT canvasser_assignments_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(division_id),
  CONSTRAINT canvasser_assignments_canvasser_id_fkey FOREIGN KEY (canvasser_id) REFERENCES public.users(id)
);
CREATE TABLE public.division_budgets (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  division_id bigint NOT NULL,
  fiscal_year bigint NOT NULL,
  allocated double precision DEFAULT '0'::double precision,
  utilized double precision DEFAULT '0'::double precision,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  CONSTRAINT division_budgets_pkey PRIMARY KEY (id),
  CONSTRAINT divison_budgets_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(division_id)
);
CREATE TABLE public.divisions (
  division_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  division_name text,
  CONSTRAINT divisions_pkey PRIMARY KEY (division_id)
);
CREATE TABLE public.ors_entries (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  ors_no text UNIQUE,
  pr_id bigint,
  pr_no text,
  division_id bigint,
  fiscal_year bigint,
  amount double precision DEFAULT '0'::double precision,
  status text,
  prepared_by bigint,
  approved_by bigint,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  fund_cluster text,
  responsibility_center text,
  particulars text,
  mfo_pap text,
  uacs_code text,
  prepared_by_name text,
  prepared_by_desig text,
  approved_by_name text,
  approved_by_desig text,
  date_created text,
  CONSTRAINT ors_entries_pkey PRIMARY KEY (id),
  CONSTRAINT ors_entries_prepared_by_fkey FOREIGN KEY (prepared_by) REFERENCES public.users(id),
  CONSTRAINT ors_entries_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id),
  CONSTRAINT ors_entries_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(division_id),
  CONSTRAINT ors_entries_pr_id_fkey FOREIGN KEY (pr_id) REFERENCES public.purchase_requests(id)
);
CREATE TABLE public.pr_form (
  pr_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL UNIQUE,
  entity_name text,
  fund_cluster text,
  office_section text,
  pr_num text NOT NULL DEFAULT ''::text UNIQUE,
  responsibility_code text,
  created_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  purpose text,
  req_by text,
  req_designation text,
  app_by text,
  app_designation text,
  status_id bigint,
  division bigint,
  CONSTRAINT pr_form_pkey PRIMARY KEY (pr_id),
  CONSTRAINT pr_form_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.status(id),
  CONSTRAINT pr_form_division_fkey FOREIGN KEY (division) REFERENCES public.divisions(division_id)
);
CREATE TABLE public.pr_item (
  prItem_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  stock_num text,
  unit text,
  description text,
  quantity text,
  unit_cost text,
  total_cost text,
  pr_id bigint,
  CONSTRAINT pr_item_pkey PRIMARY KEY (prItem_id),
  CONSTRAINT pr_item_pr_id_fkey FOREIGN KEY (pr_id) REFERENCES public.pr_form(pr_id)
);
CREATE TABLE public.proposals (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  proposal_no bigint,
  division_id bigint,
  pr_id bigint,
  CONSTRAINT proposals_pkey PRIMARY KEY (id),
  CONSTRAINT proposals_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(division_id),
  CONSTRAINT proposals_pr_id_fkey FOREIGN KEY (pr_id) REFERENCES public.purchase_requests(id)
);
CREATE TABLE public.purchase_order_items (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  po_id bigint,
  stock_no text,
  unit text,
  description text,
  quantity bigint,
  unit_price double precision,
  subtotal double precision,
  CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_order_items_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id)
);
CREATE TABLE public.purchase_orders (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  po_no text,
  pr_no text,
  pr_id bigint,
  supplier text,
  address text,
  tin text,
  procurement_mode text,
  delivery_place text,
  delivery_term text,
  delivery_date text,
  payment_term text,
  date text,
  office_section text,
  fund_cluster text,
  ors_no text,
  ors_date text,
  funds_available text,
  ors_amount double precision,
  total_amount double precision,
  status_id bigint,
  division_id bigint,
  official_name text,
  official_desig text,
  accountant_name text,
  accountant_desig text,
  CONSTRAINT purchase_orders_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_orders_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(division_id),
  CONSTRAINT purchase_orders_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.status(id),
  CONSTRAINT purchase_orders_pr_id_fkey FOREIGN KEY (pr_id) REFERENCES public.purchase_requests(id)
);
CREATE TABLE public.purchase_request_items (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  pr_id bigint NOT NULL,
  description text NOT NULL,
  stock_no text,
  unit text,
  quantity bigint NOT NULL,
  unit_price bigint NOT NULL,
  subtotal bigint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT purchase_request_items_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_request_items_pr_id_fkey FOREIGN KEY (pr_id) REFERENCES public.purchase_requests(id)
);
CREATE TABLE public.purchase_requests (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  pr_no text NOT NULL DEFAULT ''::text UNIQUE,
  office_section text NOT NULL,
  resp_code text,
  purpose text NOT NULL,
  total_cost bigint NOT NULL,
  is_high_value boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending'::text,
  budget_number text,
  pap_code text,
  proposal_file text,
  created_at timestamp with time zone DEFAULT now(),
  entity_name text,
  fund_cluster text,
  req_name text,
  req_desig text,
  app_name text,
  app_desig text,
  app_no text,
  status_id bigint DEFAULT '1'::bigint,
  proposal_no text,
  division_id bigint,
  updated_at timestamp with time zone,
  CONSTRAINT purchase_requests_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_requests_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.status(id),
  CONSTRAINT purchase_requests_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(division_id)
);
CREATE TABLE public.remarks (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  remark text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id bigint,
  pr_id bigint,
  status_flag_id bigint,
  prform_id bigint,
  po_id bigint,
  CONSTRAINT remarks_pkey PRIMARY KEY (id),
  CONSTRAINT remarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT remarks_pr_id_fkey FOREIGN KEY (pr_id) REFERENCES public.purchase_requests(id),
  CONSTRAINT remarks_status_flag_id_fkey FOREIGN KEY (status_flag_id) REFERENCES public.status_flag(id),
  CONSTRAINT remarks_prform_id_fkey FOREIGN KEY (prform_id) REFERENCES public.pr_form(pr_id),
  CONSTRAINT remarks_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id)
);
CREATE TABLE public.roles (
  role_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  role_name text,
  CONSTRAINT roles_pkey PRIMARY KEY (role_id)
);
CREATE TABLE public.status (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  status_name text NOT NULL,
  CONSTRAINT status_pkey PRIMARY KEY (id)
);
CREATE TABLE public.status_flag (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  flag_name text,
  CONSTRAINT status_flag_pkey PRIMARY KEY (id)
);
CREATE TABLE public.users (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  fullname character varying DEFAULT 'admin'::character varying,
  password character varying DEFAULT 'admin123'::character varying,
  username text,
  division_id bigint,
  role_id bigint,
  last_login timestamp with time zone,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(division_id),
  CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(role_id)
);
`;
