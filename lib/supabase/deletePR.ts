import { supabase } from "./client";

export interface DeletePRPreview {
  prId: string;
  prNo: string;
  currentStatusId: number;
  prItemCount: number;
  proposalCount: number;
  remarkCount: number;
  prFormId: number | null;
  prFormItemCount: number;
  sessionId: number | null;
  canvassEntryCount: number;
  assignmentCount: number;
  aaaDocCount: number;
  bacResolutionCount: number;
  bacResolutionPRLinkCount: number;
  poCount: number;
  poItemCount: number;
  deliveryCount: number;
  iarCount: number;
  loaCount: number;
  dvCount: number;
  orsCount: number;
}

export async function fetchPRDeletePreview(
  prId: string,
): Promise<DeletePRPreview> {
  const { data: pr, error: prErr } = await supabase
    .from("purchase_requests")
    .select("id, pr_no, status_id")
    .eq("id", prId)
    .single();
  if (prErr || !pr) throw prErr ?? new Error("PR not found.");
  const prNo = (pr as any).pr_no as string;

  const { data: prForm } = await supabase
    .from("pr_form")
    .select("pr_id")
    .eq("pr_num", prNo)
    .maybeSingle();
  const prFormId = (prForm as any)?.pr_id != null ? Number((prForm as any).pr_id) : null;

  const { data: session } = await supabase
    .from("canvass_sessions")
    .select("id")
    .eq("pr_id", prId)
    .maybeSingle();
  const sessionId = (session as any)?.id != null ? Number((session as any).id) : null;

  const { data: pos } = await supabase
    .from("purchase_orders")
    .select("id")
    .eq("pr_id", prId);
  const poIds = (pos ?? []).map((r: any) => Number(r.id)).filter(Boolean);

  const { data: deliveries } = poIds.length
    ? await supabase.from("deliveries").select("id").in("po_id", poIds)
    : ({ data: [] } as any);
  const deliveryIds = (deliveries ?? [])
    .map((r: any) => Number(r.id))
    .filter(Boolean);

  const [
    prItems,
    proposals,
    remarksByPR,
    remarksByPRForm,
    remarksByPO,
    prFormItems,
    canvassEntries,
    assignments,
    aaaDocs,
    bacResolutions,
    bacResLinks,
    poItems,
    iars,
    loas,
    dvs,
    orsEntries,
  ] = await Promise.all([
    supabase
      .from("purchase_request_items")
      .select("id", { count: "exact", head: true })
      .eq("pr_id", prId),
    supabase
      .from("proposals")
      .select("id", { count: "exact", head: true })
      .eq("pr_id", prId),
    supabase
      .from("remarks")
      .select("id", { count: "exact", head: true })
      .eq("pr_id", prId),
    prFormId
      ? supabase
          .from("remarks")
          .select("id", { count: "exact", head: true })
          .eq("prform_id", prFormId)
      : Promise.resolve({ count: 0 } as any),
    poIds.length
      ? supabase
          .from("remarks")
          .select("id", { count: "exact", head: true })
          .in("po_id", poIds)
      : Promise.resolve({ count: 0 } as any),
    prFormId
      ? supabase
          .from("pr_item")
          .select("prItem_id", { count: "exact", head: true })
          .eq("pr_id", prFormId)
      : Promise.resolve({ count: 0 } as any),
    sessionId
      ? supabase
          .from("canvass_entries")
          .select("id", { count: "exact", head: true })
          .eq("session_id", sessionId)
      : Promise.resolve({ count: 0 } as any),
    sessionId
      ? supabase
          .from("canvasser_assignments")
          .select("id", { count: "exact", head: true })
          .eq("session_id", sessionId)
      : Promise.resolve({ count: 0 } as any),
    sessionId
      ? supabase
          .from("aaa_documents")
          .select("id", { count: "exact", head: true })
          .eq("session_id", sessionId)
      : Promise.resolve({ count: 0 } as any),
    sessionId
      ? supabase
          .from("bac_resolution")
          .select("id", { count: "exact", head: true })
          .eq("session_id", sessionId)
      : Promise.resolve({ count: 0 } as any),
    supabase
      .from("bac_resolution_prs")
      .select("id", { count: "exact", head: true })
      .or(`pr_id.eq.${prId},pr_no.eq.${prNo}`),
    poIds.length
      ? supabase
          .from("purchase_order_items")
          .select("id", { count: "exact", head: true })
          .in("po_id", poIds)
      : Promise.resolve({ count: 0 } as any),
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
    supabase
      .from("ors_entries")
      .select("id", { count: "exact", head: true })
      .eq("pr_id", prId),
  ]);

  return {
    prId: String((pr as any).id),
    prNo,
    currentStatusId: Number((pr as any).status_id) || 0,
    prItemCount: prItems.count ?? 0,
    proposalCount: proposals.count ?? 0,
    remarkCount:
      (remarksByPR.count ?? 0) +
      (remarksByPRForm.count ?? 0) +
      (remarksByPO.count ?? 0),
    prFormId,
    prFormItemCount: prFormItems.count ?? 0,
    sessionId,
    canvassEntryCount: canvassEntries.count ?? 0,
    assignmentCount: assignments.count ?? 0,
    aaaDocCount: aaaDocs.count ?? 0,
    bacResolutionCount: bacResolutions.count ?? 0,
    bacResolutionPRLinkCount: bacResLinks.count ?? 0,
    poCount: poIds.length,
    poItemCount: poItems.count ?? 0,
    deliveryCount: deliveryIds.length,
    iarCount: iars.count ?? 0,
    loaCount: loas.count ?? 0,
    dvCount: dvs.count ?? 0,
    orsCount: orsEntries.count ?? 0,
  };
}

