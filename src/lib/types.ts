export type BrainState =
  | "idle"
  | "listening"
  | "thinking"
  | "executing"
  | "speaking"
  | "interrupted"
  | "error"
  | "success"
  | "offline";

export type OrbState = BrainState;

export const BRAIN_STATE_COLORS: Record<BrainState, { hex: string; glow: string; label: string }> = {
  idle: {
    hex: "#8B5CF6",
    glow: "rgba(139, 92, 246, 0.35)",
    label: "SYSTEM STANDBY",
  },
  listening: {
    hex: "#22D3EE",
    glow: "rgba(34, 211, 238, 0.45)",
    label: "LISTENING",
  },
  thinking: {
    hex: "#A78BFA",
    glow: "rgba(167, 139, 250, 0.45)",
    label: "PROCESSING REQUEST",
  },
  executing: {
    hex: "#60A5FA",
    glow: "rgba(96, 165, 250, 0.45)",
    label: "EXECUTING TOOL",
  },
  speaking: {
    hex: "#22D3EE",
    glow: "rgba(34, 211, 238, 0.45)",
    label: "NEXUS SPEAKING",
  },
  interrupted: {
    hex: "#FBBF24",
    glow: "rgba(251, 191, 36, 0.4)",
    label: "RESPONSE INTERRUPTED",
  },
  error: {
    hex: "#FB7185",
    glow: "rgba(251, 113, 133, 0.45)",
    label: "FAULT DETECTED",
  },
  success: {
    hex: "#34D399",
    glow: "rgba(52, 211, 153, 0.45)",
    label: "OPERATION COMPLETE",
  },
  offline: {
    hex: "#64748B",
    glow: "rgba(100, 116, 139, 0.25)",
    label: "SYSTEM OFFLINE",
  },
};

export const ORB_STATE_HUES: Record<OrbState, number> = {
  idle: 262,
  listening: 190,
  thinking: 270,
  executing: 215,
  speaking: 190,
  interrupted: 45,
  error: 350,
  success: 155,
  offline: 220,
};

export const ORB_STATE_LABELS: Record<OrbState, string> = {
  idle: "SYSTEM STANDBY",
  listening: "LISTENING",
  thinking: "PROCESSING REQUEST",
  executing: "EXECUTING TOOL",
  speaking: "NEXUS SPEAKING",
  interrupted: "RESPONSE INTERRUPTED",
  error: "FAULT DETECTED",
  success: "OPERATION COMPLETE",
  offline: "SYSTEM OFFLINE",
};
