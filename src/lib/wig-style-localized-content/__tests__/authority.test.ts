import { afterEach, describe, expect, it } from "vitest";
import {
  assertEditorialApprover,
  assertPublisher,
  getLocalizedContentCapabilities,
} from "../authority";

const EDITORIAL = "LPC_WIG_STYLE_EDITORIAL_APPROVER_USER_ID";
const PUBLISHER = "LPC_WIG_STYLE_PUBLISHER_USER_ID";

afterEach(() => {
  delete process.env[EDITORIAL];
  delete process.env[PUBLISHER];
});

describe("localized-content configured principals", () => {
  it("fails closed for absent, blank, and comma-separated values", () => {
    expect(getLocalizedContentCapabilities("admin")).toEqual({
      canApprove: false,
      canPublish: false,
      editorialApproverConfigured: false,
      publisherConfigured: false,
    });
    process.env[EDITORIAL] = "   ";
    process.env[PUBLISHER] = "admin,other";
    expect(() => assertEditorialApprover("admin")).toThrowError(
      expect.objectContaining({ code: "EDITORIAL_APPROVER_DISABLED" }),
    );
    expect(() => assertPublisher("admin")).toThrowError(
      expect.objectContaining({ code: "PUBLISHER_DISABLED" }),
    );
  });

  it("trims one principal and evaluates editorial and publication authority independently", () => {
    process.env[EDITORIAL] = " approver ";
    process.env[PUBLISHER] = "publisher";
    expect(getLocalizedContentCapabilities("approver")).toMatchObject({
      canApprove: true,
      canPublish: false,
    });
    expect(getLocalizedContentCapabilities("publisher")).toMatchObject({
      canApprove: false,
      canPublish: true,
    });
    expect(() => assertEditorialApprover("ordinary-admin")).toThrowError(
      expect.objectContaining({ code: "EDITORIAL_APPROVER_FORBIDDEN" }),
    );
    expect(() => assertPublisher("ordinary-admin")).toThrowError(
      expect.objectContaining({ code: "PUBLISHER_FORBIDDEN" }),
    );
  });
});
