import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const REFUND_ROOT = join(ROOT, "src", "lib", "payment", "refund");
const CYCLE = join(REFUND_ROOT, "run-refund-execution-worker-cycle.ts");
const HOST = join(REFUND_ROOT, "run-refund-execution-worker-host.ts");
const HOST_CONTRACT = join(REFUND_ROOT, "worker-host-contract.ts");
const LIFECYCLE = join(REFUND_ROOT, "worker-host-lifecycle.ts");
const PROCESS = join(REFUND_ROOT, "worker-host-process.ts");
const SCRIPT = join(ROOT, "scripts", "refund-execution-worker.ts");
const SOURCE_EXTENSIONS = Object.freeze([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"] as const);
const EXCLUDED_PRODUCTION_DIRECTORIES = Object.freeze([
  "node_modules",
  ".next",
  "coverage",
  "dist",
  "build",
] as const);
const TEST_ONLY_DIRECTORIES = Object.freeze(["__tests__"] as const);
const APPROVED_REACHABILITY = [CYCLE, HOST, PROCESS, SCRIPT].map(repositoryPath).sort();
const APPROVED_LIFECYCLE_REACHABILITY = [LIFECYCLE, HOST_CONTRACT, HOST, PROCESS, SCRIPT]
  .map(repositoryPath)
  .sort();
const WORKER_FILES = [
  CYCLE,
  "worker-allocation.ts",
  "worker-contract.ts",
  "worker-preflight.ts",
  "worker-result-classification.ts",
  "worker-router.ts",
  "worker-selector.ts",
].map((path) => path.startsWith(ROOT) ? path : join(REFUND_ROOT, path));

describe("refund execution worker reachability", () => {
  it("permits only the approved one-shot script chain to reach the dormant cycle", () => {
    const files = productionSourceFiles();
    const reachable = reverseReachableFiles(CYCLE, files).map(repositoryPath).sort();

    expect(reachable).toEqual(APPROVED_REACHABILITY);
    expect(reachable.some((path) => path.startsWith("src/app/"))).toBe(false);
    expect(reachable.some((path) => path.includes("middleware"))).toBe(false);
  });

  it("permits lifecycle ownership only through the approved one-shot host chain", () => {
    const files = productionSourceFiles();
    const reachable = reverseReachableFiles(LIFECYCLE, files).map(repositoryPath).sort();

    expect(reachable).toEqual(APPROVED_LIFECYCLE_REACHABILITY);
    expect(reachable.some((path) => path.startsWith("src/app/"))).toBe(false);
    expect(reachable).not.toContain(repositoryPath(CYCLE));
  });

  it("keeps selector, allocation, and provider routing inside the existing cycle core", () => {
    const source = WORKER_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).toContain("createTossRefundExecutionAuthorizer");
    expect(source).toContain("createTossRefundContactExecutor");
    expect(source).toContain("createTossRefundRecoveryOperation");
    expect(source).not.toMatch(/claimRefundExecution|claimRefundAttemptForExecution/g);
    expect(source).not.toMatch(/authorize-refund-dispatch|execute-toss-refund-contact|recover-toss-refund-execution/);
    expect(source).not.toMatch(/\bfetch\s*\(|console\.|setInterval|setTimeout|cron|scheduler|signal/iu);
  });

  it("exposes only the two approved one-shot commands and one cooperative lifecycle budget", () => {
    const packageJson: unknown = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const scripts = packageScripts(packageJson);
    const workerScripts = Object.fromEntries(
      Object.entries(scripts).filter(([name]) => name.startsWith("refund:worker:")),
    );
    const hostSource = [HOST, PROCESS, SCRIPT]
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const lifecycleSource = readFileSync(LIFECYCLE, "utf8");

    expect(workerScripts).toEqual({
      "refund:worker:check": "node --import tsx scripts/refund-execution-worker.ts check",
      "refund:worker:once": "node --import tsx scripts/refund-execution-worker.ts run-once",
    });
    expect(hostSource).not.toMatch(
      /setInterval|setTimeout|setImmediate|queueMicrotask|process\.on|cron|scheduler|daemon|heartbeat|while\s*\(/iu,
    );
    expect(lifecycleSource.match(/\bsetTimeout\s*\(/gu)).toHaveLength(1);
    expect(lifecycleSource).toContain("REFUND_EXECUTION_WORKER_COOPERATIVE_BUDGET_MS = 120_000");
    expect(lifecycleSource).toContain('process.on(signal, listener)');
    expect(lifecycleSource).toContain('process.off(signal, listener)');
    expect(lifecycleSource).toContain('"SIGTERM"');
    expect(lifecycleSource).toContain('"SIGINT"');
    expect(lifecycleSource).not.toMatch(
      /setInterval|setImmediate|queueMicrotask|cron|scheduler|daemon|heartbeat|while\s*\(/iu,
    );
    expect(hostSource).not.toContain("refund-sandbox-acceptance");
    expect(hostSource).not.toContain("readSecretKey");
  });

  it("has no package lifecycle hook or GitHub workflow that starts or reaches the worker", () => {
    const packageJson: unknown = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const scripts = packageScripts(packageJson);
    const lifecycle = Object.entries(scripts).filter(([name]) => (
      /^(?:pre|post)?(?:start|dev|build|install|prepare)$/u.test(name)
    ));
    const workflows = productionTextFiles(join(ROOT, ".github"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(lifecycle.map((entry) => entry[1]).join("\n"))
      .not.toMatch(/refund:worker|refund-execution-worker|runRefundExecutionWorkerCycle/u);
    expect(workflows)
      .not.toMatch(/refund:worker|refund-execution-worker|runRefundExecutionWorkerCycle/u);
  });

  it.each([
    ["TypeScript side-effect import", ".ts", 'import "./cycle";'],
    ["TSX static import", ".tsx", 'import { cycle } from "./cycle";'],
    ["JavaScript static import", ".js", 'import { cycle } from "./cycle";'],
    ["JSX re-export", ".jsx", 'export { cycle } from "./cycle";'],
    ["MJS dynamic import", ".mjs", 'void import("./cycle");'],
    ["CommonJS require", ".cjs", 'void require("./cycle");'],
  ])("detects an indirect %s caller in the reverse reachability graph", async (
    _syntax,
    extension,
    source,
  ) => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "mira-worker-reachability-"));
    const cycle = join(fixtureRoot, "cycle.ts");
    const bridge = join(fixtureRoot, `bridge${extension}`);
    const entrypoint = join(fixtureRoot, "entrypoint.ts");
    try {
      await Promise.all([
        writeFile(cycle, "export const cycle = true;\n"),
        writeFile(bridge, `${source}\n`),
        writeFile(entrypoint, 'export * from "./bridge";\n'),
      ]);

      expect(reverseReachableFiles(cycle, [cycle, bridge, entrypoint]).sort()).toEqual(
        [cycle, bridge, entrypoint].sort(),
      );
    } finally {
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  });

  it("includes ordinary JavaScript paths containing test text and excludes only exact test forms", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "mira-worker-discovery-"));
    const sourceRoot = join(fixtureRoot, "src");
    try {
      await Promise.all([
        mkdir(join(sourceRoot, "contest"), { recursive: true }),
        mkdir(join(sourceRoot, "__tests__"), { recursive: true }),
        ...EXCLUDED_PRODUCTION_DIRECTORIES.map((name) => (
          mkdir(join(sourceRoot, name), { recursive: true })
        )),
      ]);
      await Promise.all([
        writeFile(join(sourceRoot, "contest", "refund-worker.js"), "export {};\n"),
        writeFile(join(sourceRoot, "__tests__", "refund-worker.js"), "export {};\n"),
        writeFile(join(sourceRoot, "refund-worker.test.mjs"), "export {};\n"),
        writeFile(join(sourceRoot, "refund-worker.spec.cjs"), "module.exports = {};\n"),
        ...EXCLUDED_PRODUCTION_DIRECTORIES.map((name) => (
          writeFile(join(sourceRoot, name, "refund-worker.js"), "export {};\n")
        )),
      ]);

      expect(walkProductionSource(sourceRoot).map((path) => relative(sourceRoot, path)))
        .toEqual([join("contest", "refund-worker.js")]);
    } finally {
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  });

  it("recognizes exact test and spec basenames across every supported source extension", () => {
    for (const extension of SOURCE_EXTENSIONS) {
      expect(isTestFile(`refund-worker.test${extension}`)).toBe(true);
      expect(isTestFile(`refund-worker.spec${extension}`)).toBe(true);
      expect(isTestFile(`contest-refund-worker${extension}`)).toBe(false);
    }
  });

  it("resolves explicit, extensionless, and directory-index targets for all source extensions", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "mira-worker-resolution-"));
    const importer = join(fixtureRoot, "importer.ts");
    try {
      await writeFile(importer, "export {};\n");
      for (const [index, extension] of SOURCE_EXTENSIONS.entries()) {
        const explicit = join(fixtureRoot, `explicit-${index}${extension}`);
        const extensionless = join(fixtureRoot, `extensionless-${index}${extension}`);
        const indexDirectory = join(fixtureRoot, `directory-${index}`);
        const indexFile = join(indexDirectory, `index${extension}`);
        await mkdir(indexDirectory);
        await Promise.all([
          writeFile(explicit, "export {};\n"),
          writeFile(extensionless, "export {};\n"),
          writeFile(indexFile, "export {};\n"),
        ]);

        expect(resolveRepositoryImport(importer, `./explicit-${index}${extension}`))
          .toBe(explicit);
        expect(resolveRepositoryImport(importer, `./extensionless-${index}`))
          .toBe(extensionless);
        expect(resolveRepositoryImport(importer, `./directory-${index}`))
          .toBe(indexFile);
      }
      const priorityDirectory = join(fixtureRoot, "priority-directory");
      await mkdir(priorityDirectory);
      await Promise.all(SOURCE_EXTENSIONS.flatMap((extension) => [
        writeFile(join(fixtureRoot, `priority${extension}`), "export {};\n"),
        writeFile(join(priorityDirectory, `index${extension}`), "export {};\n"),
      ]));
      expect(resolveRepositoryImport(importer, "./priority"))
        .toBe(join(fixtureRoot, "priority.ts"));
      expect(resolveRepositoryImport(importer, "./priority-directory"))
        .toBe(join(priorityDirectory, "index.ts"));
      await writeFile(join(fixtureRoot, "unsupported.json"), "{}\n");
      expect(resolveRepositoryImport(importer, "./unsupported.json")).toBeNull();
    } finally {
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  });
});

function productionSourceFiles(): readonly string[] {
  return [join(ROOT, "src"), join(ROOT, "scripts")]
    .flatMap(walkProductionSource)
    .sort();
}

function walkProductionSource(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return excludedProductionDirectory(entry.name) ? [] : walkProductionSource(path);
    }
    if (!entry.isFile() || !sourceExtension(entry.name) || isTestFile(entry.name)) return [];
    return [path];
  });
}

