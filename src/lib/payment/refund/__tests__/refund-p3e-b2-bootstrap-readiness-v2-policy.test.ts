import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import attendedContract from "../../../../../infra/refund-sandbox/p3e-b2/contracts/attended-collector-core-v1.json";
import evidenceContract from "../../../../../infra/refund-sandbox/p3e-b2/contracts/trusted-project-bootstrap-readiness-v2.json";
import evidenceSchema from "../../../../../infra/refund-sandbox/p3e-b2/trusted-project-bootstrap-readiness-v2/evidence.schema.json";
import {
  assembleTb2aReviewerAbsentEvidence,
  buildTb2aReadOnlyCommand,
  computeTb2aEvidenceDigest,
  parseAndEvaluateTb1Evidence,
  parseAndEvaluateTb2aEvidence,
  parseTb2aCommandOutput,
  tb2aEvidencePassesStructuralSchemaPrefilter,
  TB2A_ADAPTER_CONTRACT_VERSION,
  TB2A_AUTOMATIC_RETRIES,
  TB2A_BOOTSTRAP_API_ACTIVATION_DISPOSITION_REAL_REACHABILITY,
  TB2A_COMMAND_KINDS,
  TB2A_CONTRACT_VERSION,
  TB2A_EVIDENCE_VERSION,
  TB2A_MAX_ATTEMPTS,
  TB2A_MAX_RETRIES,
  TB2A_METHOD_A_DISABLED_INFERENCE,
  TB2A_METHOD_A_MISSING_TARGET_STATE,
  TB2A_REMOTE_COMMAND_KINDS,
  TB2A_REMOTE_COMMAND_SURFACES,
  type Tb2aCommandKind,
  type Tb2aCommandReceipt,
  type Tb2aCommandResult,
} from "../../../../../scripts/refund-p3e-b2-bootstrap-readiness.mjs";

const ROOT = process.cwd();
const PROJECT_ID = "mira-refund-sbx";
const PROJECT_NUMBER = "123456789012";
const CONFIGURATION = "attended-review";
const NOW_MS = Date.parse("2026-07-27T12:00:00.000Z");
const REPOSITORY_COMMIT = "775d01f66963399798ea001623940ebc979da929";
const NONCE = "nonce_for_tb2a_r1_0001";
const TARGETS = Object.freeze([
  "cloudresourcemanager.googleapis.com",
  "serviceusage.googleapis.com",
  "storage.googleapis.com",
]);

