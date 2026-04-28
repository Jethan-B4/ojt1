import { supabase, withTimeout } from "./client";
import { assertOnline } from "@/lib/network";

export interface DeliveryRow {
  id: number;
  po_id: number | null;
  po_no: string;
  supplier: string | null;
  office_section: string | null;
  division_id: number | null;
  status_id: number;
  delivery_no: string;
  dr_no: string | null;
  soa_no: string | null;
  notes: string | null;
  expected_delivery_date: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string | null;
}

export type DeliveryRemarkPhase = "delivery" | "payment";

export interface DeliveryPOContext {
  poId: number | null;
  poNo: string;
  supplier: string;
  prId: string | null;
  prNo: string;
}

export async function fetchDeliveries() {
  const { data, error } = await supabase
    .from("deliveries")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DeliveryRow[];
}

export async function fetchDeliveryById(id: number) {
  const { data, error } = await supabase
    .from("deliveries")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as DeliveryRow | null;
}

export async function fetchDeliveryPOContext(
  deliveryId: number,
): Promise<DeliveryPOContext | null> {
  const { data, error } = await supabase
    .from("deliveries")
    .select("id, po_id, po_no, supplier")
    .eq("id", deliveryId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  let prId: string | null = null;
  let prNo = "";
  const poId = (data as any).po_id != null ? Number((data as any).po_id) : null;
  if (poId != null) {
    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .select("id, pr_id, pr_no")
      .eq("id", poId)
      .maybeSingle();
    if (poErr) throw poErr;
    if (po) {
      prId = (po as any).pr_id != null ? String((po as any).pr_id) : null;
      prNo = String((po as any).pr_no ?? "");
    }
  }

  return {
    poId,
    poNo: String((data as any).po_no ?? ""),
    supplier: String((data as any).supplier ?? "—"),
    prId,
    prNo,
  };
}

export async function fetchDeliveriesByDivision(divisionId: number) {
  const { data, error } = await supabase
    .from("deliveries")
    .select("*")
    .eq("division_id", divisionId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DeliveryRow[];
}

export async function fetchPoCandidatesForDelivery() {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("id, po_no, pr_no, supplier, office_section, division_id")
    /** PO phase complete — served POs are eligible for delivery logging */
    .eq("status_id", 34)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Phase 4 payment queue on `deliveries.status_id` (same row continues after status 35). */
const PAYMENT_PHASE_STATUS_IDS = [
  35, 25, 26, 27, 28, 29, 30, 31, 32, 36,
] as const;

export async function fetchDeliveriesForPaymentPhase(
  divisionId?: number | null,
) {
  let q = supabase
    .from("deliveries")
    .select("*")
    .in("status_id", [...PAYMENT_PHASE_STATUS_IDS])
    .order("updated_at", { ascending: false });
  if (divisionId != null) {
    q = q.eq("division_id", divisionId);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as DeliveryRow[];
}

export async function fetchPaymentPhaseStatuses(): Promise<
  { id: number; status_name: string }[]
> {
  const { data, error } = await supabase
    .from("status")
    .select("id, status_name")
    .in("id", [...PAYMENT_PHASE_STATUS_IDS])
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as { id: number; status_name: string }[];
}

export async function insertDelivery(payload: {
  po_id: number | null;
  po_no: string;
  supplier?: string | null;
  office_section?: string | null;
  division_id?: number | null;
  delivery_no: string;
  expected_delivery_date?: string | null;
  created_by?: number | null;
}) {
  await assertOnline("create delivery");
  const { data, error } = await withTimeout(
    supabase
      .from("deliveries")
      .insert({
        ...payload,
        status_id: 18,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single(),
    "create delivery",
  );
  if (error) throw error;
  return data as DeliveryRow;
}

export async function updateDelivery(
  id: number,
  patch: Partial<
    Pick<
      DeliveryRow,
      | "status_id"
      | "dr_no"
      | "soa_no"
      | "notes"
      | "expected_delivery_date"
      | "supplier"
      | "office_section"
      | "division_id"
    >
  >,
) {
  await assertOnline("update delivery");
  const { data, error } = await withTimeout(
    supabase
      .from("deliveries")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single(),
    "update delivery",
  );
  if (error) throw error;
  return data as DeliveryRow;
}

export async function insertDeliveryProcessRemark(
  deliveryId: number,
  userId: string | number | null,
  remark: string,
  statusFlagId: number | null,
  phase: DeliveryRemarkPhase,
) {
  await assertOnline("add delivery/payment remark");
  const ctx = await fetchDeliveryPOContext(deliveryId);
  if (!ctx?.poId) {
    throw new Error("Linked PO not found for this delivery record.");
  }

  const note = remark.trim();
  const phaseTag = phase === "payment" ? "[PAYMENT]" : "[DELIVERY]";
  const finalRemark = note ? `${phaseTag} ${note}` : phaseTag;

  const { error } = await supabase.from("remarks").insert({
    po_id: ctx.poId,
    pr_id: ctx.prId ? Number(ctx.prId) : null,
    user_id: userId,
    remark: finalRemark,
    status_flag_id: statusFlagId ?? null,
  });
  if (error) throw error;
}

export async function fetchIARByDelivery(deliveryId: number) {
  const { data, error } = await supabase
    .from("iar_documents")
    .select("*")
    .eq("delivery_id", deliveryId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertIARByDelivery(
  deliveryId: number,
  payload: Record<string, any>,
) {
  await assertOnline("save IAR");
  const existing = await fetchIARByDelivery(deliveryId);
  if (existing?.id) {
    const { data, error } = await withTimeout(
      supabase
        .from("iar_documents")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("*")
        .single(),
      "update IAR",
    );
    if (error) throw error;
    return data;
  }
  const { data, error } = await withTimeout(
    supabase
      .from("iar_documents")
      .insert({
        delivery_id: deliveryId,
        ...payload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single(),
    "create IAR",
  );
  if (error) throw error;
  return data;
}

export async function fetchLOAByDelivery(deliveryId: number) {
  const { data, error } = await supabase
    .from("loa_documents")
    .select("*")
    .eq("delivery_id", deliveryId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertLOAByDelivery(
  deliveryId: number,
  payload: Record<string, any>,
) {
  await assertOnline("save LOA");
  const existing = await fetchLOAByDelivery(deliveryId);
  if (existing?.id) {
    const { data, error } = await withTimeout(
      supabase
        .from("loa_documents")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("*")
        .single(),
      "update LOA",
    );
    if (error) throw error;
    return data;
  }
  const { data, error } = await withTimeout(
    supabase
      .from("loa_documents")
      .insert({
        delivery_id: deliveryId,
        ...payload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single(),
    "create LOA",
  );
  if (error) throw error;
  return data;
}

export async function fetchDVByDelivery(deliveryId: number) {
  const { data, error } = await supabase
    .from("dv_documents")
    .select("*")
    .eq("delivery_id", deliveryId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertDVByDelivery(
  deliveryId: number,
  payload: Record<string, any>,
) {
  await assertOnline("save DV");
  const existing = await fetchDVByDelivery(deliveryId);
  if (existing?.id) {
    const { data, error } = await withTimeout(
      supabase
        .from("dv_documents")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("*")
        .single(),
      "update DV",
    );
    if (error) throw error;
    return data;
  }
  const { data, error } = await withTimeout(
    supabase
      .from("dv_documents")
      .insert({
        delivery_id: deliveryId,
        ...payload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single(),
    "create DV",
  );
  if (error) throw error;
  return data;
}

export async function fetchDeliveryStatuses(): Promise<
  { id: number; status_name: string }[]
> {
  const { data, error } = await supabase
    .from("status")
    .select("id, status_name")
    .gte("id", 18)
    .lte("id", 36)
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as { id: number; status_name: string }[];
}