function isTestFile(name: string): boolean {
  const extension = sourceExtension(name);
  if (!extension) return false;
  const stem = name.slice(0, -extension.length);
  return stem.endsWith(".test") || stem.endsWith(".spec");
}

function excludedProductionDirectory(name: string): boolean {
  return EXCLUDED_PRODUCTION_DIRECTORIES.some((excluded) => excluded === name)
    || TEST_ONLY_DIRECTORIES.some((testOnly) => testOnly === name);
}

function sourceExtension(path: string): typeof SOURCE_EXTENSIONS[number] | null {
  const extension = extname(path);
  return SOURCE_EXTENSIONS.find((supported) => supported === extension) ?? null;
}

function reverseReachableFiles(target: string, files: readonly string[]): string[] {
  const reverse = reverseImportGraph(files);
  const visited = new Set<string>();
  const pending = [target];
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    pending.push(...(reverse.get(current) ?? []));
  }
  return [...visited];
}

function reverseImportGraph(files: readonly string[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const importer of files) {
    for (const specifier of importSpecifiers(readFileSync(importer, "utf8"))) {
      const imported = resolveRepositoryImport(importer, specifier);
      if (!imported) continue;
      const importers = graph.get(imported) ?? [];
      importers.push(importer);
      graph.set(imported, importers);
    }
  }
  return graph;
}

function importSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) specifiers.add(match[1]);
    }
  }
  return [...specifiers];
}

function resolveRepositoryImport(importer: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return resolveSourcePath(join(ROOT, "src", specifier.slice(2)));
  if (specifier.startsWith(".")) return resolveSourcePath(resolve(dirname(importer), specifier));
  return null;
}

function resolveSourcePath(base: string): string | null {
  const explicitExtension = extname(base);
  if (explicitExtension) {
    return sourceExtension(base) && isRegularFile(base) ? base : null;
  }
  for (const extension of SOURCE_EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (isRegularFile(candidate)) return candidate;
  }
  for (const extension of SOURCE_EXTENSIONS) {
    const candidate = join(base, `index${extension}`);
    if (isRegularFile(candidate)) return candidate;
  }
  return null;
}

function isRegularFile(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function productionTextFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? productionTextFiles(path) : [path];
  });
}

function repositoryPath(path: string): string {
  return relative(ROOT, path);
}

function packageScripts(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || !("scripts" in value)) return {};
  const scripts: unknown = value.scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return {};
  return Object.fromEntries(Object.entries(scripts).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  ));
}
