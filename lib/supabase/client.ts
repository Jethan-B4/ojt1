import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";

// Make sure to set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file
// Remove the default values if you set them in your .env file
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  "https://yqfoykznqmdvgxsoassm.supabase.co";
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxZm95a3pucW1kdmd4c29hc3NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMTA5NjEsImV4cCI6MjA4Njg4Njk2MX0.NOtDkXus6fb2l-gXAruCCgNV4JjtYzieFmyv_qtb_4I";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[Supabase] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is not set. " +
      "Check that your .env file exists and the Metro bundler was restarted after editing it.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function withTimeout<T>(
  promise: PromiseLike<T>,
  label: string,
  ms = 60000,
): Promise<T> {
  let t: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      t = setTimeout(() => reject(new Error(`Timed out: ${label}`)), ms);
    });
    return (await Promise.race([promise, timeoutPromise])) as T;
  } finally {
    if (t) clearTimeout(t);
  }
}
