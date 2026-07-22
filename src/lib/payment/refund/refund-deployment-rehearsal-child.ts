import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

type RehearsalChildProcess = ChildProcessByStdio<null, Readable, Readable>;

export const REFUND_DEPLOYMENT_REHEARSAL_MAX_OUTPUT_BYTES = 32 * 1024;

export interface RefundDeploymentRehearsalChildEnvironment {
  DATABASE_URL: string;
  NODE_ENV: "test";
}

export type RefundDeploymentRehearsalChildFailureReason =
  | "SPAWN_FAILED"
  | "CHILD_TIMEOUT"
  | "OUTPUT_OVERFLOW"
  | "WRONG_CHANNEL"
  | "MALFORMED_OUTPUT"
  | "UNEXPECTED_EXIT"
  | "SIGNAL_TERMINATION"
  | "NO_OUTPUT";

export interface RefundDeploymentRehearsalChildSpec {
  executable: string;
  args: readonly string[];
  cwd: string;
  env: Readonly<RefundDeploymentRehearsalChildEnvironment>;
  deadlineMs: number;
  expectedExitCode: number;
  expectedChannel: "STDOUT" | "STDERR";
}

export type RefundDeploymentRehearsalChildResult =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false; reason: RefundDeploymentRehearsalChildFailureReason }>;

export interface RefundDeploymentRehearsalChildDependencies {
  spawnChild: (
    executable: string,
    args: readonly string[],
    options: Readonly<{
      cwd: string;
      env: Readonly<RefundDeploymentRehearsalChildEnvironment>;
      stdio: readonly ["ignore", "pipe", "pipe"];
      shell: false;
      detached: false;
    }>,
  ) => RehearsalChildProcess;
  setTimer: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
}

export const defaultRefundDeploymentRehearsalChildDependencies:
RefundDeploymentRehearsalChildDependencies = Object.freeze({
  spawnChild(
    executable: string,
    args: readonly string[],
    options: Parameters<RefundDeploymentRehearsalChildDependencies["spawnChild"]>[2],
  ) {
    return spawn(executable, [...args], {
      cwd: options.cwd,
      env: { ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      detached: false,
    });
  },
  setTimer(callback: () => void, delayMs: number) {
    return setTimeout(callback, delayMs);
  },
  clearTimer(timer: ReturnType<typeof setTimeout>) {
    clearTimeout(timer);
  },
});

export async function runRefundDeploymentRehearsalChild(
  spec: RefundDeploymentRehearsalChildSpec,
  dependencies: RefundDeploymentRehearsalChildDependencies =
    defaultRefundDeploymentRehearsalChildDependencies,
): Promise<RefundDeploymentRehearsalChildResult> {
  if (!validSpec(spec)) return Object.freeze({ ok: false, reason: "SPAWN_FAILED" });
  let child: RehearsalChildProcess;
  try {
    child = dependencies.spawnChild(spec.executable, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      detached: false,
    });
  } catch {
    return Object.freeze({ ok: false, reason: "SPAWN_FAILED" });
  }
  return superviseChild(child, spec, dependencies);
}

function superviseChild(
  child: RehearsalChildProcess,
  spec: RefundDeploymentRehearsalChildSpec,
  dependencies: RefundDeploymentRehearsalChildDependencies,
): Promise<RefundDeploymentRehearsalChildResult> {
  return new Promise((resolve) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let terminalReason: RefundDeploymentRehearsalChildFailureReason | null = null;
    let settled = false;

    const acceptTerminalReason = (
      reason: RefundDeploymentRehearsalChildFailureReason,
    ): boolean => {
      if (terminalReason !== null || settled) return false;
      terminalReason = reason;
      return true;
    };
    const terminate = (reason: RefundDeploymentRehearsalChildFailureReason): void => {
      if (!acceptTerminalReason(reason)) return;
      child.kill("SIGKILL");
    };
    const onStdout = (chunk: Buffer): void => {
      if (terminalReason !== null || settled) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > REFUND_DEPLOYMENT_REHEARSAL_MAX_OUTPUT_BYTES) {
        terminate("OUTPUT_OVERFLOW");
        return;
      }
      stdout.push(Buffer.from(chunk));
    };
    const onStderr = (chunk: Buffer): void => {
      if (terminalReason !== null || settled) return;
      stderrBytes += chunk.length;
      if (stderrBytes > REFUND_DEPLOYMENT_REHEARSAL_MAX_OUTPUT_BYTES) {
        terminate("OUTPUT_OVERFLOW");
        return;
      }
      stderr.push(Buffer.from(chunk));
    };
    const cleanup = (): void => {
      dependencies.clearTimer(timer);
      child.stdout.removeListener("data", onStdout);
      child.stderr.removeListener("data", onStderr);
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
    };
    const finish = (result: RefundDeploymentRehearsalChildResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const onError = (): void => {
      acceptTerminalReason("SPAWN_FAILED");
    };
    const onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (terminalReason) {
        finish(Object.freeze({ ok: false, reason: terminalReason }));
        return;
      }
      if (signal !== null || code === null) {
        finish(Object.freeze({ ok: false, reason: "SIGNAL_TERMINATION" }));
        return;
      }
      finish(evaluateChildOutput(spec, code, stdout, stderr));
    };

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("error", onError);
    child.once("close", onClose);
    const timer = dependencies.setTimer(() => terminate("CHILD_TIMEOUT"), spec.deadlineMs);
  });
}

function evaluateChildOutput(
  spec: RefundDeploymentRehearsalChildSpec,
  exitCode: number,
  stdout: readonly Buffer[],
  stderr: readonly Buffer[],
): RefundDeploymentRehearsalChildResult {
  if (exitCode !== spec.expectedExitCode) {
    return Object.freeze({ ok: false, reason: "UNEXPECTED_EXIT" });
  }
  const expected = spec.expectedChannel === "STDOUT" ? stdout : stderr;
  const opposite = spec.expectedChannel === "STDOUT" ? stderr : stdout;
  if (opposite.reduce((total, chunk) => total + chunk.length, 0) > 0) {
    return Object.freeze({ ok: false, reason: "WRONG_CHANNEL" });
  }
  if (expected.length === 0) return Object.freeze({ ok: false, reason: "NO_OUTPUT" });
  const decoded = decodeOutput(expected);
  if (decoded === null) return Object.freeze({ ok: false, reason: "MALFORMED_OUTPUT" });
  const parsed = parseJsonObject(decoded);
  return parsed === null
    ? Object.freeze({ ok: false, reason: "MALFORMED_OUTPUT" })
    : Object.freeze({ ok: true, value: parsed });
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isJsonObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeOutput(chunks: readonly Buffer[]): string | null {
  try {
    const bytes = Buffer.concat(chunks);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text.endsWith("\n") || text.includes("\0")) return null;
    const line = text.slice(0, -1);
    return line.startsWith("{") && line.endsWith("}")
      && !line.includes("\n") && !line.includes("\r") ? line : null;
  } catch {
    return null;
  }
}

function validSpec(spec: RefundDeploymentRehearsalChildSpec): boolean {
  return spec.executable.length > 0 && spec.cwd.length > 0
    && Number.isSafeInteger(spec.deadlineMs) && spec.deadlineMs > 0
    && Number.isSafeInteger(spec.expectedExitCode) && spec.expectedExitCode >= 0;
}
