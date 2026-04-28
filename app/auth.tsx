import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { JSX } from 'react/jsx-runtime';
import { useAuth } from './AuthContext';

const { height: SCREEN_H } = Dimensions.get('window');

export default function AuthScreen(): JSX.Element {
  const [user_id,      setUserID]       = useState<string>('');
  const [password,     setPassword]     = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isLoading,    setIsLoading]    = useState<boolean>(false);

  const passwordRef = useRef<TextInput>(null);
  const { handleSignIn } = useAuth();
  const router = useRouter();

  const handleSignInPress = async (): Promise<void> => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const result = await handleSignIn(user_id, password);
      if (result.success) {
        setUserID('');
        setPassword('');
        router.navigate('./(tabs)/dashboard');
      } else {
        setErrorMessage(result.message || 'Sign in failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // KeyboardAvoidingView shrinks/pads the area above the keyboard.
    // On iOS 'padding' pushes content up; on Android 'height' shrinks the container,
    // and the inner ScrollView handles the rest.
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#f5f7f6" />

      {/*
        ScrollView lets the user scroll to inputs if the keyboard still overlaps.
        contentContainerStyle grows to at least full screen height so content
        stays vertically centred on tall screens, but can grow taller on small ones.
        keyboardShouldPersistTaps="handled" lets taps on buttons work while the
        keyboard is open without dismissing it first.
      */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Logo ── */}
        <View style={styles.logoContainer}>
          <View style={styles.logoRing}>
            <Image
              source={require('@/assets/images/dar.png')}
              style={styles.logo}
              contentFit="contain"
            />
          </View>
          <Text style={styles.appName}>DAR Procurement</Text>
          <Text style={styles.appSub}>Monitoring & Automation System</Text>
        </View>

        {/* ── Form card ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign In</Text>
          {/* <Text style={styles.cardSub}>
            Procurement Workflow Monitoring{'\n'}and Document Automation System
          </Text> */}

          {/* ── Username field ── */}
          <View style={styles.fieldWrapper}>
            <Text style={styles.fieldLabel}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your username"
              placeholderTextColor="#aab5b0"
              value={user_id}
              onChangeText={(text) => { setUserID(text); setErrorMessage(''); }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              // Move focus to password field when user taps "Next" on the keyboard
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
            />
          </View>

          {/* ── Password field ── */}
          <View style={styles.fieldWrapper}>
            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor="#aab5b0"
              value={password}
              onChangeText={(text) => { setPassword(text); setErrorMessage(''); }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSignInPress}
            />
          </View>

          {/* ── Error message ── */}
          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* ── Sign-in button ── */}
          <TouchableOpacity
            style={[styles.signInButton, isLoading && styles.signInButtonDisabled]}
            onPress={handleSignInPress}
            activeOpacity={0.8}
            disabled={isLoading}
          >
            <Text style={styles.signInText}>
              {isLoading ? 'Signing In…' : 'Sign In'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Footer ── */}
        <Text style={styles.footer}>
          Department of Agrarian Reform — Camarines Sur I
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // ── Outer wrapper ──────────────────────────────────────────────────────────
  kav: {
    flex: 1,
    backgroundColor: '#f5f7f6',
  },

  // ── Scroll container ───────────────────────────────────────────────────────
  // minHeight ensures content is centred on tall screens.
  // flexGrow: 1 makes the container stretch to fill available space.
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
    minHeight: SCREEN_H,
  },

  // ── Logo area ──────────────────────────────────────────────────────────────
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    // Subtle green-tinted shadow
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    marginBottom: 14,
  },
  logo: {
    width: 80,
    height: 80,
  },
  appName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.4,
  },
  appSub: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 3,
    textAlign: 'center',
  },

  // ── Card ───────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },
  cardTitle: {
    textAlign: 'center',
    textDecorationLine: 'underline',
    textDecorationColor: '#064E3B',
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
  },
  cardSub: {
    fontSize: 12,
    color: '#9ca3af',
    lineHeight: 17,
    marginBottom: 24,
  },

  // ── Form fields ────────────────────────────────────────────────────────────
  fieldWrapper: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 11,
    fontSize: 15,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  // ── Error box ──────────────────────────────────────────────────────────────
  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },

  // ── Sign-in button ─────────────────────────────────────────────────────────
  signInButton: {
    backgroundColor: '#064E3B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  signInButtonDisabled: {
    opacity: 0.6,
  },
  signInText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Footer ─────────────────────────────────────────────────────────────────
  footer: {
    marginTop: 28,
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'center',
  },
});
