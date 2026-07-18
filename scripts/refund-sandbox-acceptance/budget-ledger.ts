import type { H1ArtifactStore } from "./artifact-store";
import { ProviderCallBudget, budgetRecordsFromPayload } from "./call-budget";
import type { H1Ledger } from "./run-ledger";
import { RunLedgerStore } from "./run-ledger";
import { appendRuntimeLedger } from "./runtime-ledger";

export function createLedgerBudget(
  store: RunLedgerStore,
  initial: H1Ledger,
  artifacts: H1ArtifactStore,
): ProviderCallBudget {
  const previousRecords = budgetRecordsFromPayload(initial.payload.callRecords);
  return new ProviderCallBudget(async (entry, result) => {
    const current = await store.loadLatest();
    const existing = budgetRecordsFromPayload(current?.payload.callRecords);
    const artifact = entry.phase === "COMPLETED"
      ? await artifacts.writeRaw(`call-${String(entry.sequence).padStart(3, "0")}-${entry.kind}.json`, result)
      : null;
    const phase = entry.kind === "POST"
      ? entry.phase === "INTENT" ? "POST_INTENT_RECORDED" : "POST_RESPONSE_RECORDED"
      : current?.phase ?? initial.phase;
    const references = rawReferences(current?.payload.rawArtifactReferences);
    await appendRuntimeLedger(store, current, phase, {
      ...current?.payload,
      callRecords: Object.freeze([...existing, entry]),
      rawArtifactReferences: artifact ? Object.freeze([...references, artifact]) : references,
    });
  }, previousRecords);
}

function rawReferences(value: unknown): readonly unknown[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) throw new Error("RAW_ARTIFACT_LEDGER_INVALID");
  return Object.freeze(value.map((entry: unknown) => entry));
}
