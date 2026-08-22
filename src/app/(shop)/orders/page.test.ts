import { OrderStatus } from "@prisma/client";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findMany: vi.fn(),
  redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/db", () => ({ db: { order: { findMany: mocks.findMany } } }));

import OrdersPage from "./page";

describe("customer Order list historical money presentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "customer_1" }, expires: "2099-01-01" });
    mocks.findMany.mockResolvedValue([{
      id: "order_1",
      status: OrderStatus.PAID,
      paidAt: new Date("2026-08-01T00:00:00.000Z"),
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      currency: "XYZ",
      totalAmount: 12_345,
      items: [],
      _count: { items: 0 },
    }]);
  });

  it("shows an unknown Order currency as stored minor-unit data with unknown scale", async () => {
    const html = renderToStaticMarkup(await OrdersPage());

    expect(html).toContain("XYZ · 저장된 최소 단위 12345 · 소수 자릿수 확인 불가");
    expect(html).not.toMatch(/KRW|₩|123\.45/);
  });
});
