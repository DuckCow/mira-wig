import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import legacyResourceMap from "../../../../../infra/refund-sandbox/p3e-b/legacy-resource-map-v1.json";

const ROOT = process.cwd();
const RETIRED_ROOT = join(ROOT, "infra/refund-sandbox/p3e-b");

describe("retired P3E-B1 infrastructure policy", () => {
  it("contains only the bounded retirement authority", () => {
    expect(walk(RETIRED_ROOT).map((path) => basename(path)).sort()).toEqual([
      "README.md",
      "legacy-resource-map-v1.json",
    ]);
    const source = walk(RETIRED_ROOT)
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(source).not.toMatch(
      /(?:resource|data|module|terraform|provider)\s+"?google_|backend\s+"/u,
    );
    expect(source).not.toMatch(
      /(?:terraform\s+(?:apply|destroy|import|refresh|state)|-target)/u,
    );
  });

  it("freezes the exact retirement status and 19-address ownership ledger", () => {
    expect(legacyResourceMap.statuses).toEqual({
      P3E_B1_MONOLITH: "RETIRED_UNAPPLIED",
      FOUNDATION_OWNER: "P3E_B2_R1B_FOUNDATION",
      RUNTIME_OWNER: "DEFERRED_TO_LATER_PACKAGES",
      STATE_MIGRATION: "NOT_REQUIRED_NO_STATE_EXISTED",
    });
    expect(legacyResourceMap.killCondition).toBe(
      "DISCOVERY_OF_UNDISCLOSED_REAL_B1_STATE_OR_RESOURCE",
    );
    expect(
      legacyResourceMap.resources.map(({ oldAddress }) => oldAddress).sort(),
    ).toEqual([
      "google_artifact_registry_repository.refund_images",
      "google_cloud_run_v2_job.canary",
      "google_cloud_run_v2_job.preflight",
      "google_compute_firewall.allow_private_sql",
      "google_compute_firewall.deny_other_egress",
      "google_compute_global_address.private_service_access",
      "google_compute_network.refund",
      "google_compute_subnetwork.refund",
      "google_project_iam_member.runtime",
      "google_project_service.required",
      "google_secret_manager_secret.canary_database_url",
      "google_secret_manager_secret.preflight_database_url",
      "google_secret_manager_secret_iam_member.canary_database_access",
      "google_secret_manager_secret_iam_member.preflight_database_access",
      "google_service_account.canary",
      "google_service_account.preflight",
      "google_service_networking_connection.private_service_access",
      "google_sql_database.refund",
      "google_sql_database_instance.refund",
    ]);
    expect(legacyResourceMap.artifacts).toContainEqual({
      oldIdentity: "database_roles.sql",
      owner: "LATER_DB_BOOTSTRAP",
      disposition: "MOVED_BYTE_IDENTICALLY",
      newIdentity: "p3e-b2/runtime-deferred/database_roles.sql",
    });
  });
});

function walk(root: string): string[] {
  return readdirSync(root).filter((name) => name !== ".terraform").flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
