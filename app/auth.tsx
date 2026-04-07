import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
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
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const { height: SCREEN_H } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// DEV-ONLY · UserListModal
// Shows all users from the `users` table joined with division_name + role_name.
// TO REMOVE: delete everything between the two DEV-ONLY fence comments,
//            then remove <DEV_UserListModal /> and the "Dev Tools" button below.
// ─────────────────────────────────────────────────────────────────────────────

//Add designation field to DevUser interface
interface DevUser {
  fullname: string;
  username: string; // login
  password: string;
  division_name: string | null;
  role_name: string | null;
}

function DEV_UserListModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [users,   setUsers]   = useState<DevUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Fetch once every time the modal opens
  React.useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    supabase
      .from('users')
      .select(`
        fullname,
        username,
        password,
        divisions ( division_name ),
        roles     ( role_name )
      `)
      .order('fullname')
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); return; }
        setUsers(
          (data ?? []).map((r: any) => ({
            fullname:      r.fullname,
            username:      r.username,
            password:      r.password,
            division_name: r.divisions?.division_name ?? null,
            role_name:     r.roles?.role_name ?? null,
          }))
        );
      })
      setLoading(false);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={devStyles.overlay}>
        <View style={devStyles.sheet}>

          {/* Header */}
          <View style={devStyles.header}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <MaterialIcons name="warning-amber" size={14} color="#f59e0b" />
                <Text style={devStyles.headerEyebrow}>DEV ONLY</Text>
              </View>
              <Text style={devStyles.headerTitle}>User Accounts</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={devStyles.closeBtn}>
              <MaterialIcons name="close" size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          <Text style={devStyles.warning}>
            This panel is for development only. Remove before production.
          </Text>

          {/* Content */}
          {loading ? (
            <View style={devStyles.center}>
              <ActivityIndicator color="#064E3B" />
              <Text style={devStyles.loadingText}>Fetching users…</Text>
            </View>
          ) : error ? (
            <View style={devStyles.center}>
              <Text style={devStyles.errorText}>Error: {error}</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Table header */}
              <View style={[devStyles.row, devStyles.tableHead]}>
                <Text style={[devStyles.cell, devStyles.headCell, { flex: 1.2 }]}>Full Name</Text>
                <Text style={[devStyles.cell, devStyles.headCell, { flex: 1 }]}>Username</Text>
                <Text style={[devStyles.cell, devStyles.headCell, { flex: 1 }]}>Password</Text>
                <Text style={[devStyles.cell, devStyles.headCell, { flex: 1.3 }]}>Division</Text>
                <Text style={[devStyles.cell, devStyles.headCell, { flex: 1.2 }]}>Role</Text>
              </View>

              {users.length === 0 ? (
                <Text style={devStyles.emptyText}>No users found.</Text>
              ) : (
                users.map((u, i) => (
                  <View key={u.username} style={[devStyles.row, i % 2 === 1 && devStyles.rowAlt]}>
                    <Text style={[devStyles.cell, { flex: 1.2 }]} numberOfLines={1}>{u.fullname}</Text>
                    <Text style={[devStyles.cell, devStyles.monoCell, { flex: 1.2 }]} numberOfLines={1}>{u.username}</Text>
                    <Text style={[devStyles.cell, devStyles.monoCell, { flex: 1 }]} numberOfLines={1}>{u.password}</Text>
                    <Text style={[devStyles.cell, { flex: 1.3 }]} numberOfLines={2}>{u.division_name ?? '—'}</Text>
                    <Text style={[devStyles.cell, devStyles.roleCell, { flex: 1.2 }]} numberOfLines={2}>{u.role_name ?? '—'}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const devStyles = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
                 maxHeight: '80%', paddingBottom: 32 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                 paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  headerEyebrow: { fontSize: 9.5, fontWeight: '800', color: '#b45309',
                   textTransform: 'uppercase', letterSpacing: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginTop: 2 },
  closeBtn:    { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3f4f6',
                 alignItems: 'center', justifyContent: 'center' },
  closeBtnText:{ fontSize: 14, color: '#6b7280', fontWeight: '700' },
  warning:     { marginHorizontal: 20, marginBottom: 12, backgroundColor: '#fffbeb',
                 borderWidth: 1, borderColor: '#fde68a', borderRadius: 10,
                 paddingHorizontal: 12, paddingVertical: 8,
                 fontSize: 11, color: '#92400e' },
  center:      { paddingVertical: 32, alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 12, color: '#9ca3af' },
  errorText:   { fontSize: 12, color: '#dc2626', textAlign: 'center', paddingHorizontal: 20 },
  emptyText:   { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 24 },
  tableHead:   { backgroundColor: '#064E3B' },
  row:         { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 9,
                 borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  rowAlt:      { backgroundColor: '#f9fafb' },
  cell:        { fontSize: 11.5, color: '#374151', paddingRight: 6 },
  headCell:    { fontSize: 9.5, fontWeight: '700', color: '#ffffff',
                 textTransform: 'uppercase', letterSpacing: 0.5 },
  monoCell:    { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', color: '#6b7280' },
  roleCell:    { color: '#047857', fontWeight: '600' },
});

// ─────────────────────────────────────────────────────────────────────────────
// END DEV-ONLY · UserListModal
// ─────────────────────────────────────────────────────────────────────────────


export default function AuthScreen(): JSX.Element {
  const [user_id,      setUserID]       = useState<string>('');
  const [password,     setPassword]     = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isLoading,    setIsLoading]    = useState<boolean>(false);
  /* DEV-ONLY */ const [devModalOpen, setDevModalOpen] = useState(false); /* DEV-ONLY */

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

          {/* DEV-ONLY ── Dev tools trigger ── DEV-ONLY */}
          <TouchableOpacity
            onPress={() => setDevModalOpen(true)}
            activeOpacity={0.7}
            style={styles.devButton}>
            <Text style={styles.devButtonText}>🛠 Dev: View Users</Text>
          </TouchableOpacity>
          <DEV_UserListModal visible={devModalOpen} onClose={() => setDevModalOpen(false)} />
          {/* END DEV-ONLY */}
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

  // ── DEV-ONLY ────────────────────────────────────────────────────────────────
  devButton: {
    marginTop: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
    alignItems: 'center',
  },
  devButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e',
  },
  // ── END DEV-ONLY ────────────────────────────────────────────────────────────
});
