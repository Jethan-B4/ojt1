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
  const { year, setYearPickerOpen, yearPickerOpen, CURRENT_YEAR } = useFiscalYear();

  // ── Fetch PR creation dates for calendar ───────────────────────────────────────────
  useEffect(() => {
    const fetchPRCreationDates = async () => {
      try {
        const { data, error } = await supabase
          .from("purchase_requests")
          .select('created_at')
          .not('created_at', 'is', null);
        
        if (error) {
          console.error('Error fetching PR dates:', error);
          return;
        }
        
        const dates = data?.map((pr: { created_at: string }) => new Date(pr.created_at)) || [];
        setPrCreationDates(dates);
      } catch (err) {
        console.error('Error fetching PR dates:', err);
      }
    };
    
    fetchPRCreationDates();
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
          setCalendarOpen(false);
        }}
        prCreationDates={prCreationDates}
      />

      <YearPickerModal
        visible={yearPickerOpen}
        onClose={() => setYearPickerOpen(false)}
      />
    </>
  );
}
