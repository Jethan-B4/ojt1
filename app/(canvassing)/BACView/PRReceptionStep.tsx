/**
 * PRReceptionStep.tsx
 *
 * Step 6 — PR Received from PARPO (BAC Canvassing Reception)
 * No StepHeader. Clean, form-focused layout.
 */

import {
  FlagButton,
  STATUS_FLAGS,
  StatusFlagPicker,
  type StatusFlag,
} from "@/app/(modals)/ProcessPRModal";
import { insertRemark } from "@/lib/supabase";
import { fetchPRIdByNo } from "@/lib/supabase/pr";
import type {
  CanvassStage,
  CanvassingPR,
  CanvassingPRItem,
} from "@/types/canvassing";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CompletedBanner, ItemsTable, StepNav } from "./components";
import { MONO } from "./constants";
import { Banner, Card, Divider, Field, Input } from "./ui";

// ─── Constants ────────────────────────────────────────────────────────────────

const FLAG_TO_ID: Record<StatusFlag, number> = {
  complete: 2,
  incomplete_info: 3,
  wrong_information: 4,
  needs_revision: 5,
  on_hold: 6,
  urgent: 7,
};

const BLOCKING_FLAGS = new Set<StatusFlag>([
  "incomplete_info",
  "wrong_information",
  "needs_revision",
  "on_hold",
]);

