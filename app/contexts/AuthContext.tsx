import { router } from "expo-router";
import React, {
  createContext,
  JSX,
  ReactNode,
  useContext,
  useState,
} from "react";
import { Alert, Platform } from "react-native";
import { hasInternetConnection } from "../../lib/network";
import { supabase, updateLastLogin } from "../../lib/supabase";
import type { DatabaseUser } from "../../types/user";

function isNetworkError(e: unknown): boolean {
  const msg = String((e as any)?.message ?? "");
  if (!msg) return false;
  return (
    msg.toLowerCase().includes("network request failed") ||
    msg.toLowerCase().includes("failed to fetch") ||
    msg.toLowerCase().includes("timeout") ||
    msg.toLowerCase().includes("timed out")
  );
}

interface AuthContextType {
  [x: string]: any;
  isAuthenticated: boolean;
  currentUser: DatabaseUser | null;
  handleSignOut: () => void;
  handleSignIn: (
    user_id: string,
    password: string,
  ) => Promise<{ success: boolean; message?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<DatabaseUser | null>(null);

  const handleSignIn = async (
    user_id: string,
    password: string,
  ): Promise<{ success: boolean; message?: string }> => {
    if (!user_id.trim() || !password.trim()) {
      return {
        success: false,
        message: "Please enter both user id and password",
      };
    }

    try {
      console.log("Attempting custom sign in with:", user_id);

      // Query the 'users' table directly
      // WARNING: This assumes you have a 'password' column in your users table.
      // Storing plain text passwords is NOT secure. This is for demonstration as requested.
      const { data, error } = await supabase
        .from("users")
        .select(
          "id, fullname, username, password, role_id, division_id, created_at, last_login",
        )
        .eq("username", user_id)
        .eq("password", password)
        .single();

      if (error) {
        console.error("Custom Sign-in Error:", error.message);
        if (isNetworkError(error)) {
          const ok = await hasInternetConnection();
          return {
            success: false,
            message: ok
              ? "Cannot reach the server right now. Please try again."
              : "No internet connection. Please connect and try again.",
          };
        }
        return { success: false, message: "Invalid credentials" };
      }

      if (data) {
        console.log("Custom Sign-in successful:", data.username);

        // Update last_login timestamp
        try {
          await updateLastLogin(data.username);
        } catch (loginErr) {
          console.warn("Failed to update last_login:", loginErr);
          // Don't fail auth if last_login update fails
        }

        // Fetch division name and role name in parallel
        const [divResult, roleResult] = await Promise.allSettled([
          supabase
            .from("divisions")
            .select("division_name")
            .eq("division_id", data.division_id)
            .single(),
          supabase
            .from("roles")
            .select("role_name")
            .eq("role_id", data.role_id)
            .single(),
        ]);

        const division_name =
          divResult.status === "fulfilled"
            ? (divResult.value.data?.division_name ?? null)
            : null;
        const role_name =
          roleResult.status === "fulfilled"
            ? (roleResult.value.data?.role_name ?? null)
            : null;

        setCurrentUser({ ...(data as DatabaseUser), division_name, role_name });
        console.log("Current user:", division_name, role_name);
        setIsAuthenticated(true);
        return { success: true };
      } else {
        return { success: false, message: "Invalid credentials" };
      }
    } catch (error) {
      console.error("Sign in error:", error);
      if (isNetworkError(error)) {
        const ok = await hasInternetConnection();
        return {
          success: false,
          message: ok
            ? "Cannot reach the server right now. Please try again."
            : "No internet connection. Please connect and try again.",
        };
      }
      return { success: false, message: "An error occurred during sign in" };
    }
  };

  const handleSignOut = async (): Promise<void> => {
    const performSignOut = () => {
      setIsAuthenticated(false);
      setCurrentUser(null);
      router.replace("/auth");
    };

    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to sign out?")) {
        performSignOut();
      }
    } else {
      Alert.alert("Sign Out", "Are you sure you want to sign out?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: performSignOut,
        },
      ]);
    }
  };

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, currentUser, handleSignOut, handleSignIn }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
