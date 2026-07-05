// ============================================================
// lib/order/validation.ts 순수 함수 테스트
// DOM/DB 의존성 없음 — FormData Web API만 사용한다.
// ============================================================
import { describe, expect, it } from "vitest";
import {
  checkSimpleRequired,
  checkPatternField,
  getFieldError,
  collectFromFormData,
  hasSubmitError,
  REQUIRED_FIELDS,
} from "../validation";
import type { CountryFormConfig } from "../address-config";

// ── 테스트용 최소 config ──────────────────────────────────────

const KR_CONFIG: CountryFormConfig = {
  countryCode: "KR",
  postalCodeLabel: "우편번호",
  postalCodePlaceholder: "12345",
  postalCodePattern: /^\d{5}$/,
  phonePrefix: "+82",
  phonePlaceholder: "010-1234-5678",
  phonePattern: /^0\d{1,2}-\d{3,4}-\d{4}$/,
  administrativeAreaLabel: "시/도",
  administrativeAreaRequired: true,
  administrativeAreaOptions: null,
  cityLabel: "시/군/구",
};

// ── checkSimpleRequired ───────────────────────────────────────

describe("checkSimpleRequired", () => {
  it("값이 있으면 null 반환", () => {
    expect(checkSimpleRequired("홍길동", "이름")).toBeNull();
  });

  it("빈 문자열이면 에러 반환", () => {
    expect(checkSimpleRequired("", "이름")).toBeTruthy();
  });

  it("공백만 있으면 에러 반환", () => {
    expect(checkSimpleRequired("   ", "이름")).toBeTruthy();
  });

  it("에러 메시지에 label이 포함된다", () => {
    const msg = checkSimpleRequired("", "이름");
    expect(msg).toContain("이름");
  });
});

// ── checkPatternField ─────────────────────────────────────────

describe("checkPatternField", () => {
  const pattern = /^\d{5}$/;

  it("빈 값이면 emptyMsg 반환", () => {
    const msg = checkPatternField("", "우편번호 필수", pattern, "형식 오류");
    expect(msg).toBe("우편번호 필수");
  });

  it("패턴 통과하면 null 반환", () => {
    expect(checkPatternField("12345", "필수", pattern, "형식 오류")).toBeNull();
  });

  it("패턴 실패하면 formatMsg 반환", () => {
    expect(checkPatternField("1234X", "필수", pattern, "형식 오류")).toBe("형식 오류");
  });
});

// ── getFieldError ─────────────────────────────────────────────

describe("getFieldError", () => {
  it("recipientName — 빈 값이면 에러", () => {
    expect(getFieldError("recipientName", "", KR_CONFIG)).toBeTruthy();
  });

  it("recipientName — 값 있으면 null", () => {
    expect(getFieldError("recipientName", "홍길동", KR_CONFIG)).toBeNull();
  });

  it("phone — 빈 값이면 에러", () => {
    expect(getFieldError("phone", "", KR_CONFIG)).toBeTruthy();
  });

  it("phone — 올바른 형식이면 null", () => {
    expect(getFieldError("phone", "010-1234-5678", KR_CONFIG)).toBeNull();
  });

  it("phone — 잘못된 형식이면 에러", () => {
    expect(getFieldError("phone", "01012345678", KR_CONFIG)).toBeTruthy();
  });

  it("postalCode — 올바른 형식이면 null", () => {
    expect(getFieldError("postalCode", "12345", KR_CONFIG)).toBeNull();
  });

  it("postalCode — 잘못된 형식이면 에러", () => {
    expect(getFieldError("postalCode", "1234", KR_CONFIG)).toBeTruthy();
  });

  it("administrativeArea — required=true이고 빈 값이면 에러", () => {
    expect(getFieldError("administrativeArea", "", KR_CONFIG)).toBeTruthy();
  });

  it("administrativeArea — required=false이면 빈 값도 null", () => {
    const config: CountryFormConfig = { ...KR_CONFIG, administrativeAreaRequired: false, administrativeAreaOptions: null };
    expect(getFieldError("administrativeArea", "", config)).toBeNull();
  });

  it("city — 빈 값이면 에러", () => {
    expect(getFieldError("city", "", KR_CONFIG)).toBeTruthy();
  });

  it("addressLine1 — 빈 값이면 에러", () => {
    expect(getFieldError("addressLine1", "", KR_CONFIG)).toBeTruthy();
  });

  it("addressLine2, memo — 필수 아닌 필드는 항상 null", () => {
    expect(getFieldError("addressLine2", "", KR_CONFIG)).toBeNull();
    expect(getFieldError("memo", "", KR_CONFIG)).toBeNull();
  });
});