export async function deletePurchaseRequestDeep(prId: string): Promise<void> {
  const { data: pr, error: prErr } = await supabase
    .from("purchase_requests")
    .select("id, pr_no")
    .eq("id", prId)
    .single();
  if (prErr || !pr) throw prErr ?? new Error("PR not found.");
  const prNo = (pr as any).pr_no as string;

  const { data: prForm } = await supabase
    .from("pr_form")
    .select("pr_id")
    .eq("pr_num", prNo)
    .maybeSingle();
  const prFormId =
    (prForm as any)?.pr_id != null ? Number((prForm as any).pr_id) : null;

  const { data: session } = await supabase
    .from("canvass_sessions")
    .select("id")
    .eq("pr_id", prId)
    .maybeSingle();
  const sessionId = (session as any)?.id != null ? Number((session as any).id) : null;

  const { data: pos, error: poErr } = await supabase
    .from("purchase_orders")
    .select("id")
    .eq("pr_id", prId);
  if (poErr) throw poErr;
  const poIds = (pos ?? []).map((r: any) => Number(r.id)).filter(Boolean);

  const { data: deliveries, error: dErr } = poIds.length
    ? await supabase.from("deliveries").select("id").in("po_id", poIds)
    : ({ data: [], error: null } as any);
  if (dErr) throw dErr;
  const deliveryIds = (deliveries ?? [])
    .map((r: any) => Number(r.id))
    .filter(Boolean);

  if (deliveryIds.length) {
    const { error: e1 } = await supabase
      .from("iar_documents")
      .delete()
      .in("delivery_id", deliveryIds);
    if (e1) throw e1;
    const { error: e2 } = await supabase
      .from("loa_documents")
      .delete()
      .in("delivery_id", deliveryIds);
    if (e2) throw e2;
    const { error: e3 } = await supabase
      .from("dv_documents")
      .delete()
      .in("delivery_id", deliveryIds);
    if (e3) throw e3;
    const { error: e4 } = await supabase
      .from("deliveries")
      .delete()
      .in("id", deliveryIds);
    if (e4) throw e4;
  }

  if (poIds.length) {
    const { error } = await supabase.from("remarks").delete().in("po_id", poIds);
    if (error) throw error;
  }
  if (prFormId) {
    const { error } = await supabase
      .from("remarks")
      .delete()
      .eq("prform_id", prFormId);
    if (error) throw error;
  }
  {
    const { error } = await supabase.from("remarks").delete().eq("pr_id", prId);
    if (error) throw error;
  }

  if (sessionId) {
    const { error: e1 } = await supabase
      .from("canvass_entries")
      .delete()
      .eq("session_id", sessionId);
    if (e1) throw e1;

    const { error: e2 } = await supabase
      .from("canvasser_assignments")
      .delete()
      .eq("session_id", sessionId);
    if (e2) throw e2;

    const { error: e3 } = await supabase
      .from("aaa_documents")
      .delete()
      .eq("session_id", sessionId);
    if (e3) throw e3;

    const { data: resRows, error: e4 } = await supabase
      .from("bac_resolution")
      .select("id")
      .eq("session_id", sessionId);
    if (e4) throw e4;
    const resIds = (resRows ?? []).map((r: any) => Number(r.id)).filter(Boolean);
    if (resIds.length) {
      const { error } = await supabase
        .from("bac_resolution_prs")
        .delete()
        .in("resolution_id", resIds);
      if (error) throw error;
    }

    const { error: e5 } = await supabase
      .from("bac_resolution")
      .delete()
      .eq("session_id", sessionId);
    if (e5) throw e5;

    const { error: e6 } = await supabase
      .from("canvass_sessions")
      .delete()
      .eq("id", sessionId);
    if (e6) throw e6;
  }

  {
    const { error } = await supabase
      .from("bac_resolution_prs")
      .delete()
      .eq("pr_id", prId);
    if (error) throw error;
  }

  if (poIds.length) {
    const { error: e1 } = await supabase
      .from("purchase_order_items")
      .delete()
      .in("po_id", poIds);
    if (e1) throw e1;

    const { error: e2 } = await supabase
      .from("purchase_orders")
      .delete()
      .in("id", poIds);
    if (e2) throw e2;
  }

  {
    const { error } = await supabase
      .from("ors_entries")
      .delete()
      .eq("pr_id", prId);
    if (error) throw error;
  }

  {
    const { error } = await supabase.from("proposals").delete().eq("pr_id", prId);
    if (error) throw error;
  }
  {
    const { error } = await supabase
      .from("purchase_request_items")
      .delete()
      .eq("pr_id", prId);
    if (error) throw error;
  }

  if (prFormId) {
    const { error: e1 } = await supabase
      .from("pr_item")
      .delete()
      .eq("pr_id", prFormId);
    if (e1) throw e1;
    const { error: e2 } = await supabase
      .from("pr_form")
      .delete()
      .eq("pr_id", prFormId);
    if (e2) throw e2;
  }

  const { error: delErr } = await supabase
    .from("purchase_requests")
    .delete()
    .eq("id", prId);
  if (delErr) throw delErr;
}
