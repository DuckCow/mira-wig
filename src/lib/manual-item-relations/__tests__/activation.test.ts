import { describe, expect, it } from "vitest";
import {
  getEnabledManualRelationPurposes,
  getManualRelationCustomerGateStates,
  ManualItemRelationsActivationConfigError,
} from "../activation";

describe("manual item relation activation", () => {
  it.each([
    {},
    {
      MANUAL_ITEM_RELATIONS_KR_SIMILAR_STYLE_ENABLED: "",
      MANUAL_ITEM_RELATIONS_KR_COMPARE_WITH_ENABLED: "   ",
    },
  ])("keeps unset or blank values off", (env) => {
    expect(getEnabledManualRelationPurposes("KR", env)).toEqual([]);
  });

  it("enables the two purposes independently with exact ENABLED", () => {
    expect(getEnabledManualRelationPurposes("KR", {
      MANUAL_ITEM_RELATIONS_KR_SIMILAR_STYLE_ENABLED: "ENABLED",
    })).toEqual(["SIMILAR_STYLE"]);
    expect(getEnabledManualRelationPurposes("KR", {
      MANUAL_ITEM_RELATIONS_KR_COMPARE_WITH_ENABLED: " ENABLED ",
    })).toEqual(["COMPARE_WITH"]);
    expect(getEnabledManualRelationPurposes("KR", {
      MANUAL_ITEM_RELATIONS_KR_SIMILAR_STYLE_ENABLED: "ENABLED",
      MANUAL_ITEM_RELATIONS_KR_COMPARE_WITH_ENABLED: "ENABLED",
    })).toEqual(["SIMILAR_STYLE", "COMPARE_WITH"]);
  });

  it.each(["enabled", "true", "1", "DISABLED"])(
    "rejects invalid nonblank KR configuration %s",
    (value) => {
      expect(() => getEnabledManualRelationPurposes("KR", {
        MANUAL_ITEM_RELATIONS_KR_SIMILAR_STYLE_ENABLED: value,
      })).toThrow(ManualItemRelationsActivationConfigError);
    },
  );

  it("projects both KR customer gates without throwing on invalid configuration", () => {
    expect(getManualRelationCustomerGateStates("KR", {
      MANUAL_ITEM_RELATIONS_KR_SIMILAR_STYLE_ENABLED: " ENABLED ",
      MANUAL_ITEM_RELATIONS_KR_COMPARE_WITH_ENABLED: "invalid",
    })).toEqual({
      SIMILAR_STYLE: "ON",
      COMPARE_WITH: "INVALID CONFIGURATION",
    });
  });

  it.each([
    [undefined, "OFF"],
    ["   ", "OFF"],
    ["ENABLED", "ON"],
    [" ENABLED ", "ON"],
    ["enabled", "INVALID CONFIGURATION"],
  ] as const)("projects %s as %s", (value, expected) => {
    expect(getManualRelationCustomerGateStates("KR", {
      MANUAL_ITEM_RELATIONS_KR_SIMILAR_STYLE_ENABLED: value,
    }).SIMILAR_STYLE).toBe(expected);
  });

  it("returns no enabled purpose outside KR without inspecting dormant KR values", () => {
    expect(getEnabledManualRelationPurposes("US", {
      MANUAL_ITEM_RELATIONS_KR_SIMILAR_STYLE_ENABLED: "invalid",
      MANUAL_ITEM_RELATIONS_KR_COMPARE_WITH_ENABLED: "ENABLED",
    })).toEqual([]);
  });

  it("keeps non-KR diagnostic projections off without inspecting dormant KR values", () => {
    expect(getManualRelationCustomerGateStates("US", {
      MANUAL_ITEM_RELATIONS_KR_SIMILAR_STYLE_ENABLED: "invalid",
      MANUAL_ITEM_RELATIONS_KR_COMPARE_WITH_ENABLED: "ENABLED",
    })).toEqual({
      SIMILAR_STYLE: "OFF",
      COMPARE_WITH: "OFF",
    });
  });
});
