import { View } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import { Button } from '@react-navigation/elements';

function DashboardScreen() {
  const navigation = useNavigation();

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Button onPress={() => navigation.navigate('Procurement' as never)}>
        Go to Procurement
      </Button>
    </View>
  );
}

function ProcurementScreen() {
  const navigation = useNavigation();

  return (
    <View className="flex-1 items-center justify-center">
      <Button onPress={() => navigation.goBack()}>Go back to Dashboard</Button>
    </View>
  );
}

const Drawer = createDrawerNavigator();

export default function App() {
  return (
    <Drawer.Navigator initialRouteName="Dashboard" >
      <Drawer.Screen name="Dashboard" component={DashboardScreen} />
      <Drawer.Screen name="Procurement" component={ProcurementScreen} />
    </Drawer.Navigator>
  );
}
