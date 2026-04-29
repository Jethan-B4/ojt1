/**
 * budget.tsx — Budget Management Screen
 *
 * Role behaviour (from DB roles table):
 *   role_id 1 (Admin)   → full edit: set allocations + manage all ORS entries
 *   role_id 4 (Budget)  → full edit: same as Admin for this module
 *   role_id 6 (End User)→ read-only: sees own division only
 *   all others          → read-only: sees all divisions (no edit)
 *
 * Sections:
 *   • Summary strip        — Total Allocated / Total Utilized / Remaining
 *   • DivisionBudgetSection — progress bars per division (editable for 1 & 4)
 *                             Extracted to DivisionBudgetModule.tsx
 *   • ORSSection            — ORS entries table (editable for 1 & 4)
 *                             Extracted to ORSModule.tsx
 *
 * This file is now a thin orchestrator: it owns data loading, derived
 * totals, and the page header/summary strip. All sub-sections are
 * delegated to their respective modules.
 */

import {
  fetchBudgets,
  fetchOrsEntries,
  insertDivisionBudget,
  supabase,
  updateDivisionBudget,
  type DivisionBudgetRow,
  type OrsEntryRow,
} from "@/lib/supabase";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DivisionBudgetSection, {
  YearPickerModal,
} from "../(components)/DivisionBudgetModule";
import { ORSSection } from "../(components)/ORSModule";
import { useAuth } from "../contexts/AuthContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const CURRENT_YEAR = new Date().getFullYear();

const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

/** Roles that may write to this module */
const EDIT_ROLES = new Set([1, 4]); // Admin, Budget
/** Role that sees only their own division */
const ENDUSER_ROLE = 6;

// ─── BudgetScreen ─────────────────────────────────────────────────────────────

