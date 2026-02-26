import { Button } from '@react-navigation/elements';
import { useNavigation } from '@react-navigation/native';
import { View } from 'react-native';
import { useAuth } from '../AuthContext';

export default function DashboardScreen() {
  const { currentUser } = useAuth();
  const navigation = useNavigation();

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Button onPress={() => navigation.navigate('Procurement' as never)}>
        Go to Procurement
      </Button>
    </View>
  );
}
