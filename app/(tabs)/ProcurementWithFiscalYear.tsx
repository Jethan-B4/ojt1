import React from "react";
import { FiscalYearProvider } from "../contexts/FiscalYearContext";
import ProcurementScreen from "./procurement";

export default function ProcurementWithFiscalYear() {
  return (
    <FiscalYearProvider>
      <ProcurementScreen />
    </FiscalYearProvider>
  );
}
