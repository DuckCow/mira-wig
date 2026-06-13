import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// next-auth v4가 핸들러 반환 타입을 any로 노출하는 라이브러리 한계.
// 실제 런타임 동작은 NextAuth가 보장하므로 이 파일에서만 예외 허용.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
