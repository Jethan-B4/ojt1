/**
 * AAAView — AAA (Abstract of Awards) preparation module, Step 10.
 *
 * Handles the final step of the canvassing process where the BAC prepares
 * and records the Abstract of Awards before forwarding to the Supply Section.
 */

import {
    CANVASS_PR_STATUS,
    fetchPRIdByNo,
    insertAAAForSession,
    updateCanvassSessionMeta,
    updatePRStatus,
} from "@/lib/supabase";
import type { CanvassingPR } from "@/types/canvassing";
import React, { useCallback, useRef, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    View,
} from "react-native";
import { useAuth } from "../../AuthContext";
import { CompletedBanner, StepHeader, StepNav } from "../BACView/components";
import { MONO } from "../BACView/constants";
import { Banner, Card, Divider, Field, Input } from "../BACView/ui";

interface AAAViewProps {
  sessionId: string;
  pr: CanvassingPR;
  bacNo: string;
  resolutionNo: string;
  mode: string;
  onComplete?: (payload: any) => void;
  onBack?: () => void;
}

export default function AAAView({
  sessionId,
  pr,
  bacNo,
  resolutionNo,
  mode,
  onComplete,
  onBack,
}: AAAViewProps) {
  const { currentUser } = useAuth();
  const [aaaNo, setAaaNo] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const sessionRef = useRef({
    bac_no: bacNo,
    resolution_no: resolutionNo,
    aaa_no: "",
  });

  const handleSubmit = useCallback(async () => {
    if (!sessionId || !aaaNo) return;
    try {
      const prId = await fetchPRIdByNo(pr.prNo);
      if (!prId) throw new Error("PR not found");

      sessionRef.current.aaa_no = aaaNo;

      // Record AAA in database
      await insertAAAForSession(sessionId, {
        aaa_no: aaaNo,
        prepared_by: currentUser?.id ?? 0,
        prepared_at: new Date().toISOString(),
        file_url: null,
      });

      // Close session and update PR status
      await updateCanvassSessionMeta(sessionId, { status: "closed" });
      await updatePRStatus(prId, CANVASS_PR_STATUS.aaa_preparation);

      setIsSubmitted(true);

      // Notify parent component
      onComplete?.({
        pr_no: pr.prNo,
        bac_no: sessionRef.current.bac_no,
        resolution_no: sessionRef.current.resolution_no,
        mode,
        aaa_no: aaaNo,
      });

      Alert.alert("✅ Canvassing Complete", "Forward to Supply Section");
    } catch (e: any) {
      Alert.alert("AAA failed", e?.message ?? "Could not record AAA");
    }
  }, [sessionId, pr.prNo, aaaNo, currentUser?.id, mode, onComplete]);

  const handleResubmit = () => {
    setIsSubmitted(false);
    setAaaNo("");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}>
        <StepHeader
          stage="aaa_preparation"
          title="Abstract of Awards"
          desc="Prepare the AAA and finalize the canvassing process."
        />

        {/* PR Summary */}
        <Card>
          <View className="bg-[#064E3B] px-4 pt-3.5 pb-3">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-2">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">
                  Purchase Request
                </Text>
                <Text
                  className="text-[16px] font-extrabold text-white"
                  style={{ fontFamily: MONO }}>
                  {pr.prNo}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">
                  BAC No.
                </Text>
                <Text
                  className="text-[15px] font-extrabold text-white"
                  style={{ fontFamily: MONO }}>
                  {bacNo}
                </Text>
              </View>
            </View>
          </View>
        </Card>

        {/* AAA Details Form */}
        <Card>
          <View className="px-4 pt-3 pb-2">
            <Divider label="AAA Details" />
            <View className="flex-row gap-2.5">
              <View className="flex-1">
                <Field label="AAA No." required>
                  <Input
                    value={aaaNo}
                    onChange={setAaaNo}
                    placeholder="e.g. AAA-2026-0001"
                  />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="PR Reference">
                  <Input value={pr.prNo} readonly />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="Date Prepared">
                  <Input
                    value={new Date().toLocaleDateString("en-PH")}
                    readonly
                  />
                </Field>
              </View>
            </View>
          </View>
        </Card>

        {/* Resolution Reference */}
        <Card>
          <View className="px-4 py-3">
            <Divider label="Resolution Reference" />
            <View className="flex-row gap-2.5 mt-2">
              <View className="flex-1">
                <Field label="Resolution No.">
                  <Input value={resolutionNo} readonly />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="Procurement Mode">
                  <Input value={mode} readonly />
                </Field>
              </View>
            </View>
          </View>
        </Card>

        {isSubmitted && (
          <CompletedBanner
            label={`AAA No. ${aaaNo} prepared. Forwarded to Supply.`}
            onResubmit={handleResubmit}
          />
        )}

        {/* Info Banner */}
        {!isSubmitted && (
          <Banner
            type="info"
            text="Complete the Abstract of Awards to finalize the canvassing process."
          />
        )}

        <StepNav
          stage="aaa_preparation"
          done={new Set(isSubmitted ? ["aaa_preparation"] : [])}
          onPrev={() => onBack?.()}
          onNext={() => {}}
          canSubmit={!isSubmitted && !!aaaNo}
          submitLabel="Finalize & Forward to Supply →"
          onSubmit={handleSubmit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
