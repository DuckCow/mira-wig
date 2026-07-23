import { runWithRefundProviderContactAdmission } from "./refund-provider-contact-admission";

type PreflightEnv = Readonly<Record<string, string | undefined>>;

export type RefundSandboxProviderFreeAdmissionProbeResult =
  "ONE_WINNER_ONE_BUSY" | "BUSY" | "UNAVAILABLE" | "CLEANUP_FAILED";

export async function probeRefundSandboxProviderFreeAdmission(
  env: PreflightEnv,
): Promise<RefundSandboxProviderFreeAdmissionProbeResult> {
  const entered = deferred<void>();
  const release = deferred<void>();
  const first = runWithRefundProviderContactAdmission(env, async () => {
    entered.resolve();
    await release.promise;
    return "FIRST_COMPLETE" as const;
  });
  const firstBoundary = await Promise.race([
    entered.promise.then(() => Object.freeze({ kind: "ENTERED" as const })),
    first.then((result) => Object.freeze({ kind: "COMPLETED" as const, result })),
  ]);
  if (firstBoundary.kind === "COMPLETED") return classifyEarlyResult(firstBoundary.result);
  const second = await runWithRefundProviderContactAdmission(
    env,
    () => Promise.resolve("SECOND_MUST_NOT_RUN" as const),
  );
  release.resolve();
  const completedFirst = await first;
  if (second.outcome !== "BUSY") return classifyUnexpectedSecond(second.outcome);
  if (completedFirst.outcome === "ADMISSION_CLEANUP_FAILED") return "CLEANUP_FAILED";
  return completedFirst.outcome === "ACQUIRED" ? "ONE_WINNER_ONE_BUSY" : "UNAVAILABLE";
}

function classifyEarlyResult(
  result: Awaited<ReturnType<typeof runWithRefundProviderContactAdmission<"FIRST_COMPLETE">>>,
): RefundSandboxProviderFreeAdmissionProbeResult {
  if (result.outcome === "BUSY") return "BUSY";
  if (result.outcome === "ADMISSION_CLEANUP_FAILED") return "CLEANUP_FAILED";
  return "UNAVAILABLE";
}

function classifyUnexpectedSecond(
  outcome: "ACQUIRED" | "ADMISSION_UNAVAILABLE" | "ADMISSION_CLEANUP_FAILED",
): RefundSandboxProviderFreeAdmissionProbeResult {
  return outcome === "ADMISSION_CLEANUP_FAILED" ? "CLEANUP_FAILED" : "UNAVAILABLE";
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return Object.freeze({ promise, resolve });
}
