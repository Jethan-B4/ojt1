import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../AuthContext';
import CanvassingModule from './CanvassingModule';
import DashboardScreen from './dashboard';
import ReactScreen from './index';
import ProcurementScreen from './procurement';

export default function TabLayout() {
  const { handleSignOut } = useAuth();
  const Drawer = createDrawerNavigator();

  return (
    <Drawer.Navigator
      initialRouteName="Dashboard"
      screenOptions={{
        drawerActiveTintColor: '#ffffff',
        drawerActiveBackgroundColor: '#10B981',
        drawerLabelStyle: {
          color: '#CBD5E1',
          // fontSize: 20,
          // fontFamily: 'Georgia',
        },
        drawerStyle: {
          borderRadius: 0,
          backgroundColor: '#064E3B',
        },
        headerShown: true,
        headerStyle: { height: 60 },
        headerTitle: '',
        drawerContentStyle: { paddingBottom: 12 },
        header: ({ navigation }) => <BrandHeader navigation={navigation} />,
      }}
      drawerContent={(props) => <CustomDrawer {...props} />}>
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
        name="React"
        component={ReactScreen}
        options={{
          title: 'Explore',
          drawerIcon: ({ color, size }) => (
            <MaterialIcons name="explore" size={size} color={color} />
          ),
        }}
      />
      {/* <Drawer.Screen
        name="Create PR"
        component={PurchaseRequestModal}
        options={{
          title: 'Create Purchase Request',
          drawerIcon: ({ color, size }) => (
            <MaterialIcons name="create" size={size} color={color} /> 
          ),
        }}
      /> */}
      <Drawer.Screen
        name="Canvassing"
        component={CanvassingModule}
        options={{
          title: 'Canvassing',
          drawerIcon: ({ color, size }) => (
            <MaterialIcons name="create" size={size} color={color} /> 
          ),
        }}
      />
      {/* Logout Screen */}
      <Drawer.Screen
        name="Logout"
        component={LogoutScreen}
        listeners={{
          drawerItemPress: (e) => {
            e.preventDefault();
            handleSignOut();
          },
        }}
      />
      {/* <Drawer.Screen name="modal" options={{ title: 'Modal' }} /> */}
    </Drawer.Navigator>
  );
}

function LogoutScreen() {
  return null;
}

function BrandHeader({ navigation }: any) {
  const [query, setQuery] = React.useState('');
  return (
    <View
      style={{
        backgroundColor: '#064E3B',
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          onPress={() => navigation?.openDrawer?.()}
          style={{
            height: 40,
            width: 40,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <MaterialIcons name="menu" size={24} color="#ffffff" />
        </Pressable>
        {/* <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#ffffff',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#e5e7eb',
            height: 40,
            paddingHorizontal: 10,
            gap: 6,
          }}>
          <MaterialIcons name="search" size={20} color="#9ca3af" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor="#9ca3af"
            style={{ flex: 1, fontSize: 16 }}
            returnKeyType="search"
          />
        </View> */}
        <Pressable
          style={{
            height: 40,
            width: 40,
            borderRadius: 20,
            backgroundColor: '#ffffff',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: '#e5e7eb',
          }}>
          <MaterialIcons name="calendar-month" size={22} color="#064E3B" />
        </Pressable>
        <Pressable
          style={{
            height: 40,
            width: 40,
            borderRadius: 20,
            backgroundColor: '#ffffff',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: '#e5e7eb',
          }}>
          <MaterialIcons name="notifications" size={22} color="#064E3B" />
        </Pressable>
      </View>
    </View>
  );
}

function CustomDrawer(props: any) {
  const { currentUser } = useAuth();
  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={{ backgroundColor: '#064E3B', flexGrow: 1 }}>
      <View
        style={{
          alignItems: 'center',
          paddingVertical: 24,
          paddingHorizontal: 20,
          backgroundColor: '#064E3B',
        }}>
        <Image
          source={require('@/assets/images/dar.png')}
          style={{ height: 64, width: 64, borderRadius: 32, backgroundColor: '#ffffff' }}
          contentFit="contain"
        />
        <Text style={{ marginTop: 12, fontSize: 18, fontWeight: '700', color: '#ffffff' }}>
          DAR Procurement
        </Text>
        <Text style={{ marginTop: 4, fontSize: 13, color: '#A7F3D0', textAlign: 'center' }}>
          Monitoring & Automation System
        </Text>
      </View>
      <View style={{ height: 1, backgroundColor: '#047857', marginVertical: 12 }} />
      <View style={{ flexGrow: 1 }}>
        <DrawerItemList {...props} />
      </View>
      {currentUser && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: '#047857',
            paddingHorizontal: 20,
            paddingVertical: 16,
          }}>
          <Text style={{ fontSize: 11, color: '#A7F3D0' }}>Logged in as:</Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#ffffff' }}>
            {currentUser.username}
          </Text>
        </View>
      )}
    </DrawerContentScrollView>
  );
}
