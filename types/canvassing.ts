export interface CanvassingPRItem {
  id: number;
  desc: string;
  stock: string;
  unit: string;
  qty: number;
  unitCost: number;
}

export interface CanvassingPR {
  prNo: string;
  date: string;
  officeSection: string;
  responsibilityCode: string;
  purpose: string;
  isHighValue: boolean;
  budgetNumber?: string | null;
  items: CanvassingPRItem[];
}

export type CanvassStage =
  | "pr_received"
  | "bac_resolution"
  | "release_canvass"
  | "collect_canvass"
  | "aaa_preparation";

export interface BACMember {
  name: string;
  designation: string;
  signed: boolean;
  signedAt: string;
}

export interface DivAssign {
  section: string;
  canvasser: string;
  releaseDate: string;
  returnDate: string;
  status: "pending" | "released" | "returned";
}

export interface RFQForm {
  quotationNo:    string;
  quotationDate:  string;
  deadlineDate:   string;
  bacChairperson: string;
  entity:         string;
  companyName:    string;
  companyAddress: string;
  // Per-item supplier response (keyed by item id)
  unitPrices:     Record<number, string>;
  // Supplier fields (filled by supplier / canvasser)
  printedName:    string;
  telNo:          string;
  philGeps:       string;
  birTin:         string;
  vatType:        "vat" | "non-vat" | "";
  remarks:        string;
  canvasserRef:   string;   // ECT/asa style reference
}

export interface SupplierQ {
  id: number;
  name: string;
  address: string;
  contact: string;
  tin: string;
  days: string;
  prices: Record<number, string>;
  remarks: string;
}

export interface CanvassPayload {
  pr_no: string;
  bac_no: string;
  resolution_no: string;
  mode: string;
  aaa_no: string;
  awarded_supplier: string;
  awarded_total: number;
  suppliers: SupplierQ[];
  bac_members: BACMember[];
}
