/**
 * NotificationContext.tsx
 *
 * Provides live refresh functionality across the app using Supabase realtime.
 * Subscribes to database changes for PR, PO, Delivery, Payment, and Remarks
 * to trigger automatic refresh of data when changes occur.
 */

import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { supabase } from "../../lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EntityType = "pr" | "po" | "delivery" | "payment" | "remarks";

export interface ChangeEvent {
  entity: EntityType;
  id?: string | number;
  operation: "INSERT" | "UPDATE" | "DELETE";
  payload?: any;
}

export interface NotificationContextType {
  /** Latest change event received */
  lastChange: ChangeEvent | null;
  /** Whether realtime connection is active */
  isConnected: boolean;
  /** Manual refresh trigger - increment to force refresh */
  refreshTick: number;
  /** Trigger a manual refresh */
  triggerRefresh: () => void;
  /** Subscribe to specific entity changes */
  subscribe: (entity: EntityType, callback: (event: ChangeEvent) => void) => () => void;
}

// ─── Context ────────────────────────────────────────────────────────────────────

const NotificationContext = createContext<NotificationContextType | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────────

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [lastChange, setLastChange] = useState<ChangeEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const subscriptionsRef = useRef<Map<string, any>>(new Map());
  const listenersRef = useRef<Map<EntityType, Set<(event: ChangeEvent) => void>>>(new Map());
  const appStateRef = useRef<AppStateStatus>("active");

  // Initialize listeners map
  useEffect(() => {
    const entities: EntityType[] = ["pr", "po", "delivery", "payment", "remarks"];
    entities.forEach((e) => {
      if (!listenersRef.current.has(e)) {
        listenersRef.current.set(e, new Set());
      }
    });
  }, []);

  // Setup Supabase realtime subscriptions
  useEffect(() => {
    const setupSubscriptions = () => {
      // Clean up existing subscriptions
      subscriptionsRef.current.forEach((sub) => sub.unsubscribe?.());
      subscriptionsRef.current.clear();

      // Subscribe to purchase_requests
      const prChannel = supabase
        .channel("pr-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "purchase_requests" },
          (payload: RealtimePostgresChangesPayload<any>) => {
            const newRecord = payload.new as { id?: string | number } | undefined;
            const oldRecord = payload.old as { id?: string | number } | undefined;
            const event: ChangeEvent = {
              entity: "pr",
              id: newRecord?.id ?? oldRecord?.id,
              operation: payload.eventType as any,
              payload: payload.new,
            };
            handleChange(event);
          }
        )
        .subscribe((status: string) => {
          if (status === "SUBSCRIBED") setIsConnected(true);
          if (status === "CLOSED" || status === "CHANNEL_ERROR") setIsConnected(false);
        });
      subscriptionsRef.current.set("pr", prChannel);

      // Subscribe to purchase_orders
      const poChannel = supabase
        .channel("po-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "purchase_orders" },
          (payload: RealtimePostgresChangesPayload<any>) => {
            const newRecord = payload.new as { id?: string | number } | undefined;
            const oldRecord = payload.old as { id?: string | number } | undefined;
            const event: ChangeEvent = {
              entity: "po",
              id: newRecord?.id ?? oldRecord?.id,
              operation: payload.eventType as any,
              payload: payload.new,
            };
            handleChange(event);
          }
        )
        .subscribe();
      subscriptionsRef.current.set("po", poChannel);

      // Subscribe to deliveries
      const deliveryChannel = supabase
        .channel("delivery-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "deliveries" },
          (payload: RealtimePostgresChangesPayload<any>) => {
            const newRecord = payload.new as { id?: string | number } | undefined;
            const oldRecord = payload.old as { id?: string | number } | undefined;
            const event: ChangeEvent = {
              entity: "delivery",
              id: newRecord?.id ?? oldRecord?.id,
              operation: payload.eventType as any,
              payload: payload.new,
            };
            handleChange(event);
          }
        )
        .subscribe();
      subscriptionsRef.current.set("delivery", deliveryChannel);

      // Subscribe to payment_phase (if table exists)
      const paymentChannel = supabase
        .channel("payment-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "payment_phase" },
          (payload: RealtimePostgresChangesPayload<any>) => {
            const newRecord = payload.new as { id?: string | number } | undefined;
            const oldRecord = payload.old as { id?: string | number } | undefined;
            const event: ChangeEvent = {
              entity: "payment",
              id: newRecord?.id ?? oldRecord?.id,
              operation: payload.eventType as any,
              payload: payload.new,
            };
            handleChange(event);
          }
        )
        .subscribe();
      subscriptionsRef.current.set("payment", paymentChannel);

      // Subscribe to remarks
      const remarksChannel = supabase
        .channel("remarks-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "remarks" },
          (payload: RealtimePostgresChangesPayload<any>) => {
            const newRecord = payload.new as { id?: string | number } | undefined;
            const oldRecord = payload.old as { id?: string | number } | undefined;
            const event: ChangeEvent = {
              entity: "remarks",
              id: newRecord?.id ?? oldRecord?.id,
              operation: payload.eventType as any,
              payload: payload.new,
            };
            handleChange(event);
          }
        )
        .subscribe();
      subscriptionsRef.current.set("remarks", remarksChannel);
    };

    const handleChange = (event: ChangeEvent) => {
      // Only process if app is active
      if (appStateRef.current !== "active") return;

      setLastChange(event);

      // Notify listeners
      const listeners = listenersRef.current.get(event.entity);
      listeners?.forEach((cb) => {
        try {
          cb(event);
        } catch (e) {
          console.error("Notification listener error:", e);
        }
      });
    };

    setupSubscriptions();

    // Cleanup
    return () => {
      subscriptionsRef.current.forEach((sub) => sub.unsubscribe?.());
      subscriptionsRef.current.clear();
    };
  }, []);

  // Handle app state changes (pause/resume)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      appStateRef.current = nextAppState;

      if (nextAppState === "active") {
        // App came to foreground - trigger a refresh
        setRefreshTick((t) => t + 1);
      }
    });

    return () => subscription.remove();
  }, []);

  const subscribe = (entity: EntityType, callback: (event: ChangeEvent) => void) => {
    const set = listenersRef.current.get(entity);
    if (!set) {
      listenersRef.current.set(entity, new Set([callback]));
    } else {
      set.add(callback);
    }

    // Return unsubscribe function
    return () => {
      listenersRef.current.get(entity)?.delete(callback);
    };
  };

  const triggerRefresh = () => setRefreshTick((t) => t + 1);

  const value: NotificationContextType = {
    lastChange,
    isConnected,
    refreshTick,
    triggerRefresh,
    subscribe,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────────

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
}

/**
 * Hook to listen for changes to a specific entity type
 */
export function useEntityChanges(entity: EntityType, callback?: (event: ChangeEvent) => void) {
  const { subscribe, refreshTick, triggerRefresh } = useNotifications();

  useEffect(() => {
    if (!callback) return;
    return subscribe(entity, callback);
  }, [entity, callback, subscribe]);

  return { refreshTick, triggerRefresh };
}

/**
 * Hook that returns a refresh trigger for manual refresh
 */
export function useRefreshTrigger() {
  const { refreshTick, triggerRefresh } = useNotifications();
  return { refreshTick, triggerRefresh };
}
