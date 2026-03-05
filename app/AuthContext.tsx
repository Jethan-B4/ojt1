import { router } from 'expo-router';
import React, { createContext, JSX, ReactNode, useContext, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import type { DatabaseUser } from '../types/user';

interface AuthContextType {
  isAuthenticated: boolean;
  currentUser: DatabaseUser | null;
  handleSignOut: () => void;
  handleSignIn: (user_id: string, password: string) => Promise<{ success: boolean; message?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<DatabaseUser | null>(null);

  const handleSignIn = async (user_id: string, password: string): Promise<{ success: boolean; message?: string }> => {
    if (!user_id.trim() || !password.trim()) {
      return { success: false, message: 'Please enter both user_id and password' };
    }

    try {
      console.log('Attempting custom sign in with:', user_id);
      
      // Query the 'users' table directly
      // WARNING: This assumes you have a 'password' column in your users table.
      // Storing plain text passwords is NOT secure. This is for demonstration as requested.
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', user_id)
        .eq('password', password)
        .single();

      if (error) {
        console.error('Custom Sign-in Error:', error.message);
        return { success: false, message: 'Invalid credentials' };
      }

      if (data) {
        console.log('Custom Sign-in successful:', data.user_id);
        setCurrentUser(data as DatabaseUser);
        setIsAuthenticated(true);
        return { success: true };
      } else {
        return { success: false, message: 'Invalid credentials' };
      }
    } catch (error) {
      console.error('Sign in error:', error);
      return { success: false, message: 'An error occurred during sign in' };
    }
  };

  const handleSignOut = async (): Promise<void> => {
    const performSignOut = () => {
      setIsAuthenticated(false);
      setCurrentUser(null);
      router.replace('/auth');
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to sign out?')) {
        performSignOut();
      }
    } else {
      Alert.alert(
        'Sign Out',
        'Are you sure you want to sign out?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign Out',
            style: 'destructive',
            onPress: performSignOut,
          },
        ]
      );
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, currentUser, handleSignOut, handleSignIn }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
