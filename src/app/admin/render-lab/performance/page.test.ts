import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminGuardResult } from "@/lib/admin";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn<() => Promise<AdminGuardResult>>(),
  redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); }),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./RenderPerformanceClient", () => ({
  RenderPerformanceClient: () => null,
}));

import RenderPerformancePage from "./page";
import { RenderPerformanceClient } from "./RenderPerformanceClient";

describe("admin render performance page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      success: true,
      session: {
        user: { id: "admin", role: "ADMIN" },
        expires: "2099-01-01",
      },
    });
  });

  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)(
    "redirects %s before rendering the benchmark client",
    async (errorCode) => {
      mocks.requireAdmin.mockResolvedValue({ success: false, errorCode });
      await expect(RenderPerformancePage()).rejects.toThrow("REDIRECT:/");
      expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    },
  );

  it("authorizes locally before returning the dynamic client boundary", async () => {
    const element = await RenderPerformancePage();
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(isValidElement(element) && element.type).toBe(RenderPerformanceClient);
  });
});
