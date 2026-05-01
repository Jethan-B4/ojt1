import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useEffect, useState } from "react";
import { Platform, Pressable, Text, TouchableOpacity, View } from "react-native";
import CalendarModal from "../(modals)/CalendarModal";
import { supabase } from "../../lib/supabase/client";
import { useFiscalYear } from "../contexts/FiscalYearContext";
import { YearPickerModal } from "./YearPickerModal";

interface BrandHeaderWithFiscalYearProps {
  navigation: any;
  showFiscalYear?: boolean;
}

export function BrandHeaderWithFiscalYear({ 
  navigation, 
  showFiscalYear = false 
}: BrandHeaderWithFiscalYearProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [prCreationDates, setPrCreationDates] = useState<Date[]>([]);
  const [poCreationDates, setPoCreationDates] = useState<Date[]>([]);
  const [deliveryCreationDates, setDeliveryCreationDates] = useState<Date[]>([]);
  const [paymentCreationDates, setPaymentCreationDates] = useState<Date[]>([]);
  const { year, setYearPickerOpen, yearPickerOpen, CURRENT_YEAR } = useFiscalYear();

  // ── Fetch PR, PO, Delivery, and Payment creation dates for calendar ──────────────────
  useEffect(() => {
    const fetchAllDates = async () => {
      try {
        // Fetch PR dates
        const { data: prData, error: prErr } = await supabase
          .from("purchase_requests")
          .select('created_at')
          .not('created_at', 'is', null);

        if (prErr) {
          console.error('Error fetching PR dates:', prErr);
        } else {
          const prDates = prData?.map((pr: { created_at: string }) => new Date(pr.created_at)) || [];
          setPrCreationDates(prDates);
        }

        // Fetch PO dates
        const { data: poData, error: poErr } = await supabase
          .from("purchase_orders")
          .select('created_at')
          .not('created_at', 'is', null);

        if (poErr) {
          console.error('Error fetching PO dates:', poErr);
        } else {
          const poDates = poData?.map((po: { created_at: string }) => new Date(po.created_at)) || [];
          setPoCreationDates(poDates);
        }

        // Fetch Delivery dates and derive Payment dates
        // Payment phase starts when delivery reaches status_id 35 (Completed Delivery Phase)
        const { data: deliveryData, error: deliveryErr } = await supabase
          .from("deliveries")
          .select('created_at, status_id, updated_at')
          .not('created_at', 'is', null);

        if (deliveryErr) {
          console.error('Error fetching delivery dates:', deliveryErr);
        } else {
          const delDates = deliveryData?.map((del: { created_at: string }) => new Date(del.created_at)) || [];
          setDeliveryCreationDates(delDates);

          // Derive payment dates: use updated_at for deliveries in Payment phase
          // Payment phase includes status_id 35 (Completed Delivery Phase) and 25-32, 36
          const payDates = (deliveryData ?? [])
            .filter((del: any) =>
              del.status_id !== null &&
              (del.status_id === 35 || (del.status_id >= 25 && del.status_id <= 32) || del.status_id === 36)
            )
            .map((del: any) => del.updated_at ? new Date(del.updated_at) : null)
            .filter((date: Date | null): date is Date => date !== null);
          setPaymentCreationDates(payDates);
        }
      } catch (err) {
        console.error('Error fetching calendar dates:', err);
      }
    };

    fetchAllDates();
  }, []);

  const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

  return (
    <>
      <View
        style={{
          backgroundColor: "#064E3B",
          paddingTop: 30,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            onPress={() => navigation?.openDrawer?.()}
            style={{
              height: 40,
              width: 40,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcons name="menu" size={24} color="#ffffff" />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => setCalendarOpen(true)}
            style={{
              height: 40,
              width: 40,
              borderRadius: 20,
              backgroundColor: "#ffffff",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "#e5e7eb",
            }}
          >
            <MaterialIcons name="calendar-month" size={22} color="#064E3B" />
          </Pressable>
        </View>
      </View>

      {/* Fiscal Year Filter - Only show when enabled */}
      {showFiscalYear && (
        <View
          style={{
            backgroundColor: "#064E3B",
            paddingHorizontal: 12,
            paddingBottom: 12,
          }}
        >
          <TouchableOpacity
            onPress={() => setYearPickerOpen(true)}
            activeOpacity={0.8}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: "rgba(255,255,255,0.1)",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.15)",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "bold",
                color: "#ffffff",
                fontFamily: MONO,
              }}
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
      )}

      <CalendarModal
        visible={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        onSelectDate={(date) => {
          console.log("Selected:", date.toISOString());
        }}
        prCreationDates={prCreationDates}
        poCreationDates={poCreationDates}
        deliveryCreationDates={deliveryCreationDates}
        paymentCreationDates={paymentCreationDates}
      />

      <YearPickerModal
        visible={yearPickerOpen}
        onClose={() => setYearPickerOpen(false)}
      />
    </>
  );
}
