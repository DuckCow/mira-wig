import type { WigCategory } from "@/lib/catalog.types";

export const ManualStyleRelationPurpose = {
  SIMILAR_STYLE: "SIMILAR_STYLE",
  COMPARE_WITH: "COMPARE_WITH",
} as const;

export type ManualStyleRelationPurpose =
  (typeof ManualStyleRelationPurpose)[keyof typeof ManualStyleRelationPurpose];

export const MANUAL_STYLE_RELATION_PURPOSES = [
  ManualStyleRelationPurpose.SIMILAR_STYLE,
  ManualStyleRelationPurpose.COMPARE_WITH,
] as const;

export type ManualStyleRelationErrorCode =
  | "INVALID_ACTOR"
  | "RELATION_NOT_FOUND"
  | "RELATION_DUPLICATE"
  | "SELF_RELATION"
  | "INVALID_RELATION_PURPOSE"
  | "INVALID_PRIORITY"
  | "RATIONALE_REQUIRED"
  | "RATIONALE_TOO_LONG"
  | "RATIONALE_INVALID"
  | "SOURCE_STYLE_NOT_FOUND"
  | "TARGET_STYLE_NOT_FOUND"
  | "MARKET_NOT_FOUND"
  | "SOURCE_NOT_PUBLISHED"
  | "TARGET_NOT_PUBLISHED"
  | "TARGET_NO_ACTIVE_PRICED_VARIANT";

export class ManualStyleRelationException extends Error {
  constructor(
    public readonly code: ManualStyleRelationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ManualStyleRelationException";
  }
}

export interface CreateManualStyleRelationInput {
  sourceStyleId: string;
  targetStyleId: string;
  marketCode: string;
  purpose: ManualStyleRelationPurpose;
  priority: number;
  internalRationale?: string | null;
}

export interface UpdateManualStyleRelationInput {
  purpose?: ManualStyleRelationPurpose;
  priority?: number;
  internalRationale?: string | null;
}

export type ManualRelationDiagnostic =
  | "READY"
  | "TARGET_GLOBALLY_INACTIVE"
  | "TARGET_NOT_PUBLISHED"
  | "TARGET_NO_ACTIVE_PRICED_VARIANT";

export interface AdminManualStyleRelation {
  id: string;
  sourceStyleId: string;
  targetStyleId: string;
  marketCode: string;
  targetName: string;
  targetIsActive: boolean;
  targetMarketIsActive: boolean;
  targetHasActivePricedVariant: boolean;
  purpose: ManualStyleRelationPurpose;
  priority: number;
  isActive: boolean;
  internalRationale: string | null;
  diagnostic: ManualRelationDiagnostic;
}

export interface ManualRelationTargetChoice {
  id: string;
  name: string;
  isActive: boolean;
  marketIsActive: boolean;
  hasActivePricedVariant: boolean;
}

export interface ManualRelatedStyle {
  id: string;
  name: string;
  category: WigCategory;
  tags: string[];
  coverImageKey: string | null;
  basePrice: number;
}

export interface ManualRelatedStyleGroups {
  SIMILAR_STYLE: ManualRelatedStyle[];
  COMPARE_WITH: ManualRelatedStyle[];
}
