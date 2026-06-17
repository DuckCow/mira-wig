// ============================================================
// scripts/make-admin.ts — 기존 User를 ADMIN으로 승격하는 운영 스크립트
// ------------------------------------------------------------
// 사용법: npx tsx scripts/make-admin.ts <email>
// 또는:   npm run make-admin -- <email>
//
// - OAuth로 가입된 기존 User만 승격 (생성 안 함)
// - 이미 ADMIN이면 멱등하게 처리 (업데이트 없이 알림)
// - email 미존재 시 명확한 에러로 종료
// ============================================================

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const email = process.argv[2];

if (!email || !email.includes("@")) {
  console.error("❌ 사용법: npx tsx scripts/make-admin.ts <email>");
  process.exit(1);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ DATABASE_URL 환경변수가 설정되지 않았습니다.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const db = new PrismaClient({ adapter });

  try {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!user) {
      console.error(`❌ 이메일 '${email}'에 해당하는 사용자가 없습니다.`);
      console.error("   OAuth 로그인 후 가입된 사용자만 승격할 수 있습니다.");
      process.exit(1);
    }

    if (user.role === "ADMIN") {
      console.log(`ℹ️  '${user.email}' (${user.name ?? "-"})은 이미 ADMIN입니다. 변경 없음.`);
      return;
    }

    await db.user.update({
      where: { email },
      data: { role: "ADMIN" },
    });

    const updated = await db.user.findUnique({
      where: { email },
      select: { email: true, name: true, role: true },
    });

    console.log("✅ ADMIN 승격 완료:");
    console.table([updated]);
    console.log("⚠️  변경 사항을 반영하려면 해당 계정에서 로그아웃 후 재로그인하세요.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error("❌ 오류 발생:", e);
  process.exit(1);
});
