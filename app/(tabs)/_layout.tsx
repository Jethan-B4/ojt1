/* eslint-disable import/namespace, import/no-named-as-default, import/no-named-as-default-member */
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItem,
  DrawerItemList,
} from "@react-navigation/drawer";
import { Image } from "expo-image";
import * as Notifications from "expo-notifications";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, TouchableOpacity, View } from "react-native";
import "../global-typography";

import { supabase } from "@/lib/supabase/client";
import { bootstrapNotifications } from "@/lib/supabase/notifications";
import { BrandHeaderWithFiscalYear } from "../(components)/BrandHeaderWithFiscalYear";
import CalendarModal from "../(modals)/CalendarModal";
import { useAuth } from "../contexts/AuthContext";
import { FiscalYearProvider } from "../contexts/FiscalYearContext";
import BudgetScreen from "./budget";
import CanvassingModule from "./CanvassingModule";
import DashboardScreen from "./dashboard";
import ProcurementScreen from "./procurement";
import ProcurementLog from "./ProcurementLog";
import UserManagementScreen from "./UserManagement";

// ─── Drawer navigator ─────────────────────────────────────────────────────────

export default function TabLayout() {
  const { handleSignOut } = useAuth();
  const Drawer = createDrawerNavigator();

  // ── Notification bootstrap ──────────────────────────────────────────────────
  // Run once after mount: request permission + create the Android channel.
  // Attach a tap listener so future screens can deep-link from notifications.
  const notifListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // 1. Request permission + create Android channel
    bootstrapNotifications().then((granted) => {
      if (!granted) {
        console.warn(
          "[Notifications] Permission not granted — local notifications will be suppressed.",
        );
      }
    });

    // 2. Log notifications received while app is foregrounded (optional).
    notifListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log("[Notification received]", notification.request.content);
      },
    );

    // 3. Handle taps on notifications (foreground or background).
    //    Extend this handler to navigate to the relevant screen.
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as Record<
          string,
          any
        >;
        console.log("[Notification tapped]", data);
        // Example deep-link pattern (wire up navigation ref if needed):
        // if (data.type === "pr_created" || data.type === "pr_status_changed") {
        //   navigationRef.navigate("Procurement");
        // } else if (data.type === "po_created" || data.type === "po_status_changed") {
        //   navigationRef.navigate("Budget");
        // }
      });

    return () => {
      notifListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return (
    <FiscalYearProvider>
      <Drawer.Navigator
        initialRouteName="Dashboard"
        detachInactiveScreens={true}
        screenOptions={{
          drawerActiveTintColor: "#ffffff",
          drawerActiveBackgroundColor: "#10B981",
          drawerLabelStyle: { color: "#CBD5E1" },
          drawerStyle: { borderRadius: 0, backgroundColor: "#064E3B" },
          drawerContentStyle: { paddingBottom: 12 },
          headerShown: true,
          headerStyle: { height: 60 },
          headerTitle: "",
          header: ({ navigation }) => {
            // Check if current route is procurement to show fiscal year filter
            const currentRoute = navigation.getState()?.routes[navigation.getState()?.index]?.name;
            const showFiscalYear = currentRoute === "Procurement";
            return <BrandHeaderWithFiscalYear navigation={navigation} showFiscalYear={showFiscalYear} />;
          },
        }}
        drawerContent={(props) => (
          <CustomDrawer {...props} onSignOut={handleSignOut} />
        )}
      >
      <Drawer.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          drawerIcon: ({ color, size }) => (
            <MaterialIcons name="space-dashboard" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="Procurement"
        component={ProcurementScreen}
        options={{
          drawerIcon: ({ color, size }) => (
            <MaterialIcons name="shopping-bag" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="Budget"
        component={BudgetScreen}
        options={{
          title: "Budget",
          drawerIcon: ({ color, size }) => (
            <MaterialIcons
              name="account-balance-wallet"
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Drawer.Screen
        name="ProcurementLog"
        component={ProcurementLog}
        options={{
          title: "Procurement Log",
          drawerIcon: ({ color, size }) => (
            <MaterialIcons name="history" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="UserManagement"
        component={UserManagementScreen}
        options={{
          title: "User Management",
          drawerItemStyle: { display: "none" },
        }}
      />
      <Drawer.Screen
        name="Canvassing"
        component={CanvassingScreen}
        options={{ title: "Canvassing", drawerItemStyle: { display: "none" } }}
      />
      </Drawer.Navigator>
    </FiscalYearProvider>
  );
}

function CanvassingScreen({ navigation, route }: any) {
  const prNo: string | undefined = route?.params?.prNo;
  const targetStage: string | undefined = route?.params?.targetStage;
  return (
    <CanvassingModule
      prNo={prNo}
      targetStage={targetStage}
      onBack={() =>
        navigation.navigate("Procurement", { activeSubTab: "canvass" })
      }
      onComplete={(payload) =>
        navigation.navigate("Procurement", {
          activeSubTab: "abstract_of_awards",
          canvassPayload: payload,
          prNo,
        })
      }
    />
  );
}

function BrandHeader({ navigation }: { navigation: any }) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [prCreationDates, setPrCreationDates] = useState<Date[]>([]);

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

      <CalendarModal
        visible={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        onSelectDate={(date) => {
          console.log("Selected:", date.toISOString());
          setCalendarOpen(false);
        }}
        prCreationDates={prCreationDates}
      />
    </>
  );
}

function CustomDrawer(props: any & { onSignOut: () => void }) {
  const { currentUser } = useAuth();
  const { onSignOut } = props;
  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={{ backgroundColor: "#064E3B", flexGrow: 1 }}
    >
      {/* ── App branding ── */}
      <View
        style={{
          alignItems: "center",
          paddingVertical: 24,
          paddingHorizontal: 20,
          backgroundColor: "#064E3B",
        }}
      >
        <Image
          source={require("@/assets/images/dar.png")}
          style={{
            height: 64,
            width: 64,
            borderRadius: 32,
            backgroundColor: "#ffffff",
          }}
          contentFit="contain"
        />
        <Text
          style={{
            marginTop: 12,
            fontSize: 18,
            fontWeight: "700",
            color: "#ffffff",
          }}
        >
          DAR Procurement
        </Text>
        <Text
          style={{
            marginTop: 4,
            fontSize: 13,
            color: "#A7F3D0",
            textAlign: "center",
          }}
        >
          Monitoring & Automation System
        </Text>
      </View>

      <View
        style={{ height: 1, backgroundColor: "#047857", marginVertical: 12 }}
      />

      {/* ── Nav items ── */}
      <View style={{ flexGrow: 1 }}>
        <DrawerItemList {...props} />

        {/* Admin-only: User Management */}
        {currentUser?.role_id === 1 && (
          <DrawerItem
            label="User Management"
            onPress={() => props.navigation.navigate("UserManagement")}
            icon={({ color, size }) => (
              <MaterialIcons name="manage-accounts" size={size} color={color} />
            )}
            focused={
              props.state.routes[props.state.index].name === "UserManagement"
            }
            activeTintColor="#ffffff"
            activeBackgroundColor="#10B981"
            inactiveTintColor="#CBD5E1"
            labelStyle={{ color: "#CBD5E1" }}
          />
        )}
      </View>

      {/* ── User identity card ── */}
      {currentUser && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: "#047857",
            margin: 12,
            borderRadius: 14,
            backgroundColor: "rgba(255,255,255,0.06)",
            padding: 14,
          }}
        >
          {/* Avatar row */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: "#10B981",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{ fontSize: 16, fontWeight: "800", color: "#ffffff" }}
              >
                {currentUser.fullname?.charAt(0).toUpperCase() ?? "?"}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontSize: 13, fontWeight: "700", color: "#ffffff" }}
                numberOfLines={1}
              >
                {currentUser.fullname}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View
            style={{ height: 1, backgroundColor: "#047857", marginBottom: 10 }}
          />

          {/* Role badge */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "600",
                color: "#6ee7b7",
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              Role
            </Text>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: "#ffffff",
                flexShrink: 1,
                textAlign: "right",
                maxWidth: "65%",
                marginTop: 4,
              }}
              numberOfLines={2}
            >
              {currentUser.role_name ?? `Role ID ${currentUser.role_id}`}
            </Text>
          </View>

          {/* Division */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "600",
                color: "#6ee7b7",
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              Division
            </Text>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: "#ffffff",
                flexShrink: 1,
                textAlign: "right",
                maxWidth: "65%",
              }}
              numberOfLines={2}
            >
              {currentUser.division_name ??
                `Division ${currentUser.division_id}`}
            </Text>
          </View>
        </View>
      )}

      {/* ── Logout button ── */}
      <TouchableOpacity
        onPress={onSignOut}
        activeOpacity={0.75}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginHorizontal: 12,
          marginBottom: 16,
          marginTop: 4,
          paddingHorizontal: 16,
          paddingVertical: 13,
          borderRadius: 12,
          backgroundColor: "rgba(239,68,68,0.12)",
          borderWidth: 1,
          borderColor: "rgba(239,68,68,0.25)",
        }}
      >
        <MaterialIcons name="logout" size={20} color="#f87171" />
        <Text
          style={{
            fontSize: 13,
            fontWeight: "700",
            color: "#f87171",
            flex: 1,
          }}
        >
          Sign Out
        </Text>
        <MaterialIcons name="chevron-right" size={16} color="#f87171" />
      </TouchableOpacity>
    </DrawerContentScrollView>
  );
}
