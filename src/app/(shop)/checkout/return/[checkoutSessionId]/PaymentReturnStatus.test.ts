import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PaymentReturnViewStatus } from "@/lib/payment/return-status-contract";
import { PaymentReturnStatusView } from "./PaymentReturnStatus";

describe("payment return status presentation", () => {
  const cases: Array<[PaymentReturnViewStatus, string]> = [
    [{ kind: "SUCCEEDED", orderId: "order_1" }, "결제가 완료되었습니다."],
    [{ kind: "FAILED" }, "결제가 완료되지 않았습니다."],
    [{ kind: "PROCESSING" }, "결제 상태를 확인하고 있습니다."],
    [{ kind: "UNAVAILABLE" }, "결제 정보를 확인할 수 없습니다."],
    [{ kind: "UNRESOLVED" }, "결제 결과를 계속 확인해야 합니다."],
  ];

  it.each(cases)("renders the $kind state with an accessible announcement", (status, expectedText) => {
    const html = render(status);

    expect(html).toContain(expectedText);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("states explicitly that an observation timeout is not payment failure", () => {
    const html = render({ kind: "UNRESOLVED" });

    expect(html).toContain("결제 실패로 처리되지는 않았습니다.");
  });
});

function render(status: PaymentReturnViewStatus): string {
  return renderToStaticMarkup(createElement(PaymentReturnStatusView, { status }));
}
