import React from 'react';
import { Redirect } from 'expo-router';

export default function Index() {
  // Redirect root to auth so auth.tsx becomes the landing page
  return <Redirect href="/auth" />;
}
