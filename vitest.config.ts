import path from "path";
import { defineConfig } from "vitest/config";

// PostgreSQL-backed tests must use *.integration.test.ts or be added here.
const DATABASE_TEST_PATTERNS = [
  "src/**/*.integration.test.ts",
  "src/app/actions/__tests__/payment.test.ts",
  "src/app/api/payments/toss/success/__tests__/route.test.ts",
  "src/lib/fitting/__tests__/fitting.test.ts",
  "src/lib/payment/eximbay/__tests__/ready-http.test.ts",
  "src/lib/payment/providers/toss/__tests__/callback.test.ts",
] as const;

export default defineConfig({
  test: {
    environment: "node",
    // .env.test를 .env보다 먼저 로드 — 통합 테스트가 개발 DB 대신 테스트 DB를 사용한다.
    setupFiles: ["src/__tests__/setup.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "parallel",
          include: ["src/**/*.test.ts"],
          exclude: [...DATABASE_TEST_PATTERNS],
        },
      },
      {
        extends: true,
        test: {
          name: "database",
          include: [...DATABASE_TEST_PATTERNS],
          fileParallelism: false,
        },
      },
    ],
  },
  resolve: {
    alias: {
      // server-only는 Next.js 런타임 전용. vitest(Node.js)에서는 빈 모듈로 대체한다.
      "server-only": path.resolve(__dirname, "src/__mocks__/server-only.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
});
