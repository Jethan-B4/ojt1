import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type Ctx = { visible: boolean; setVisible: (v: boolean) => void; toggle: () => void };

const StatusBarCtx = createContext<Ctx | undefined>(undefined);

export function StatusBarProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("ui:statusbar-visible");
        if (raw != null) setVisible(raw === "1");
      } catch {}
    })();
  }, []);
  useEffect(() => {
    AsyncStorage.setItem("ui:statusbar-visible", visible ? "1" : "0").catch(() => {});
  }, [visible]);
  const value = useMemo<Ctx>(() => ({ visible, setVisible, toggle: () => setVisible(v => !v) }), [visible]);
  return <StatusBarCtx.Provider value={value}>{children}</StatusBarCtx.Provider>;
}

export function useStatusBar(): Ctx {
  const ctx = useContext(StatusBarCtx);
  if (!ctx) throw new Error("useStatusBar must be used within StatusBarProvider");
  return ctx;
}
