// ============================================================
// tables.ts — TypeScript types for all public schema tables
// ============================================================

export type AaaDocument = {
  id: number;
  session_id: number | null;
  aaa_no: string | null;
  prepared_by: number | null;
  prepared_at: string | null; // ISO timestamp
  file_url: string | null;
  particulars: string | null;
};

export type BacResolution = {
  id: number;
  session_id: number | null;
  resolution_no: string | null;
  prepared_by: number | null;
  division_id: number | null;
  pr_request_id: number | null;
};

export type BacResolutionPr = {
  id: number;
  resolution_id: number;
  pr_id: number | null;
  pr_no: string;
  pr_date: string | null;
  estimated_cost: number; // default 0
  end_user: string | null;
  recommended_mode: string | null;
};

export type CanvassEntry = {
  id: number;
  session_id: number | null;
  unit: string | null;
  quantity: number | null;
  supplier_name: string | null;
  unit_price: number | null;
  total_price: number | null;
  is_winning: boolean | null;
  created_at: string; // ISO timestamp, default now()
  tin_no: string | null;
  delivery_days: string | null;
  assignment_id: number | null;
  supplier_address: string | null;
  quotation_no: number | null;
  pr_no: string | null;
  pr_items: number | null;
};

export type CanvassSession = {
  id: number;
  created_at: string; // ISO timestamp
  updated_at: string | null;
  pr_id: number | null;
  stage: string | null;
  released_by: number | null;
  deadline: string | null; // ISO timestamp
  status: string | null;
  bac_no: string | null; // UNIQUE
};

export type CanvasserAssignment = {
  id: number;
  session_id: number | null;
  division_id: number | null;
  canvasser_id: number | null;
  released_at: string | null; // ISO timestamp
  returned_at: string | null; // ISO timestamp
  status: string | null;
  quotation_no: string | null;
  rfq_index: number | null;
  received_at: string | null; // ISO timestamp
  name_of_canvasser: string | null;
  pr_no: string | null;
};

export type Delivery = {
  id: number;
  po_id: number | null;
  po_no: string;
  supplier: string | null;
  office_section: string | null;
  division_id: number | null;
  status_id: number; // default 16
  delivery_no: string; // UNIQUE
  dr_no: string | null;
  soa_no: string | null;
  notes: string | null;
  created_by: number | null;
  created_at: string; // ISO timestamp
  updated_at: string | null;
  expected_delivery_date: string | null; // date (YYYY-MM-DD)
  // Payment completion timestamps
  voucher_completed_at: string | null; // ISO timestamp
  accounting_completed_at: string | null; // ISO timestamp
  parpo_approval_completed_at: string | null; // ISO timestamp
  cash_processing_completed_at: string | null; // ISO timestamp
  parpo_signature_completed_at: string | null; // ISO timestamp
  tax_processing_completed_at: string | null; // ISO timestamp
  payment_completed_at: string | null; // ISO timestamp
};

export type DivisionBudget = {
  id: number;
  division_id: number;
  fiscal_year: number;
  allocated: number; // default 0
  utilized: number; // default 0
  notes: string | null;
  created_at: string; // ISO timestamp
  updated_at: string | null;
};

export type Division = {
  division_id: number;
  division_name: string | null;
};

export type DvDocument = {
  id: number;
  delivery_id: number;
  dv_no: string | null;
  fund_cluster: string | null;
  ors_no: string | null;
  payee: string | null;
  payee_tin: string | null;
  address: string | null;
  particulars: string | null;
  responsibility_center: string | null;
  mfo_pap: string | null;
  amount_due: string | null;
  mode_of_payment: string | null;
  certified_by: string | null;
  approved_by: string | null;
  created_by: number | null;
  created_at: string; // ISO timestamp
  updated_at: string | null;
};

export type IarDocument = {
  id: number;
  delivery_id: number;
  iar_no: string | null;
  po_no: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  requisitioning_office: string | null;
  responsibility_center: string | null;
  inspected_at: string | null;
  received_at: string | null;
  inspector_name: string | null;
  supply_officer_name: string | null;
  created_by: number | null;
  created_at: string; // ISO timestamp
  updated_at: string | null;
  missing_units_items: string | null;
};

export type LoaDocument = {
  id: number;
  delivery_id: number;
  loa_no: string | null;
  po_no: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  accepted_at: string | null;
  accepted_by_name: string | null;
  accepted_by_title: string | null;
  created_by: number | null;
  created_at: string; // ISO timestamp
  updated_at: string | null;
};

export type OrsEntry = {
  id: number;
  ors_no: string | null; // UNIQUE
  pr_id: number | null;
  pr_no: string | null;
  division_id: number | null;
  fiscal_year: number | null;
  amount: number; // default 0
  status: string | null;
  prepared_by: number | null;
  approved_by: number | null;
  notes: string | null;
  created_at: string; // ISO timestamp
  updated_at: string | null;
  fund_cluster: string | null;
  responsibility_center: string | null;
  particulars: string | null;
  mfo_pap: string | null;
  uacs_code: string | null;
  prepared_by_name: string | null;
  prepared_by_desig: string | null;
  approved_by_name: string | null;
  approved_by_desig: string | null;
  date_created: string | null;
};

