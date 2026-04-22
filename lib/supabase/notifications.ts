/**
 * lib/notifications.ts — Local push notification helpers
 *
 * Usage
 * ─────
 * 1. Call `bootstrapNotifications()` once inside your root layout (_layout.tsx).
 *    It creates the Android channel and requests iOS/Android-13 permission.
 *
 * 2. Call the domain helpers anywhere in the data layer:
 *      notifyPRCreated(prNo)
 *      notifyPREdited(prNo)
 *      notifyPRStatusChanged(prNo, "ORS Processing")
 *      notifyPOCreated(poNo)
 *      notifyPOEdited(poNo)
 *      notifyPOStatusChanged(poNo, "ORS Processing")
 *
 * All helpers are fire-and-forget — they swallow errors so they never
 * interrupt the calling data-layer function.
 *
 * Icons
 * ─────
 * Notification titles are plain OS strings — React Native icon components
 * cannot render inside them. Instead, each notification embeds `icon` and
 * `iconColor` fields in its `data` payload so your in-app notification list
 * can render the correct @expo/vector-icons (Ionicons) icon.
 *
 * Example usage in a notification list item:
 *   import { Ionicons } from "@expo/vector-icons";
 *   const { icon, iconColor } = notification.request.content.data as NotifData;
 *   <Ionicons name={icon} size={24} color={iconColor} />
 *
 * Install dependencies:
 *   npx expo install expo-notifications @expo/vector-icons
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// ─── Android notification channel ─────────────────────────────────────────────

const CHANNEL_ID = "procurement";

// ─── Foreground behaviour ─────────────────────────────────────────────────────
// Show banner + play sound even when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, // replaces shouldShowAlert
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
// ─── Bootstrap (call once at app startup) ─────────────────────────────────────

/**
 * Request notification permissions and register the Android channel.
 * Safe to call multiple times — Expo deduplicates channel creation.
 *
 * @returns true if the user has granted permission, false otherwise.
 */
export async function bootstrapNotifications(): Promise<boolean> {
  // Android 8+ requires a channel before posting any notification.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Procurement Updates",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: "#10B981",
      sound: "default",
    });
  }

  // Request permission. iOS always shows the dialog; Android 13+ does too.
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

// ─── Icon metadata ────────────────────────────────────────────────────────────

/**
 * Icon metadata embedded in every notification's `data` payload.
 * Consume this in your in-app notification list to render the correct
 * Ionicons icon via @expo/vector-icons.
 *
 * @example
 *   import { Ionicons } from "@expo/vector-icons";
 *   const { icon, iconColor } = notification.request.content.data as NotifData;
 *   <Ionicons name={icon} size={24} color={iconColor} />
 */
export interface NotifData extends Record<string, unknown> {
  type: string;
  /** Ionicons icon name from @expo/vector-icons */
  icon: string;
  /** Hex colour for the icon */
  iconColor: string;
}

// ─── Internal schedule helper ─────────────────────────────────────────────────

interface NotifPayload {
  title: string;
  body: string;
  /** Arbitrary metadata accessible from notification tap handlers. */
  data?: Record<string, unknown>;
}

/**
 * Schedules an immediate local notification (trigger: null = fire now).
 * Errors are logged and swallowed so the data layer is never interrupted.
 */
async function send(payload: NotifPayload): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: "default",
        ...(Platform.OS === "android" && { channelId: CHANNEL_ID }),
      },
      trigger: null, // fire immediately
    });
  } catch (err) {
    console.warn("[Notifications] Failed to schedule notification:", err);
  }
}

// ─── PR domain helpers ────────────────────────────────────────────────────────

/**
 * Notify when a new Purchase Request is successfully submitted.
 * In-app icon: Ionicons "document-text-outline" (#10B981 green)
 * @param prNo  Human-readable PR number, e.g. "2025-001"
 */
export function notifyPRCreated(prNo: string | null): void {
  send({
    title: "Purchase Request Created",
    body: `PR ${prNo ?? "(no number)"} has been submitted and is awaiting review.`,
    data: {
      type: "pr_created",
      prNo,
      icon: "document-text-outline",
      iconColor: "#10B981",
    } satisfies NotifData,
  });
}

/**
 * Notify when an existing Purchase Request is edited.
 * In-app icon: Ionicons "create-outline" (#F59E0B amber)
 * @param prNo  Human-readable PR number
 */
export function notifyPREdited(prNo: string | null): void {
  send({
    title: "Purchase Request Updated",
    body: `PR ${prNo ?? "(no number)"} has been edited.`,
    data: {
      type: "pr_edited",
      prNo,
      icon: "create-outline",
      iconColor: "#F59E0B",
    } satisfies NotifData,
  });
}

/**
 * Notify when a PR advances or reverts to a new workflow status.
 * In-app icon: Ionicons "sync-circle-outline" (#3B82F6 blue)
 * @param prNo        Human-readable PR number
 * @param statusLabel New status name from public.status (e.g. "For Canvassing")
 */
export function notifyPRStatusChanged(
  prNo: string | null,
  statusLabel: string,
): void {
  send({
    title: "PR Status Updated",
    body: `PR ${prNo ?? "(no number)"} is now: ${statusLabel}.`,
    data: {
      type: "pr_status_changed",
      prNo,
      statusLabel,
      icon: "sync-circle-outline",
      iconColor: "#3B82F6",
    } satisfies NotifData,
  });
}

// ─── PO domain helpers ────────────────────────────────────────────────────────

/**
 * Notify when a new Purchase Order is successfully created.
 * In-app icon: Ionicons "cart-outline" (#10B981 green)
 * @param poNo  Human-readable PO number (may be null at creation time)
 */
export function notifyPOCreated(poNo: string | null): void {
  send({
    title: "Purchase Order Created",
    body: `PO ${poNo ?? "(pending number)"} has been logged and is in PO Creation.`,
    data: {
      type: "po_created",
      poNo,
      icon: "cart-outline",
      iconColor: "#10B981",
    } satisfies NotifData,
  });
}

/**
 * Notify when an existing Purchase Order is edited.
 * In-app icon: Ionicons "create-outline" (#F59E0B amber)
 * @param poNo  Human-readable PO number
 */
export function notifyPOEdited(poNo: string | null): void {
  send({
    title: "Purchase Order Updated",
    body: `PO ${poNo ?? "(no number)"} has been edited.`,
    data: {
      type: "po_edited",
      poNo,
      icon: "create-outline",
      iconColor: "#F59E0B",
    } satisfies NotifData,
  });
}

/**
 * Notify when a PO advances to a new workflow status
 * (Allocation → ORS Creation → ORS Processing …).
 * In-app icon: Ionicons "sync-circle-outline" (#3B82F6 blue)
 * @param poNo        Human-readable PO number
 * @param statusLabel New status name from public.status
 */
export function notifyPOStatusChanged(
  poNo: string | null,
  statusLabel: string,
): void {
  send({
    title: "PO Status Updated",
    body: `PO ${poNo ?? "(no number)"} is now: ${statusLabel}.`,
    data: {
      type: "po_status_changed",
      poNo,
      statusLabel,
      icon: "sync-circle-outline",
      iconColor: "#3B82F6",
    } satisfies NotifData,
  });
}
