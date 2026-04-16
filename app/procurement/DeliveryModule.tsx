import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  fetchDVByDelivery,
  fetchDeliveries,
  fetchDeliveriesByDivision,
  fetchIARByDelivery,
  fetchLOAByDelivery,
  fetchPoCandidatesForDelivery,
  insertDelivery,
  updateDelivery,
  upsertDVByDelivery,
  upsertIARByDelivery,
  upsertLOAByDelivery,
} from "@/lib/supabase/delivery";
import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DVPreviewPanel, { buildDVHtml } from "../(components)/DVPreviewPanel";
import IARPreviewPanel, { buildIARHtml } from "../(components)/IARPreviewPanel";
import LOAPreviewPanel, { buildLOAHtml } from "../(components)/LOAPreviewPanel";
import { useAuth } from "../AuthContext";

const STATUS_LABELS: Record<number, string> = {
  16: "Awaiting Delivery",
  17: "Delivery Received",
  18: "IAR Preparation",
  19: "IAR Signing",
  20: "LOA / DV Prep",
  21: "Division Signature",
  22: "COA Submission",
};

const canCreate = (role: number) => role === 1 || role === 8;
const canProcess = (role: number, status: number) =>
  role === 1 ||
  (role === 8 && [16, 17, 18, 20, 22].includes(status)) ||
  (role === 9 && status === 19) ||
  (role === 2 && status === 21);

