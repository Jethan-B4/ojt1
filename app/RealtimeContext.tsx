import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabase/client";
import { useAuth } from "./AuthContext";

type RealtimeEvent = {
  schema: string;
  table: string;
  eventType: string;
  ts: number;
};

type RealtimeContextValue = {
  tick: number;
  lastEvent: RealtimeEvent | null;
};

const RealtimeContext = createContext<RealtimeContextValue>({
  tick: 0,
  lastEvent: null,
});

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, currentUser } = useAuth();
  const [tick, setTick] = useState(0);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setTick(0);
      setLastEvent(null);
      return;
    }

    const channel = supabase.channel(
      `global-realtime-${currentUser?.id ?? "anon"}`,
    );

    const bump = (payload: any) => {
      const evt: RealtimeEvent = {
        schema: String(payload?.schema ?? "public"),
        table: String(payload?.table ?? ""),
        eventType: String(payload?.eventType ?? payload?.event ?? "CHANGE"),
        ts: Date.now(),
      };
      setLastEvent(evt);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setTick((t) => t + 1), 300);
    };

    [
      "purchase_requests",
      "purchase_request_items",
      "purchase_orders",
      "purchase_order_items",
      "remarks",
      "users",
      "canvass_sessions",
      "canvasser_assignments",
      "canvass_entries",
      "bac_resolution",
      "aaa_documents",
      "ors_entries",
    ].forEach((table) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        bump,
      );
    });

    channel.subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, currentUser?.id]);

  const value = useMemo(() => ({ tick, lastEvent }), [tick, lastEvent]);

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}

