import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const ROOT = process.cwd();

export const SOURCE_EXTENSIONS = Object.freeze([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
] as const);
export const EXCLUDED_PRODUCTION_DIRECTORIES = Object.freeze([
  "node_modules", ".next", "coverage", "dist", "build",
] as const);
const TEST_ONLY_DIRECTORIES = Object.freeze(["__tests__"] as const);

export function productionSourceFiles(): readonly string[] {
  return [join(ROOT, "src"), join(ROOT, "scripts")]
    .flatMap(walkProductionSource)
    .sort();
}

export function walkProductionSource(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return excludedProductionDirectory(entry.name) ? [] : walkProductionSource(path);
    }
    if (!entry.isFile() || !sourceExtension(entry.name) || isTestFile(entry.name)) return [];
    return [path];
  });
}

export function isTestFile(name: string): boolean {
  const extension = sourceExtension(name);
  if (!extension) return false;
  const stem = name.slice(0, -extension.length);
  return stem.endsWith(".test") || stem.endsWith(".spec");
}

export function reverseReachableFiles(target: string, files: readonly string[]): string[] {
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

export function resolveRepositoryImport(importer: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return resolveSourcePath(join(ROOT, "src", specifier.slice(2)));
  if (specifier.startsWith(".")) return resolveSourcePath(resolve(dirname(importer), specifier));
  return null;
}

export function repositoryPath(path: string): string {
  return relative(ROOT, path);
}

function excludedProductionDirectory(name: string): boolean {
  return EXCLUDED_PRODUCTION_DIRECTORIES.some((excluded) => excluded === name)
    || TEST_ONLY_DIRECTORIES.some((testOnly) => testOnly === name);
}

function sourceExtension(path: string): typeof SOURCE_EXTENSIONS[number] | null {
  const extension = extname(path);
  return SOURCE_EXTENSIONS.find((supported) => supported === extension) ?? null;
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

function resolveSourcePath(base: string): string | null {
  const explicitExtension = extname(base);
  if (explicitExtension) return sourceExtension(base) && isRegularFile(base) ? base : null;
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
