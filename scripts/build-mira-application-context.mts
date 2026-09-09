import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, lstat, readFile, copyFile, writeFile } from "node:fs/promises";
import { dirname, join, isAbsolute } from "node:path";

const rootFiles = new Set([
  "package.json", "package-lock.json", "next.config.ts", "tsconfig.json",
  "postcss.config.mjs", "prisma.config.ts", "prisma/schema.prisma",
  "containers/mira-application/Dockerfile",
]);

export function isMiraApplicationInput(path: string): boolean {
  if (path.split("/").some((part) => part.startsWith(".") || part === "__tests__" || part === "__mocks__")) return false;
  if (/\.(?:test|spec)\.[^.]+$/u.test(path)) return false;
  return rootFiles.has(path) || ["src/", "public/", "content/"].some((prefix) => path.startsWith(prefix));
}

// Git's tracked inventory, narrowed to application inputs. Never copy the repository
// root, .env files, local evidence, generated host clients, worker contexts or infra.
export async function assembleMiraApplicationContext(directory: string) {
  if (!isAbsolute(directory)) throw new Error("APPLICATION_CONTEXT_MUST_BE_ABSOLUTE");
  await mkdir(directory, { mode: 0o700 });
  const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0").filter((path) => path && isMiraApplicationInput(path)).sort();
  if ([...rootFiles].some((path) => !paths.includes(path))) throw new Error("APPLICATION_INPUT_MISSING");
  const entries = [];
  for (const path of paths) {
    const status = await lstat(path);
    if (!status.isFile() || status.isSymbolicLink()) throw new Error("APPLICATION_INPUT_NOT_REGULAR");
    const bytes = await readFile(path);
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await copyFile(path, join(directory, path));
    entries.push({ path, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  const manifest = JSON.stringify(entries);
  await writeFile(join(directory, "application-inputs.json"), `${manifest}\n`, { mode: 0o600 });
  return { entries, sha256: createHash("sha256").update(manifest).digest("hex") };
}
