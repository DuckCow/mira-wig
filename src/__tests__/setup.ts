// vitest global setup — 통합 테스트 전용 DB 환경 로드
// .env.test의 DATABASE_URL을 .env보다 먼저 로드한다.
import dotenv from "dotenv";
dotenv.config({ path: ".env.test", override: true });
