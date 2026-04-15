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

import AAAView from "@/app/(canvassing)/AAAView/AAAModule";
import BACView from "@/app/(canvassing)/BACView";
import CanvasserView from "@/app/(canvassing)/CanvasserView";
import BACResolutionModule from "@/app/(components)/BACResolutionModule";
import EndUserView from "@/app/(canvassing)/EndUserView";
import { ensureCanvassSession, fetchPRIdByNo } from "@/lib/supabase";
import type { CanvassPayload, CanvassingPR } from "@/types/canvassing";
import React from "react";
import { Text, View } from "react-native";
import { useAuth } from "../AuthContext";

// ─── Props ────────────────────────────────────────────────────────────────────

interface CanvassingModuleProps {
  /** PR number string — passed via navigation.navigate("Canvassing", { prNo }) */
  prNo?: string;
  /** Optional explicit stage to show, e.g. "aaa_preparation" */
  targetStage?: string;
  onComplete?: (payload: CanvassPayload) => void;
  onBack?: () => void;
}

// ─── Root export ──────────────────────────────────────────────────────────────

export default function CanvassingModule({
  prNo,
  targetStage,
  onComplete,
  onBack,
}: CanvassingModuleProps) {
  const { currentUser } = useAuth();
  const roleId = currentUser?.role_id ?? 0;

  // Seed the PR shell with the prNo — each view hydrates items from Supabase.
  const prNoValue = prNo || "";

  const pr: CanvassingPR = {
    prNo: prNoValue,
    date: "",
    officeSection: "",
    responsibilityCode: "",
    purpose: "",
    isHighValue: false,
    items: [],
  };

  // If explicitly opening AAA stage for BAC, hydrate session meta and render AAAView
  const [aaaProps, setAAAProps] = React.useState<{
    sessionId: string;
    resolutionNo: string;
    mode: string;
  } | null>(null);

  React.useEffect(() => {
    (async () => {
      if (roleId === 3 && targetStage === "aaa_preparation" && pr.prNo) {
        try {
          const prId = await fetchPRIdByNo(pr.prNo);
          if (!prId) return;
          const session = await ensureCanvassSession(prId);
          // resolution_no is stored in bac_resolution table; for simplicity,
          // leave resolutionNo blank here — AAAView can proceed with read-only refs.
          setAAAProps({
            sessionId: session.id,
            resolutionNo: "",
            mode: session.status ?? "SVP/Canvass",
          });
        } catch {}
      } else {
        setAAAProps(null);
      }
    })();
  }, [roleId, targetStage, pr.prNo]);

  if (!prNoValue) {
    if (roleId === 3) {
      return (
        <BACResolutionModule
          currentUserId={currentUser?.id ?? null}
          divisionId={currentUser?.division_id ?? null}
        />
      );
    }
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f9fafb",
        }}
      >
        <Text style={{ fontSize: 16, color: "#6b7280", fontWeight: "600" }}>
          No PR Selected
        </Text>
        <Text style={{ fontSize: 13, color: "#9ca3af", marginTop: 8 }}>
          Please select a PR from the Procurement view to process its
          canvassing.
        </Text>
      </View>
    );
  }

  if (roleId === 3 && targetStage === "aaa_preparation") {
    if (!aaaProps) {
      return <EndUserView pr={pr} onBack={onBack} />;
    }
    return (
      <AAAView
        sessionId={aaaProps.sessionId}
        pr={pr}
        resolutionNo={aaaProps.resolutionNo}
        mode={aaaProps.mode}
        onComplete={onComplete}
        onBack={onBack}
      />
    );
  }

  if (roleId === 3)
    return <BACView pr={pr} onComplete={onComplete} onBack={onBack} />;
  if (roleId === 7) return <CanvasserView pr={pr} onBack={onBack} />;
  return <EndUserView pr={pr} onBack={onBack} />;
}
