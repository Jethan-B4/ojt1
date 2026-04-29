import React, { createContext, useContext, useState, ReactNode } from "react";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_RANGE = Array.from({ length: 7 }, (_, i) => CURRENT_YEAR - 5 + i);

interface FiscalYearContextType {
  year: number;
  setYear: (year: number) => void;
  yearPickerOpen: boolean;
  setYearPickerOpen: (open: boolean) => void;
  YEAR_RANGE: number[];
  CURRENT_YEAR: number;
}

const FiscalYearContext = createContext<FiscalYearContextType | undefined>(undefined);

export function FiscalYearProvider({ children }: { children: ReactNode }) {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);

  return (
    <FiscalYearContext.Provider
      value={{
        year,
        setYear,
        yearPickerOpen,
        setYearPickerOpen,
        YEAR_RANGE,
        CURRENT_YEAR,
      }}
    >
      {children}
    </FiscalYearContext.Provider>
  );
}

export function useFiscalYear() {
  const context = useContext(FiscalYearContext);
  if (context === undefined) {
    throw new Error("useFiscalYear must be used within a FiscalYearProvider");
  }
  return context;
}
