/* eslint-disable import/namespace, import/no-named-as-default, import/no-named-as-default-member */
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItemList,
} from "@react-navigation/drawer";
import { Image } from "expo-image";
import React, { useState } from "react";
import { Pressable, Text, TouchableOpacity, View } from "react-native";

import type { CanvassingPR } from "@/types/canvassing";
import CalendarModal from "../(modals)/CalendarModal";
import { useAuth } from "../AuthContext";
import CanvassingModule from "./CanvassingModule";
import DashboardScreen from "./dashboard";
import ReactScreen from "./index";
import ProcurementScreen from "./procurement";

// ─── CanvassingScreen wrapper ─────────────────────────────────────────────────
// Adapts the Drawer's navigation system to CanvassingModule's props.
//
// Called from ProcurementContent after a PR is approved:
//   navigation.navigate("Canvassing", { prRecord: <CanvassingPR> })
//
// Called directly from the Drawer (no params) → uses built-in placeholder.
function CanvassingScreen({ navigation, route }: any) {
  const prRecord: CanvassingPR | undefined = route?.params?.prRecord;
  return (
    <CanvassingModule
      prRecord={prRecord}
      onBack={() => navigation.goBack()}
      onComplete={(payload) => {
        // Surface completed session back to ProcurementContent so it can
        // advance the PR from Phase 1 → Phase 2.
        navigation.navigate("Procurement", { canvassPayload: payload });
      }}
    />
  );
}

// ─── Drawer navigator ─────────────────────────────────────────────────────────

export default function TabLayout() {
  const { handleSignOut } = useAuth();
  const Drawer = createDrawerNavigator();
  const [calendarOpen, setCalendarOpen] = useState(false);

  return (
    <>
      <Drawer.Navigator
        initialRouteName="Dashboard"
        screenOptions={{
          drawerActiveTintColor:       "#ffffff",
          drawerActiveBackgroundColor: "#10B981",
          drawerLabelStyle:   { color: "#CBD5E1" },
          drawerStyle:        { borderRadius: 0, backgroundColor: "#064E3B" },
          drawerContentStyle: { paddingBottom: 12 },
          headerShown: true,
          headerStyle: { height: 60 },
          headerTitle: "",
          header: ({ navigation }) => (
            <BrandHeader navigation={navigation} onCalendarPress={() => setCalendarOpen(true)} />
          ),
        }}
        drawerContent={(props) => <CustomDrawer {...props} onSignOut={handleSignOut} />}
      >
        <Drawer.Screen name="Dashboard" component={DashboardScreen}
          options={{ drawerIcon: ({ color, size }) => <MaterialIcons name="space-dashboard" size={size} color={color} /> }} />
        <Drawer.Screen name="Procurement" component={ProcurementScreen}
          options={{ drawerIcon: ({ color, size }) => <MaterialIcons name="shopping-bag" size={size} color={color} /> }} />
        <Drawer.Screen name="React" component={ReactScreen}
          options={{ title: "Explore", drawerIcon: ({ color, size }) => <MaterialIcons name="explore" size={size} color={color} /> }} />
        <Drawer.Screen name="Canvassing" component={CanvassingScreen}
          options={{ title: "Canvassing", drawerIcon: ({ color, size }) => <MaterialIcons name="create" size={size} color={color} /> }} />

      </Drawer.Navigator>

      <CalendarModal visible={calendarOpen} onClose={() => setCalendarOpen(false)}
        onSelectDate={(date) => { console.log("Selected:", date.toISOString()); setCalendarOpen(false); }} />
    </>
  );
}


