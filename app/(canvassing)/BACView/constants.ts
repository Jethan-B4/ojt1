import type { CanvassStage } from "@/types/canvassing";
import { Platform } from "react-native";

export const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

export type StageMeta = {
  step: number;
  label: string;
  icon: string;
};

export const STAGE_ORDER: CanvassStage[] = [
  "pr_received",
  "release_canvass",
  "collect_canvass",
  "bac_resolution",
  "aaa_preparation",
];

export const STAGE_META: Record<CanvassStage, StageMeta> = {
  pr_received: { step: 6, label: "PR Received", icon: "inbox" },
  release_canvass: { step: 7, label: "Release", icon: "send" },
  collect_canvass: { step: 8, label: "Collect", icon: "assignment-return" },
  bac_resolution: { step: 9, label: "Resolution", icon: "gavel" },
  aaa_preparation: { step: 10, label: "AAA", icon: "emoji-events" },
};

export const PROC_MODES = [
  "Small Value Procurement (SVP)",
  "Competitive Bidding",
  "Direct Contracting",
  "Shopping",
  "Negotiated Procurement",
];

// Role IDs for users involved in the canvassing process (from DB roles table):
// role_id 6 = End User  (division representative who submitted the PR)
// role_id 7 = Canvasser (designated canvass collector per division)
export const CANVASS_ROLE_IDS = [6, 7];
