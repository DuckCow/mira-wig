import {
  MANUAL_STYLE_RELATION_PURPOSES,
  ManualStyleRelationPurpose,
  type ManualStyleRelationPurpose as ManualStyleRelationPurposeValue,
} from "./types";

export type ManualItemRelationsActivationEnv =
  Readonly<Record<string, string | undefined>>;

const PURPOSE_KEYS: Readonly<Record<ManualStyleRelationPurposeValue, string>> = {
  [ManualStyleRelationPurpose.SIMILAR_STYLE]:
    "MANUAL_ITEM_RELATIONS_KR_SIMILAR_STYLE_ENABLED",
  [ManualStyleRelationPurpose.COMPARE_WITH]:
    "MANUAL_ITEM_RELATIONS_KR_COMPARE_WITH_ENABLED",
};

export class ManualItemRelationsActivationConfigError extends Error {
  constructor(key: string) {
    super(`Invalid manual item relations activation configuration for ${key}.`);
    this.name = "ManualItemRelationsActivationConfigError";
  }
}

export function getEnabledManualRelationPurposes(
  marketCode: string,
  env: ManualItemRelationsActivationEnv = process.env,
): ManualStyleRelationPurposeValue[] {
  if (marketCode !== "KR") return [];
  return MANUAL_STYLE_RELATION_PURPOSES.filter((purpose) => (
    parseActivation(env, PURPOSE_KEYS[purpose])
  ));
}

function parseActivation(
  env: ManualItemRelationsActivationEnv,
  key: string,
): boolean {
  const value = env[key]?.trim();
  if (!value) return false;
  if (value === "ENABLED") return true;
  throw new ManualItemRelationsActivationConfigError(key);
}
