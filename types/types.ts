export type PRItem = {
  id: string;
  stockNo: string;
  unit: string;
  description: string;
  quantity: string;
  unitCost: string;
};

export type PRRecord = {
  id: string;
  savedAt: string;
  entityName: string;
  fundCluster: string;
  office: string;
  prNumber: string;
  date: string;
  respCode: string;
  purpose: string;
  items: PRItem[];
  reqName: string;
  reqDesig: string;
  appName: string;
  appDesig: string;
  status: string;
};

export type TabType = {
  id: string;
  label: string;
  dropdown: string[];
};

export const tabs: TabType[] = [
  { id: "purchase-request", label: "Purchase Request", dropdown: ["Abstract of Awards", "Summary Report", "Export CSV"] },
  { id: "purchase-order", label: "Purchase Order", dropdown: ["View All Orders", "Pending Orders", "Export CSV"] },
  { id: "delivery-inspection", label: "Delivery & Inspection", dropdown: ["Inspection Reports", "Pending Delivery", "Export CSV"] },
  { id: "payment-closure", label: "Payment & Closure", dropdown: ["Payment History", "Closed Items", "Export CSV"] },
];

export const STATUS_OPTIONS = ["Pending", "Approved", "Rejected", "In Progress", "Completed"] as const;

export const statusColors: Record<string, string> = {
  Pending: "bg-yellow-400",
  Approved: "bg-emerald-500",
  Rejected: "bg-red-500",
  "In Progress": "bg-blue-500",
  Completed: "bg-gray-400",
};
