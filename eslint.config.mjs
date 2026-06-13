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

      // [10-3] 갓펑션/갓파일 금지 — 함수 50줄, 파일 300줄
      "max-lines-per-function": [
        "error",
        { max: 50, skipBlankLines: true, skipComments: true },
      ],
      "max-lines": [
        "error",
        { max: 300, skipBlankLines: true, skipComments: true },
      ],

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
      "src/lib/auth.ts",
      "src/app/api/orders/**/*.ts",
      "src/app/api/payments/**/*.ts",
    ],
    rules: {
      // 핵심 로직은 더 엄격: 함수 40줄, 복잡도 8
      "max-lines-per-function": [
        "error",
        { max: 40, skipBlankLines: true, skipComments: true },
      ],
      complexity: ["error", 8],
      // STRICT 존에서는 any 관련 우회를 추가로 차단
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
    },
  },

  // --------------------------------------------------------
  // React 컴포넌트 / 페이지 (NORMAL 존, .tsx)
  // JSX는 함수 한 개가 길어지기 쉬움 → 함수 길이 상한만 완화.
  // 나머지 공통 규칙은 그대로 적용.
  // --------------------------------------------------------
  {
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
    rules: {
      // JSX 반환부 때문에 50줄은 비현실적 → 150줄로 완화
      "max-lines-per-function": [
        "error",
        { max: 150, skipBlankLines: true, skipComments: true },
      ],
    },
  },

  // --------------------------------------------------------
  // 설정/시드/스크립트 파일 — 일부 규칙 면제
  // --------------------------------------------------------
  {
    files: ["prisma/seed.ts", "*.config.*", "*.mjs"],
    rules: {
      "max-lines-per-function": "off",
      "max-lines": "off",
    },
  },

  // 빌드 산출물 등 무시
  {
    ignores: [".next/**", "node_modules/**", "dist/**", "next-env.d.ts"],
  }
);
