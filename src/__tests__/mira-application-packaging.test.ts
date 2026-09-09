import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { isMiraApplicationInput } from "../../scripts/build-mira-application-context.mjs";
import { fileSha256, publishRetainedArtifact, writeReceipt } from "../../scripts/refund-artifact-retention.mjs";
import { loadRefundReentryRelease } from "../lib/payment/refund/authorization/release";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function temporary() {
  const directory = await mkdtemp(join(tmpdir(), "mira-application-packaging-test-"));
  directories.push(directory); return directory;
}

it("excludes hidden secrets and task/test/bootstrap material from the application context", () => {
  for (const path of [".env.production", "src/.env", "public/.credentials/key", ".local-review/evidence.json",
    "src/__tests__/receipt.json", "src/lib/provider.test.ts", "infra/refund-sandbox/release.json",
    "prisma/migrations/m/migration.sql", "scripts/refund-execution-worker.ts", "node_modules/.prisma/client/index.js"])
    expect(isMiraApplicationInput(path), path).toBe(false);
  for (const path of ["src/app/api/payments/refunds/reentry/admission/route.ts", "prisma/schema.prisma",
    "public/logo.svg", "content/editorial/guides/example/body.md"])
    expect(isMiraApplicationInput(path), path).toBe(true);
});

it("retains application bytes on publication failure and rejects archive drift before retry", async () => {
  const directory = await temporary();
  const archive = join(directory, "image.oci.tar");
  await writeFile(archive, "synthetic application bytes");
  const receipt = { tag: `asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/mira-application:p3e-b2-${"a".repeat(12)}`,
    archive, archiveSha256: await fileSha256(archive), manifestDigest: `sha256:${"b".repeat(64)}` };
  await writeReceipt(directory, "verified.json", receipt);
  const push = vi.fn(() => Promise.reject(new Error("synthetic registry boundary")));
  await expect(publishRetainedArtifact(directory, 1, push)).rejects.toThrow("PUBLICATION_FAILED_BUILD_RETAINED");
  expect(await readFile(archive, "utf8")).toBe("synthetic application bytes");
  await writeFile(archive, "changed");
  await expect(publishRetainedArtifact(directory, 2, push)).rejects.toThrow("RETAINED_ARTIFACT_INVALID");
  expect(push).toHaveBeenCalledOnce();
});

it("loads only server-selected, absolute, byte-matched release configuration", async () => {
  const directory = await temporary();
  const path = join(directory, "synthetic-release.json");
  const bytes = JSON.stringify({ formatVersion: "mira-refund-reentry-release/v1",
    audience: "https://application.example.test/api/payments/refunds/reentry/admission",
    jobName: "projects/synthetic/locations/asia-northeast3/jobs/test", serviceAccountSubject: "123",
    serviceAccountEmail: "worker@synthetic.iam.gserviceaccount.com", mid: "synthetic-mid",
    merchantAccountBindingId: "synthetic-merchant", credentialGenerationBindingId: "synthetic-generation",
    secretResource: "projects/synthetic/secrets/test", secretVersion: "1",
    executionTemplate: { serviceAccount: "worker@synthetic.iam.gserviceaccount.com", maxRetries: 0, timeout: "180s",
      containers: [{ image: `example.test/synthetic@sha256:${"a".repeat(64)}`,
        env: [{ name: "MIRA_REFUND_AUTHORIZATION_ID", value: "${GRANT_ID}" }] }] } });
  const digest = createHash("sha256").update(bytes).digest("hex");
  await writeFile(path, bytes);
  const env = { MIRA_REFUND_REENTRY_RELEASE_FILE: path, MIRA_REFUND_REENTRY_RELEASE_SHA256: digest };
  expect(await loadRefundReentryRelease(digest, env)).toMatchObject({ digest, serviceAccountSubject: "123" });
  await expect(loadRefundReentryRelease(digest, { ...env, MIRA_REFUND_REENTRY_RELEASE_FILE: "relative.json" })).rejects.toThrow("CONFIG_INVALID");
  await expect(loadRefundReentryRelease("b".repeat(64), env)).rejects.toThrow("RELEASE_MISMATCH");
  await writeFile(path, `${bytes}\n`);
  await expect(loadRefundReentryRelease(digest, env)).rejects.toThrow("RELEASE_MISMATCH");
});
