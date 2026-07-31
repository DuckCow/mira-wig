import { describe, expect, it } from "vitest";
import {
  ManualStyleRelationException,
  ManualStyleRelationPurpose,
} from "../types";
import {
  assertActiveRationale,
  assertManualRelationActiveState,
  assertManualRelationPriority,
  assertManualRelationPurpose,
  compareUtf16CodeUnits,
  normalizeManualRelationRationale,
} from "../validation";

function expectCode(run: () => void, code: ManualStyleRelationException["code"]): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ManualStyleRelationException);
    if (error instanceof ManualStyleRelationException) expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}.`);
}

describe("manual style relation validation", () => {
  it.each([
    ManualStyleRelationPurpose.SIMILAR_STYLE,
    ManualStyleRelationPurpose.COMPARE_WITH,
  ])("accepts exact purpose %s", (purpose) => {
    expect(() => assertManualRelationPurpose(purpose)).not.toThrow();
  });

  it.each(["similar_style", "SAME_FAMILY_OPTION", "", null, 1])(
    "rejects non-contract purpose %j",
    (purpose) => {
      expectCode(() => assertManualRelationPurpose(purpose), "INVALID_RELATION_PURPOSE");
    },
  );

  it.each([0, 10000])("accepts boundary priority %d", (priority) => {
    expect(() => assertManualRelationPriority(priority)).not.toThrow();
  });

  it.each([-1, 10001, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, "1"])(
    "rejects invalid priority %j",
    (priority) => {
      expectCode(() => assertManualRelationPriority(priority), "INVALID_PRIORITY");
    },
  );

  it.each([true, false])("accepts exact active state %j", (isActive) => {
    expect(() => assertManualRelationActiveState(isActive)).not.toThrow();
  });

  it.each([
    "true",
    "false",
    "0",
    "1",
    0,
    1,
    null,
    undefined,
    {},
    [],
  ])("rejects non-boolean active state %j", (isActive) => {
    expectCode(
      () => assertManualRelationActiveState(isActive),
      "INVALID_ACTIVE_STATE",
    );
  });

  it("uses ECMAScript Unicode trimming and stores the normalized value", () => {
    expect(normalizeManualRelationRationale("\uFEFF  편집 근거 \u00A0")).toBe("편집 근거");
    expect(normalizeManualRelationRationale(" \t\n ")).toBeNull();
    expect(normalizeManualRelationRationale(undefined)).toBeNull();
  });

  it("accepts 500 Unicode code points and rejects 501 without counting surrogate pairs twice", () => {
    const astral = "😀";
    expect(normalizeManualRelationRationale(astral.repeat(500))).toBe(astral.repeat(500));
    expectCode(
      () => normalizeManualRelationRationale(astral.repeat(501)),
      "RATIONALE_TOO_LONG",
    );
  });

  it.each(["내부\n개행", "내부\u0000널", "내부\u0085제어"])(
    "rejects C0/C1 controls in non-trimmed content",
    (rationale) => {
      expectCode(() => normalizeManualRelationRationale(rationale), "RATIONALE_INVALID");
    },
  );

  it("allows null only for inactive draft validation", () => {
    expect(normalizeManualRelationRationale(null)).toBeNull();
    expectCode(() => assertActiveRationale(null), "RATIONALE_REQUIRED");
    expect(() => assertActiveRationale("검토됨")).not.toThrow();
  });

  it("orders by JavaScript UTF-16 code units without locale collation", () => {
    const values = ["z", "\uE000", "\u{10000}", "a"];
    expect(values.sort(compareUtf16CodeUnits)).toEqual(["a", "z", "\u{10000}", "\uE000"]);
  });
});