function BrandHeader({ navigation, onCalendarPress }: { navigation: any; onCalendarPress: () => void }) {
  return (
    <View style={{ backgroundColor: "#064E3B", paddingHorizontal: 12, paddingVertical: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable onPress={() => navigation?.openDrawer?.()}
          style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center" }}>
          <MaterialIcons name="menu" size={24} color="#ffffff" />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onCalendarPress}
          style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: "#ffffff",
            alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e5e7eb" }}>
          <MaterialIcons name="calendar-month" size={22} color="#064E3B" />
        </Pressable>
        <Pressable style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: "#ffffff",
          alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e5e7eb" }}>
          <MaterialIcons name="notifications" size={22} color="#064E3B" />
        </Pressable>
      </View>
    </View>
  );
}

function CustomDrawer(props: any & { onSignOut: () => void }) {
  const { currentUser } = useAuth();
  const { onSignOut } = props;
  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ backgroundColor: "#064E3B", flexGrow: 1 }}>
      {/* ── App branding ── */}
      <View style={{ alignItems: "center", paddingVertical: 24, paddingHorizontal: 20, backgroundColor: "#064E3B" }}>
        <Image source={require("@/assets/images/dar.png")}
          style={{ height: 64, width: 64, borderRadius: 32, backgroundColor: "#ffffff" }}
          contentFit="contain" />
        <Text style={{ marginTop: 12, fontSize: 18, fontWeight: "700", color: "#ffffff" }}>DAR Procurement</Text>
        <Text style={{ marginTop: 4, fontSize: 13, color: "#A7F3D0", textAlign: "center" }}>
          Monitoring & Automation System
        </Text>
      </View>

      <View style={{ height: 1, backgroundColor: "#047857", marginVertical: 12 }} />

      {/* ── Nav items ── */}
      <View style={{ flexGrow: 1 }}><DrawerItemList {...props} /></View>

      {/* ── User identity card ── */}
      {currentUser && (
        <View style={{ borderTopWidth: 1, borderTopColor: "#047857", margin: 12, borderRadius: 14,
          backgroundColor: "rgba(255,255,255,0.06)", padding: 14 }}>

          {/* Avatar row */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <View style={{ width: 38, height: 38, borderRadius: 19,
              backgroundColor: "#10B981", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: "#ffffff" }}>
                {currentUser.username?.charAt(0).toUpperCase() ?? "?"}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#ffffff" }} numberOfLines={1}>
                {currentUser.username}
              </Text>
              <Text style={{ fontSize: 11, color: "#A7F3D0", marginTop: 1 }} numberOfLines={1}>
                {currentUser.email ?? currentUser.user_id}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: "#047857", marginBottom: 10 }} />

          {/* Role badge */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: "600", color: "#6ee7b7", textTransform: "uppercase", letterSpacing: 0.6 }}>
              Role
            </Text>
             <Text style={{ fontSize: 11, fontWeight: "600", color: "#ffffff", flexShrink: 1, textAlign: "right", maxWidth: "65%", marginTop: 4 }} numberOfLines={2}>
              {currentUser.role_name ?? `Role ID ${currentUser.role_id}`}
            </Text>
            {/* <View style={{flexShrink: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#10B981", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
              <Text style={{ flexShrink: 1, alignSelf: "center", justifyContent: "center", fontSize: 11, fontWeight: "700", color: "#ffffff" }}>
                {currentUser.role_name ?? `Role ID ${currentUser.role_id}`}
              </Text>
            </View> */}
          </View>

          {/* Division */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 10, fontWeight: "600", color: "#6ee7b7", textTransform: "uppercase", letterSpacing: 0.6 }}>
              Division
            </Text>
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#ffffff", flexShrink: 1, textAlign: "right", maxWidth: "65%" }} numberOfLines={2}>
              {currentUser.division_name ?? `Division ${currentUser.division_id}`}
            </Text>
          </View>
        </View>
      )}

      {/* ── Logout button ── */}
      <TouchableOpacity
        onPress={onSignOut}
        activeOpacity={0.75}
        style={{
          flexDirection: "row", alignItems: "center", gap: 12,
          marginHorizontal: 12, marginBottom: 16, marginTop: 4,
          paddingHorizontal: 16, paddingVertical: 13,
          borderRadius: 12,
          backgroundColor: "rgba(239,68,68,0.12)",
          borderWidth: 1, borderColor: "rgba(239,68,68,0.25)",
        }}>
        <MaterialIcons name="logout" size={20} color="#f87171" />
        <Text style={{ fontSize: 13, fontWeight: "700", color: "#f87171", flex: 1 }}>
          Sign Out
        </Text>
        <MaterialIcons name="chevron-right" size={16} color="#f87171" />
      </TouchableOpacity>
    </DrawerContentScrollView>
  );
}
