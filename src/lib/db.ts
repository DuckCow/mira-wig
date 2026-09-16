import "server-only";
import { PrismaClient } from "@prisma/client";
import { createPrismaPg } from "./database/prisma-pg";

declare global {
  var prisma: PrismaClient | undefined; // globalThis 타입 보강에 필요한 TypeScript 관용구
}

function createPrismaClient(): PrismaClient {
  const adapter = createPrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const db: PrismaClient = globalThis.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalThis.prisma = db;
