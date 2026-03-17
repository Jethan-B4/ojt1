import type { CanvassingPRItem } from "@/types/canvassing";

export const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const prTotal = (items: CanvassingPRItem[]) =>
  items.reduce((s, i) => s + i.qty * i.unitCost, 0);
