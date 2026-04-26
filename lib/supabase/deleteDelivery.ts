import { supabase } from "./client";

export interface DeleteDeliveryPreview {
  deliveryId: string;
  deliveryNo: string;
  poNo: string;
  statusId: number;
  iarCount: number;
  loaCount: number;
  dvCount: number;
}

export async function fetchDeliveryDeletePreview(
  deliveryId: string | number,
): Promise<DeleteDeliveryPreview> {
  const { data: d, error: dErr } = await supabase
    .from("deliveries")
    .select("id, delivery_no, po_no, status_id")
    .eq("id", deliveryId)
    .single();
  if (dErr || !d) throw dErr ?? new Error("Delivery not found.");

  const [iar, loa, dv] = await Promise.all([
    supabase
      .from("iar_documents")
      .select("id", { count: "exact", head: true })
      .eq("delivery_id", deliveryId),
    supabase
      .from("loa_documents")
      .select("id", { count: "exact", head: true })
      .eq("delivery_id", deliveryId),
    supabase
      .from("dv_documents")
      .select("id", { count: "exact", head: true })
      .eq("delivery_id", deliveryId),
  ]);

  return {
    deliveryId: String((d as any).id),
    deliveryNo: String((d as any).delivery_no ?? ""),
    poNo: String((d as any).po_no ?? ""),
    statusId: Number((d as any).status_id) || 0,
    iarCount: iar.count ?? 0,
    loaCount: loa.count ?? 0,
    dvCount: dv.count ?? 0,
  };
}

export async function deleteDeliveryDeep(
  deliveryId: string | number,
): Promise<void> {
  const { data: d, error: dErr } = await supabase
    .from("deliveries")
    .select("id")
    .eq("id", deliveryId)
    .single();
  if (dErr || !d) throw dErr ?? new Error("Delivery not found.");

  const { error: iarErr } = await supabase
    .from("iar_documents")
    .delete()
    .eq("delivery_id", deliveryId);
  if (iarErr) throw iarErr;

  const { error: loaErr } = await supabase
    .from("loa_documents")
    .delete()
    .eq("delivery_id", deliveryId);
  if (loaErr) throw loaErr;

  const { error: dvErr } = await supabase
    .from("dv_documents")
    .delete()
    .eq("delivery_id", deliveryId);
  if (dvErr) throw dvErr;

  const { error: delErr } = await supabase
    .from("deliveries")
    .delete()
    .eq("id", deliveryId);
  if (delErr) throw delErr;
}

