import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));

import { GET } from "./route";

const FIXTURE_DIRECTORY = resolve(
  process.cwd(),
  "src/lib/rendering/fixtures/r2-diagnostic-v1",
);

function requestFile(file: string): Promise<Response> {
  return GET(new Request(`http://localhost/admin/render-lab/strand-bundle/${file}`), {
    params: Promise.resolve({ file }),
  });
}

function adminGuard() {
  return {
    success: true as const,
    session: { user: { id: "admin-1", role: "ADMIN" }, expires: "2099-01-01" },
  };
}

function expectSecurityHeaders(response: Response): void {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
}

describe("admin strand bundle route authority", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
  });

  it.each([
    ["UNAUTHENTICATED", 401],
    ["FORBIDDEN", 403],
  ] as const)("returns the exact %s denial", async (errorCode, status) => {
    mocks.requireAdmin.mockResolvedValue({ success: false, errorCode });
    const response = await requestFile("manifest.json");

    expect(response.status).toBe(status);
    expectSecurityHeaders(response);
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });

  it.each([
    ["manifest.json", "application/json; charset=utf-8"],
    ["strands.bin", "application/octet-stream"],
  ] as const)("serves only the exact %s fixture with bounded headers", async (file, contentType) => {
    mocks.requireAdmin.mockResolvedValue(adminGuard());
    const expected = readFileSync(resolve(FIXTURE_DIRECTORY, file));
    const response = await requestFile(file);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(contentType);
    expect(response.headers.get("content-length")).toBe(String(expected.byteLength));
    expectSecurityHeaders(response);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(expected);
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
  });

  it.each([
    "unknown.json",
    "../manifest.json",
    "../../package.json",
    "%2e%2e%2fmanifest.json",
    "%252e%252e%252fmanifest.json",
    "..%2Fstrands.bin",
    "%2Fetc%2Fpasswd",
    "MANIFEST.JSON",
    "manifest.json?alternate=1",
  ])("returns 404 for non-allowlisted raw or encoded input %s", async (file) => {
    mocks.requireAdmin.mockResolvedValue(adminGuard());
    const response = await requestFile(file);

    expect(response.status).toBe(404);
    expectSecurityHeaders(response);
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });
});
