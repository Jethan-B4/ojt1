/**
 * ProcurementContent — Canvassing integration snippet
 *
 * Add these to your existing ProcurementContent.tsx to wire
 * the "Start Canvassing" action from an approved PR card.
 *
 * ─── 1. Import ─────────────────────────────────────────────
 */
import { PRRecord } from "@/app/ProcurementContent";
import type { CanvassingPR } from "../app/(tabs)/CanvassingModule";

/**
 * ─── 2. Add navigation prop ────────────────────────────────
 *
 * ProcurementContent is rendered inside ProcurementScreen,
 * which receives the navigation prop from the Drawer.
 * Pass it down:
 *
 *   // procurement.tsx  (the screen file)
 *   export default function ProcurementScreen({ navigation }: any) {
 *     return <ProcurementContent navigation={navigation} />;
 *   }
 *
 *   // ProcurementContent — add to props interface:
 *   interface ProcurementContentProps {
 *     navigation?: any;   // ← add this
 *     ...
 *   }
 */

/**
 * ─── 3. Map PRRecord → CanvassingPR ────────────────────────
 *
 * Inside ProcurementContent, add this helper that converts
 * your local display record + Supabase items into the shape
 * CanvassingModule expects.
 *
 * TODO: replace the stub items with a real Supabase fetch:
 *   const { data: items } = await supabase
 *     .from("purchase_request_items")
 *     .select("*")
 *     .eq("pr_id", record.id);
 */
function toCanvassingPR(record: PRRecord): CanvassingPR {
  return {
    prNo:               record.prNo,
    date:               record.date,
    officeSection:      record.officeSection,
    responsibilityCode: "",                          // TODO: add to PRRecord if needed
    purpose:            record.itemDescription,
    isHighValue:        record.totalCost >= 10_000,
    items: [
      // TODO: replace with real items from purchase_request_items
      {
        id:       1,
        desc:     record.itemDescription,
        stock:    "",
        unit:     "lot",
        qty:      record.quantity,
        unitCost: record.totalCost / Math.max(record.quantity, 1),
      },
    ],
  };
}

/**
 * ─── 4. Handler — called from RecordCard "Start Canvassing" button ──
 */
function handleStartCanvassing(record: PRRecord, navigation: any) {
  const prRecord = toCanvassingPR(record);
  navigation.navigate("Canvassing", { prRecord });
}

/**
 * ─── 5. Add button to RecordCard actions ───────────────────
 *
 * In the RecordCard component, after the "Edit" button:
 *
 *   {record.status === "approved" && (
 *     <TouchableOpacity
 *       onPress={() => handleStartCanvassing(record, navigation)}
 *       className="flex-1 bg-emerald-700 rounded-xl py-2 items-center"
 *     >
 *       <Text className="text-white text-[12px] font-bold">Canvass</Text>
 *     </TouchableOpacity>
 *   )}
 *
 * ─── 6. Handle returned canvassPayload ─────────────────────
 *
 * In ProcurementContent, read the param passed back by CanvassingModule
 * via navigation.navigate("Procurement", { canvassPayload }) and
 * advance the PR's status to "processing":
 */

// Inside ProcurementContent component body:
// useEffect(() => {
//   const payload = route?.params?.canvassPayload;
//   if (!payload) return;
//   setRecords((prev) =>
//     prev.map((r) =>
//       r.prNo === payload.pr_no
//         ? { ...r, status: "processing", elapsedTime: "just now" }
//         : r
//     )
//   );
//   // TODO: supabase.from("purchase_requests").update({ status: "processing" }).eq("pr_no", payload.pr_no)
// }, [route?.params?.canvassPayload]);

export { };

