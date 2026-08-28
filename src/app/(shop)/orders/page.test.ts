import { OrderStatus } from "@prisma/client";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticationLocale: vi.fn(),
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
vi.mock("@/lib/market", () => ({ getAuthenticationLocale: mocks.getAuthenticationLocale }));

import OrdersPage from "./page";

describe("customer Order list presentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticationLocale.mockResolvedValue("ko");
    mocks.getSession.mockResolvedValue({ user: { id: "customer_1" }, expires: "2099-01-01" });
    mocks.findMany.mockResolvedValue([{
      id: "order_1",
      status: OrderStatus.PAID,
      paidAt: new Date("2026-08-01T00:00:00.000Z"),
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      currency: "XYZ",
      totalAmount: 12_345,
      cancellation: null,
      items: [],
      _count: { items: 0 },
    }]);
  });

  it("shows an unknown Order currency as stored minor-unit data with unknown scale", async () => {
    const html = renderToStaticMarkup(await OrdersPage());

    expect(html).toContain("XYZ · 저장된 최소 단위 12345 · 소수 자릿수 확인 불가");
    expect(html).not.toMatch(/KRW|₩|123\.45/);
  });

  it.each([
    ["ko", "주문 취소"],
    ["en", "Order canceled"],
    ["ja", "注文取消"],
  ] as const)("renders an accepted cancellation badge from the %s message authority", async (locale, label) => {
    mocks.getAuthenticationLocale.mockResolvedValue(locale);
    mocks.findMany.mockResolvedValue([{
      id: "order_cancelled",
      status: OrderStatus.REFUND_PENDING,
      paidAt: new Date("2026-08-01T00:00:00.000Z"),
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      currency: "KRW",
      totalAmount: 12_345,
      cancellation: { id: "cancellation_1" },
      items: [],
      _count: { items: 0 },
    }]);

    const html = renderToStaticMarkup(await OrdersPage());

    expect(html).toContain(label);
    if (locale !== "ko") expect(html).not.toContain("주문 취소");
  });
});
