import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { JSX } from 'react/jsx-runtime';
import { useAuth } from './AuthContext';

export default function App(): JSX.Element {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { handleSignIn } = useAuth();

  // Access the router instance using the hook
  const router = useRouter();

  // Handle sign in and navigation
  const handleSignInPress = async (): Promise<void> => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const result = await handleSignIn(email, password);
      if (result.success) {
        setEmail('');
        setPassword('');
        router.navigate('./(tabs)'); // Navigate to the main app layout after successful sign in
      } else {
        setErrorMessage(result.message || 'Sign in failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content"/>
      
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
           <Image source={require('@/assets/images/dar.png')} style={styles.logo} contentFit="contain"/>
        </View>

        {/* Form Card */}
        <View style={styles.card}>
          <Text style={styles.title}>
            Procurement Workflow{'\n'}
            Monitoring and Document{'\n'}
            Automation System
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#999"
            value={email}
            onChangeText={(text) => { setEmail(text); setErrorMessage(''); }}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#999"
            value={password}
            onChangeText={(text) => { setPassword(text); setErrorMessage(''); }}
            secureTextEntry={true}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <TouchableOpacity 
            style={styles.signInButton}
            onPress={handleSignInPress}
            activeOpacity={0.8}
            disabled={isLoading}
          >
            <Text style={styles.signInText}>{isLoading ? 'Signing In...' : 'Sign In'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    boxShadow: '2px -1px 10px 2px #ebe5e5, -2px 2px 15px 2px #ebe5e5',
  },
  logoContainer: {
    marginBottom: 40,
  },
  logo: {
    width: 150,
    height: 150,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 15,
    padding: 30,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0a6e3d',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  errorText: {
    color: '#ff3b30',
    marginBottom: 10,
    textAlign: 'center',
    fontWeight: '500',
  },
  input: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  signInButton: {
    backgroundColor: '#0a6e3d',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 50,
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  signInText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
