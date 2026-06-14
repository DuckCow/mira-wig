import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // .env.test를 .env보다 먼저 로드 — 통합 테스트가 개발 DB 대신 테스트 DB를 사용한다.
    setupFiles: ["src/__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      // server-only는 Next.js 런타임 전용. vitest(Node.js)에서는 빈 모듈로 대체한다.
      "server-only": path.resolve(__dirname, "src/__mocks__/server-only.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
});
