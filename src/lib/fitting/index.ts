// ============================================================
// lib/fitting/index.ts — 피팅 계층 공개 API
// ============================================================

export { startFitting, pollFitting } from "./db";

export {
  FittingException,
  type FittingErrorCode,
  type StartFittingResult,
  type FittingPollResult,
} from "./types";