export default function BudgetScreen() {
  const { currentUser } = useAuth();
  const roleId = currentUser?.role_id ?? 0;
  const divisionId = currentUser?.division_id ?? null;
  const canEdit = EDIT_ROLES.has(roleId);
  const canEditOrs = false;
  const isEndUser = roleId === ENDUSER_ROLE;

  const [year, setYear] = useState(CURRENT_YEAR);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [budgets, setBudgets] = useState<DivisionBudgetRow[]>([]);
  const [orsEntries, setOrsEntries] = useState<OrsEntryRow[]>([]);
  const [prStatusByNo, setPrStatusByNo] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [b, o] = await Promise.all([
          fetchBudgets(year),
          fetchOrsEntries(
            year,
            isEndUser && divisionId ? divisionId : undefined,
          ),
        ]);
        setBudgets(
          isEndUser && divisionId
            ? b.filter((r) => r.division_id === divisionId)
            : b,
        );
        setOrsEntries(o);
        const prNos = [
          ...new Set(
            (o ?? []).map((x) => String(x.pr_no ?? "")).filter(Boolean),
          ),
        ];
        if (prNos.length === 0) {
          setPrStatusByNo({});
        } else {
          const { data: prRows, error: prErr } = await supabase
            .from("purchase_requests")
            .select("pr_no, status_id")
            .in("pr_no", prNos);
          if (prErr) throw prErr;
          const map: Record<string, number> = {};
          for (const r of prRows ?? []) {
            const k = String((r as any).pr_no ?? "");
            if (!k) continue;
            map[k] = Number((r as any).status_id) || 0;
          }
          setPrStatusByNo(map);
        }
      } catch (e: any) {
        Alert.alert("Load error", e?.message ?? "Could not fetch budget data");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [year, isEndUser, divisionId],
  );

  useEffect(() => {
    load();
  }, [load]);

  // ── Derived totals ────────────────────────────────────────────────────────

  const totalAllocated = budgets.reduce((s, r) => s + r.allocated, 0);

  // Calculate utilized amount from ORS entries instead of budget utilized field
  const totalUtilized = orsEntries.reduce((s, entry) => s + entry.amount, 0);

  const totalRemaining = totalAllocated - totalUtilized;
  const utilizationPct =
    totalAllocated > 0 ? Math.round((totalUtilized / totalAllocated) * 100) : 0;

  // ── Allocation handlers (passed down to DivisionBudgetSection) ────────────

  const handleUpdateAllocation = async (
    id: string,
    yr: number,
    amount: number,
    notes: string,
  ) => {
    await updateDivisionBudget(id, yr, amount, notes);
    await load(true);
  };

  const handleInsertAllocation = async (
    divId: number,
    yr: number,
    amount: number,
    notes: string,
  ) => {
    await insertDivisionBudget(divId, yr, amount, notes);
    await load(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#064E3B" />
        <Text className="text-[13px] text-gray-400 mt-3">
          Loading budget data…
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* ── Page header ── */}
      <View className="bg-[#064E3B] px-4 pt-3.5 pb-4">
        <View className="flex-row items-start justify-between">
          <View>
            <Text className="text-[9.5px] font-semibold tracking-widest uppercase text-white/40">
              DAR · Procurement
            </Text>
            <Text className="text-[20px] font-extrabold text-white">
              Budget Management
            </Text>
            <Text className="text-[12px] text-white/50 mt-0.5">
              Monitor allocation and utilization across divisions
            </Text>
          </View>
          {/* Year selector */}
          <TouchableOpacity
            onPress={() => setYearPickerOpen(true)}
            activeOpacity={0.8}
            className="flex-row items-center gap-1.5 bg-white/10 rounded-xl px-3 py-2 mt-1"
            style={{ borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" }}
          >
            <Text
              className="text-[13px] font-bold text-white"
              style={{ fontFamily: MONO }}
            >
              FY {year}
            </Text>
            <MaterialIcons
              name="keyboard-arrow-down"
              size={16}
              color="rgba(255,255,255,0.7)"
            />
          </TouchableOpacity>
        </View>

        {/* Role badge */}
        <View
          className={`self-start mt-2.5 px-2.5 py-1 rounded-lg ${canEdit ? "bg-emerald-700" : "bg-white/10"}`}
        >
          <View className="flex-row items-center gap-1">
            <MaterialIcons
              name={canEdit ? "edit" : "visibility"}
              size={12}
              color="rgba(255,255,255,0.85)"
            />
            <Text className="text-[10px] font-bold text-white/80 uppercase tracking-wide">
              {canEdit ? "Edit Access" : "Read-Only"}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(true);
            }}
            tintColor="#064E3B"
          />
        }
      >
        {/* ── Summary strip ── */}
        <View className="flex-row gap-2.5 mb-3">
          {/* Allocated */}
          <View
            className="flex-1 bg-white rounded-2xl p-3.5 border border-gray-200"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
              elevation: 2,
            }}
          >
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
              Total Allocated
            </Text>
            <Text className="text-[17px] font-extrabold text-[#064E3B]">
              <Text>{"\u20B1"}</Text>
              <Text style={{ fontFamily: MONO }}>{fmt(totalAllocated)}</Text>
            </Text>
            <Text className="text-[10px] text-gray-400 mt-1">
              Annual Procurement Plan {year}
            </Text>
          </View>

          {/* Utilized */}
          <View
            className="flex-1 bg-white rounded-2xl p-3.5 border border-gray-200"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
              elevation: 2,
            }}
          >
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
              Total Utilized
            </Text>
            <Text className="text-[17px] font-extrabold text-[#10b981]">
              <Text>{"\u20B1"}</Text>
              <Text style={{ fontFamily: MONO }}>{fmt(totalUtilized)}</Text>
            </Text>
            <View className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
              <View
                className="h-full rounded-full bg-[#10b981]"
                style={{ width: `${utilizationPct}%` }}
              />
            </View>
            <Text className="text-[10px] text-gray-400 mt-1">
              {utilizationPct}% of total budget
            </Text>
          </View>

          {/* Remaining */}
          <View
            className="flex-1 bg-white rounded-2xl p-3.5 border border-gray-200"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
              elevation: 2,
            }}
          >
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
              Remaining
            </Text>
            <Text
              className={`text-[17px] font-extrabold ${
                totalRemaining < 0 ? "text-red-500" : "text-amber-500"
              }`}
            >
              <Text>{"\u20B1"}</Text>
              <Text style={{ fontFamily: MONO }}>
                {fmt(Math.abs(totalRemaining))}
              </Text>
            </Text>
            <Text className="text-[10px] text-gray-400 mt-1">
              Available for procurement
            </Text>
          </View>
        </View>

        {/* ── Budget by Division (DivisionBudgetModule) ── */}
        <DivisionBudgetSection
          budgets={budgets}
          year={year}
          canEdit={canEdit}
          onUpdate={handleUpdateAllocation}
          onInsert={handleInsertAllocation}
          orsEntries={orsEntries}
        />

        {/* ── ORS Processing (ORSModule) ── */}
        <ORSSection
          orsEntries={orsEntries}
          year={year}
          canEdit={canEditOrs}
          isEndUser={isEndUser}
          budgets={budgets}
          prStatusByNo={prStatusByNo}
          currentUserId={currentUser?.id}
          onSave={async () => {}}
          onDelete={() => {}}
        />

        {/* ── Read-only notice ── */}
        {!canEdit && (
          <View className="flex-row items-center gap-2.5 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
            <MaterialIcons name="info" size={16} color="#1d4ed8" />
            <Text className="flex-1 text-[12px] text-blue-800 leading-5">
              {isEndUser
                ? "You are viewing your division's budget summary. Contact the Budget office to request changes."
                : "You have read-only access to the budget module."}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ── Year picker modal ── */}
      <YearPickerModal
        visible={yearPickerOpen}
        selected={year}
        onSelect={setYear}
        onClose={() => setYearPickerOpen(false)}
      />
    </View>
  );
}
