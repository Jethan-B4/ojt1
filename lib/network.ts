let lastCheckAt = 0;
let lastOk: boolean | null = null;

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  "https://yqfoykznqmdvgxsoassm.supabase.co";

async function pingUrl(url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function hasInternetConnection(
  timeoutMs = 3000,
  cacheMs = 10000,
): Promise<boolean> {
  const now = Date.now();
  if (lastOk === true && now - lastCheckAt < cacheMs) return true;

  const ok =
    (await pingUrl(`${supabaseUrl}/auth/v1/health`, timeoutMs)) ||
    (await pingUrl("https://clients3.google.com/generate_204", timeoutMs)) ||
    (await pingUrl("https://www.cloudflare.com/cdn-cgi/trace", timeoutMs));
  lastOk = ok;
  lastCheckAt = now;
  return ok;
}

export async function assertOnline(actionLabel?: string): Promise<void> {
  const ok = await hasInternetConnection();
  if (!ok) {
    const suffix = actionLabel ? ` (${actionLabel})` : "";
    throw new Error(`No internet connection. Please connect and try again.${suffix}`);
  }
}
