// ============================================================
// eslint.config.mjs
// CLAUDE.md 10번 섹션(코드 엄격도)을 기계적으로 강제하는 설정.
// 문서는 잊혀도 lint는 거부한다. 위반 시 CI 실패시킬 것.
// ------------------------------------------------------------
// 필요 패키지:
//   npm i -D eslint typescript-eslint eslint-plugin-import \
//           eslint-import-resolver-typescript @eslint/js
//   (Next.js 설정은 기존 eslint-config-next와 병행)
// ============================================================

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import nextPlugin from "@next/eslint-plugin-next";

const initiationModuleRestriction = {
  group: ["**/payment/providers/initiation"],
  message: "Only the payment-attempt contact owner may import raw initiation resolution.",
};
const initiationTypeRestriction = {
  group: ["**/payment/providers/types"],
  importNames: ["PaymentInitiationProvider", "PaymentProvider"],
  message: "Raw initiation capability types are restricted to the contact owner and provider infrastructure.",
};
const initiationFactoryRestriction = {
  group: ["**/payment/providers/factory"],
  importNames: ["createInitiationProvider"],
  message: "Raw initiation construction is restricted to provider infrastructure.",
};
const mockInitiationRestriction = {
  group: ["**/payment/providers/mock"],
  importNames: ["createMockPaymentProvider", "createMockPaymentInitiationProvider"],
  message: "Combined provider adapters must not escape provider infrastructure.",
};
const tossInitiationRestriction = {
  group: ["**/payment/providers/toss/adapter"],
  importNames: ["createTossSandboxPaymentProvider"],
  message: "Low-level initiation-capable adapters are restricted provider infrastructure.",
};

/**
 * @param {readonly Readonly<Record<string, unknown>>[]} patterns
 * @returns {readonly ["error", Readonly<{ patterns: readonly Readonly<Record<string, unknown>>[] }> ]}
 */
function restrictedInitiationImports(patterns) {
  return ["error", { patterns }];
}

export default tseslint.config(
  // Next.js 권장 규칙 (core-web-vitals 포함) — 베이스로 먼저 적용
  { ...nextPlugin.configs["core-web-vitals"], files: ["src/**/*.{ts,tsx}"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.mjs"],
        },
      },
    },
    plugins: {
      import: importPlugin,
    },
    settings: {
      "import/resolver": {
        typescript: true,
      },
    },
    // --------------------------------------------------------
    // 공통 강제 규칙 (CLAUDE.md 10-3) — 모든 존에 적용
    // --------------------------------------------------------
    rules: {
      // [10-3] as any / as unknown as 금지 — 암묵 계약을 타입으로 드러낸다
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" }, // as 단언 자체를 금지 → 타입가드로 유도
      ],

      // [10-3] 에러를 삼키지 않는다 — 빈 catch 금지
      "no-empty": ["error", { allowEmptyCatch: false }],
      // 무의미한 catch-rethrow도 거부
      "no-useless-catch": "error",

      // [10-3] 3단계 이상 중첩 금지 — early return / guard clause로 평탄화
      "max-depth": ["error", 3],
      // 복잡도 상한 (갓펑션의 또다른 신호)
      complexity: ["error", 10],
      // 콜백 중첩도 제한
      "max-nested-callbacks": ["error", 3],

      // [10-3 / 4-1] 순환 의존성 금지
      "import/no-cycle": ["error", { maxDepth: Infinity }],
      // 죽은 import 금지
      "import/no-unresolved": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // 조용한 실패 방지 — floating promise(await 누락) 거부
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },

  // --------------------------------------------------------
  // STRICT 존 (CLAUDE.md 10-1) — 더 빡빡하게
  // --------------------------------------------------------
  {
    files: [
      "src/lib/payment/**/*.ts",
      "src/lib/ai/**/*.ts",
      "src/lib/storage/**/*.ts",
      "src/lib/fitting/**/*.ts",
      "src/lib/auth.ts",
      "src/app/api/orders/**/*.ts",
      "src/app/api/payments/**/*.ts",
    ],
    rules: {
      // 핵심 로직은 더 엄격: 복잡도 8
      complexity: ["error", 8],
      // STRICT 존에서는 any 관련 우회를 추가로 차단
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
    },
  },

  // --------------------------------------------------------
  // 테스트 파일 — 시나리오 서술력을 보존하되 타입/안전 규칙은 유지.
  // --------------------------------------------------------
  {
    files: ["src/**/__tests__/**/*.ts", "src/**/*.test.ts", "src/**/*.integration.test.ts"],
    rules: {
      complexity: ["error", 10],
    },
  },

  // Raw provider initiation is a restricted capability. Ordinary production
  // modules may not import or re-export its resolver or construction seams.
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
    ignores: [
      "**/__tests__/**",
      "**/*.test.*",
      "**/*.spec.*",
      "coverage/**",
      "dist/**",
      "build/**",
      "out/**",
      ".next/**",
      "node_modules/**",
    ],
    rules: {
      "no-restricted-imports": [
        ...restrictedInitiationImports([
          initiationModuleRestriction,
          initiationTypeRestriction,
          initiationFactoryRestriction,
          mockInitiationRestriction,
          tossInitiationRestriction,
        ]),
      ],
    },
  },
  {
    files: ["src/lib/payment/attempt/initiate.ts"],
    rules: {
      "no-restricted-imports": restrictedInitiationImports([
        initiationFactoryRestriction,
        mockInitiationRestriction,
        tossInitiationRestriction,
      ]),
    },
  },
  {
    files: ["src/lib/payment/providers/initiation.ts"],
    rules: {
      "no-restricted-imports": restrictedInitiationImports([
        initiationModuleRestriction,
        mockInitiationRestriction,
        tossInitiationRestriction,
      ]),
    },
  },
  {
    files: ["src/lib/payment/providers/contract.ts"],
    rules: {
      "no-restricted-imports": restrictedInitiationImports([
        initiationModuleRestriction,
        initiationFactoryRestriction,
        mockInitiationRestriction,
        tossInitiationRestriction,
      ]),
    },
  },
  {
    files: ["src/lib/payment/providers/factory.ts"],
    rules: {
      "no-restricted-imports": restrictedInitiationImports([
        initiationModuleRestriction,
        tossInitiationRestriction,
        {
          ...mockInitiationRestriction,
          importNames: ["createMockPaymentProvider"],
        },
      ]),
    },
  },
  {
    files: ["src/lib/payment/providers/mock.ts"],
    rules: {
      "no-restricted-imports": restrictedInitiationImports([
        initiationModuleRestriction,
        initiationFactoryRestriction,
        tossInitiationRestriction,
      ]),
    },
  },
  {
    files: ["src/lib/payment/providers/toss/adapter.ts"],
    rules: {
      "no-restricted-imports": restrictedInitiationImports([
        initiationModuleRestriction,
        initiationFactoryRestriction,
        mockInitiationRestriction,
      ]),
    },
  },

  // 빌드 산출물 등 무시
  {
    // Repository-root review exports are evidence copies, outside runtime/test inputs.
    ignores: [".next/**", "node_modules/**", "dist/**", "next-env.d.ts", ".local-review/**"],
  }
);
