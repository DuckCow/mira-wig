import type { StrandAsset, StrandRecord } from "./strand-asset";

export type VisualDensityTier = "LOW" | "MEDIUM" | "HIGH";

export interface ViewRotation {
  readonly yaw: number;
  readonly pitch: number;
}

export interface VisualState {
  readonly previewColor: string;
  readonly visualDensityTier: VisualDensityTier;
  readonly viewRotation: ViewRotation;
}

export const DEFAULT_VISUAL_STATE: VisualState = {
  previewColor: "#34251F",
  visualDensityTier: "MEDIUM",
  viewRotation: { yaw: 0, pitch: 0 },
};

const DENSITY_THRESHOLDS: Readonly<Record<VisualDensityTier, number>> = {
  LOW: 0.34,
  MEDIUM: 0.67,
  HIGH: 1,
};
const COLOR_PATTERN = /^#[0-9A-F]{6}$/;
const YAW_LIMIT = 0.9;
const MIN_PITCH = -0.38;
const MAX_PITCH = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function canonicalizePreviewColor(value: string): string {
  const canonical = value.trim().toUpperCase();
  if (!COLOR_PATTERN.test(canonical)) {
    throw new Error("previewColor must be a six-digit hexadecimal colour.");
  }
  return canonical;
}

export function canonicalizeViewRotation(rotation: ViewRotation): ViewRotation {
  if (!Number.isFinite(rotation.yaw) || !Number.isFinite(rotation.pitch)) {
    throw new Error("View rotation values must be finite.");
  }
  return {
    yaw: clamp(rotation.yaw, -YAW_LIMIT, YAW_LIMIT),
    pitch: clamp(rotation.pitch, MIN_PITCH, MAX_PITCH),
  };
}

export function canonicalizeVisualState(state: VisualState): VisualState {
  if (!(state.visualDensityTier in DENSITY_THRESHOLDS)) {
    throw new Error("visualDensityTier is unsupported.");
  }
  return {
    previewColor: canonicalizePreviewColor(state.previewColor),
    visualDensityTier: state.visualDensityTier,
    viewRotation: canonicalizeViewRotation(state.viewRotation),
  };
}

export function selectStrandsForTier(
  asset: StrandAsset,
  tier: VisualDensityTier,
): readonly StrandRecord[] {
  const threshold = DENSITY_THRESHOLDS[tier];
  return asset.strands.filter((strand) => strand.densityRank < threshold);
}
