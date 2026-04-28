import { supabase } from "./client";

function timeout(ms: number, label: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Timed out: ${label}`)), ms);
  });
}

async function timed<T>(
  p: PromiseLike<T>,
  label: string,
  ms = 60000,
): Promise<T> {
  return Promise.race([p, timeout(ms, label)]) as Promise<T>;
}

export interface DeletePOPreview {
  poId: string;
  poNo: string;
  prNo: string | null;
  prId: string | null;
  currentStatusId: number;
  poItemCount: number;
  remarkCount: number;
  deliveryCount: number;
  iarCount: number;
  loaCount: number;
  dvCount: number;
}

export type DeletePOProgress =
  | "Loading PO"
  | "Loading linked deliveries"
  | "Deleting delivery documents"
  | "Deleting delivery logs"
  | "Deleting PO remarks"
  | "Deleting PO items"
  | "Deleting PO header";

export async function fetchPODeletePreview(
  poId: string,
): Promise<DeletePOPreview> {
  const { data: po, error: poErr } = await timed(
    supabase
      .from("purchase_orders")
      .select("id, po_no, pr_no, pr_id, status_id")
      .eq("id", poId)
      .single(),
    "fetch PO",
  );
  if (poErr || !po) throw poErr ?? new Error("PO not found.");

  const { data: deliveries, error: dErr } = await timed(
    supabase.from("deliveries").select("id").eq("po_id", poId),
    "fetch linked deliveries",
  );
  if (dErr) throw dErr;
  const deliveryIds = (deliveries ?? [])
    .map((r: any) => Number(r.id))
    .filter(Boolean);

  const [items, remarks, iars, loas, dvs] = await Promise.all([
    supabase
      .from("purchase_order_items")
      .select("id", { count: "exact", head: true })
      .eq("po_id", poId),
    supabase
      .from("remarks")
      .select("id", { count: "exact", head: true })
      .eq("po_id", poId),
    deliveryIds.length
      ? supabase
          .from("iar_documents")
          .select("id", { count: "exact", head: true })
          .in("delivery_id", deliveryIds)
      : Promise.resolve({ count: 0 } as any),
    deliveryIds.length
      ? supabase
          .from("loa_documents")
          .select("id", { count: "exact", head: true })
          .in("delivery_id", deliveryIds)
      : Promise.resolve({ count: 0 } as any),
    deliveryIds.length
      ? supabase
          .from("dv_documents")
          .select("id", { count: "exact", head: true })
          .in("delivery_id", deliveryIds)
      : Promise.resolve({ count: 0 } as any),
  ]);

  return {
    poId: String((po as any).id),
    poNo: String((po as any).po_no ?? ""),
    prNo: (po as any).pr_no ?? null,
    prId: (po as any).pr_id != null ? String((po as any).pr_id) : null,
    currentStatusId: Number((po as any).status_id) || 0,
    poItemCount: items.count ?? 0,
    remarkCount: remarks.count ?? 0,
    deliveryCount: deliveryIds.length,
    iarCount: iars.count ?? 0,
    loaCount: loas.count ?? 0,
    dvCount: dvs.count ?? 0,
  };
}

export async function deletePurchaseOrderDeep(poId: string): Promise<void> {
  await deletePurchaseOrderDeepWithProgress(poId);
}

export async function deletePurchaseOrderDeepWithProgress(
  poId: string,
  onProgress?: (p: DeletePOProgress) => void,
): Promise<void> {
  onProgress?.("Loading PO");
  const { data: po, error: poErr } = await timed(
    supabase.from("purchase_orders").select("id").eq("id", poId).single(),
    "fetch PO",
  );
  if (poErr || !po) throw poErr ?? new Error("PO not found.");

  onProgress?.("Loading linked deliveries");
  const { data: deliveries, error: dErr } = await timed(
    supabase.from("deliveries").select("id").eq("po_id", poId),
    "fetch linked deliveries",
  );
  if (dErr) throw dErr;
  const deliveryIds = (deliveries ?? [])
    .map((r: any) => Number(r.id))
    .filter(Boolean);

  if (deliveryIds.length) {
    onProgress?.("Deleting delivery documents");
    const [iarRes, loaRes, dvRes] = await Promise.all([
      timed(
        supabase.from("iar_documents").delete().in("delivery_id", deliveryIds),
        "delete IAR docs",
      ),
      timed(
        supabase.from("loa_documents").delete().in("delivery_id", deliveryIds),
        "delete LOA docs",
      ),
      timed(
        supabase.from("dv_documents").delete().in("delivery_id", deliveryIds),
        "delete DV docs",
      ),
    ]);
    if ((iarRes as any).error) throw (iarRes as any).error;
    if ((loaRes as any).error) throw (loaRes as any).error;
    if ((dvRes as any).error) throw (dvRes as any).error;

    onProgress?.("Deleting delivery logs");
    const delDeliveriesRes = await timed(
      supabase.from("deliveries").delete().in("id", deliveryIds),
      "delete delivery logs",
    );
    if ((delDeliveriesRes as any).error) throw (delDeliveriesRes as any).error;
  }

  onProgress?.("Deleting PO remarks");
  const { error: rErr } = await timed(
    supabase.from("remarks").delete().eq("po_id", poId),
    "delete PO remarks",
  );
  if (rErr) throw rErr;

  onProgress?.("Deleting PO items");
  const { error: iErr } = await timed(
    supabase.from("purchase_order_items").delete().eq("po_id", poId),
    "delete PO items",
  );
  if (iErr) throw iErr;

  onProgress?.("Deleting PO header");
  const { error: delErr } = await timed(
    supabase.from("purchase_orders").delete().eq("id", poId),
    "delete PO header",
  );
  if (delErr) throw delErr;
}
