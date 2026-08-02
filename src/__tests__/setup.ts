// vitest global setup — 통합 테스트 전용 DB 환경 로드
// 명시적인 격리 DATABASE_URL이 없을 때만 저장소 기본 테스트 DB를 사용한다.
import dotenv from "dotenv";
if (!process.env.DATABASE_URL) dotenv.config({ path: ".env.test" });
