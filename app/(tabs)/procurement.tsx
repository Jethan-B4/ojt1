import { Button } from '@react-navigation/elements';
import { useNavigation } from '@react-navigation/native';
import { View } from 'react-native';

export default function ProcurementScreen() {
  const navigation = useNavigation();

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Button onPress={() => navigation.navigate('Dashboard' as never)}>
        Go to Dashboard
      </Button>
    </View>
  );
}
