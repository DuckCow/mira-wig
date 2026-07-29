import { describe, expect, it } from "vitest";

import {
  createAudienceNamespace,
  createLanguageTag,
  createLocaleCode,
  type AudienceNamespace,
  type LanguageTag,
  type LocaleCode,
} from "../types";

describe("opaque discovery context tokens", () => {
  it("requires validated factories at the TypeScript boundary", () => {
    // @ts-expect-error LocaleCode must not be structurally constructible.
    const locale: LocaleCode = { value: "en-US" };
    // @ts-expect-error LanguageTag must not be structurally constructible.
    const language: LanguageTag = { value: "en" };
    // @ts-expect-error AudienceNamespace must not be structurally constructible.
    const audience: AudienceNamespace = { value: "fixture:audience" };

    expect([locale.value, language.value, audience.value]).toEqual([
      "en-US",
      "en",
      "fixture:audience",
    ]);
  });

  it("keeps factory values serializable and runtime validated", () => {
    expect(JSON.stringify(createLocaleCode("en-US"))).toBe('{"value":"en-US"}');
    expect(JSON.stringify(createLanguageTag("en"))).toBe('{"value":"en"}');
    expect(JSON.stringify(createAudienceNamespace("fixture:audience"))).toBe(
      '{"value":"fixture:audience"}',
    );

    expect(() => createLocaleCode(" en-US")).toThrow(RangeError);
    expect(() => createLanguageTag("")).toThrow(RangeError);
    expect(() => createAudienceNamespace("fixture:audience ")).toThrow(
      RangeError,
    );
  });
});
