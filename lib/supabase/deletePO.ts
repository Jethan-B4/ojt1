import { supabase } from "./client";

export interface DeletePOPreview {
  poId: string;
  poNo: string;
  prNo: string | null;
  prId: string | null;
  currentStatusId: number;
  poItemCount: number;
  remarkCount: number;
}

export async function fetchPODeletePreview(
  poId: string,
): Promise<DeletePOPreview> {
  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .select("id, po_no, pr_no, pr_id, status_id")
    .eq("id", poId)
    .single();
  if (poErr || !po) throw poErr ?? new Error("PO not found.");

  const [items, remarks] = await Promise.all([
    supabase
      .from("purchase_order_items")
      .select("id", { count: "exact", head: true })
      .eq("po_id", poId),
    supabase
      .from("remarks")
      .select("id", { count: "exact", head: true })
      .eq("po_id", poId),
  ]);

  return {
    poId: String((po as any).id),
    poNo: String((po as any).po_no ?? ""),
    prNo: (po as any).pr_no ?? null,
    prId: (po as any).pr_id != null ? String((po as any).pr_id) : null,
    currentStatusId: Number((po as any).status_id) || 0,
    poItemCount: items.count ?? 0,
    remarkCount: remarks.count ?? 0,
  };
}

export async function deletePurchaseOrderDeep(poId: string): Promise<void> {
  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .select("id")
    .eq("id", poId)
    .single();
  if (poErr || !po) throw poErr ?? new Error("PO not found.");

  const { error: rErr } = await supabase
    .from("remarks")
    .delete()
    .eq("po_id", poId);
  if (rErr) throw rErr;

  const { error: iErr } = await supabase
    .from("purchase_order_items")
    .delete()
    .eq("po_id", poId);
  if (iErr) throw iErr;

  const { error: delErr } = await supabase
    .from("purchase_orders")
    .delete()
    .eq("id", poId);
  if (delErr) throw delErr;
}