export default function DeliveryModule() {
  const { currentUser } = useAuth();
  const roleId: number = (currentUser as any)?.role_id ?? 0;
  const divisionId: number | null = (currentUser as any)?.division_id ?? null;

  const [records, setRecords] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [processOpen, setProcessOpen] = useState(false);
  const [active, setActive] = useState<any | null>(null);

  const [poOptions, setPoOptions] = useState<any[]>([]);
  const [selectedPoId, setSelectedPoId] = useState<number | null>(null);
  const [deliveryNo, setDeliveryNo] = useState("");

  const [drNo, setDrNo] = useState("");
  const [soaNo, setSoaNo] = useState("");
  const [notes, setNotes] = useState("");
  const [iar, setIar] = useState<any>(null);
  const [loa, setLoa] = useState<any>(null);
  const [dv, setDv] = useState<any>(null);
  const [viewTab, setViewTab] = useState<"iar" | "loa" | "dv">("iar");

  const load = useCallback(async () => {
    const rows =
      roleId === 1 || divisionId == null
        ? await fetchDeliveries()
        : await fetchDeliveriesByDivision(divisionId);
    setRecords(rows);
  }, [roleId, divisionId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = records.filter((r) => {
    const q = query.toLowerCase();
    return (
      !q ||
      String(r.delivery_no ?? "")
        .toLowerCase()
        .includes(q) ||
      String(r.po_no ?? "")
        .toLowerCase()
        .includes(q) ||
      String(r.supplier ?? "")
        .toLowerCase()
        .includes(q)
    );
  });

  const openCreate = async () => {
    setPoOptions((await fetchPoCandidatesForDelivery()) as any[]);
    setCreateOpen(true);
  };

  const openView = async (row: any) => {
    setActive(row);
    const [i, l, d] = await Promise.all([
      fetchIARByDelivery(row.id),
      fetchLOAByDelivery(row.id),
      fetchDVByDelivery(row.id),
    ]);
    setIar(i);
    setLoa(l);
    setDv(d);
    setViewTab("iar");
    setViewOpen(true);
  };

  const openProcess = async (row: any) => {
    setActive(row);
    setDrNo(row.dr_no ?? "");
    setSoaNo(row.soa_no ?? "");
    setNotes(row.notes ?? "");
    setIar(await fetchIARByDelivery(row.id));
    setLoa(await fetchLOAByDelivery(row.id));
    setDv(await fetchDVByDelivery(row.id));
    setProcessOpen(true);
  };

  const submitCreate = async () => {
    const po = poOptions.find((x) => Number(x.id) === Number(selectedPoId));
    if (!po || !deliveryNo.trim()) return;
    await insertDelivery({
      po_id: po.id,
      po_no: po.po_no ?? "",
      supplier: po.supplier ?? "",
      office_section: po.office_section ?? "",
      division_id: po.division_id ?? null,
      delivery_no: deliveryNo.trim(),
      created_by: (currentUser as any)?.id ?? null,
    });
    setCreateOpen(false);
    setDeliveryNo("");
    setSelectedPoId(null);
    await load();
  };

  const submitProcess = async () => {
    if (!active) return;
    if (active.status_id === 16) {
      await updateDelivery(active.id, {
        status_id: 17,
        dr_no: drNo || null,
        soa_no: soaNo || null,
        notes: notes || null,
      });
    } else if (active.status_id === 17) {
      await upsertIARByDelivery(active.id, {
        iar_no: iar?.iar_no ?? "",
        invoice_no: iar?.invoice_no ?? "",
        invoice_date: iar?.invoice_date ?? "",
      });
      await updateDelivery(active.id, { status_id: 18, notes: notes || null });
    } else if (active.status_id === 18) {
      await updateDelivery(active.id, { status_id: 19, notes: notes || null });
    } else if (active.status_id === 19) {
      await upsertIARByDelivery(active.id, {
        inspector_name: iar?.inspector_name ?? "",
        inspected_at: iar?.inspected_at ?? "",
      });
      await updateDelivery(active.id, { status_id: 20, notes: notes || null });
    } else if (active.status_id === 20) {
      await upsertLOAByDelivery(active.id, {
        loa_no: loa?.loa_no ?? "",
        invoice_no: loa?.invoice_no ?? "",
        accepted_by_name: loa?.accepted_by_name ?? "",
        accepted_by_title: loa?.accepted_by_title ?? "",
      });
      await upsertDVByDelivery(active.id, {
        dv_no: dv?.dv_no ?? "",
        amount_due: dv?.amount_due ?? "",
        particulars: dv?.particulars ?? "",
        mode_of_payment: dv?.mode_of_payment ?? "",
      });
      await updateDelivery(active.id, { status_id: 21, notes: notes || null });
    } else if (active.status_id === 21) {
      await updateDelivery(active.id, { status_id: 22, notes: notes || null });
    } else {
      await updateDelivery(active.id, { notes: notes || null });
    }
    setProcessOpen(false);
    await load();
  };

  return (
    <View className="flex-1 bg-gray-50">
      <View className="flex-row items-center gap-2 px-3 py-2.5 bg-white border-b border-gray-100">
        <View className="flex-1 flex-row items-center bg-gray-100 rounded-xl px-3 py-2 border border-gray-200">
          <MaterialIcons name="search" size={16} color="#9ca3af" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search delivery no, PO, supplier"
            className="flex-1 ml-2 text-[13px]"
          />
        </View>
        {canCreate(roleId) && (
          <TouchableOpacity
            onPress={openCreate}
            className="bg-[#064E3B] px-4 py-2.5 rounded-xl"
          >
            <Text className="text-white font-bold">Log Delivery</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#064E3B"
            colors={["#064E3B"]}
          />
        }
        contentContainerStyle={{ padding: 12, gap: 8 }}
      >
        {filtered.map((r) => (
          <View
            key={r.id}
            className="bg-white rounded-2xl border border-gray-100 p-3"
          >
            <Text className="font-bold text-gray-800">{r.delivery_no}</Text>
            <Text className="text-xs text-gray-500">PO: {r.po_no}</Text>
            <Text className="text-xs text-gray-500">{r.supplier}</Text>
            <View className="mt-1 mb-2 self-start bg-gray-100 rounded-full px-2 py-1">
              <Text className="text-[11px] text-gray-700">
                {STATUS_LABELS[r.status_id] ?? `Status ${r.status_id}`}
              </Text>
            </View>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => openView(r)}
                className="bg-gray-100 px-3 py-2 rounded-xl"
              >
                <Text>View</Text>
              </TouchableOpacity>
              {canProcess(roleId, r.status_id) && (
                <TouchableOpacity
                  onPress={() => openProcess(r)}
                  className="bg-[#064E3B] px-3 py-2 rounded-xl"
                >
                  <Text className="text-white">Process</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal
        visible={createOpen}
        animationType="slide"
        onRequestClose={() => setCreateOpen(false)}
      >
        <View className="flex-1 bg-white p-4 gap-3">
          <Text className="text-lg font-bold">Log Delivery</Text>
          <TextInput
            value={deliveryNo}
            onChangeText={setDeliveryNo}
            placeholder="Delivery No."
            className="border border-gray-300 rounded-xl px-3 py-2.5"
          />
          <Text className="text-xs text-gray-500">Select PO (served status)</Text>
          <ScrollView className="max-h-56">
            {poOptions.map((p) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => setSelectedPoId(Number(p.id))}
                className={`p-3 rounded-xl border mb-2 ${
                  Number(selectedPoId) === Number(p.id)
                    ? "border-[#064E3B] bg-green-50"
                    : "border-gray-200"
                }`}
              >
                <Text className="font-semibold">{p.po_no}</Text>
                <Text className="text-xs text-gray-500">{p.supplier}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View className="flex-row gap-2 mt-auto">
            <TouchableOpacity
              onPress={() => setCreateOpen(false)}
              className="flex-1 bg-gray-100 py-3 rounded-xl items-center"
            >
              <Text>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={submitCreate}
              className="flex-1 bg-[#064E3B] py-3 rounded-xl items-center"
            >
              <Text className="text-white">Create</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={viewOpen}
        animationType="slide"
        onRequestClose={() => setViewOpen(false)}
      >
        <View className="flex-1 bg-white">
          <View className="flex-row p-2 gap-2">
            {(["iar", "loa", "dv"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setViewTab(t)}
                className={`px-3 py-2 rounded-xl ${
                  viewTab === t ? "bg-[#064E3B]" : "bg-gray-100"
                }`}
              >
                <Text className={viewTab === t ? "text-white" : "text-gray-700"}>
                  {t.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => setViewOpen(false)}
              className="ml-auto px-3 py-2 rounded-xl bg-gray-100"
            >
              <Text>Close</Text>
            </TouchableOpacity>
          </View>
          {viewTab === "iar" && (
            <IARPreviewPanel
              html={buildIARHtml({
                entityName: "DEPARTMENT OF AGRARIAN REFORM-CAM SUR 1",
                supplier: active?.supplier,
                iarNo: iar?.iar_no,
                poNo: active?.po_no,
                invoiceNo: iar?.invoice_no,
                invoiceDate: iar?.invoice_date,
                requisitioningOffice: active?.office_section,
                dateInspected: iar?.inspected_at,
              })}
            />
          )}
          {viewTab === "loa" && (
            <LOAPreviewPanel
              html={buildLOAHtml({
                supplier: active?.supplier,
                invoiceNo: loa?.invoice_no,
                poNo: active?.po_no,
                acceptanceDate: loa?.accepted_at,
                signatoryName: loa?.accepted_by_name,
                signatoryTitle: loa?.accepted_by_title,
              })}
            />
          )}
          {viewTab === "dv" && (
            <DVPreviewPanel
              html={buildDVHtml({
                entityName: "DEPARTMENT OF AGRARIAN REFORM-CAM SUR 1",
                dvNo: dv?.dv_no,
                payee: active?.supplier,
                particulars: dv?.particulars,
                amountDue: dv?.amount_due,
                modeOfPayment: dv?.mode_of_payment,
              })}
            />
          )}
        </View>
      </Modal>

      <Modal
        visible={processOpen}
        animationType="slide"
        onRequestClose={() => setProcessOpen(false)}
      >
        <View className="flex-1 bg-white p-4 gap-2">
          <Text className="text-lg font-bold">Process Delivery</Text>
          <Text className="text-sm text-gray-500">
            {active?.delivery_no} · {STATUS_LABELS[active?.status_id ?? 16]}
          </Text>
          {(active?.status_id === 16 || active?.status_id === 17) && (
            <>
              <TextInput
                value={drNo}
                onChangeText={setDrNo}
                placeholder="DR No."
                className="border border-gray-300 rounded-xl px-3 py-2.5"
              />
              <TextInput
                value={soaNo}
                onChangeText={setSoaNo}
                placeholder="SOA No."
                className="border border-gray-300 rounded-xl px-3 py-2.5"
              />
            </>
          )}
          {(active?.status_id === 17 || active?.status_id === 19) && (
            <>
              <TextInput
                value={iar?.iar_no ?? ""}
                onChangeText={(v) =>
                  setIar((p: any) => ({ ...(p ?? {}), iar_no: v }))
                }
                placeholder="IAR No."
                className="border border-gray-300 rounded-xl px-3 py-2.5"
              />
              <TextInput
                value={iar?.invoice_no ?? ""}
                onChangeText={(v) =>
                  setIar((p: any) => ({ ...(p ?? {}), invoice_no: v }))
                }
                placeholder="Invoice No."
                className="border border-gray-300 rounded-xl px-3 py-2.5"
              />
            </>
          )}
          {active?.status_id === 20 && (
            <>
              <TextInput
                value={loa?.loa_no ?? ""}
                onChangeText={(v) =>
                  setLoa((p: any) => ({ ...(p ?? {}), loa_no: v }))
                }
                placeholder="LOA No."
                className="border border-gray-300 rounded-xl px-3 py-2.5"
              />
              <TextInput
                value={dv?.dv_no ?? ""}
                onChangeText={(v) =>
                  setDv((p: any) => ({ ...(p ?? {}), dv_no: v }))
                }
                placeholder="DV No."
                className="border border-gray-300 rounded-xl px-3 py-2.5"
              />
              <TextInput
                value={dv?.amount_due ?? ""}
                onChangeText={(v) =>
                  setDv((p: any) => ({ ...(p ?? {}), amount_due: v }))
                }
                placeholder="Amount Due"
                className="border border-gray-300 rounded-xl px-3 py-2.5"
              />
            </>
          )}
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes / remarks"
            multiline
            className="border border-gray-300 rounded-xl px-3 py-2.5 min-h-24"
          />
          <View className="flex-row gap-2 mt-auto">
            <TouchableOpacity
              onPress={() => setProcessOpen(false)}
              className="flex-1 bg-gray-100 py-3 rounded-xl items-center"
            >
              <Text>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={submitProcess}
              className="flex-1 bg-[#064E3B] py-3 rounded-xl items-center"
            >
              <Text className="text-white">Save & Next Step</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

