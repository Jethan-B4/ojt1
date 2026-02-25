import { Image } from 'expo-image';
import { Platform, TouchableOpacity } from 'react-native';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useNavigation } from '@react-navigation/native';
import { Link } from 'expo-router';
import { useAuth } from '../AuthContext';

export default function ReactScreen() {
  const { currentUser, handleSignOut } = useAuth();
  const navigation = useNavigation();

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/dar.png')}
          className="absolute bottom-0 left-0 h-[178px] w-[290px]"
        />
      }>
      <ThemedView className="flex-row items-center gap-2">
        <ThemedText type="title">Hello World!</ThemedText>
        <HelloWave />
      </ThemedView>

      {/* Display current user */}
      {currentUser && (
        <ThemedView className="mb-4 gap-2 rounded-lg border border-[#ccc] p-3">
          <ThemedText type="subtitle">Logged in as:</ThemedText>
          <ThemedText>{currentUser.username}</ThemedText>
          <ThemedText type="defaultSemiBold">{currentUser.email}</ThemedText>
          <TouchableOpacity
            className="mt-2 items-center rounded-[6px] bg-[#ff3b30] px-4 py-2.5"
            onPress={handleSignOut}
          >
            <ThemedText className="font-semibold text-white">Sign Out</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      )}

      <ThemedView className="mb-2 gap-2">
        <ThemedText type="subtitle">Step 1: Try it</ThemedText>
        <ThemedText>
          Edit <ThemedText type="defaultSemiBold">app/(tabs)/index.tsx</ThemedText> to see changes.
          Press{' '}
          <ThemedText type="defaultSemiBold">
            {Platform.select({
              ios: 'cmd + d',
              android: 'cmd + m',
              web: 'F12',
            })}
          </ThemedText>{' '}
          to open developer tools.
        </ThemedText>
      </ThemedView>
      <ThemedView className="mb-2 gap-2">
        <Link href="/modal">
          <Link.Trigger>
            <ThemedText type="subtitle">Step 2: Explore</ThemedText>
          </Link.Trigger>
          <Link.Preview />
          <Link.Menu>
            <Link.MenuAction title="Action" icon="cube" onPress={() => alert('Action pressed')} />
            <Link.MenuAction
              title="Share"
              icon="square.and.arrow.up"
              onPress={() => alert('Share pressed')}
            />
            <Link.Menu title="More" icon="ellipsis">
              <Link.MenuAction
                title="Delete"
                icon="trash"
                destructive
                onPress={() => alert('Delete pressed')}
              />
            </Link.Menu>
          </Link.Menu>
        </Link>

        <ThemedText>
          {`Tap the Explore tab to learn more about what's included in this starter app.`}
        </ThemedText>
      </ThemedView>
      <ThemedView className="mb-2 gap-2">
        <ThemedText type="subtitle">Step 3: Get a fresh start</ThemedText>
        <ThemedText>
          {`When you're ready, run `}
          <ThemedText type="defaultSemiBold">npm run reset-project</ThemedText> to get a fresh{' '}
          <ThemedText type="defaultSemiBold">app</ThemedText> directory. This will move the current{' '}
          <ThemedText type="defaultSemiBold">app</ThemedText> to{' '}
          <ThemedText type="defaultSemiBold">app-example</ThemedText>.
        </ThemedText>
      </ThemedView>
    </ParallaxScrollView>
  );
}
