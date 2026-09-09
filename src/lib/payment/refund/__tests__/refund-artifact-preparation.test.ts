import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { refundArtifactEnvironment } from "../../../../../scripts/refund-artifact-environment.mjs";
import { fileSha256, publishRetainedArtifact, writeReceipt } from "../../../../../scripts/refund-artifact-retention.mjs";
import { readCurrentEximbayImageAuthority } from "../../../../../scripts/verify-refund-worker-image.mjs";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

it("passes task-local Docker/helper configuration into a real child without unrelated secrets", async () => {
  const directory = await temporary();
  const selected = refundArtifactEnvironment({ ...process.env, DOCKER_CONFIG: directory,
    CLOUDSDK_CONFIG: directory, DOCKER_HOST: "unix:///tmp/synthetic-docker.sock", DOCKER_CONTEXT: undefined,
    BUILDX_BUILDER: "desktop-linux", EXIMBAY_SANDBOX_API_KEY: "must-not-cross", DATABASE_URL: "must-not-cross" });
  const stdout = execFileSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify(process.env))"], { env: selected, encoding: "utf8" });
  const actual: unknown = JSON.parse(stdout);
  expect(actual).toMatchObject({ DOCKER_CONFIG: directory, CLOUDSDK_CONFIG: directory, DOCKER_HOST: "unix:///tmp/synthetic-docker.sock", BUILDX_BUILDER: "desktop-linux" });
  expect(actual).not.toHaveProperty("EXIMBAY_SANDBOX_API_KEY");
  expect(actual).not.toHaveProperty("DATABASE_URL");
});

it("rejects contradictory contexts and invalid configuration instead of silently falling back", () => {
  expect(() => refundArtifactEnvironment({ DOCKER_HOST: "unix:///tmp/socket", DOCKER_CONTEXT: "desktop-linux" })).toThrow("ARTIFACT_DOCKER_ENDPOINT_INVALID");
  expect(() => refundArtifactEnvironment({ DOCKER_CONFIG: "relative" })).toThrow("ARTIFACT_CONFIG_DIRECTORY_INVALID");
  expect(() => refundArtifactEnvironment({ DOCKER_HOST: "tcp://unreviewed:2375" })).toThrow("ARTIFACT_DOCKER_ENDPOINT_INVALID");
  expect(() => refundArtifactEnvironment({ BUILDX_BUILDER: "--push" })).toThrow("ARTIFACT_CONTEXT_INVALID");
});

it("preserves a successful build receipt and reusable bytes after simulated authentication/publication failure", async () => {
  const directory = await completedFixture();
  const before = await readFile(join(directory, "build.json"));
  const archive = await readFile(join(directory, "image.oci.tar"));
  const push = vi.fn(() => Promise.reject(new Error("synthetic authentication failure")));
  await expect(publishRetainedArtifact(directory, 1, push)).rejects.toThrow("PUBLICATION_FAILED_BUILD_RETAINED");
  expect(push).toHaveBeenCalledOnce();
  expect(await readFile(join(directory, "build.json"))).toEqual(before);
  expect(await readFile(join(directory, "image.oci.tar"))).toEqual(archive);
  expect(JSON.parse(await readFile(join(directory, "publication-1-result.json"), "utf8"))).toMatchObject({ commandSucceeded: false, retainedBuild: true, remoteOutcome: "REQUIRES_READBACK" });
  await expect(publishRetainedArtifact(directory, 1, push)).rejects.toMatchObject({ code: "EEXIST" });
  expect(push).toHaveBeenCalledOnce();
});

it("refuses changed retained bytes before any publication attempt", async () => {
  const directory = await completedFixture();
  await writeFile(join(directory, "image.oci.tar"), "changed");
  const push = vi.fn();
  await expect(publishRetainedArtifact(directory, 1, push)).rejects.toThrow("RETAINED_ARTIFACT_INVALID");
  expect(push).not.toHaveBeenCalled();
});

it("still reads v20 as its original immutable authority", async () => {
  const old = await readCurrentEximbayImageAuthority();
  expect(await fileSha256("infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v20.json")).toBe("2bf2887cc6bead7336dea8a36dc25fba695434674a272623f57299be42ad4cd8");
  expect(old).toMatchObject({ buildContext: { migrationCount: 41, migrationDigest: "4af152869389ea6ceab2108100b3b2effe772e64784f29e9d62ceb98e0be173c" } });
});

async function temporary() {
  const directory = await mkdtemp(join(tmpdir(), "mira-artifact-retention-test-")); directories.push(directory); return directory;
}
async function completedFixture() {
  const directory = await temporary();
  const archive = join(directory, "image.oci.tar");
  await writeFile(archive, "synthetic reusable artifact bytes");
  const receipt = { tag: `asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker:p3e-b2-${"a".repeat(12)}`,
    archive, archiveSha256: await fileSha256(archive), manifestDigest: `sha256:${"b".repeat(64)}`, buildSucceeded: true };
  await writeReceipt(directory, "build.json", receipt);
  await writeReceipt(directory, "verified.json", receipt);
  return directory;
}
