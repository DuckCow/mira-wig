import {
  MANUAL_STYLE_RELATION_PURPOSES,
  ManualStyleRelationPurpose,
  type ManualStyleRelationPurpose as ManualStyleRelationPurposeValue,
} from "./types";

export type ManualItemRelationsActivationEnv =
  Readonly<Record<string, string | undefined>>;

export type ManualRelationCustomerGateState =
  | "OFF"
  | "ON"
  | "INVALID CONFIGURATION";

export type ManualRelationCustomerGateStates = Readonly<
  Record<ManualStyleRelationPurposeValue, ManualRelationCustomerGateState>
>;

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
  const states = getManualRelationCustomerGateStates(marketCode, env);
  return MANUAL_STYLE_RELATION_PURPOSES.filter((purpose) => {
    const state = states[purpose];
    if (state === "INVALID CONFIGURATION") {
      throw new ManualItemRelationsActivationConfigError(PURPOSE_KEYS[purpose]);
    }
    return state === "ON";
  });
}

export function getManualRelationCustomerGateStates(
  marketCode: string,
  env: ManualItemRelationsActivationEnv = process.env,
): ManualRelationCustomerGateStates {
  if (marketCode !== "KR") {
    return {
      [ManualStyleRelationPurpose.SIMILAR_STYLE]: "OFF",
      [ManualStyleRelationPurpose.COMPARE_WITH]: "OFF",
    };
  }
  return {
    [ManualStyleRelationPurpose.SIMILAR_STYLE]: getActivationState(
      env,
      PURPOSE_KEYS[ManualStyleRelationPurpose.SIMILAR_STYLE],
    ),
    [ManualStyleRelationPurpose.COMPARE_WITH]: getActivationState(
      env,
      PURPOSE_KEYS[ManualStyleRelationPurpose.COMPARE_WITH],
    ),
  };
}

function getActivationState(
  env: ManualItemRelationsActivationEnv,
  key: string,
): ManualRelationCustomerGateState {
  const value = env[key]?.trim();
  if (!value) return "OFF";
  if (value === "ENABLED") return "ON";
  return "INVALID CONFIGURATION";
}
