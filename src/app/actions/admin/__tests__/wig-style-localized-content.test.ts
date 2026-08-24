import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  decide: vi.fn(),
  publish: vi.fn(),
  withdraw: vi.fn(),
  revalidatePath: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin", () => ({
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("@/lib/wig-style-localized-content/commands", () => ({
  submitLocalizedRevision: mocks.submit,
  decideLocalizedRevision: mocks.decide,
  publishLocalizedRevision: mocks.publish,
  withdrawLocalizedPublication: mocks.withdraw,
}));

import {
  decideLocalizedRevisionAction,
  publishLocalizedRevisionAction,
  submitLocalizedRevisionAction,
} from "../wig-style-localized-content";

beforeEach(() => {
  mocks.requireAdmin.mockResolvedValue({
    success: true,
    session: { user: { id: "ordinary-admin", role: "ADMIN" } },
  });
  mocks.submit.mockResolvedValue({ wigStyleId: "style" });
  mocks.decide.mockResolvedValue({ id: "decision" });
  mocks.publish.mockResolvedValue({ wigStyleId: "style" });
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.LPC_WIG_STYLE_EDITORIAL_APPROVER_USER_ID;
  delete process.env.LPC_WIG_STYLE_PUBLISHER_USER_ID;
});

describe("localized-content admin action authority", () => {
  it("allows a generic administrator to author but not to approve or publish", async () => {
    process.env.LPC_WIG_STYLE_EDITORIAL_APPROVER_USER_ID = "configured-approver";
    process.env.LPC_WIG_STYLE_PUBLISHER_USER_ID = "configured-publisher";

    await expect(submitLocalizedRevisionAction({
      wigStyleId: "style",
      locale: "en",
      displayName: "Name",
      sourceKind: "MANUAL_AUTHORING",
      claimDisposition: "NON_MATERIAL",
      submissionKey: "submission",
    })).resolves.toEqual({ success: true });
    expect(mocks.submit).toHaveBeenCalledWith("ordinary-admin", expect.any(Object));

    await expect(decideLocalizedRevisionAction("style", {
      revisionId: "revision",
      decision: "APPROVED",
      requestKey: "approval",
    })).resolves.toEqual({ success: false, errorCode: "EDITORIAL_APPROVER_FORBIDDEN" });
    await expect(publishLocalizedRevisionAction("style", {
      revisionId: "revision",
      expectedPublicationVersion: 0,
      requestKey: "publish",
    })).resolves.toEqual({ success: false, errorCode: "PUBLISHER_FORBIDDEN" });
    expect(mocks.decide).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("fails closed when capability configuration is blank or malformed", async () => {
    process.env.LPC_WIG_STYLE_EDITORIAL_APPROVER_USER_ID = " ";
    process.env.LPC_WIG_STYLE_PUBLISHER_USER_ID = "one,two";
    await expect(decideLocalizedRevisionAction("style", {
      revisionId: "revision",
      decision: "APPROVED",
      requestKey: "approval",
    })).resolves.toEqual({ success: false, errorCode: "EDITORIAL_APPROVER_DISABLED" });
    await expect(publishLocalizedRevisionAction("style", {
      revisionId: "revision",
      expectedPublicationVersion: 0,
      requestKey: "publish",
    })).resolves.toEqual({ success: false, errorCode: "PUBLISHER_DISABLED" });
  });

  it("allows only each exact configured actor and keeps the checks distinct", async () => {
    process.env.LPC_WIG_STYLE_EDITORIAL_APPROVER_USER_ID = "configured-approver";
    process.env.LPC_WIG_STYLE_PUBLISHER_USER_ID = "configured-publisher";
    mocks.requireAdmin.mockResolvedValueOnce({
      success: true,
      session: { user: { id: "configured-approver", role: "ADMIN" } },
    });
    await expect(decideLocalizedRevisionAction("style", {
      revisionId: "revision",
      decision: "APPROVED",
      requestKey: "approval",
    })).resolves.toEqual({ success: true });
    expect(mocks.decide).toHaveBeenCalledWith("configured-approver", expect.any(Object));

    mocks.requireAdmin.mockResolvedValueOnce({
      success: true,
      session: { user: { id: "configured-publisher", role: "ADMIN" } },
    });
    await expect(publishLocalizedRevisionAction("style", {
      revisionId: "revision",
      expectedPublicationVersion: 0,
      requestKey: "publish",
    })).resolves.toEqual({ success: true });
    expect(mocks.publish).toHaveBeenCalledWith("configured-publisher", expect.any(Object));
  });
});