// ── 공통 헬퍼 ────────────────────────────────────────────────

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

// ── collectFromFormData ───────────────────────────────────────

describe("collectFromFormData", () => {
  it("FormData 값을 CheckoutShippingInput으로 수집한다", () => {
    const fd = makeFormData({
      recipientName: "홍길동", phone: "010-1234-5678", postalCode: "12345",
      administrativeArea: "서울특별시", city: "강남구",
      addressLine1: "테헤란로 1", addressLine2: "101호", memo: "경비실 맡겨주세요",
    });
    const result = collectFromFormData(fd, "KR");
    expect(result.recipientName).toBe("홍길동");
    expect(result.phone).toBe("010-1234-5678");
    expect(result.country).toBe("KR");
    expect(result.postalCode).toBe("12345");
    expect(result.administrativeArea).toBe("서울특별시");
    expect(result.city).toBe("강남구");
    expect(result.addressLine1).toBe("테헤란로 1");
    expect(result.addressLine2).toBe("101호");
    expect(result.memo).toBe("경비실 맡겨주세요");
  });

  it("누락된 필드는 빈 문자열로 처리한다", () => {
    const result = collectFromFormData(makeFormData({ recipientName: "홍길동" }), "KR");
    expect(result.phone).toBe("");
    expect(result.postalCode).toBe("");
  });

  it("country는 외부 주입값을 사용한다 (FormData 무시)", () => {
    expect(collectFromFormData(makeFormData({ country: "US" }), "KR").country).toBe("KR");
  });
});

// ── autofill 시뮬레이션 ───────────────────────────────────────
// 브라우저 autofill이 onChange를 건너뛰어 React state는 비어 있지만
// DOM(FormData)에는 값이 있는 상황을 시뮬레이션한다.

describe("autofill 시뮬레이션 — FormData 기반 검증", () => {
  it("React state가 비어도 FormData에 값이 있으면 검증 통과", () => {
    const fd = makeFormData({
      recipientName: "홍길동", phone: "010-1234-5678", postalCode: "12345",
      administrativeArea: "서울특별시", city: "강남구", addressLine1: "테헤란로 1",
    });
    expect(hasSubmitError(collectFromFormData(fd, "KR"), KR_CONFIG)).toBe(false);
  });

  it("FormData도 비어있으면 검증 실패", () => {
    expect(hasSubmitError(collectFromFormData(makeFormData({}), "KR"), KR_CONFIG)).toBe(true);
  });

  it("일부만 채워진 경우 검증 실패", () => {
    const fd = makeFormData({ recipientName: "홍길동" });
    expect(hasSubmitError(collectFromFormData(fd, "KR"), KR_CONFIG)).toBe(true);
  });
});

// ── hasSubmitError ────────────────────────────────────────────

describe("hasSubmitError", () => {
  function makeAddress(overrides: Partial<Record<string, string>> = {}) {
    return collectFromFormData(
      (() => {
        const fd = new FormData();
        const defaults: Record<string, string> = {
          recipientName: "홍길동",
          phone: "010-1234-5678",
          postalCode: "12345",
          administrativeArea: "서울특별시",
          city: "강남구",
          addressLine1: "테헤란로 1",
        };
        const merged: Record<string, string> = { ...defaults };
        for (const [k, v] of Object.entries(overrides)) {
          if (v !== undefined) merged[k] = v;
        }
        for (const [k, v] of Object.entries(merged)) fd.append(k, v);
        return fd;
      })(),
      "KR",
    );
  }

  it("모든 필드가 올바르면 false", () => {
    expect(hasSubmitError(makeAddress(), KR_CONFIG)).toBe(false);
  });

  it("필수 필드가 비어있으면 true", () => {
    expect(hasSubmitError(makeAddress({ recipientName: "" }), KR_CONFIG)).toBe(true);
  });

  it("패턴 불일치 필드가 있으면 true", () => {
    expect(hasSubmitError(makeAddress({ phone: "01012345678" }), KR_CONFIG)).toBe(true);
  });

  it("REQUIRED_FIELDS에 있는 모든 필드를 검사한다", () => {
    expect(REQUIRED_FIELDS).toContain("recipientName");
    expect(REQUIRED_FIELDS).toContain("phone");
    expect(REQUIRED_FIELDS).toContain("postalCode");
    expect(REQUIRED_FIELDS).toContain("administrativeArea");
    expect(REQUIRED_FIELDS).toContain("city");
    expect(REQUIRED_FIELDS).toContain("addressLine1");
  });
});
