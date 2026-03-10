/**
 * CanvassingModule.tsx
 * Stage 2 — Canvass & Resolution (Steps 6–10)
 *
 * Role switch:
 *   role_id 3  →  BACView        (full Steps 6–10 editable workflow)
 *   role_id 7  →  CanvasserView  (quote entry for assigned division)
 *   all others →  EndUserView    (read-only stage tracker)
 *
 * Receives `prNo` from the Drawer route params:
 *   navigation.navigate("Canvassing", { prNo: row.pr_no })
 *
 * Each view fetches its own live session data from Supabase using prNo.
 * The placeholder PR is used when the screen is opened directly from the Drawer
 * with no params (e.g. during development / demo).
 */

import BACView from "@/app/(canvassing)/BACView";
import CanvasserView from "@/app/(canvassing)/CanvasserView";
import EndUserView from "@/app/(canvassing)/EndUserView";
import type { CanvassPayload, CanvassingPR } from "@/types/canvassing";
import { useAuth } from "../AuthContext";

// ─── Placeholder used when no prNo param is passed ────────────────────────────

const PLACEHOLDER_PR: CanvassingPR = {
  prNo:               "2026-PR-0001",
  date:               new Date().toLocaleDateString("en-PH"),
  officeSection:      "STOD",
  responsibilityCode: "10-001",
  purpose:            "Procurement of office supplies for Q1 operations.",
  isHighValue:        false,
  items: [
    { id: 1, desc: "Bond Paper, Short (70gsm)", stock: "SP-001", unit: "ream", qty: 10, unitCost: 220 },
    { id: 2, desc: "Ballpen, Black (0.5mm)",    stock: "SP-002", unit: "box",  qty: 5,  unitCost: 85  },
  ],
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface CanvassingModuleProps {
  /** PR number string — passed via navigation.navigate("Canvassing", { prNo }) */
  prNo?:       string;
  onComplete?: (payload: CanvassPayload) => void;
  onBack?:     () => void;
}

// ─── Root export ──────────────────────────────────────────────────────────────

export default function CanvassingModule({ prNo, onComplete, onBack }: CanvassingModuleProps) {
  const { currentUser } = useAuth();
  const roleId = currentUser?.role_id ?? 0;

  // Seed the PR shell with the prNo — each view hydrates items from Supabase.
  const pr: CanvassingPR = prNo
    ? { ...PLACEHOLDER_PR, prNo }
    : PLACEHOLDER_PR;

  if (roleId === 3) return <BACView       pr={pr} onComplete={onComplete} onBack={onBack} />;
  if (roleId === 7) return <CanvasserView pr={pr} onBack={onBack} />;
  return                   <EndUserView   pr={pr} onBack={onBack} />;
}