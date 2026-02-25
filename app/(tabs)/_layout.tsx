import { createDrawerNavigator } from '@react-navigation/drawer';
import React from 'react';
import { useAuth } from '../AuthContext';
import DashboardScreen from './dashboard';
import ReactScreen from './index';
import ProcurementScreen from './procurement';

export default function TabLayout() {
  const { handleSignOut } = useAuth();
  const Drawer = createDrawerNavigator();

  return (
    <Drawer.Navigator initialRouteName="Dashboard" >
      <Drawer.Screen name="Dashboard" component={DashboardScreen} />
      <Drawer.Screen name="Procurement" component={ProcurementScreen} />
      <Drawer.Screen name="React" component={ReactScreen} />
      <Drawer.Screen
        name="Logout"
        component={LogoutScreen}
        options={{ title: 'Logout' }}
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
