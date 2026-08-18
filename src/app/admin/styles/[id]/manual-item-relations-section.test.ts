import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminManualStyleRelation,
  ManualRelationTargetChoice,
} from "@/lib/manual-item-relations/types";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));
vi.mock("@/app/actions/admin/manual-item-relations", () => ({
  createManualStyleRelationAction: vi.fn(),
  updateManualStyleRelationAction: vi.fn(),
  setManualStyleRelationActiveAction: vi.fn(),
}));

import { ManualItemRelationsSection } from "./ManualItemRelationsSection";

const RELATION: AdminManualStyleRelation = {
  id: "relation-1",
  sourceStyleId: "source-style",
  targetStyleId: "target-\u{10000}",
  marketCode: "KR",
  targetName: "비교 대상",
  targetIsActive: true,
  targetMarketIsActive: false,
  targetHasActivePricedVariant: false,
  purpose: "COMPARE_WITH",
  priority: 20,
  isActive: false,
  internalRationale: "관리자 전용 검토 근거",
  diagnostic: "TARGET_NOT_PUBLISHED",
};

const CHOICE: ManualRelationTargetChoice = {
  id: "draft-target",
  name: "출시 준비 대상",
  isActive: false,
  marketIsActive: false,
  hasActivePricedVariant: false,
};

describe("ManualItemRelationsSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders KR identity, stale diagnostics, rationale, and bounded operations", () => {
    const html = renderToStaticMarkup(React.createElement(ManualItemRelationsSection, {
      sourceStyleId: "source-style",
      relations: [RELATION],
      targetChoices: [CHOICE],
      customerGateStates: {
        SIMILAR_STYLE: "OFF",
        COMPARE_WITH: "ON",
      },
    }));
    expect(html).toContain("수동 스타일 관계 (KR)");
    expect(html).toContain("target-");
    expect(html).toContain("대상 KR 미공개");
    expect(html).toContain("관리자 전용 검토 근거");
    expect(html).toContain("편집 저장");
    expect(html).toContain("활성화");
    expect(html).toContain("비활성 초안 만들기");
    expect(html).toContain("고객 노출 게이트");
    expect(html).toContain("SIMILAR_STYLE");
    expect(html).toContain("COMPARE_WITH");
    expect(html).toContain("OFF");
    expect(html).toContain("ON");
    expect(html).not.toContain("삭제");
  });

  it("shows invalid customer gate configuration without exposing its raw value", () => {
    const html = renderToStaticMarkup(React.createElement(ManualItemRelationsSection, {
      sourceStyleId: "source-style",
      relations: [],
      targetChoices: [],
      customerGateStates: {
        SIMILAR_STYLE: "INVALID CONFIGURATION",
        COMPARE_WITH: "OFF",
      },
    }));
    expect(html).toContain("SIMILAR_STYLE");
    expect(html).toContain("INVALID CONFIGURATION");
    expect(html).toContain("COMPARE_WITH");
    expect(html).not.toContain("MANUAL_ITEM_RELATIONS_KR_SIMILAR_STYLE_ENABLED");
  });

  it("labels inactive and unpublished candidate targets for draft curation", () => {
    const html = renderToStaticMarkup(React.createElement(ManualItemRelationsSection, {
      sourceStyleId: "source-style",
      relations: [],
      targetChoices: [CHOICE],
      customerGateStates: {
        SIMILAR_STYLE: "OFF",
        COMPARE_WITH: "OFF",
      },
    }));
    expect(html).toContain("출시 준비 대상");
    expect(html).toContain("전역 비활성");
    expect(html).toContain("KR 미공개");
    expect(html).toContain("KR 활성·가격 없음");
  });
});