describe("P3E-B2 TB2A evidence v2 policy", () => {
  it("preserves the immutable v1 files and publishes separate exact versions", () => {
    expect(attendedContract.contractVersion).toBe(TB2A_CONTRACT_VERSION);
    expect(evidenceContract.contractVersion).toBe(TB2A_EVIDENCE_VERSION);
    expect(evidenceSchema.$id).toContain("readiness-v2");
    expect(readFileSync(join(
      ROOT,
      "infra/refund-sandbox/p3e-b2/contracts/"
        + "trusted-project-bootstrap-readiness-v1.json",
    ))).not.toEqual(readFileSync(join(
      ROOT,
      "infra/refund-sandbox/p3e-b2/contracts/"
        + "trusted-project-bootstrap-readiness-v2.json",
    )));
  });

  it("freezes one attempt, zero retries, and six commands in exact order", () => {
    expect(TB2A_MAX_ATTEMPTS).toBe(1);
    expect(TB2A_MAX_RETRIES).toBe(0);
    expect(TB2A_AUTOMATIC_RETRIES).toBe("NONE");
    expect(TB2A_COMMAND_KINDS).toEqual([
      "EFFECTIVE_CONFIG_GET",
      "GCLOUD_VERSION",
      "COLLECTOR_IDENTITY",
      "PROJECT_GET",
      "BILLING_INFO_GET",
      "BOOTSTRAP_SERVICES_LIST",
    ]);
    expect(attendedContract.attempts).toMatchObject({
      maxAttempts: 1,
      maxRetries: 0,
      automaticRetries: "NONE",
    });
  });

  it("builds exact command surfaces without quota, filter, sort, or cap drift", () => {
    const commands = Object.fromEntries(TB2A_COMMAND_KINDS.map((kind) => [
      kind,
      buildTb2aReadOnlyCommand(kind, {
        projectId: PROJECT_ID,
        configurationName: CONFIGURATION,
      }),
    ]));

    expect(commands.PROJECT_GET).toEqual([
      "projects", "describe", PROJECT_ID, `--project=${PROJECT_ID}`,
      `--configuration=${CONFIGURATION}`, "--quiet", "--verbosity=none",
      "--format=json(projectId,projectNumber,lifecycleState)",
    ]);
    expect(commands.BILLING_INFO_GET).toEqual([
      "billing", "projects", "describe", PROJECT_ID,
      `--configuration=${CONFIGURATION}`, "--quiet", "--verbosity=none",
      "--format=json(projectId,billingEnabled)",
    ]);
    expect(commands.BOOTSTRAP_SERVICES_LIST).toEqual([
      "services", "list", "--enabled", `--project=${PROJECT_ID}`,
      `--configuration=${CONFIGURATION}`, "--quiet", "--verbosity=none",
      "--page-size=200",
      "--format=json(name,config.name,state,parent)",
    ]);
    const serviceArgs = commands.BOOTSTRAP_SERVICES_LIST ?? [];
    expect(serviceArgs.some((arg) => arg.startsWith("--filter"))).toBe(false);
    expect(serviceArgs.some((arg) => arg.startsWith("--sort-by"))).toBe(false);
    expect(serviceArgs.some((arg) => arg.startsWith("--limit"))).toBe(false);
    expect(serviceArgs).not.toContain("--available");
    expect(Object.values(commands).flat()).not.toContain("--billing-project");
  });

  it("records three remote sources and keeps three local commands out of that set", () => {
    expect(TB2A_REMOTE_COMMAND_KINDS).toEqual([
      "PROJECT_GET",
      "BILLING_INFO_GET",
      "BOOTSTRAP_SERVICES_LIST",
    ]);
    expect(TB2A_REMOTE_COMMAND_SURFACES).toEqual([
      "gcloud.projects.describe:json(projectId,projectNumber,lifecycleState)",
      "gcloud.billing.projects.describe:json(projectId,billingEnabled)",
      "gcloud.services.list.enabled:json(name,config.name,state,parent)",
    ]);
  });

  it("sanitizes effective configuration to booleans and a names-only fingerprint", () => {
    const result = parse("EFFECTIVE_CONFIG_GET", {
      core: {
        account: "private-collector@example.invalid",
        project: PROJECT_ID,
      },
      accessibility: { screen_reader: false },
    });

    expect(result).toMatchObject({
      ok: true,
      kind: "EFFECTIVE_CONFIG_GET",
      attemptCount: 1,
      cleanliness: {
        apiEndpointOverridesAbsent: true,
        customCaCertsFileAbsent: true,
        impersonationAbsent: true,
        accessTokenFileAbsent: true,
        credentialFileOverrideAbsent: true,
        proxyOverridesAbsent: true,
        quotaProjectAbsent: true,
        coreAccountPresent: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("private-collector");
    expect(JSON.stringify(result)).not.toContain(PROJECT_ID);
  });

  it.each([
    ["api endpoint", { api_endpoint_overrides: { storage: "https://invalid" }, core: { account: "a" } }],
    ["custom CA", { core: { account: "a", custom_ca_certs_file: "/private" } }],
    ["impersonation", { auth: { impersonate_service_account: "private" }, core: { account: "a" } }],
    ["access token", { auth: { access_token_file: "/private" }, core: { account: "a" } }],
    ["credential override", { auth: { credential_file_override: "/private" }, core: { account: "a" } }],
    ["proxy", { proxy: { address: "private" }, core: { account: "a" } }],
    ["quota project", { billing: { quota_project: "private" }, core: { account: "a" } }],
    ["missing account", { core: { project: PROJECT_ID } }],
  ])("rejects prohibited effective configuration: %s", (_name, value) => {
    expect(parse("EFFECTIVE_CONFIG_GET", value)).toEqual({
      ok: false,
      reason: "CONFIGURATION_REJECTED",
      attemptCount: 1,
    });
  });

  it("parses official Service Usage resource shape and ignores valid non-targets", () => {
    const result = parseServices([
      service("compute.googleapis.com"),
      ...TARGETS.map((name) => service(name)),
    ]);

    expect(result).toMatchObject({
      ok: true,
      kind: "BOOTSTRAP_SERVICES_LIST",
      observations: TARGETS.map((name) => ({
        name,
        state: "ENABLED",
        consumerProjectNumber: PROJECT_NUMBER,
      })),
    });
  });

  it("maps a missing target to UNOBSERVABLE and observation-incomplete", () => {
    expect(TB2A_METHOD_A_DISABLED_INFERENCE).toBe("FORBIDDEN");
    expect(TB2A_METHOD_A_MISSING_TARGET_STATE).toBe("UNOBSERVABLE");
    expect(
      TB2A_BOOTSTRAP_API_ACTIVATION_DISPOSITION_REAL_REACHABILITY,
    ).toBe("UNREACHABLE_WITH_METHOD_A");
    const receipts = makeReceipts([
      service(TARGETS[0] ?? ""),
      service(TARGETS[1] ?? ""),
      service("compute.googleapis.com"),
    ]);
    const serviceResult = receipts[5]?.result;
    expect(serviceResult).toMatchObject({
      ok: true,
      observations: [
        { name: TARGETS[0], state: "ENABLED" },
        { name: TARGETS[1], state: "ENABLED" },
        { name: TARGETS[2], state: "UNOBSERVABLE" },
      ],
    });

    const assembled = assemble(receipts);
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    expect(assembled.disposition).toBe("OBSERVATION_INCOMPLETE");
    expect(assembled.canonicalEvidence).not.toContain("DISABLED");
  });

  it("rejects digest-valid Method-A evidence with an explicit DISABLED API", () => {
    expect(evidenceContract.methodA.evidenceObservationStates).toEqual([
      "ENABLED",
      "UNOBSERVABLE",
    ]);
    expect(evidenceSchema.$defs.apiObservation.properties.state.enum).toEqual([
      "ENABLED",
      "UNOBSERVABLE",
    ]);
    const assembled = assemble(makeReceipts(
      TARGETS.map((name) => service(name)),
    ));
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    const disabledEvidence = structuredClone(assembled.evidence);
    const bootstrapApis = record(disabledEvidence.bootstrapApis);
    if (!Array.isArray(bootstrapApis.observations)) {
      throw new Error("TEST_FIXTURE_INVALID");
    }
    const firstObservation = record(bootstrapApis.observations[0]);
    firstObservation.state = "DISABLED";
    const integrity = record(disabledEvidence.integrity);
    integrity.evidenceSha256 = computeTb2aEvidenceDigest(disabledEvidence);
    const raw = JSON.stringify(disabledEvidence);

    expect(tb2aEvidencePassesStructuralSchemaPrefilter(
      disabledEvidence,
    )).toBe(false);
    expect(parseAndEvaluateTb2aEvidence(raw, NOW_MS)).toEqual({
      ok: false,
      reason: "EVIDENCE_INVALID",
    });
  });

  it.each([
    ["duplicate target", [
      ...TARGETS.map((name) => service(name)),
      service(TARGETS[0] ?? ""),
    ]],
    ["project mismatch", [
      ...TARGETS.slice(0, 2).map((name) => service(name)),
      service(TARGETS[2] ?? "", "999999999999"),
    ]],
    ["name/config mismatch", [
      ...TARGETS.slice(0, 2).map((name) => service(name)),
      {
        ...service(TARGETS[2] ?? ""),
        config: { name: "compute.googleapis.com" },
      },
    ]],
    ["malformed non-target", [...TARGETS.map((name) => service(name)), {
      name: "compute.googleapis.com",
      config: { name: "compute.googleapis.com" },
      state: "ENABLED",
      parent: `projects/${PROJECT_NUMBER}`,
    }]],
  ])("fails closed for %s", (_name, value) => {
    expect(parseServices(value)).toEqual({
      ok: false,
      reason: "MALFORMED_OUTPUT",
      attemptCount: 1,
    });
  });

  it("never retains a billing account identifier in a result", () => {
    const result = parse("BILLING_INFO_GET", {
      projectId: PROJECT_ID,
      billingEnabled: true,
      billingAccountName: "billingAccounts/SECRET-ACCOUNT",
    });

    expect(result).toEqual({
      ok: false,
      reason: "MALFORMED_OUTPUT",
      attemptCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it("assembles, canonicalizes, reparses, and deep-freezes reviewer-absent evidence", () => {
    const assembled = assemble(makeReceipts(
      TARGETS.map((name) => service(name)),
    ));

    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    expect(assembled.disposition).toBe("INDEPENDENT_REVIEW_REQUIRED");
    expect(assembled.evidence.contractVersion).toBe(TB2A_EVIDENCE_VERSION);
    expect(assembled.evidence.sources).toHaveLength(3);
    expect(assembled.evidence.collection).toMatchObject({
      maxAttempts: 1,
      maxRetries: 0,
      automaticRetries: "NONE",
    });
    expect(assembled.evidence.project).not.toHaveProperty(
      "bindingResponseSha256",
    );
    expect(assembled.evidence.provenance).toMatchObject({
      repositoryCommit: REPOSITORY_COMMIT,
      adapterContractVersion: TB2A_ADAPTER_CONTRACT_VERSION,
      effectiveCallerAttested: false,
    });
    expect(assembled.evidence.operators).toMatchObject({
      reviewer: { status: "ABSENT" },
    });
    expect(Object.values(
      record(assembled.evidence.downstreamAuthority),
    ).every((value) => value === false)).toBe(true);
    expect(Object.isFrozen(assembled.evidence)).toBe(true);
    expect(Object.isFrozen(assembled.evidence.collection)).toBe(true);
    expect(tb2aEvidencePassesStructuralSchemaPrefilter(
      assembled.evidence,
    )).toBe(true);
    expect(evidenceSchema.additionalProperties).toBe(false);
    expect(evidenceSchema.properties.contractVersion.const).toBe(
      TB2A_EVIDENCE_VERSION,
    );
    expect(evidenceSchema.$defs.sources.maxItems).toBe(3);
    expect(parseAndEvaluateTb2aEvidence(
      assembled.canonicalEvidence,
      NOW_MS,
    )).toEqual(assembled);
    expect(assembled.canonicalEvidence).not.toContain(
      "READY_FOR_STATE_BUCKET_PACKAGE",
    );
  });

  it("rejects wrong order, failed receipts, and collection duration over 120 seconds", () => {
    const reordered = [...makeReceipts(
      TARGETS.map((name) => service(name)),
    )];
    const first = reordered[0];
    const second = reordered[1];
    if (!first || !second) throw new Error("TEST_FIXTURE_INVALID");
    reordered[0] = second;
    reordered[1] = first;
    expect(assemble(reordered)).toEqual({
      ok: false,
      reason: "EVIDENCE_INVALID",
    });

    const failed = [...makeReceipts(
      TARGETS.map((name) => service(name)),
    )];
    const receipt = failed[3];
    if (!receipt) throw new Error("TEST_FIXTURE_INVALID");
    failed[3] = Object.freeze({
      ...receipt,
      result: Object.freeze({
        ok: false,
        reason: "COMMAND_FAILED",
        attemptCount: 1,
      }),
    });
    expect(assemble(failed)).toEqual({
      ok: false,
      reason: "EVIDENCE_INVALID",
    });

    const long = makeReceipts(
      TARGETS.map((name) => service(name)),
      25_000,
    );
    expect(assemble(long)).toEqual({
      ok: false,
      reason: "EVIDENCE_INVALID",
    });
  });

  it("requires exact evidence versions in both parser entry points", () => {
    const assembled = assemble(makeReceipts(
      TARGETS.map((name) => service(name)),
    ));
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;

    expect(parseAndEvaluateTb1Evidence(
      assembled.canonicalEvidence,
      NOW_MS,
    )).toEqual({ ok: false, reason: "EVIDENCE_INVALID" });
    expect(parseAndEvaluateTb2aEvidence(
      JSON.stringify({
        contractVersion:
          "mira-refund-p3e-b2-trusted-project-bootstrap-readiness/v1",
      }),
      NOW_MS,
    )).toEqual({ ok: false, reason: "EVIDENCE_INVALID" });
  });
});

function makeReceipts(
  services: readonly Record<string, unknown>[],
  durationMs = 10,
): Tb2aCommandReceipt[] {
  const results = new Map<Tb2aCommandKind, Tb2aCommandResult>([
    ["EFFECTIVE_CONFIG_GET", parse("EFFECTIVE_CONFIG_GET", {
      core: { account: "collector@example.invalid", project: PROJECT_ID },
    })],
    ["GCLOUD_VERSION", parse("GCLOUD_VERSION", {
      "Google Cloud SDK": "577.0.0",
    })],
    ["COLLECTOR_IDENTITY", parse("COLLECTOR_IDENTITY", [
      { account: "collector@example.invalid" },
    ])],
    ["PROJECT_GET", parse("PROJECT_GET", {
      projectId: PROJECT_ID,
      projectNumber: PROJECT_NUMBER,
      lifecycleState: "ACTIVE",
    })],
    ["BILLING_INFO_GET", parse("BILLING_INFO_GET", {
      projectId: PROJECT_ID,
      billingEnabled: true,
    })],
    ["BOOTSTRAP_SERVICES_LIST", parseServices(services)],
  ]);
  const start = Date.parse("2026-07-27T11:59:00.000Z");
  return TB2A_COMMAND_KINDS.map((kind, index) => {
    const startedAtMs = start + index * durationMs;
    const result = results.get(kind);
    if (!result) throw new Error("TEST_FIXTURE_INVALID");
    return Object.freeze({
      kind,
      args: buildTb2aReadOnlyCommand(kind, {
        projectId: PROJECT_ID,
        configurationName: CONFIGURATION,
      }),
      startedAt: new Date(startedAtMs).toISOString(),
      completedAt: new Date(startedAtMs + durationMs).toISOString(),
      durationMs,
      result,
    });
  });
}

function assemble(receipts: readonly Tb2aCommandReceipt[]) {
  return assembleTb2aReviewerAbsentEvidence({
    projectId: PROJECT_ID,
    configurationName: CONFIGURATION,
    repositoryCommit: REPOSITORY_COMMIT,
    nonce: NONCE,
    receipts,
    authoritativeNowMs: NOW_MS,
  });
}

function parse(kind: Tb2aCommandKind, value: unknown): Tb2aCommandResult {
  return parseTb2aCommandOutput(
    kind,
    Buffer.from(JSON.stringify(value)),
    { projectId: PROJECT_ID, projectNumber: PROJECT_NUMBER },
  );
}

function parseServices(
  value: readonly Record<string, unknown>[],
): Tb2aCommandResult {
  return parse("BOOTSTRAP_SERVICES_LIST", value);
}

function service(
  name: string,
  projectNumber = PROJECT_NUMBER,
): Record<string, unknown> {
  return {
    name: `projects/${projectNumber}/services/${name}`,
    parent: `projects/${projectNumber}`,
    config: { name },
    state: "ENABLED",
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("TEST_FIXTURE_INVALID");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
