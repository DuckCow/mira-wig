import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { ManualStyleRelationException } from "@/lib/manual-item-relations/types";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  setActive: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/manual-item-relations/admin", () => ({
  createManualStyleRelation: mocks.create,
  updateManualStyleRelation: mocks.update,
  setManualStyleRelationActive: mocks.setActive,
}));

import {
  createManualStyleRelationAction,
  setManualStyleRelationActiveAction,
  updateManualStyleRelationAction,
} from "../admin/manual-item-relations";

function adminSession(): Session {
  return {
    user: {
      id: "authenticated-admin",
      email: "admin@example.com",
      name: "Admin",
      role: "ADMIN",
    },
    expires: "2099-01-01",
  };
}

const CREATE_INPUT = {
  sourceStyleId: "source",
  targetStyleId: "target",
  marketCode: "KR",
  purpose: "SIMILAR_STYLE" as const,
  priority: 10,
  internalRationale: "편집 검토",
};

describe("manual item relation admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      label: "unauthenticated",
      guard: { success: false as const, errorCode: "UNAUTHENTICATED" as const },
    },
    {
      label: "forbidden",
      guard: { success: false as const, errorCode: "FORBIDDEN" as const },
    },
  ])("guards every mutation before the service for $label", async ({ guard }) => {
    mocks.requireAdmin.mockResolvedValue(guard);
    const results = await Promise.all([
      createManualStyleRelationAction(CREATE_INPUT),
      updateManualStyleRelationAction("relation", { priority: 20 }),
      setManualStyleRelationActiveAction("relation", "false"),
    ]);
    expect(results).toEqual([guard, guard, guard]);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.setActive).not.toHaveBeenCalled();
  });

  it("uses only the authenticated actor snapshot and whitelists create fields", async () => {
    mocks.requireAdmin.mockResolvedValue({ success: true, session: adminSession() });
    mocks.create.mockResolvedValue({
      id: "relation-new",
      sourceStyleId: "source",
    });
    const clientInput = {
      ...CREATE_INPUT,
      sourceStyleId: " source ",
      createdByAdminUserId: "forged-creator",
      updatedByAdminUserId: "forged-updater",
      isActive: true,
    };
    const result = await createManualStyleRelationAction(clientInput);
    expect(result).toEqual({ success: true, relationId: "relation-new" });
    expect(mocks.create).toHaveBeenCalledWith("authenticated-admin", {
      ...CREATE_INPUT,
      sourceStyleId: " source ",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/styles/source");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/styles/source");
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/admin/styles/ source ");
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/styles/ source ");
  });

  it("whitelists mutable update fields and revalidates the persisted source", async () => {
    mocks.requireAdmin.mockResolvedValue({ success: true, session: adminSession() });
    mocks.update.mockResolvedValue({ sourceStyleId: "persisted-source" });
    const input = {
      purpose: "COMPARE_WITH" as const,
      priority: 5,
      internalRationale: "비교 검토",
      sourceStyleId: "forged-source",
      marketCode: "US",
      actorUserId: "forged-actor",
    };
    const result = await updateManualStyleRelationAction("relation", input);
    expect(result).toEqual({ success: true });
    expect(mocks.update).toHaveBeenCalledWith("authenticated-admin", "relation", {
      purpose: "COMPARE_WITH",
      priority: 5,
      internalRationale: "비교 검토",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/styles/persisted-source");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/styles/persisted-source");
  });

  it("supports activation and deactivation through the bounded state action", async () => {
    mocks.requireAdmin.mockResolvedValue({ success: true, session: adminSession() });
    mocks.setActive.mockResolvedValue({ sourceStyleId: "source" });
    await expect(setManualStyleRelationActiveAction("relation", true)).resolves.toEqual({
      success: true,
    });
    await expect(setManualStyleRelationActiveAction("relation", false)).resolves.toEqual({
      success: true,
    });
    expect(mocks.setActive).toHaveBeenNthCalledWith(
      1,
      "authenticated-admin",
      "relation",
      true,
    );
    expect(mocks.setActive).toHaveBeenNthCalledWith(
      2,
      "authenticated-admin",
      "relation",
      false,
    );
  });

  it("passes raw active state without coercion and skips revalidation on bounded failure", async () => {
    mocks.requireAdmin.mockResolvedValue({ success: true, session: adminSession() });
    mocks.setActive.mockRejectedValue(
      new ManualStyleRelationException(
        "INVALID_ACTIVE_STATE",
        "invalid active state",
      ),
    );

    await expect(
      setManualStyleRelationActiveAction("relation", "false"),
    ).resolves.toEqual({
      success: false,
      errorCode: "INVALID_ACTIVE_STATE",
    });
    expect(mocks.setActive).toHaveBeenCalledWith(
      "authenticated-admin",
      "relation",
      "false",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("maps bounded relation failures and rethrows unknown failures", async () => {
    mocks.requireAdmin.mockResolvedValue({ success: true, session: adminSession() });
    mocks.create.mockRejectedValueOnce(
      new ManualStyleRelationException("RELATION_DUPLICATE", "duplicate"),
    );
    await expect(createManualStyleRelationAction(CREATE_INPUT)).resolves.toEqual({
      success: false,
      errorCode: "RELATION_DUPLICATE",
    });
    mocks.update.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(
      updateManualStyleRelationAction("relation", { priority: 1 }),
    ).rejects.toThrow("database unavailable");
  });
});
