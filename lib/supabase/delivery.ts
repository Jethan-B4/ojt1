import { supabase } from "./client";

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
  created_by: number | null;
  created_at: string;
  updated_at: string | null;
}

export async function fetchDeliveries() {
  const { data, error } = await supabase
    .from("deliveries")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DeliveryRow[];
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
    .eq("status_id", 17)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function insertDelivery(payload: {
  po_id: number | null;
  po_no: string;
  supplier?: string | null;
  office_section?: string | null;
  division_id?: number | null;
  delivery_no: string;
  created_by?: number | null;
}) {
  const { data, error } = await supabase
    .from("deliveries")
    .insert({
      ...payload,
      status_id: 16,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
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
      | "supplier"
      | "office_section"
      | "division_id"
    >
  >,
) {
  const { data, error } = await supabase
    .from("deliveries")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as DeliveryRow;
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
  const existing = await fetchIARByDelivery(deliveryId);
  if (existing?.id) {
    const { data, error } = await supabase
      .from("iar_documents")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from("iar_documents")
    .insert({
      delivery_id: deliveryId,
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
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
  const existing = await fetchLOAByDelivery(deliveryId);
  if (existing?.id) {
    const { data, error } = await supabase
      .from("loa_documents")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from("loa_documents")
    .insert({
      delivery_id: deliveryId,
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
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
  const existing = await fetchDVByDelivery(deliveryId);
  if (existing?.id) {
    const { data, error } = await supabase
      .from("dv_documents")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from("dv_documents")
    .insert({
      delivery_id: deliveryId,
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function fetchDeliveryStatuses(): Promise<
  { id: number; status_name: string }[]
> {
  const { data, error } = await supabase
    .from("status")
    .select("id, status_name")
    .gte("id", 16)
    .lte("id", 22)
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as { id: number; status_name: string }[];
}
