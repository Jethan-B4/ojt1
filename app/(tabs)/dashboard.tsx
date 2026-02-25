import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@react-navigation/elements';
import { useNavigation } from '@react-navigation/native';
import { View } from 'react-native';
import { useAuth } from '../AuthContext';

export default function DashboardScreen() {
  const { currentUser, handleSignOut } = useAuth();
  const navigation = useNavigation();

  return (
    <View className="flex-1 items-center justify-center bg-white">
      {/* Display current user */}
      {currentUser && (
        <ThemedView className="mb-6 w-full max-w-[420px] gap-2 rounded-xl border border-[#e5e7eb] p-4">
          <ThemedText type="subtitle">Logged in as:</ThemedText>
          <ThemedText>{currentUser.username}</ThemedText>
          <ThemedText type="defaultSemiBold">{currentUser.email}</ThemedText>
        </ThemedView>
      )}
      <Button onPress={() => navigation.navigate('Procurement' as never)}>
        Go to Procurement
      </Button>
    </View>
  );
}
