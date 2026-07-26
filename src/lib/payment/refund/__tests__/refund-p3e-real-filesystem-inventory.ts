import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export function walkRefundP3eRealFiles(root: string): string[] {
  const lexicalRoot = resolve(root);
  rejectSymlink(lexicalRoot);
  const realRoot = realpathSync(lexicalRoot);
  assertContained(realRoot, realRoot);
  return walkContained(realRoot, realRoot).sort();
}

function walkContained(root: string, directory: string): string[] {
  assertContained(root, directory);
  return readdirSync(directory)
    .filter((name) => name !== ".terraform")
    .flatMap((name) => {
      const path = join(directory, name);
      rejectSymlink(path);
      const status = lstatSync(path);
      const realPath = realpathSync(path);
      assertContained(root, realPath);
      if (status.isDirectory()) return walkContained(root, realPath);
      if (status.isFile()) return [realPath];
      throw new Error(`Unsupported inventory entry: ${path}`);
    });
}

function rejectSymlink(path: string): void {
  if (lstatSync(path).isSymbolicLink()) {
    throw new Error(`Inventory symlink rejected: ${path}`);
  }
}

function assertContained(root: string, candidate: string): void {
  const pathFromRoot = relative(root, candidate);
  if (
    pathFromRoot === ".."
    || pathFromRoot.startsWith(`..${sep}`)
    || isAbsolute(pathFromRoot)
  ) {
    throw new Error(`Inventory path escaped root: ${candidate}`);
  }
}