export type PrForm = {
  pr_id: number; // UNIQUE
 entity_name: string | null;
  fund_cluster: string | null;
  office_section: string | null;
  pr_num: string; // UNIQUE, default ''
  responsibility_code: string | null;
  created_at: string; // ISO timestamp
  purpose: string | null;
  req_by: string | null;
  req_designation: string | null;
  app_by: string | null;
  app_designation: string | null;
  status_id: number | null;
  division: number | null;
};

export type PrItem = {
  prItem_id: number;
  created_at: string; // ISO timestamp
  stock_num: string | null;
  unit: string | null;
  description: string | null;
  quantity: string | null;
  unit_cost: string | null;
  total_cost: string | null;
  pr_id: number | null;
};

export type Proposal = {
  id: number;
  created_at: string; // ISO timestamp
  proposal_no: number | null;
  division_id: number | null;
  pr_id: number | null;
};

export type PurchaseOrderItem = {
  id: number;
  po_id: number | null;
  stock_no: string | null;
  unit: string | null;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  subtotal: number | null;
};

export type PurchaseOrder = {
  id: number;
  created_at: string; // ISO timestamp
  updated_at: string | null;
  po_no: string | null;
  pr_no: string | null;
  pr_id: number | null;
  supplier: string | null;
  address: string | null;
  tin: string | null;
  procurement_mode: string | null;
  delivery_place: string | null;
  delivery_term: string | null;
  delivery_date: string | null;
  payment_term: string | null;
  date: string | null;
  office_section: string | null;
  fund_cluster: string | null;
  ors_no: string | null;
  ors_date: string | null;
  funds_available: string | null;
  ors_amount: number | null;
  total_amount: number | null;
  status_id: number | null;
  division_id: number | null;
  official_name: string | null;
  official_desig: string | null;
  accountant_name: string | null;
  accountant_desig: string | null;
};

export type PurchaseRequestItem = {
  id: number;
  pr_id: number;
  description: string;
  stock_no: string | null;
  unit: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string; // ISO timestamp
};

export type PurchaseRequest = {
  id: number;
  pr_no: string; // UNIQUE, default ''
  office_section: string;
  resp_code: string | null;
  purpose: string;
  total_cost: number;
  is_high_value: boolean; // default false
  status: string; // default 'pending'
  budget_number: string | null;
  pap_code: string | null;
  proposal_file: string | null;
  created_at: string | null; // ISO timestamp
  entity_name: string | null;
  fund_cluster: string | null;
  req_name: string | null;
  req_desig: string | null;
  app_name: string | null;
  app_desig: string | null;
  app_no: string | null;
  status_id: number | null; // default 1
  proposal_no: string | null;
  division_id: number | null;
  updated_at: string | null;
};

export type RemarkPhase = 'pr' | 'po' | 'delivery' | 'payment' | 'system';

export type Remark = {
  id: number;
  remark: string | null;
  created_at: string; // ISO timestamp
  user_id: number | null;
  pr_id: number | null;
  status_flag_id: number | null;
  prform_id: number | null;
  po_id: number | null;
  delivery_id: number | null;
  phase: RemarkPhase | null;
};

export type Role = {
  role_id: number;
  role_name: string | null;
};

export type Status = {
  id: number;
  status_name: string;
};

export type StatusFlag = {
  id: number;
  flag_name: string | null;
};

export type User = {
  id: number;
  created_at: string; // ISO timestamp
  fullname: string | null; // default 'admin'
  password: string | null; // default 'admin123'
  username: string | null;
  division_id: number | null;
  role_id: number | null;
  last_login: string | null; // ISO timestamp
};

// ============================================================
// Database table map — useful for generic helpers / Supabase
// ============================================================

export type Database = {
  public: {
    Tables: {
      aaa_documents: { Row: AaaDocument };
      bac_resolution: { Row: BacResolution };
      bac_resolution_prs: { Row: BacResolutionPr };
      canvass_entries: { Row: CanvassEntry };
      canvass_sessions: { Row: CanvassSession };
      canvasser_assignments: { Row: CanvasserAssignment };
      deliveries: { Row: Delivery };
      division_budgets: { Row: DivisionBudget };
      divisions: { Row: Division };
      dv_documents: { Row: DvDocument };
      iar_documents: { Row: IarDocument };
      loa_documents: { Row: LoaDocument };
      ors_entries: { Row: OrsEntry };
      pr_form: { Row: PrForm };
      pr_item: { Row: PrItem };
      proposals: { Row: Proposal };
      purchase_order_items: { Row: PurchaseOrderItem };
      purchase_orders: { Row: PurchaseOrder };
      purchase_request_items: { Row: PurchaseRequestItem };
      purchase_requests: { Row: PurchaseRequest };
      remarks: { Row: Remark };
      roles: { Row: Role };
      status: { Row: Status };
      status_flag: { Row: StatusFlag };
      users: { Row: User };
    };
  };
};