import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItemList,
} from "@react-navigation/drawer";
import { Image } from "expo-image";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import CalendarModal from "../(modals)/CalendarModal";
import { useAuth } from "../AuthContext";
import CanvassingModule from "./CanvassingModule";
import DashboardScreen from "./dashboard";
import ReactScreen from "./index";
import ProcurementScreen from "./procurement";

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
            <BrandHeader
              navigation={navigation}
              onCalendarPress={() => setCalendarOpen(true)}
            />
          ),
        }}
        drawerContent={(props) => <CustomDrawer {...props} />}
      >
        <Drawer.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ drawerIcon: ({ color, size }) => <MaterialIcons name="space-dashboard" size={size} color={color} /> }}
        />
        <Drawer.Screen
          name="Procurement"
          component={ProcurementScreen}
          options={{ drawerIcon: ({ color, size }) => <MaterialIcons name="shopping-bag" size={size} color={color} /> }}
        />
        <Drawer.Screen
          name="React"
          component={ReactScreen}
          options={{
            title: "Explore",
            drawerIcon: ({ color, size }) => <MaterialIcons name="explore" size={size} color={color} />,
          }}
        />
        <Drawer.Screen
          name="Canvassing"
          component={CanvassingModule}
          options={{
            title: "Canvassing",
            drawerIcon: ({ color, size }) => <MaterialIcons name="create" size={size} color={color} />,
          }}
        />
        <Drawer.Screen
          name="Logout"
          component={LogoutPlaceholder}
          listeners={{
            drawerItemPress: (e) => { e.preventDefault(); handleSignOut(); },
          }}
        />
      </Drawer.Navigator>

      {/* Calendar modal — rendered outside the navigator so it floats on top */}
      <CalendarModal
        visible={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        onSelectDate={(date) => {
          // Handle the selected date here (e.g. filter dashboard by date)
          console.log("Selected date:", date.toISOString());
          setCalendarOpen(false);
        }}
      />
    </>
  );
}

// ─── Placeholder component required by Drawer.Screen ─────────────────────────

function LogoutPlaceholder() {
  return null;
}

// ─── Header ───────────────────────────────────────────────────────────────────

function BrandHeader({
  navigation,
  onCalendarPress,
}: {
  navigation: any;
  onCalendarPress: () => void;
}) {
  return (
    <View style={{ backgroundColor: "#064E3B", paddingHorizontal: 12, paddingVertical: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {/* Drawer toggle */}
        <Pressable
          onPress={() => navigation?.openDrawer?.()}
          style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center" }}
        >
          <MaterialIcons name="menu" size={24} color="#ffffff" />
        </Pressable>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Calendar button — opens CalendarModal */}
        <Pressable
          onPress={onCalendarPress}
          style={{
            height: 40, width: 40, borderRadius: 20,
            backgroundColor: "#ffffff",
            alignItems: "center", justifyContent: "center",
            borderWidth: 1, borderColor: "#e5e7eb",
          }}
        >
          <MaterialIcons name="calendar-month" size={22} color="#064E3B" />
        </Pressable>

        {/* Notifications button */}
        <Pressable
          style={{
            height: 40, width: 40, borderRadius: 20,
            backgroundColor: "#ffffff",
            alignItems: "center", justifyContent: "center",
            borderWidth: 1, borderColor: "#e5e7eb",
          }}
        >
          <MaterialIcons name="notifications" size={22} color="#064E3B" />
        </Pressable>
      </View>
    </View>
  );
}

// ─── Custom drawer content ────────────────────────────────────────────────────

function CustomDrawer(props: any) {
  const { currentUser } = useAuth();
  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={{ backgroundColor: "#064E3B", flexGrow: 1 }}
    >
      {/* Logo + title */}
      <View style={{ alignItems: "center", paddingVertical: 24, paddingHorizontal: 20, backgroundColor: "#064E3B" }}>
        <Image
          source={require("@/assets/images/dar.png")}
          style={{ height: 64, width: 64, borderRadius: 32, backgroundColor: "#ffffff" }}
          contentFit="contain"
        />
        <Text style={{ marginTop: 12, fontSize: 18, fontWeight: "700", color: "#ffffff" }}>
          DAR Procurement
        </Text>
        <Text style={{ marginTop: 4, fontSize: 13, color: "#A7F3D0", textAlign: "center" }}>
          Monitoring & Automation System
        </Text>
      </View>

      <View style={{ height: 1, backgroundColor: "#047857", marginVertical: 12 }} />

      <View style={{ flexGrow: 1 }}>
        <DrawerItemList {...props} />
      </View>

      {/* Logged-in user */}
      {currentUser && (
        <View style={{ borderTopWidth: 1, borderTopColor: "#047857", paddingHorizontal: 20, paddingVertical: 16 }}>
          <Text style={{ fontSize: 11, color: "#A7F3D0" }}>Logged in as:</Text>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#ffffff" }}>
            {currentUser.username}
          </Text>
        </View>
      )}
    </DrawerContentScrollView>
  );
}
