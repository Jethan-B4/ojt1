import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { supabase } from "../../lib/supabase/client";
import { useAuth } from "./AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EntityType = "pr" | "po" | "delivery" | "payment" | "remarks" | "user" | "canvass";

export type RealtimeEvent = {
  schema: string;
  table: string;
  eventType: string;
  ts: number;
  entity?: EntityType;
  id?: string | number;
};

export type ChangeCallback = (event: RealtimeEvent) => void;

export interface RealtimeContextValue {
  /** Global tick that increments on any change (debounced) */
  tick: number;
  /** Last event received */
  lastEvent: RealtimeEvent | null;
  /** Whether realtime connection is active */
  isConnected: boolean;
  /** Subscribe to specific entity changes. Returns unsubscribe function. */
  subscribe: (entity: EntityType, callback: ChangeCallback) => () => void;
  /** Trigger a manual refresh */
  triggerRefresh: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const RealtimeContext = createContext<RealtimeContextValue>({
  tick: 0,
  lastEvent: null,
  isConnected: false,
  subscribe: () => () => {},
  triggerRefresh: () => {},
});

// ─── Table to Entity Mapping ────────────────────────────────────────────────

const TABLE_TO_ENTITY: Record<string, EntityType> = {
  purchase_requests: "pr",
  purchase_request_items: "pr",
  purchase_orders: "po",
  purchase_order_items: "po",
  deliveries: "delivery",
  payment_phase: "payment",
  remarks: "remarks",
  users: "user",
  canvass_sessions: "canvass",
  canvasser_assignments: "canvass",
  canvass_entries: "canvass",
  bac_resolution: "pr",
  aaa_documents: "pr",
  ors_entries: "po",
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, currentUser } = useAuth();
  const [tick, setTick] = useState(0);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenersRef = useRef<Map<EntityType, Set<ChangeCallback>>>(new Map());
  const appStateRef = useRef(AppState.currentState);

  // Initialize listeners map
  useEffect(() => {
    const entities: EntityType[] = ["pr", "po", "delivery", "payment", "remarks", "user", "canvass"];
    entities.forEach((e) => {
      if (!listenersRef.current.has(e)) {
        listenersRef.current.set(e, new Set());
      }
    });
  }, []);

  // Main realtime subscription effect
  useEffect(() => {
    if (!isAuthenticated) {
      setTick(0);
      setLastEvent(null);
      setIsConnected(false);
      return;
    }

    const channel = supabase.channel(
      `global-realtime-${currentUser?.id ?? "anon"}`,
    );

    const handleChange = (payload: any) => {
      const table = String(payload?.table ?? "");
      const entity = TABLE_TO_ENTITY[table];

      const evt: RealtimeEvent = {
        schema: String(payload?.schema ?? "public"),
        table,
        eventType: String(payload?.eventType ?? payload?.event ?? "CHANGE"),
        ts: Date.now(),
        entity,
        id: payload?.new?.id ?? payload?.old?.id,
      };

      // Only process if app is active
      if (appStateRef.current !== "active") return;

      setLastEvent(evt);

      // Notify entity-specific listeners
      if (entity) {
        const listeners = listenersRef.current.get(entity);
        listeners?.forEach((cb) => {
          try {
            cb(evt);
          } catch (e) {
            console.error("Realtime listener error:", e);
          }
        });
      }

      // Debounced global tick update
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setTick((t) => t + 1), 300);
    };

    // Subscribe to all relevant tables
    const tables = Object.keys(TABLE_TO_ENTITY);
    tables.forEach((table) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        handleChange,
      );
    });

    channel.subscribe((status) => {
      setIsConnected(status === "SUBSCRIBED");
    });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, currentUser?.id]);

  // Handle app state changes (foreground/background)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const wasInactive = appStateRef.current.match(/inactive|background/);
      const isActive = nextAppState === "active";

      if (wasInactive && isActive) {
        // App came to foreground - trigger refresh
        setTick((t) => t + 1);
      }

      appStateRef.current = nextAppState;
    });

    return () => subscription.remove();
  }, []);

  // Subscribe function
  const subscribe = (entity: EntityType, callback: ChangeCallback) => {
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

  const triggerRefresh = () => setTick((t) => t + 1);

  const value = useMemo(
    () => ({ tick, lastEvent, isConnected, subscribe, triggerRefresh }),
    [tick, lastEvent, isConnected]
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useRealtime() {
  return useContext(RealtimeContext);
}

/**
 * Hook to listen for changes to a specific entity type
 */
export function useEntityChanges(entity: EntityType, callback?: ChangeCallback) {
  const { subscribe, tick } = useRealtime();

  useEffect(() => {
    if (!callback) return;
    return subscribe(entity, callback);
  }, [entity, callback, subscribe]);

  return { tick };
}

