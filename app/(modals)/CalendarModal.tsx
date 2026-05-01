/**
 * CalendarModal.tsx
 *
 * A self-contained calendar modal. Shows the current month with
 * day-of-week headers, navigable prev/next month arrows, and
 * highlights today. Selecting a day calls onSelectDate.
 *
 * Usage:
 *   <CalendarModal visible={open} onClose={() => setOpen(false)} />
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useMemo, useState } from "react";
import {
    Modal, Pressable, ScrollView, Text, TouchableOpacity, View,
} from "react-native";

export interface CalendarModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called when the user taps a day. Receives a Date set to midnight local time. */
  onSelectDate?: (date: Date) => void;
  /** Initial date to highlight (defaults to today) */
  initialDate?: Date;
  /** Array of dates when PRs were created to show indicators */
  prCreationDates?: Date[];
  /** Array of dates when POs were created to show indicators */
  poCreationDates?: Date[];
  /** Array of dates when Deliveries were created to show indicators */
  deliveryCreationDates?: Date[];
  /** Array of dates when Payments were started (from delivery status change) to show indicators */
  paymentCreationDates?: Date[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay(); // 0 = Sunday
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

// ─── CalendarModal ────────────────────────────────────────────────────────────

export function CalendarModal({
  visible, onClose, onSelectDate, initialDate, 
  prCreationDates = [],
  poCreationDates = [],
  deliveryCreationDates = [],
  paymentCreationDates = [],
}: CalendarModalProps) {
  const today     = useMemo(() => new Date(), []);
  const [cursor,  setCursor]   = useState(() => initialDate ?? new Date());
  const [selected, setSelected] = useState<Date | null>(initialDate ?? null);

  const year  = cursor.getFullYear();
  const month = cursor.getMonth();

  const totalDays  = daysInMonth(year, month);
  const startDay   = firstDayOfMonth(year, month);
  // Pad the grid so it starts on the correct weekday
  const cells: (number | null)[] = [
    ...Array(startDay).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  // Round up to complete weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => setCursor(new Date(year, month - 1, 1));
  const nextMonth = () => setCursor(new Date(year, month + 1, 1));

  const handleDay = (day: number) => {
    const date = new Date(year, month, day);
    setSelected(date);
    onSelectDate?.(date);
  };

  // Helper to get counts for a specific date
  const getCountsForDate = useCallback((date: Date) => {
    const countPR = prCreationDates.filter(d => isSameDay(d, date)).length;
    const countPO = poCreationDates.filter(d => isSameDay(d, date)).length;
    const countDelivery = deliveryCreationDates.filter(d => isSameDay(d, date)).length;
    const countPayment = paymentCreationDates.filter(d => isSameDay(d, date)).length;
    return { countPR, countPO, countDelivery, countPayment };
  }, [prCreationDates, poCreationDates, deliveryCreationDates, paymentCreationDates]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Backdrop */}
      <Pressable className="flex-1 bg-black/50 items-center justify-center px-4"
        onPress={onClose}>
        {/* Card — stop propagation so taps inside don't close */}
        <Pressable onPress={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl w-full max-w-sm overflow-hidden"
          style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
                   shadowOpacity: 0.18, shadowRadius: 24, elevation: 12 }}>

          {/* ── Header ── */}
          <View className="px-5 pt-5 pb-4 bg-[#064E3B]">
            <View className="flex-row items-center justify-between mb-1">
              <TouchableOpacity onPress={prevMonth} hitSlop={12}
                className="w-8 h-8 rounded-full bg-white/15 items-center justify-center">
                <MaterialIcons name="chevron-left" size={20} color="#ffffff" />
              </TouchableOpacity>

              <View className="items-center">
                <Text className="text-white text-[18px] font-bold">
                  {MONTH_NAMES[month]}
                </Text>
                <Text className="text-white/50 text-[12px] font-semibold">{year}</Text>
              </View>

              <TouchableOpacity onPress={nextMonth} hitSlop={12}
                className="w-8 h-8 rounded-full bg-white/15 items-center justify-center">
                <MaterialIcons name="chevron-right" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {/* Day headers */}
            <View className="flex-row mt-3">
              {DAY_HEADERS.map((d) => (
                <View key={d} className="flex-1 items-center">
                  <Text className="text-[11px] font-bold uppercase tracking-wide text-white/40">{d}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Grid ── */}
          <ScrollView scrollEnabled={false} className="px-3 py-3">
            {Array.from({ length: cells.length / 7 }, (_, row) => (
              <View key={row} className="flex-row mb-1">
                {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                  if (!day) return <View key={col} className="flex-1 h-14" />;

                  const thisDate  = new Date(year, month, day);
                  const isToday   = isSameDay(thisDate, today);
                  const isSel     = selected ? isSameDay(thisDate, selected) : false;
                  const isPast    = thisDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                  const hasPR     = prCreationDates.some(date => isSameDay(date, thisDate));
                  const hasPO     = poCreationDates.some(date => isSameDay(date, thisDate));
                  const hasDelivery = deliveryCreationDates.some(date => isSameDay(date, thisDate));
                  const hasPayment = paymentCreationDates.some(date => isSameDay(date, thisDate));

                  return (
                    <TouchableOpacity
                      key={col}
                      onPress={() => handleDay(day)}
                      activeOpacity={0.7}
                      className={[
                        "flex-1 h-14 mx-0.5 rounded-xl items-center justify-center",
                        isSel   ? "bg-[#064E3B]"  :
                        isToday ? "bg-emerald-50 border border-emerald-400" :
                                  "",
                      ].join(" ")}
                    >
                      <View className="items-center gap-0.5">
                        <Text className={[
                          "text-[14px] font-semibold",
                          isSel   ? "text-white"       :
                          isToday ? "text-emerald-700"  :
                          isPast  ? "text-gray-300"     :
                                    "text-gray-700",
                        ].join(" ")}>
                          {day}
                        </Text>
                        <View className="flex-row gap-0.5">
                          {hasPR && <View className="w-1.5 h-1.5 bg-[#064E3B] rounded-full" />}
                          {hasPO && <View className="w-1.5 h-1.5 bg-[#8b5cf6] rounded-full" />}
                          {hasDelivery && <View className="w-1.5 h-1.5 bg-[#10b981] rounded-full" />}
                          {hasPayment && <View className="w-1.5 h-1.5 bg-[#f97316] rounded-full" />}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          {/* ── Selected date display + actions ── */}
          <View className="px-5 pb-5 pt-2 border-t border-gray-100">
            {/* Legend */}
            <View className="flex-row flex-wrap gap-3 mb-3 justify-center">
              <View className="flex-row items-center gap-1.5">
                <View className="w-2 h-2 bg-[#064E3B] rounded-full" />
                <Text className="text-[10px] font-semibold text-gray-500">PR</Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <View className="w-2 h-2 bg-[#8b5cf6] rounded-full" />
                <Text className="text-[10px] font-semibold text-gray-500">PO</Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <View className="w-2 h-2 bg-[#10b981] rounded-full" />
                <Text className="text-[10px] font-semibold text-gray-500">Delivery</Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <View className="w-2 h-2 bg-[#f97316] rounded-full" />
                <Text className="text-[10px] font-semibold text-gray-500">Payment</Text>
              </View>
            </View>
            <Text className="text-[12px] text-gray-400 mb-2 text-center">
              {selected
                ? selected.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
                : "Tap a date to select it"}
            </Text>
            {/* Count preview */}
            {selected && (() => {
              const counts = getCountsForDate(selected);
              const hasAny = counts.countPR + counts.countPO + counts.countDelivery + counts.countPayment > 0;
              return (
                <View className="mb-3">
                  {hasAny ? (
                    <View className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                      <Text className="text-[11px] font-bold text-gray-600 mb-2 text-center">Entries for this date</Text>
                      <View className="flex-row justify-around">
                        {counts.countPR > 0 && (
                          <View className="items-center">
                            <Text className="text-[18px] font-extrabold text-[#064E3B]">{counts.countPR}</Text>
                            <Text className="text-[10px] text-gray-500">PR</Text>
                          </View>
                        )}
                        {counts.countPO > 0 && (
                          <View className="items-center">
                            <Text className="text-[18px] font-extrabold text-[#8b5cf6]">{counts.countPO}</Text>
                            <Text className="text-[10px] text-gray-500">PO</Text>
                          </View>
                        )}
                        {counts.countDelivery > 0 && (
                          <View className="items-center">
                            <Text className="text-[18px] font-extrabold text-[#10b981]">{counts.countDelivery}</Text>
                            <Text className="text-[10px] text-gray-500">Delivery</Text>
                          </View>
                        )}
                        {counts.countPayment > 0 && (
                          <View className="items-center">
                            <Text className="text-[18px] font-extrabold text-[#f97316]">{counts.countPayment}</Text>
                            <Text className="text-[10px] text-gray-500">Payment</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ) : (
                    <Text className="text-[11px] text-gray-400 text-center">No entries for this date</Text>
                  )}
                </View>
              );
            })()}
            <View className="flex-row gap-2">
              <TouchableOpacity onPress={() => { setSelected(today); setCursor(today); }} activeOpacity={0.8}
                className="flex-1 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 items-center">
                <Text className="text-[13px] font-bold text-emerald-700">Today</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} activeOpacity={0.8}
                className="flex-1 py-2.5 rounded-xl bg-[#064E3B] items-center">
                <Text className="text-[13px] font-bold text-white">Done</Text>
              </TouchableOpacity>
            </View>
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default CalendarModal;