function blockingBannerText(flag: StatusFlag): string {
  switch (flag) {
    case "incomplete_info":
      return "Missing required documents or fields — return to PARPO for completion.";
    case "wrong_information":
      return "Data errors found in the PR — return to PARPO for correction.";
    case "needs_revision":
      return "Minor corrections needed — flag for revision and await resubmission.";
    case "on_hold":
      return "Processing paused — awaiting clarification from the requesting office.";
    default:
      return "";
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PRReceptionStepProps {
  pr: CanvassingPR;
  liveItems: CanvassingPRItem[];
  bacNo: string;
  onBacNoChange: (v: string) => void;
  currentUser: any;
  isCompleted: boolean;
  onResubmit: () => void;
  onForward: () => Promise<void>;
  stage: "pr_received";
  done: Set<CanvassStage>;
  onPrev: (s: CanvassStage) => void;
  onNext: (s: CanvassStage) => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ChecklistRow = ({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail?: string;
}) => (
  <View
    className="flex-row items-center gap-2.5 py-2"
    style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}
  >
    <View
      className={`w-5 h-5 rounded-full items-center justify-center ${ok ? "bg-emerald-100" : "bg-gray-100"}`}
    >
      <MaterialIcons
        name={ok ? "check" : "radio-button-unchecked"}
        size={12}
        color={ok ? "#059669" : "#d1d5db"}
      />
    </View>
    <Text
      className={`flex-1 text-[12.5px] font-semibold ${ok ? "text-gray-700" : "text-gray-400"}`}
    >
      {label}
    </Text>
    {detail ? (
      <Text
        className="text-[11px] text-emerald-700 font-bold"
        style={{ fontFamily: MONO }}
        numberOfLines={1}
      >
        {detail}
      </Text>
    ) : null}
  </View>
);

const FlagPill = ({ flag }: { flag: StatusFlag }) => {
  const m = STATUS_FLAGS[flag];
  return (
    <View
      className={`flex-row items-center gap-1.5 self-start px-2.5 py-1 rounded-full border ${m.bg} ${m.border}`}
    >
      <View
        className="w-3.5 h-3.5 rounded-full items-center justify-center"
        style={{ backgroundColor: m.dot + "22" }}
      >
        <MaterialIcons name={m.icon} size={9} color={m.dot} />
      </View>
      <Text className={`text-[10.5px] font-bold ${m.text}`}>{m.label}</Text>
    </View>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PRReceptionStep({
  pr,
  liveItems,
  bacNo,
  onBacNoChange,
  currentUser,
  isCompleted,
  onResubmit,
  onForward,
  stage,
  done,
  onPrev,
  onNext,
}: PRReceptionStepProps) {
  const [flag, setFlag] = useState<StatusFlag | null>(null);
  const [remark, setRemark] = useState("");
  const [flagOpen, setFlagOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snapshot, setSnapshot] = useState<{
    bacNo: string;
    flag: StatusFlag;
    remark: string;
  } | null>(null);

  const hasBacNo = bacNo.trim().length > 0;
  const hasFlag = flag !== null;
  const hasRemark = remark.trim().length > 0;
  const isBlocking = flag !== null && BLOCKING_FLAGS.has(flag);
  const canForwardNow = hasBacNo && hasFlag && hasRemark && !isBlocking;

  const doSaveAndForward = useCallback(async () => {
    setSaving(true);
    try {
      const prId = await fetchPRIdByNo(pr.prNo);
      if (!prId) throw new Error("PR not found.");
      await insertRemark(
        prId,
        currentUser?.id ?? null,
        `[Reception] ${remark.trim()}`,
        flag ? FLAG_TO_ID[flag] : null,
      );
      setSnapshot({ bacNo: bacNo.trim(), flag: flag!, remark: remark.trim() });
      await onForward();
      setRemark("");
      setFlag(null);
    } catch (e: any) {
      Alert.alert(
        "Save failed",
        e?.message ?? "Could not record the reception remark.",
      );
    } finally {
      setSaving(false);
    }
  }, [flag, remark, bacNo, pr.prNo, currentUser, onForward]);

  const handleSubmit = useCallback(() => {
    if (!canForwardNow) return;
    if (flag === "urgent") {
      Alert.alert(
        "Urgent PR",
        "This PR is flagged Urgent. Forward to Release Canvass?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Proceed", onPress: doSaveAndForward },
        ],
      );
    } else {
      doSaveAndForward();
    }
  }, [canForwardNow, flag, doSaveAndForward]);

  // ── Completed state ───────────────────────────────────────────────────────
  if (isCompleted && snapshot) {
    return (
      <>
        <CompletedBanner
          label={`${snapshot.bacNo} · ${STATUS_FLAGS[snapshot.flag]?.label ?? snapshot.flag}`}
          onResubmit={onResubmit}
        />
        <Card>
          <View className="px-4 pt-3.5 pb-3">
            <Divider label="Reception Summary" />
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-[9.5px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">
                  BAC Canvass No.
                </Text>
                <Text
                  className="text-[15px] font-extrabold text-[#064E3B]"
                  style={{ fontFamily: MONO }}
                >
                  {snapshot.bacNo}
                </Text>
              </View>
              <FlagPill flag={snapshot.flag} />
            </View>
            <Text className="text-[9.5px] font-bold uppercase tracking-widest text-gray-400 mb-1">
              Remark
            </Text>
            <View className="bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
              <Text className="text-[13px] text-gray-700 leading-[19px]">
                {snapshot.remark}
              </Text>
            </View>
          </View>
        </Card>
        <ItemsTable items={liveItems} />
        <StepNav
          stage={stage}
          done={done}
          onPrev={onPrev}
          onNext={onNext}
          canSubmit={false}
          submitLabel=""
          onSubmit={() => {}}
        />
      </>
    );
  }

  // ── Active form ───────────────────────────────────────────────────────────
  return (
    <>
      {/* Pre-flight checklist */}
      <Card>
        <View className="px-4 pt-3.5 pb-1">
          <Divider label="Checklist" />
          <ChecklistRow
            ok={hasBacNo}
            label="BAC Canvass No. assigned"
            detail={hasBacNo ? bacNo : undefined}
          />
          <ChecklistRow
            ok={hasFlag && !isBlocking}
            label='Flag set to "Complete" or "Urgent"'
            detail={
              hasFlag
                ? isBlocking
                  ? "⚠ Blocking"
                  : STATUS_FLAGS[flag!]?.label
                : undefined
            }
          />
          <ChecklistRow ok={hasRemark} label="Reception remark recorded" />
        </View>
      </Card>

      {/* BAC Canvass No. */}
      <Card>
        <View className="px-4 pt-3 pb-3">
          <Divider label="Acknowledgement" />
          <Field label="BAC Canvass No." required>
            <Input
              value={bacNo}
              onChange={onBacNoChange}
              placeholder="e.g. BAC-2026-001"
            />
          </Field>
          <Field label="Date Received">
            <Input value={new Date().toLocaleDateString("en-PH")} readonly />
          </Field>
        </View>
      </Card>

      {/* Completeness review */}
      <Card>
        <View className="px-4 pt-3 pb-4">
          <Divider label="Completeness Review" />

          <Field label="Status Flag" required>
            <FlagButton selected={flag} onPress={() => setFlagOpen(true)} />
          </Field>

          {isBlocking && (
            <View
              className="flex-row gap-2.5 rounded-xl p-3 mb-3 bg-red-50"
              style={{ borderLeftWidth: 4, borderLeftColor: "#ef4444" }}
            >
              <MaterialIcons
                name="block"
                size={15}
                color="#b91c1c"
                style={{ marginTop: 1 }}
              />
              <Text className="flex-1 text-[12.5px] leading-[19px] text-red-900">
                {blockingBannerText(flag!)}
              </Text>
            </View>
          )}

          {flag === "urgent" && (
            <Banner
              type="warning"
              text="Flagged Urgent — you may still forward with a confirmation prompt."
            />
          )}

          <Field label="Reception Remark" required>
            <TextInput
              value={remark}
              onChangeText={setRemark}
              placeholder={
                isBlocking
                  ? "Describe the issue for the requesting office…"
                  : "Completeness, condition, and any observations…"
              }
              placeholderTextColor="#9ca3af"
              multiline
              className="bg-gray-50 rounded-xl px-3.5 py-2.5 text-[13.5px] text-gray-800 border border-gray-200"
              style={{ minHeight: 80, textAlignVertical: "top" }}
            />
          </Field>
        </View>
      </Card>

      <ItemsTable items={liveItems} />

      {/* Action row */}
      <View
        className="flex-row items-center justify-between mt-3 pt-3"
        style={{ borderTopWidth: 1, borderTopColor: "#f3f4f6" }}
      >
        <View />
        {canForwardNow ? (
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={saving}
            activeOpacity={0.8}
            className={`flex-row items-center gap-2 px-5 py-2.5 rounded-xl ${saving ? "bg-gray-300" : "bg-[#064E3B]"}`}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialIcons name="send" size={15} color="#fff" />
            )}
            <Text className="text-[14px] font-bold text-white">
              {saving ? "Saving…" : "Acknowledge → Release Canvass"}
            </Text>
          </TouchableOpacity>
        ) : (
          <View className="flex-row items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 border border-gray-200">
            <MaterialIcons
              name={isBlocking ? "block" : "lock"}
              size={14}
              color="#9ca3af"
            />
            <Text className="text-[13px] font-bold text-gray-400">
              {isBlocking
                ? "Resolve flag to forward"
                : "Complete checklist to forward"}
            </Text>
          </View>
        )}
        <View />
      </View>

      <StatusFlagPicker
        visible={flagOpen}
        selected={flag}
        onSelect={setFlag}
        onClose={() => setFlagOpen(false)}
      />
    </>
  );
}
