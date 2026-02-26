import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';

export function AdaptiveSearchHeader() {
  const [query, setQuery] = useState('');

  return (
    <ThemedView className="border-b border-[#e5e7eb] bg-white px-4 py-3">
      <View className="w-full flex-row items-center gap-2">
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor="#9ca3af"
          className="flex-1 rounded-md border border-[#e5e7eb] bg-white px-3 py-2 text-base"
          returnKeyType="search"
          onSubmitEditing={() => {
            // no-op: integrate with screen-specific search if needed
          }}
        />
      </View>
      {query.length > 0 && (
        <ThemedText className="mt-2 text-xs text-[#6b7280]">
          Searching for: {query}
        </ThemedText>
      )}
    </ThemedView>
  );
}
