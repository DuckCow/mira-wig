import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type {} from "./fixtures/refund-p3e-b2-child-fixture.mjs";

import {
  buildTb2aAttendedEnvironment,
  executeTb2aProcessCommand,
  TB2A_PROCESS_MODE_ATTENDED,
  TB2A_PROCESS_MODE_FIXTURE,
  type Tb2aProcessDependencies,
  type Tb2aSpawnRequest,
  type Tb2aProcessTiming,
} from "../../../../../scripts/refund-p3e-b2-bootstrap-readiness-adapter.mjs";
import {
  buildTb2aReadOnlyCommand,
} from "../../../../../scripts/refund-p3e-b2-bootstrap-readiness.mjs";
import { runTb2aCollectorSelfCheck } from "../../../../../scripts/refund-p3e-b2-collector-selfcheck.mjs";

const TEST_MODULE_NODE_EXECUTABLE_PATH = `${process.execPath}`;
const ORIGINAL_PROCESS_EXEC_PATH_DESCRIPTOR =
  Object.getOwnPropertyDescriptor(process, "execPath");
const ROOT = process.cwd();
const FIXTURE = join(
  ROOT,
  "src/lib/payment/refund/__tests__/fixtures/"
    + "refund-p3e-b2-child-fixture.mjs",
);
const PROJECT_ID = "mira-refund-sbx";
const PROJECT_NUMBER = "123456789012";
const DETERMINISTIC_VERSION_OUTPUT = Buffer.from(
  '{"Google Cloud SDK":"577.0.0"}',
);
const DETERMINISTIC_VERSION_RESPONSE_SHA256 =
  "2eabe1c857abf5ea590e7a525de9aca3ffaea8972f9b4d7f6d002e2828a4bd98";
const QUICK_TIMING: Tb2aProcessTiming = Object.freeze({
  commandDeadlineMs: 1_000,
  sigtermGraceMs: 100,
  closeDeadlineMs: 500,
});
const IGNORED_SIGTERM_TIMING: Tb2aProcessTiming = Object.freeze({
  commandDeadlineMs: 2_000,
  sigtermGraceMs: 100,
  closeDeadlineMs: 500,
});
const ATTENDED_TIMING: Tb2aProcessTiming = Object.freeze({
  commandDeadlineMs: 30_000,
  sigtermGraceMs: 2_000,
  closeDeadlineMs: 5_000,
});
type AttendedBoundary = Readonly<{
  directory: string;
  launcher: string;
  python: string;
  otherPython: string;
}>;
type AttendedRequest = ReturnType<typeof attendedRequest>;
type SpawnedTb2aProcess =
  ReturnType<NonNullable<Tb2aProcessDependencies["spawnProcess"]>>;
type DescendantReadyRecord = Readonly<{
  protocol: "TB2A_DESCENDANT_READY_V1";
  pid: number;
  signalHandlerInstalled: true;
  completionMarkerArmed: true;
  inheritedOutputOpen: true;
}>;
const DESCENDANT_READY_KEYS = Object.freeze([
  "completionMarkerArmed",
  "inheritedOutputOpen",
  "pid",
  "protocol",
  "signalHandlerInstalled",
]);
const ATTENDED_REQUEST_MUTATIONS: readonly Readonly<{
  name: string;
  mutate(request: AttendedRequest, boundary: AttendedBoundary): void;
}>[] = Object.freeze([
  {
    name: "mutation-shaped argv",
    mutate(request) {
      Reflect.set(request, "args", [
        "services",
        "enable",
        "storage.googleapis.com",
      ]);
    },
  },
  {
    name: "correct kind with another kind's argv",
    mutate(request) {
      Reflect.set(request, "args", buildTb2aReadOnlyCommand("PROJECT_GET", {
        projectId: PROJECT_ID,
        configurationName: request.configurationName,
      }));
    },
  },
  {
    name: "wrong project ID inside argv",
    mutate(request) {
      Reflect.set(request, "kind", "PROJECT_GET");
      Reflect.set(request, "args", buildTb2aReadOnlyCommand("PROJECT_GET", {
        projectId: "mira-refund-alt",
        configurationName: request.configurationName,
      }));
    },
  },
  {
    name: "wrong configuration inside argv",
    mutate(request) {
      Reflect.set(request, "args", buildTb2aReadOnlyCommand(
        "GCLOUD_VERSION",
        {
          projectId: PROJECT_ID,
          configurationName: "other-review",
        },
      ));
    },
  },
  {
    name: "environment project mismatch",
    mutate(request) {
      Reflect.set(request, "env", {
        ...request.env,
        CLOUDSDK_CORE_PROJECT: "mira-refund-alt",
      });
    },
  },
  {
    name: "environment configuration mismatch",
    mutate(request) {
      Reflect.set(request, "env", {
        ...request.env,
        CLOUDSDK_ACTIVE_CONFIG_NAME: "other-review",
      });
    },
  },
  {
    name: "Python-path mismatch",
    mutate(request, boundary) {
      Reflect.set(request, "pythonPath", boundary.otherPython);
    },
  },
  {
    name: "config-root mismatch",
    mutate(request, boundary) {
      Reflect.set(
        request,
        "cloudSdkConfigPath",
        join(boundary.directory, "other-config"),
      );
    },
  },
  {
    name: "additional environment key",
    mutate(request) {
      Reflect.set(request, "env", {
        ...request.env,
        TEST_UNREVIEWED_ENVIRONMENT: "rejected",
      });
    },
  },
  {
    name: "unknown command kind",
    mutate(request) {
      Reflect.set(request, "kind", "UNKNOWN_COMMAND_KIND");
    },
  },
]);
const ATTENDED_TIMING_REJECTIONS: readonly Readonly<{
  name: string;
  timing: Readonly<Record<string, unknown>>;
}>[] = Object.freeze([
  {
    name: "command timeout above authority",
    timing: timingInput({ commandDeadlineMs: 30_001 }),
  },
  {
    name: "command timeout below authority",
    timing: timingInput({ commandDeadlineMs: 29_999 }),
  },
  {
    name: "SIGTERM grace above authority",
    timing: timingInput({ sigtermGraceMs: 2_001 }),
  },
  {
    name: "SIGTERM grace below authority",
    timing: timingInput({ sigtermGraceMs: 1_999 }),
  },
  {
    name: "close deadline above authority",
    timing: timingInput({ closeDeadlineMs: 5_001 }),
  },
  {
    name: "close deadline below authority",
    timing: timingInput({ closeDeadlineMs: 4_999 }),
  },
  {
    name: "maximum command timeout",
    timing: timingInput({ commandDeadlineMs: Number.MAX_SAFE_INTEGER }),
  },
  {
    name: "maximum SIGTERM grace",
    timing: timingInput({ sigtermGraceMs: Number.MAX_SAFE_INTEGER }),
  },
  {
    name: "maximum close deadline",
    timing: timingInput({ closeDeadlineMs: Number.MAX_SAFE_INTEGER }),
  },
  {
    name: "all three timings altered together",
    timing: Object.freeze({
      commandDeadlineMs: 30_001,
      sigtermGraceMs: 2_001,
      closeDeadlineMs: 5_001,
    }),
  },
  {
    name: "exact timing object with an extra property",
    timing: Object.freeze({
      ...ATTENDED_TIMING,
      extraTimingAuthority: true,
    }),
  },
]);

describe("P3E-B2 TB2A provider-free real process adapter", () => {
  it("parses normal exit zero after the real child close boundary", async () => {
    await withProcessDirectory(async (directory) => {
      expect(await executeFixture(directory, "normal")).toMatchObject({
        ok: true,
        kind: "GCLOUD_VERSION",
        version: "577.0.0",
        attemptCount: 1,
      });
    });
  });

  it("returns one bounded nonzero failure without exposing private stderr", async () => {
    await withProcessDirectory(async (directory) => {
      const result = await executeFixture(directory, "nonzero");

      expect(result).toEqual({
        ok: false,
        reason: "COMMAND_FAILED",
        attemptCount: 1,
      });
      expect(JSON.stringify(result)).not.toContain(
        "TEST_PRIVATE_STDERR_SECRET",
      );
    });
  });

  it("sends SIGTERM then SIGKILL to the owned group and confirms close", async () => {
    await withProcessDirectory(async (directory) => {
      const signals: NodeJS.Signals[] = [];
      const result = await executeFixture(
        directory,
        "ignore-term",
        IGNORED_SIGTERM_TIMING,
        recordingSignals(signals),
      );

      expect(result).toEqual({
        ok: false,
        reason: "PROCESS_TIMEOUT",
        attemptCount: 1,
      });
      expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
    });
  });

  it("bounds a genuinely outliving descendant and cleans its exact PID", async () => {
    await withProcessDirectory(runOutlivingDescendantCase);
  }, 60_000);

  it("terminates streaming stdout at the byte cap", async () => {
    await withProcessDirectory(async (directory) => {
      expect(await executeReadyFixture(directory, "stdout-cap")).toEqual({
        ok: false,
        reason: "OUTPUT_LIMIT_EXCEEDED",
        attemptCount: 1,
      });
    });
  }, 60_000);

  it("terminates streaming stderr at the byte cap without exposing bytes", async () => {
    await withProcessDirectory(async (directory) => {
      const result = await executeReadyFixture(directory, "stderr-cap");

      expect(result).toEqual({
        ok: false,
        reason: "OUTPUT_LIMIT_EXCEEDED",
        attemptCount: 1,
      });
      expect(JSON.stringify(result)).not.toContain("x");
    });
  }, 60_000);

  it("rejects invalid UTF-8 through the real parser", async () => {
    await withProcessDirectory(async (directory) => {
      expect(await executeReadyFixture(directory, "invalid-utf8")).toEqual({
        ok: false,
        reason: "MALFORMED_OUTPUT",
        attemptCount: 1,
      });
    });
  }, 60_000);

  it("never signals an undefined PID from the injected spawn-failure seam", async () => {
    await withProcessDirectory(runUndefinedPidCase);
  });

  it.each([
    {
      name: "regular executable",
      create: (path: string) => {
        writeFileSync(path, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
      },
    },
    {
      name: "symlink",
      create: (path: string) => {
        symlinkSync(TEST_MODULE_NODE_EXECUTABLE_PATH, path);
      },
    },
    {
      name: "Node wrapper",
      create: (path: string) => {
        writeFileSync(
          path,
          "#!/usr/bin/env node\nprocess.exitCode = 0;\n",
          { mode: 0o700 },
        );
      },
    },
  ])("rejects a $name at the former sentinel path before spawn", async ({
    create,
  }) => {
    await runFormerSentinelCase(create);
  });

  it("does not signal after a fast exit has already been observed", async () => {
    await withProcessDirectory(async (directory) => {
      const signalProcessGroup = vi.fn();
      const result = await executeFixture(
        directory,
        "fast-exit",
        Object.freeze({
          commandDeadlineMs: 1_000,
          sigtermGraceMs: 40,
          closeDeadlineMs: 80,
        }),
        { signalProcessGroup },
      );

      expect(result.ok).toBe(true);
      expect(signalProcessGroup).toHaveBeenCalledTimes(0);
      await delay(50);
      expect(signalProcessGroup).toHaveBeenCalledTimes(0);
    });
  });

  it("continuously drains write pressure and terminates without deadlock", async () => {
    await withProcessDirectory(async (directory) => {
      expect(await executeFixture(
        directory,
        "continuous-write",
        QUICK_TIMING,
      )).toEqual({
        ok: false,
        reason: "OUTPUT_LIMIT_EXCEEDED",
        attemptCount: 1,
      });
    });
  });

  it.each(["EPERM", "ESRCH"])(
    "maps required termination %s uncertainty to a blocking result",
    async () => runUncertainTerminationCase(),
  );

  it("settles bounded uncertainty after close deadline without observed close", async () => {
    await withProcessDirectory(runUnsettledCloseDeadlineCase);
  });

  it("detaches stateful listeners and removes the late-error sink on eventual close", async () => {
    await withProcessDirectory(runListenerCleanupCase);
  });

  it("runs the provider-free fixture self-check with one bounded result", async () => {
    const result = await runTb2aCollectorSelfCheck();

    expect(result).toMatchObject({
      contractVersion: "mira-refund-p3e-b2-attended-collector-core/v1",
      evidenceVersion:
        "mira-refund-p3e-b2-trusted-project-bootstrap-readiness/v2",
      disposition: "INDEPENDENT_REVIEW_REQUIRED",
      commandCount: 6,
      mode: "FIXTURE_SELF_CHECK",
    });
    expect(result.evidenceSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(Number.isSafeInteger(result.durationMs)).toBe(true);
    expect(Object.keys(result)).toHaveLength(7);
    expect(JSON.stringify(result)).not.toContain(PROJECT_ID);
    expect(JSON.stringify(result)).not.toContain("principal");
    expect(JSON.stringify(result)).not.toContain("configuration");
    expect(JSON.stringify(result)).not.toContain(ROOT);
  });

  describe.sequential(
    "pins direct fixture and self-check execution to module-load Node authority",
    () => {
      it(
        "rejects a regular side-effecting executable wrapper",
        runRegularSideEffectExecPathRebindingCase,
      );

      it(
        "rejects a symlink to a side-effecting executable wrapper",
        runSymlinkExecPathRebindingCase,
      );

      it(
        "rejects an alternate Node wrapper that ignores fixture argv",
        runIgnoredFixtureArgvExecPathRebindingCase,
      );

      it(
        "rejects a wrapper that creates a filesystem sentinel",
        runFilesystemSentinelExecPathRebindingCase,
      );

      it(
        "rejects a behaviorally compatible output wrapper",
        runCompatibleOutputExecPathRebindingCase,
      );
    },
  );

  it.sequential(
    "keeps the real self-check pinned after post-module-load process.execPath rebinding",
    runRealSelfCheckExecPathRebindingCase,
  );

  it(
    "keeps module-load Node authority while async path validation is paused",
    runDeferredAdmissionExecPathRebindingCase,
  );

  it("rejects Proxy-backed snapshot containers without invoking traps", async () => {
    await withProcessDirectory(async (directory) => {
      for (const testCase of proxyExecutionCases(directory)) {
        const validateExecutionDirectory = vi.fn(
          () => Promise.resolve(directory),
        );
        const spawnProcess = vi.fn(() => {
          throw new Error("TEST_PROXY_SPAWN_SECRET");
        });
        const resultPromise = executeTb2aProcessCommand(testCase.request, {
          signalProcessGroup: vi.fn(),
          spawnProcess,
          validateExecutionDirectory,
        });
        testCase.afterInvocation?.();
        const result = await resultPromise;

        expect(result, testCase.name).toEqual({
          ok: false,
          reason: "COMMAND_FAILED",
          attemptCount: 0,
        });
        expect(testCase.counters, testCase.name).toEqual(
          emptyProxyTrapCounters(),
        );
        expect(validateExecutionDirectory, testCase.name)
          .toHaveBeenCalledTimes(0);
        expect(spawnProcess, testCase.name).toHaveBeenCalledTimes(0);
        expect(JSON.stringify(result), testCase.name)
          .not.toContain("TEST_PROXY_TRAP_SECRET");
      }
    });
  });

  it("preserves and rejects an attended own __proto__ environment key", async () => {
    await withAttendedProcessBoundary(async (boundary) => {
      const request = attendedRequest(boundary);
      const environment = environmentWithOwnProto(request.env);
      Reflect.set(request, "env", environment);
      const spawnProcess = vi.fn(() => {
        throw new Error("TEST_PROTO_SPAWN_MUST_NOT_RUN");
      });

      expect(Object.hasOwn(environment, "__proto__")).toBe(true);
      expect(await executeTb2aProcessCommand(request, {
        signalProcessGroup: vi.fn(),
        spawnProcess,
      })).toEqual({
        ok: false,
        reason: "COMMAND_FAILED",
        attemptCount: 0,
      });
      expect(spawnProcess).toHaveBeenCalledTimes(0);
      expect(Object.getPrototypeOf(environment)).toBe(Object.prototype);
      expect(Object.getPrototypeOf({})).toBe(Object.prototype);
      expect(Object.hasOwn({}, "TEST_PROTO_POLLUTION")).toBe(false);
    });
  });

  it("preserves and rejects a fixture own __proto__ environment key", async () => {
    await withProcessDirectory(async (directory) => {
      const environment = environmentWithOwnProto({});
      const spawnProcess = vi.fn(() => {
        throw new Error("TEST_PROTO_SPAWN_MUST_NOT_RUN");
      });

      expect(Object.hasOwn(environment, "__proto__")).toBe(true);
      expect(await executeTb2aProcessCommand({
        mode: TB2A_PROCESS_MODE_FIXTURE,
        kind: "GCLOUD_VERSION",
        executable: TEST_MODULE_NODE_EXECUTABLE_PATH,
        args: [FIXTURE, "normal"],
        env: environment,
        cwd: directory,
        repositoryRoot: ROOT,
        projectId: PROJECT_ID,
        timing: QUICK_TIMING,
      }, {
        signalProcessGroup: vi.fn(),
        spawnProcess,
      })).toEqual({
        ok: false,
        reason: "COMMAND_FAILED",
        attemptCount: 0,
      });
      expect(spawnProcess).toHaveBeenCalledTimes(0);
      expect(Object.getPrototypeOf(environment)).toBe(Object.prototype);
      expect(Object.getPrototypeOf({})).toBe(Object.prototype);
      expect(Object.hasOwn({}, "TEST_PROTO_POLLUTION")).toBe(false);
    });
  });

  it("inspects the actual process environment for self-check credentials", async () => {
    vi.stubEnv(
      "GOOGLE_APPLICATION_CREDENTIALS",
      "/test-only/private/credential.json",
    );
    try {
      await expect(runTb2aCollectorSelfCheck()).rejects.toThrow(
        "TB2A_FIXTURE_SELF_CHECK_REJECTED",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    ["real gcloud", { gcloudExecutable: "/usr/bin/gcloud" }],
    ["network", { networkDependency: () => undefined }],
    ["writer", { writerDependency: () => undefined }],
  ])("refuses an injected %s dependency before fixture execution", async (
    _name,
    injected,
  ) => {
    await expect(Reflect.apply(
      runTb2aCollectorSelfCheck,
      undefined,
      [injected],
    )).rejects.toThrow("TB2A_FIXTURE_SELF_CHECK_REJECTED");
  });

  it("ignores alternate cwd and never executes a compatible substitute fixture", async () => {
    const alternateRoot = mkdtempSync(
      join(tmpdir(), "mira-tb2a-substitute-root-"),
    );
    const substituteFixture = join(
      alternateRoot,
      "src/lib/payment/refund/__tests__/fixtures/"
        + "refund-p3e-b2-child-fixture.mjs",
    );
    const sideEffect = join(alternateRoot, "substitute-executed");
    const originalCwd = process.cwd();
    mkdirSync(resolve(substituteFixture, ".."), { recursive: true });
    writeFileSync(
      substituteFixture,
      `import { writeFileSync } from "node:fs";\n`
        + `writeFileSync(${JSON.stringify(sideEffect)}, "executed\\n");\n`
        + readFileSync(FIXTURE, "utf8"),
      { mode: 0o600 },
    );
    try {
      process.chdir(alternateRoot);
      const result = await runTb2aCollectorSelfCheck();
      expect(result.disposition).toBe("INDEPENDENT_REVIEW_REQUIRED");
      expect(existsSync(sideEffect)).toBe(false);
    } finally {
      process.chdir(originalCwd);
      rmSync(alternateRoot, { recursive: true, force: true });
    }
  });

  it("rejects caller-supplied self-check root and fixture fields", async () => {
    const alternateRoot = mkdtempSync(
      join(tmpdir(), "mira-tb2a-substitute-input-"),
    );
    const substituteFixture = join(alternateRoot, "fixture.mjs");
    const sideEffect = join(alternateRoot, "substitute-executed");
    writeFileSync(
      substituteFixture,
      `import { writeFileSync } from "node:fs";\n`
        + `writeFileSync(${JSON.stringify(sideEffect)}, "executed\\n");\n`,
      { mode: 0o600 },
    );
    try {
      await expect(Reflect.apply(
        runTb2aCollectorSelfCheck,
        undefined,
        [{
          repositoryRoot: alternateRoot,
          fixturePath: substituteFixture,
        }],
      )).rejects.toThrow("TB2A_FIXTURE_SELF_CHECK_REJECTED");
      expect(existsSync(sideEffect)).toBe(false);
    } finally {
      rmSync(alternateRoot, { recursive: true, force: true });
    }
  });

  it("refuses a non-fixture executable without spawning it", async () => {
    await withProcessDirectory(async (directory) => {
      expect(await executeTb2aProcessCommand({
        mode: TB2A_PROCESS_MODE_FIXTURE,
        kind: "GCLOUD_VERSION",
        executable: "/usr/bin/gcloud",
        args: [],
        env: Object.freeze({}),
        cwd: directory,
        repositoryRoot: ROOT,
        projectId: PROJECT_ID,
      })).toEqual({
        ok: false,
        reason: "COMMAND_FAILED",
        attemptCount: 0,
      });
    });
  });

  it.each(ATTENDED_REQUEST_MUTATIONS)(
    "rejects $name before the spawn dependency",
    async ({ mutate }) => {
      await withAttendedProcessBoundary(async (boundary) => {
        const request = attendedRequest(boundary);
        mutate(request, boundary);
        const spawnProcess = vi.fn(() => {
          throw new Error("TEST_SPAWN_MUST_NOT_RUN");
        });

        expect(await executeTb2aProcessCommand(request, {
          signalProcessGroup: vi.fn(),
          spawnProcess,
        })).toEqual({
          ok: false,
          reason: "COMMAND_FAILED",
          attemptCount: 0,
        });
        expect(spawnProcess).toHaveBeenCalledTimes(0);
      });
    },
  );

  it.each(ATTENDED_TIMING_REJECTIONS)(
    "rejects attended $name before the spawn dependency",
    async ({ timing }) => {
      await withAttendedProcessBoundary(async (boundary) => {
        const request = attendedRequest(boundary);
        Reflect.set(request, "timing", timing);
        const spawnProcess = vi.fn(() => {
          throw new Error("TEST_SPAWN_MUST_NOT_RUN");
        });

        expect(await executeTb2aProcessCommand(request, {
          signalProcessGroup: vi.fn(),
          spawnProcess,
        })).toEqual({
          ok: false,
          reason: "COMMAND_FAILED",
          attemptCount: 0,
        });
        expect(spawnProcess).toHaveBeenCalledTimes(0);
      });
    },
  );

  it("rejects an attended hostile timing getter without observing it", async () => {
    await withAttendedProcessBoundary(async (boundary) => {
      const request = attendedRequest(boundary);
      const timingGetter = vi.fn(() => ATTENDED_TIMING);
      Reflect.defineProperty(request, "timing", {
        configurable: true,
        enumerable: true,
        get: timingGetter,
      });
      const spawnProcess = vi.fn(() => {
        throw new Error("TEST_SPAWN_MUST_NOT_RUN");
      });

      expect(await executeTb2aProcessCommand(request, {
        signalProcessGroup: vi.fn(),
        spawnProcess,
      })).toEqual({
        ok: false,
        reason: "COMMAND_FAILED",
        attemptCount: 0,
      });
      expect(timingGetter).toHaveBeenCalledTimes(0);
      expect(spawnProcess).toHaveBeenCalledTimes(0);
    });
  });

  it("rejects a hostile mode descriptor before async validation", async () => {
    await withAttendedProcessBoundary(async (boundary) => {
      const request = attendedRequest(boundary);
      const modeGetter = vi.fn(() => TB2A_PROCESS_MODE_ATTENDED);
      Reflect.defineProperty(request, "mode", {
        configurable: true,
        enumerable: true,
        get: modeGetter,
      });
      const validateExecutionDirectory = vi.fn(
        () => Promise.resolve(boundary.directory),
      );
      const spawnProcess = vi.fn(() => {
        throw new Error("TEST_SPAWN_MUST_NOT_RUN");
      });

      expect(await executeTb2aProcessCommand(request, {
        signalProcessGroup: vi.fn(),
        spawnProcess,
        validateExecutionDirectory,
      })).toEqual({
        ok: false,
        reason: "COMMAND_FAILED",
        attemptCount: 0,
      });
      expect(modeGetter).toHaveBeenCalledTimes(0);
      expect(validateExecutionDirectory).toHaveBeenCalledTimes(0);
      expect(spawnProcess).toHaveBeenCalledTimes(0);
    });
  });

  it("keeps an initially invalid fixture snapshot invalid after an attended mutation", async () => {
    await withAttendedProcessBoundary(async (boundary) => {
      const request = mutableFixtureRequest(boundary.directory);
      request.executable = boundary.launcher;
      const validation = deferredDirectoryValidation();
      const spawnProcess = vi.fn(() => {
        throw new Error("TEST_SPAWN_MUST_NOT_RUN");
      });
      const resultPromise = executeTb2aProcessCommand(request, {
        signalProcessGroup: vi.fn(),
        spawnProcess,
        validateExecutionDirectory: validation.validate,
      });
      await validation.entered;
      mutateIntoAttendedRequest(request, boundary);
      validation.release();

      expect(await resultPromise).toEqual({
        ok: false,
        reason: "COMMAND_FAILED",
        attemptCount: 0,
      });
      expect(spawnProcess).toHaveBeenCalledTimes(0);
    });
  });

  it("keeps a valid fixture snapshot and its nested values after an attended mutation", async () => {
    await withAttendedProcessBoundary(async (boundary) => {
      const request = mutableFixtureRequest(boundary.directory);
      const originalArgs = request.args;
      const originalEnvironment = request.env;
      const originalTiming = request.timing;
      const validation = deferredDirectoryValidation();
      const admittedRequests: Tb2aSpawnRequest[] = [];
      const spawnProcess = vi.fn((admitted: Tb2aSpawnRequest) => {
        admittedRequests.push(admitted);
        return spawnFixtureRequest(admitted);
      });
      const resultPromise = executeTb2aProcessCommand(request, {
        signalProcessGroup(pid, signal) {
          process.kill(-pid, signal);
        },
        spawnProcess,
        validateExecutionDirectory: validation.validate,
      });
      await validation.entered;
      mutateIntoAttendedRequest(request, boundary);
      originalArgs[0] = boundary.launcher;
      originalEnvironment.TEST_MUTATED_ENV = "rejected";
      originalTiming.commandDeadlineMs = Number.MAX_SAFE_INTEGER;
      originalTiming.sigtermGraceMs = Number.MAX_SAFE_INTEGER;
      originalTiming.closeDeadlineMs = Number.MAX_SAFE_INTEGER;
      validation.release();

      expect(await resultPromise).toMatchObject({
        ok: true,
        kind: "GCLOUD_VERSION",
        attemptCount: 1,
      });
      expect(spawnProcess).toHaveBeenCalledTimes(1);
      expect(admittedRequests).toHaveLength(1);
      expect(admittedRequests[0]).toMatchObject({
        executable: TEST_MODULE_NODE_EXECUTABLE_PATH,
        args: [FIXTURE, "normal"],
        timing: QUICK_TIMING,
        options: {
          cwd: realpathSync(boundary.directory),
          env: { NODE_ENV: "production" },
        },
      });
      expect(Object.getPrototypeOf(admittedRequests[0]?.options.env))
        .toBeNull();
    });
  });

  it("keeps an attended snapshot canonical after a fixture and nested mutation", async () => {
    await withAttendedProcessBoundary(async (boundary) => {
      const request = attendedRequest(boundary);
      const originalArgs = [...request.args];
      const originalEnvironment = { ...request.env };
      Reflect.set(request, "args", originalArgs);
      Reflect.set(request, "env", originalEnvironment);
      const validation = deferredDirectoryValidation();
      const admittedRequests: Tb2aSpawnRequest[] = [];
      const spawnProcess = vi.fn((admitted: Tb2aSpawnRequest) => {
        admittedRequests.push(admitted);
        return spawnNodeFixture(admitted, "normal");
      });
      const resultPromise = executeTb2aProcessCommand(request, {
        signalProcessGroup(pid, signal) {
          process.kill(-pid, signal);
        },
        spawnProcess,
        validateExecutionDirectory: validation.validate,
      });
      await validation.entered;
      mutateIntoFixtureRequest(request);
      originalArgs[0] = "services";
      originalEnvironment.CLOUDSDK_CONFIG =
        join(boundary.directory, "mutated-config");
      Reflect.set(request, "cloudSdkConfigPath", "/mutated/config");
      Reflect.set(request, "pythonPath", "/mutated/python");
      Reflect.set(request, "cwd", "/mutated/cwd");
      Reflect.set(request, "repositoryRoot", "/mutated/root");
      validation.release();

      expect(await resultPromise).toMatchObject({
        ok: true,
        kind: "GCLOUD_VERSION",
        attemptCount: 1,
      });
      expect(spawnProcess).toHaveBeenCalledTimes(1);
      expect(admittedRequests).toHaveLength(1);
      expect(admittedRequests[0]).toMatchObject({
        executable: boundary.launcher,
        args: buildTb2aReadOnlyCommand("GCLOUD_VERSION", {
          projectId: PROJECT_ID,
          configurationName: "attended-review",
        }),
        timing: ATTENDED_TIMING,
        options: {
          cwd: realpathSync(boundary.directory),
          env: requestEnvironment(boundary),
        },
      });
    });
  });

  it("spawns one exact immutable admitted attended request", async () => {
    await withAttendedProcessBoundary(async (boundary) => {
      const request = attendedRequest(boundary);
      const callerTiming = {
        commandDeadlineMs: 30_000,
        sigtermGraceMs: 2_000,
        closeDeadlineMs: 5_000,
      };
      const admittedRequests: Tb2aSpawnRequest[] = [];
      const spawnProcess = vi.fn((admitted: Tb2aSpawnRequest) => {
        admittedRequests.push(admitted);
        return spawnNodeFixture(admitted, "normal");
      });
      const resultPromise = executeTb2aProcessCommand(request, {
        signalProcessGroup(pid, signal) {
          process.kill(-pid, signal);
        },
        spawnProcess,
      });
      Reflect.set(request, "timing", callerTiming);
      callerTiming.commandDeadlineMs = Number.MAX_SAFE_INTEGER;
      callerTiming.sigtermGraceMs = Number.MAX_SAFE_INTEGER;
      callerTiming.closeDeadlineMs = Number.MAX_SAFE_INTEGER;
      const result = await resultPromise;

      expect(result).toMatchObject({
        ok: true,
        kind: "GCLOUD_VERSION",
        attemptCount: 1,
      });
      expect(spawnProcess).toHaveBeenCalledTimes(1);
      expect(admittedRequests).toHaveLength(1);
      const admitted = admittedRequests[0];
      expect(admitted).toEqual({
        executable: boundary.launcher,
        args: buildTb2aReadOnlyCommand("GCLOUD_VERSION", {
          projectId: PROJECT_ID,
          configurationName: "attended-review",
        }),
        timing: ATTENDED_TIMING,
        options: {
          cwd: realpathSync(boundary.directory),
          env: request.env,
          shell: false,
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      });
      expect(Object.isFrozen(admitted)).toBe(true);
      expect(Object.isFrozen(admitted?.args)).toBe(true);
      expect(Object.isFrozen(admitted?.timing)).toBe(true);
      expect(Object.isFrozen(admitted?.options)).toBe(true);
      expect(Object.isFrozen(admitted?.options.env)).toBe(true);
      expect(Object.getPrototypeOf(admitted?.options.env)).toBeNull();
      expect(admitted?.timing).not.toBe(callerTiming);
      expect(admitted?.timing).toEqual(ATTENDED_TIMING);
    });
  });
}, 10_000);

async function executeFixture(
  directory: string,
  mode: string,
  timing: Tb2aProcessTiming = QUICK_TIMING,
  dependencies?: Tb2aProcessDependencies,
  extraArgs: readonly string[] = [],
) {
  return executeTb2aProcessCommand({
    mode: TB2A_PROCESS_MODE_FIXTURE,
    kind: "GCLOUD_VERSION",
    executable: TEST_MODULE_NODE_EXECUTABLE_PATH,
    args: [FIXTURE, mode, ...extraArgs],
    env: Object.freeze({}),
    cwd: directory,
    repositoryRoot: ROOT,
    projectId: PROJECT_ID,
    projectNumber: PROJECT_NUMBER,
    timing,
  }, dependencies);
}

// READY/GO orders fixture work; the finite budget only bounds OS startup/cleanup.
async function executeReadyFixture(directory: string, mode: string) {
  let child: ReturnType<typeof spawn> | undefined;
  let closed: Promise<void> | undefined;
  const result = executeFixture(directory, mode, ATTENDED_TIMING, {
    signalProcessGroup(pid, signal) { process.kill(-pid, signal); },
    spawnProcess(request) {
      const running = spawn(request.executable, [...request.args], {
        ...request.options, env: { ...request.options.env },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
      child = running;
      if (!running.stdout || !running.stderr) throw new Error("FIXTURE_PIPES_REQUIRED");
      closed = new Promise((resolveClose) => running.once("close", () => resolveClose()));
      running.once("message", (message: unknown) => {
        if (message !== "READY") { running.kill("SIGKILL"); return; }
        running.send("GO");
      });
      return Object.assign(running, { stdout: running.stdout, stderr: running.stderr });
    },
  });
  try {
    const outcome = await result;
    if (!child || !closed) throw new Error("FIXTURE_NOT_SPAWNED");
    await withinTestDeadline(closed, 5_000);
    return outcome;
  } finally {
    if (child && child.exitCode === null && child.signalCode === null && child.pid) {
      process.kill(-child.pid, "SIGKILL");
    }
    if (closed) await withinTestDeadline(closed, 5_000);
  }
}

class FakeTb2aChildProcess extends EventEmitter {
  readonly pid = undefined;
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
}

async function runUndefinedPidCase(directory: string): Promise<void> {
  const signalProcessGroup = vi.fn();
  const child = new FakeTb2aChildProcess();
  const spawnProcess = vi.fn((_request: Tb2aSpawnRequest) => {
    queueMicrotask(() => emitSpawnFailureAndClose(child));
    return child;
  });
  const result = await executeTb2aProcessCommand({
    mode: TB2A_PROCESS_MODE_FIXTURE,
    kind: "GCLOUD_VERSION",
    executable: TEST_MODULE_NODE_EXECUTABLE_PATH,
    args: [FIXTURE, "normal"],
    env: Object.freeze({}),
    cwd: directory,
    repositoryRoot: ROOT,
    projectId: PROJECT_ID,
    timing: QUICK_TIMING,
  }, { signalProcessGroup, spawnProcess });

  expect(result).toEqual({
    ok: false,
    reason: "COMMAND_FAILED",
    attemptCount: 1,
  });
  expect(spawnProcess).toHaveBeenCalledTimes(1);
  expect(signalProcessGroup).toHaveBeenCalledTimes(0);
  expect(JSON.stringify(result)).not.toContain("TEST_PRIVATE_SPAWN_FAILURE");
}

function emitSpawnFailureAndClose(child: FakeTb2aChildProcess): void {
  child.emit("error", new Error("TEST_PRIVATE_SPAWN_FAILURE"));
  child.emit("close", null, null);
}

async function runFormerSentinelCase(
  create: (path: string) => void,
): Promise<void> {
  await withProcessDirectory(async (directory) => {
    const formerSentinel = resolve(directory, "missing-executable");
    create(formerSentinel);
    const spawnProcess = vi.fn(() => {
      throw new Error("TEST_SPAWN_MUST_NOT_RUN");
    });

    expect(await executeTb2aProcessCommand({
      mode: TB2A_PROCESS_MODE_FIXTURE,
      kind: "GCLOUD_VERSION",
      executable: formerSentinel,
      args: [FIXTURE, "normal"],
      env: Object.freeze({}),
      cwd: directory,
      repositoryRoot: ROOT,
      projectId: PROJECT_ID,
      timing: QUICK_TIMING,
    }, {
      signalProcessGroup: vi.fn(),
      spawnProcess,
    })).toEqual({
      ok: false,
      reason: "COMMAND_FAILED",
      attemptCount: 0,
    });
    expect(spawnProcess).toHaveBeenCalledTimes(0);
  });
}

async function runListenerCleanupCase(directory: string): Promise<void> {
  const child = new FakeTb2aChildProcess();
  const spawnProcess = vi.fn(() => {
    queueMicrotask(() => {
      child.emit("error", new Error("TEST_INITIAL_CHILD_ERROR"));
    });
    return child;
  });
  let resolutionCount = 0;
  const resultPromise = executeTb2aProcessCommand({
    mode: TB2A_PROCESS_MODE_FIXTURE,
    kind: "GCLOUD_VERSION",
    executable: TEST_MODULE_NODE_EXECUTABLE_PATH,
    args: [FIXTURE, "normal"],
    env: Object.freeze({}),
    cwd: directory,
    repositoryRoot: ROOT,
    projectId: PROJECT_ID,
    timing: Object.freeze({
      commandDeadlineMs: 200,
      sigtermGraceMs: 10,
      closeDeadlineMs: 10,
    }),
  }, {
    signalProcessGroup: vi.fn(),
    spawnProcess,
  }).then((result) => {
    resolutionCount += 1;
    return result;
  });

  const result = await withinTestDeadline(resultPromise, 500);
  expect(result).toEqual({
    ok: false,
    reason: "PROCESS_TERMINATION_UNCONFIRMED",
    attemptCount: 1,
  });
  expect(resolutionCount).toBe(1);
  expect(child.listenerCount("exit")).toBe(0);
  expect(child.listeners("close").map((listener) => listener.name))
    .toEqual(["removeTb2aLateErrorSafetySinkOnClose"]);
  expect(child.listeners("error").map((listener) => listener.name))
    .toEqual(["tb2aLateChildErrorSafetySink"]);
  expect(child.stdout.listenerCount("data")).toBe(0);
  expect(child.stderr.listenerCount("data")).toBe(0);

  child.stdout.emit("data", Buffer.from("late stdout"));
  child.stderr.emit("data", Buffer.from("late stderr"));
  child.emit("error", new Error("TEST_LATE_CHILD_ERROR"));
  child.emit("exit", 9, null);
  expect(resolutionCount).toBe(1);
  expect(result).toEqual({
    ok: false,
    reason: "PROCESS_TERMINATION_UNCONFIRMED",
    attemptCount: 1,
  });

  child.emit("close", 9, null);
  expect(child.listenerCount("error")).toBe(0);
  expect(child.listenerCount("exit")).toBe(0);
  expect(child.listenerCount("close")).toBe(0);
  await delay(30);
  expect(resolutionCount).toBe(1);
}

function deferredDirectoryValidation(): Readonly<{
  entered: Promise<void>;
  release(): void;
  validate(candidate: string, repositoryRoot: string): Promise<string | null>;
}> {
  let markEntered: () => void = () => undefined;
  let releaseValidation: () => void = () => undefined;
  const entered = new Promise<void>((resolveEntered) => {
    markEntered = resolveEntered;
  });
  const released = new Promise<void>((resolveReleased) => {
    releaseValidation = resolveReleased;
  });
  return Object.freeze({
    entered,
    release: releaseValidation,
    async validate(candidate, repositoryRoot) {
      markEntered();
      await released;
      const canonicalCandidate = realpathSync(candidate);
      const canonicalRoot = realpathSync(repositoryRoot);
      return canonicalCandidate === canonicalRoot
        || canonicalCandidate.startsWith(`${canonicalRoot}/`)
        ? null
        : canonicalCandidate;
    },
  });
}

function mutableFixtureRequest(directory: string) {
  const environment: Record<string, string> = {};
  return {
    mode: TB2A_PROCESS_MODE_FIXTURE,
    kind: "GCLOUD_VERSION",
    executable: TEST_MODULE_NODE_EXECUTABLE_PATH,
    args: [FIXTURE, "normal"],
    env: environment,
    cwd: directory,
    repositoryRoot: ROOT,
    projectId: PROJECT_ID,
    projectNumber: PROJECT_NUMBER,
    timing: {
      commandDeadlineMs: QUICK_TIMING.commandDeadlineMs,
      sigtermGraceMs: QUICK_TIMING.sigtermGraceMs,
      closeDeadlineMs: QUICK_TIMING.closeDeadlineMs,
    },
  };
}

function mutateIntoAttendedRequest(
  request: object,
  boundary: AttendedBoundary,
): void {
  const attended = attendedRequest(boundary);
  for (const key of Reflect.ownKeys(request)) {
    Reflect.deleteProperty(request, key);
  }
  for (const [key, value] of Object.entries(attended)) {
    Reflect.set(request, key, value);
  }
}

function mutateIntoFixtureRequest(request: object): void {
  for (const key of Reflect.ownKeys(request)) {
    Reflect.deleteProperty(request, key);
  }
  Reflect.set(request, "mode", TB2A_PROCESS_MODE_FIXTURE);
  Reflect.set(request, "kind", "GCLOUD_VERSION");
  Reflect.set(request, "executable", TEST_MODULE_NODE_EXECUTABLE_PATH);
  Reflect.set(request, "args", [FIXTURE, "normal"]);
  Reflect.set(request, "env", {});
  Reflect.set(request, "cwd", "/mutated/fixture-cwd");
  Reflect.set(request, "repositoryRoot", ROOT);
  Reflect.set(request, "projectId", PROJECT_ID);
  Reflect.set(request, "projectNumber", PROJECT_NUMBER);
  Reflect.set(request, "timing", {
    commandDeadlineMs: 1,
    sigtermGraceMs: 1,
    closeDeadlineMs: 1,
  });
}

function requestEnvironment(
  boundary: AttendedBoundary,
): Readonly<Record<string, string>> {
  return buildTb2aAttendedEnvironment({
    cloudSdkConfigPath: join(boundary.directory, "configuration"),
    configurationName: "attended-review",
    projectId: PROJECT_ID,
    pythonPath: boundary.python,
    homePath: join(boundary.directory, "home"),
    temporaryPath: join(boundary.directory, "tmp"),
    path: "/usr/bin",
    utf8Locale: "C.UTF-8",
  });
}

function recordingSignals(
  signals: NodeJS.Signals[],
): Tb2aProcessDependencies {
  return Object.freeze({
    signalProcessGroup(pid, signal) {
      signals.push(signal);
      process.kill(-pid, signal);
    },
  });
}

function timingInput(
  override: Readonly<Partial<Tb2aProcessTiming>>,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    ...ATTENDED_TIMING,
    ...override,
  });
}

function spawnFixtureRequest(
  request: Tb2aSpawnRequest,
): SpawnedTb2aProcess {
  return spawn(request.executable, [...request.args], {
    cwd: request.options.cwd,
    env: { ...request.options.env },
    shell: request.options.shell,
    detached: request.options.detached,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function spawnNodeFixture(
  request: Tb2aSpawnRequest,
  mode: string,
): SpawnedTb2aProcess {
  return spawn(TEST_MODULE_NODE_EXECUTABLE_PATH, [FIXTURE, mode], {
    cwd: request.options.cwd,
    env: { ...request.options.env },
    shell: request.options.shell,
    detached: request.options.detached,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function runUncertainTerminationCase(): Promise<void> {
  await withProcessDirectory(async (directory) => {
    const signalProcessGroup = vi.fn(() => {
      throw new Error("TEST_SIGNAL_UNCERTAINTY");
    });
    const result = await executeFixture(
      directory,
      "fast-exit",
      Object.freeze({
        commandDeadlineMs: 1,
        sigtermGraceMs: 40,
        closeDeadlineMs: 200,
      }),
      { signalProcessGroup },
    );

    expect(result).toEqual({
      ok: false,
      reason: "PROCESS_TERMINATION_UNCONFIRMED",
      attemptCount: 1,
    });
    expect(signalProcessGroup).toHaveBeenCalledTimes(1);
  });
}

async function runOutlivingDescendantCase(
  directory: string,
): Promise<void> {
  const readyFile = join(directory, "descendant.ready");
  const completionFile = join(directory, "descendant.completed");
  let acknowledgeExit: (code: number | null) => void = () => undefined;
  const rootExit = new Promise<number | null>((resolveExit) => { acknowledgeExit = resolveExit; });
  let acknowledgeClose: (state: "closed") => void = () => undefined;
  const rootClose = new Promise<"closed">((resolveClose) => { acknowledgeClose = resolveClose; });
  let readinessPresentAtRootExit = false;
  const spawnProcess = vi.fn((request: Tb2aSpawnRequest) => {
    const child = spawnFixtureRequest(request);
    child.once("exit", (code: number | null) => {
      readinessPresentAtRootExit =
        readDescendantReadyRecord(readyFile) !== null;
      acknowledgeExit(code);
    });
    child.once("close", () => acknowledgeClose("closed"));
    return child;
  });
  let descendantPid: number | null = null;
  try {
    const resultPromise = executeFixture(
      directory,
      "exit-with-descendant",
      Object.freeze({
        commandDeadlineMs: 30_000,
        sigtermGraceMs: 40,
        closeDeadlineMs: 120,
      }),
      {
        signalProcessGroup(pid, signal) {
          process.kill(-pid, signal);
        },
        spawnProcess,
      },
      [readyFile, completionFile],
    );
    // The fixture exits successfully only after publishing descendant readiness.
    expect(await withinTestDeadline(rootExit, 30_000)).toBe(0);
    const readiness = readDescendantReadyRecord(readyFile);
    if (!readiness) throw new Error("DESCENDANT_NOT_READY_AT_ROOT_EXIT");
    descendantPid = readiness.pid;
    expect(readiness).toEqual({
      protocol: "TB2A_DESCENDANT_READY_V1",
      pid: descendantPid,
      signalHandlerInstalled: true,
      completionMarkerArmed: true,
      inheritedOutputOpen: true,
    });
    expect(processExists(descendantPid)).toBe(true);
    expect(readinessPresentAtRootExit).toBe(true);
    // A pending close alongside root exit and a live descendant proves inherited pipes.
    expect(await Promise.race([rootClose, Promise.resolve("pending")])).toBe("pending");
    expect(existsSync(completionFile)).toBe(false);
    expect(processExists(descendantPid)).toBe(true);

    expect(await withinTestDeadline(resultPromise, 5_000)).toEqual({
      ok: false,
      reason: "PROCESS_TERMINATION_UNCONFIRMED",
      attemptCount: 1,
    });
    expect(spawnProcess).toHaveBeenCalledTimes(1);
    expect(existsSync(completionFile)).toBe(false);
    expect(processExists(descendantPid)).toBe(true);
  } finally {
    descendantPid ??= readDescendantReadyRecord(readyFile)?.pid ?? null;
    if (descendantPid !== null && processExists(descendantPid)) {
      await stopReadyDescendant(descendantPid, completionFile);
    }
  }
  await withinTestDeadline(rootClose, 5_000);
  expect(readFileSync(completionFile, "utf8")).toBe("completed\n");
  expect(descendantPid).not.toBeNull();
  expect(processExists(descendantPid ?? -1)).toBe(false);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactDescendantReadyKeys(
  value: Readonly<Record<string, unknown>>,
): boolean {
  const keys = Object.keys(value).sort();
  return JSON.stringify(keys) === JSON.stringify(DESCENDANT_READY_KEYS);
}

function parseDescendantReadyPid(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isSafeInteger(value)) return null;
  if (value <= 0) return null;
  return value;
}

function hasExactDescendantReadyFlags(
  value: Readonly<Record<string, unknown>>,
): boolean {
  return value.signalHandlerInstalled === true
    && value.completionMarkerArmed === true
    && value.inheritedOutputOpen === true;
}

function reconstructDescendantReadyRecord(
  value: unknown,
): DescendantReadyRecord | null {
  if (!isRecord(value)) return null;
  if (!hasExactDescendantReadyKeys(value)) return null;
  if (value.protocol !== "TB2A_DESCENDANT_READY_V1") return null;
  const pid = parseDescendantReadyPid(value.pid);
  if (pid === null) return null;
  if (!hasExactDescendantReadyFlags(value)) return null;
  return Object.freeze({
    protocol: "TB2A_DESCENDANT_READY_V1",
    pid,
    signalHandlerInstalled: true,
    completionMarkerArmed: true,
    inheritedOutputOpen: true,
  });
}

function readDescendantReadyRecord(
  path: string,
): DescendantReadyRecord | null {
  if (!existsSync(path)) return null;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  return reconstructDescendantReadyRecord(value);
}

async function stopReadyDescendant(
  pid: number,
  completionFile: string,
): Promise<void> {
  try {
    process.kill(pid, "SIGTERM");
    await waitForFile(completionFile, 2_500);
    await waitForCondition(() => !processExists(pid), 2_500);
  } catch (cleanupError) {
    if (processExists(pid)) process.kill(pid, "SIGKILL");
    await waitForCondition(() => !processExists(pid), 2_500).catch(
      () => undefined,
    );
    throw cleanupError;
  }
}

async function runUnsettledCloseDeadlineCase(
  directory: string,
): Promise<void> {
  let fixturePid: number | null = null;
  let fixtureClose: Promise<void> | null = null;
  const signalProcessGroup = vi.fn(() => {
    throw new Error("TEST_REQUIRED_SIGNAL_FAILURE");
  });
  const spawnProcess = vi.fn((request: Tb2aSpawnRequest) => {
    const child = spawnFixtureRequest(request);
    fixturePid = child.pid ?? null;
    fixtureClose = new Promise((resolveClose) => {
      child.once("close", () => resolveClose());
    });
    return child;
  });
  try {
    const result = await withinTestDeadline(
      executeFixture(
        directory,
        "ignore-term",
        Object.freeze({
          commandDeadlineMs: 20,
          sigtermGraceMs: 20,
          closeDeadlineMs: 60,
        }),
        { signalProcessGroup, spawnProcess },
      ),
      500,
    );

    expect(result).toEqual({
      ok: false,
      reason: "PROCESS_TERMINATION_UNCONFIRMED",
      attemptCount: 1,
    });
    expect(signalProcessGroup).toHaveBeenCalledTimes(1);
    expect(spawnProcess).toHaveBeenCalledTimes(1);
    expect(fixturePid).not.toBeNull();
    expect(processExists(fixturePid ?? -1)).toBe(true);
  } finally {
    if (fixturePid !== null && processExists(fixturePid)) {
      process.kill(-fixturePid, "SIGKILL");
    }
    if (fixtureClose) {
      await withinTestDeadline(fixtureClose, 500);
    }
  }
  expect(processExists(fixturePid ?? -1)).toBe(false);
}

async function withAttendedProcessBoundary(
  run: (boundary: AttendedBoundary) => Promise<void>,
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "mira-tb2a-admission-"));
  chmodSync(directory, 0o700);
  const launcher = join(directory, "gcloud");
  const python = join(directory, "python");
  const otherPython = join(directory, "other-python");
  for (const executable of [launcher, python, otherPython]) {
    writeFileSync(executable, "#!/nonexistent\n", { mode: 0o700 });
  }
  try {
    await run(Object.freeze({
      directory,
      launcher: realpathSync(launcher),
      python: realpathSync(python),
      otherPython: realpathSync(otherPython),
    }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function attendedRequest(boundary: AttendedBoundary) {
  const mode: typeof TB2A_PROCESS_MODE_ATTENDED =
    TB2A_PROCESS_MODE_ATTENDED;
  const configurationName = "attended-review";
  const cloudSdkConfigPath = join(boundary.directory, "configuration");
  const homePath = join(boundary.directory, "home");
  const temporaryPath = join(boundary.directory, "tmp");
  const path = "/usr/bin";
  const utf8Locale = "C.UTF-8";
  const env = buildTb2aAttendedEnvironment({
    cloudSdkConfigPath,
    configurationName,
    projectId: PROJECT_ID,
    pythonPath: boundary.python,
    homePath,
    temporaryPath,
    path,
    utf8Locale,
  });
  return {
    mode,
    kind: "GCLOUD_VERSION" as const,
    executable: boundary.launcher,
    args: buildTb2aReadOnlyCommand("GCLOUD_VERSION", {
      projectId: PROJECT_ID,
      configurationName,
    }),
    env,
    cwd: boundary.directory,
    repositoryRoot: ROOT,
    pythonPath: boundary.python,
    cloudSdkConfigPath,
    configurationName,
    homePath,
    temporaryPath,
    path,
    utf8Locale,
    projectId: PROJECT_ID,
  };
}

async function withProcessDirectory(
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "mira-tb2a-process-"));
  chmodSync(directory, 0o700);
  try {
    await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

type ExecPathCandidate = Readonly<{
  name: string;
  executable: string;
  sentinel: string;
}>;

type ExecPathCandidateKind =
  | "regular-side-effect"
  | "symlink-to-side-effect-wrapper"
  | "ignores-fixture-argv"
  | "filesystem-sentinel"
  | "compatible-output";

type ExactSelfCheckResult = Readonly<{
  contractVersion: "mira-refund-p3e-b2-attended-collector-core/v1";
  evidenceVersion:
    "mira-refund-p3e-b2-trusted-project-bootstrap-readiness/v2";
  disposition: "INDEPENDENT_REVIEW_REQUIRED";
  evidenceSha256: string;
  commandCount: 6;
  durationMs: number;
  mode: "FIXTURE_SELF_CHECK";
}>;

const EXACT_SELF_CHECK_KEYS = Object.freeze([
  "contractVersion",
  "evidenceVersion",
  "disposition",
  "evidenceSha256",
  "commandCount",
  "durationMs",
  "mode",
]);

async function runRegularSideEffectExecPathRebindingCase(): Promise<void> {
  await runExecPathRebindingCandidateCase("regular-side-effect");
}

async function runSymlinkExecPathRebindingCase(): Promise<void> {
  await runExecPathRebindingCandidateCase("symlink-to-side-effect-wrapper");
}

async function runIgnoredFixtureArgvExecPathRebindingCase(): Promise<void> {
  await runExecPathRebindingCandidateCase("ignores-fixture-argv");
}

async function runFilesystemSentinelExecPathRebindingCase(): Promise<void> {
  await runExecPathRebindingCandidateCase("filesystem-sentinel");
}

async function runCompatibleOutputExecPathRebindingCase(): Promise<void> {
  await runExecPathRebindingCandidateCase("compatible-output");
}

async function runExecPathRebindingCandidateCase(
  kind: ExecPathCandidateKind,
): Promise<void> {
  await withExecPathCandidate(kind, runReboundExecPathCandidate);
  assertOriginalProcessExecPathRestored();
}

async function runReboundExecPathCandidate(
  candidate: ExecPathCandidate,
): Promise<void> {
  await withReboundProcessExecPath(
    candidate.executable,
    runReboundDirectExecPathCase.bind(undefined, candidate),
  );
}

async function runReboundDirectExecPathCase(
  candidate: ExecPathCandidate,
): Promise<void> {
  await withProcessDirectory(
    runDirectFixtureExecPathRebindingCase.bind(undefined, candidate),
  );
}

async function runDirectFixtureExecPathRebindingCase(
  candidate: ExecPathCandidate,
  directory: string,
): Promise<void> {
  const admittedRequests: Tb2aSpawnRequest[] = [];
  const spawnProcess = vi.fn((request: Tb2aSpawnRequest) => {
    admittedRequests.push(request);
    return deterministicFixtureChild();
  });
  const candidateSpawn = vi.fn(() => {
    throw new Error("TEST_REBOUND_WRAPPER_MUST_NOT_RUN");
  });
  const candidateResult = await executeTb2aProcessCommand({
    mode: TB2A_PROCESS_MODE_FIXTURE,
    kind: "GCLOUD_VERSION",
    executable: candidate.executable,
    args: [FIXTURE, "normal"],
    env: {},
    cwd: directory,
    repositoryRoot: ROOT,
    projectId: PROJECT_ID,
    timing: QUICK_TIMING,
  }, {
    signalProcessGroup: vi.fn(),
    spawnProcess: candidateSpawn,
  });

  expect(candidateResult, candidate.name).toEqual({
    ok: false,
    reason: "COMMAND_FAILED",
    attemptCount: 0,
  });
  expect(candidateSpawn, candidate.name).toHaveBeenCalledTimes(0);
  expect(existsSync(candidate.sentinel), candidate.name).toBe(false);

  const result = await executeFixture(
    directory,
    "normal",
    QUICK_TIMING,
    {
      signalProcessGroup(pid, signal) {
        process.kill(-pid, signal);
      },
      spawnProcess,
    },
  );

  expect(spawnProcess, candidate.name).toHaveBeenCalledTimes(1);
  expect(admittedRequests, candidate.name).toHaveLength(1);
  expect(admittedRequests[0]?.executable, candidate.name)
    .toBe(TEST_MODULE_NODE_EXECUTABLE_PATH);
  expect(admittedRequests[0]?.args, candidate.name)
    .toEqual([FIXTURE, "normal"]);
  expect(admittedRequests[0]?.executable, candidate.name)
    .not.toBe(candidate.executable);
  expect(admittedRequests[0]?.args, candidate.name)
    .not.toContain(candidate.executable);
  expect(existsSync(candidate.sentinel), candidate.name).toBe(false);
  expect(result, candidate.name).toEqual({
    ok: true,
    kind: "GCLOUD_VERSION",
    version: "577.0.0",
    responseSha256: DETERMINISTIC_VERSION_RESPONSE_SHA256,
    attemptCount: 1,
  });
}

type RealSelfCheckRebindingObservation = Readonly<{
  selfCheck: ExactSelfCheckResult;
  sentinelExists: boolean;
}>;

async function runRealSelfCheckExecPathRebindingCase(): Promise<void> {
  const observation = await withExecPathCandidate(
    "regular-side-effect",
    captureRealSelfCheckRebindingObservation,
  );
  assertOriginalProcessExecPathRestored();
  const { selfCheck } = observation;
  expect(selfCheck).toEqual({
    contractVersion: "mira-refund-p3e-b2-attended-collector-core/v1",
    evidenceVersion:
      "mira-refund-p3e-b2-trusted-project-bootstrap-readiness/v2",
    disposition: "INDEPENDENT_REVIEW_REQUIRED",
    evidenceSha256: selfCheck.evidenceSha256,
    commandCount: 6,
    durationMs: selfCheck.durationMs,
    mode: "FIXTURE_SELF_CHECK",
  });
  expect(selfCheck.evidenceSha256).toMatch(/^[a-f0-9]{64}$/u);
  expect(Number.isSafeInteger(selfCheck.durationMs)).toBe(true);
  expect(Object.isFrozen(selfCheck)).toBe(true);
  expect(observation.sentinelExists).toBe(false);
}

async function captureRealSelfCheckRebindingObservation(
  candidate: ExecPathCandidate,
): Promise<RealSelfCheckRebindingObservation> {
  return await withReboundProcessExecPath(
    candidate.executable,
    async () => {
      const rawResult: unknown = await runTb2aCollectorSelfCheck();
      const sentinelExists = existsSync(candidate.sentinel);
      const selfCheck = readExactSelfCheckResult(rawResult);
      return Object.freeze({
        selfCheck,
        sentinelExists,
      });
    },
  );
}

function readExactSelfCheckResult(value: unknown): ExactSelfCheckResult {
  const source = readExactSelfCheckObject(value);
  const contractVersion = readRequiredLiteralField(
    source,
    "contractVersion",
    "mira-refund-p3e-b2-attended-collector-core/v1",
  );
  const evidenceVersion = readRequiredLiteralField(
    source,
    "evidenceVersion",
    "mira-refund-p3e-b2-trusted-project-bootstrap-readiness/v2",
  );
  const disposition = readRequiredLiteralField(
    source,
    "disposition",
    "INDEPENDENT_REVIEW_REQUIRED",
  );
  const evidenceSha256 = readRequiredSha256Field(
    source,
    "evidenceSha256",
  );
  const commandCount = readRequiredSafeIntegerLiteral(
    source,
    "commandCount",
    6,
  );
  const durationMs = readRequiredNonnegativeSafeIntegerField(
    source,
    "durationMs",
  );
  const mode = readRequiredLiteralField(
    source,
    "mode",
    "FIXTURE_SELF_CHECK",
  );
  return Object.freeze({
    contractVersion,
    evidenceVersion,
    disposition,
    evidenceSha256,
    commandCount,
    durationMs,
    mode,
  });
}

function readExactSelfCheckObject(value: unknown): object {
  if (!isNonArrayObject(value)) {
    throw new Error("TEST_SELF_CHECK_RESULT_INVALID");
  }
  assertExactSelfCheckKeys(value);
  return value;
}

function assertExactSelfCheckKeys(value: object): void {
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== EXACT_SELF_CHECK_KEYS.length
    || !ownKeys.every(isExactSelfCheckKey)) {
    throw new Error("TEST_SELF_CHECK_RESULT_INVALID");
  }
}

function isExactSelfCheckKey(value: string | symbol): boolean {
  return typeof value === "string"
    && EXACT_SELF_CHECK_KEYS.includes(value);
}

function readOwnDataValue(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor
    || !Object.hasOwn(descriptor, "value")
    || Object.hasOwn(descriptor, "get")
    || Object.hasOwn(descriptor, "set")) {
    throw new Error("TEST_SELF_CHECK_RESULT_INVALID");
  }
  const result: unknown = descriptor.value;
  return result;
}

function readRequiredLiteralField<const Value extends string>(
  source: object,
  key: string,
  expected: Value,
): Value {
  if (readOwnDataValue(source, key) !== expected) {
    throw new Error("TEST_SELF_CHECK_RESULT_INVALID");
  }
  return expected;
}

function readRequiredSha256Field(
  source: object,
  key: string,
): string {
  const value = readOwnDataValue(source, key);
  if (typeof value !== "string"
    || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error("TEST_SELF_CHECK_RESULT_INVALID");
  }
  return value;
}

function readRequiredSafeIntegerLiteral<const Value extends number>(
  source: object,
  key: string,
  expected: Value,
): Value {
  const value = readOwnDataValue(source, key);
  if (typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 0
    || value !== expected) {
    throw new Error("TEST_SELF_CHECK_RESULT_INVALID");
  }
  return expected;
}

function readRequiredNonnegativeSafeIntegerField(
  source: object,
  key: string,
): number {
  const value = readOwnDataValue(source, key);
  if (typeof value !== "number"
    || !Number.isFinite(value)
    || !Number.isSafeInteger(value)
    || value < 0) {
    throw new Error("TEST_SELF_CHECK_RESULT_INVALID");
  }
  return value;
}

function isNonArrayObject(value: unknown): value is object {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value);
}

async function runDeferredAdmissionExecPathRebindingCase(): Promise<void> {
  await withExecPathCandidate(
    "regular-side-effect",
    runDeferredAdmissionCandidate,
  );
  assertOriginalProcessExecPathRestored();
}

async function runDeferredAdmissionCandidate(
  candidate: ExecPathCandidate,
): Promise<void> {
  await withProcessDirectory(
    runPausedAdmissionRebindingCase.bind(undefined, candidate),
  );
  assertOriginalProcessExecPathRestored();
}

async function runPausedAdmissionRebindingCase(
  candidate: ExecPathCandidate,
  directory: string,
): Promise<void> {
  const validation = deferredDirectoryValidation();
  const admittedRequests: Tb2aSpawnRequest[] = [];
  const spawnProcess = vi.fn((request: Tb2aSpawnRequest) => {
    admittedRequests.push(request);
    return deterministicFixtureChild();
  });
  const resultPromise = executeFixture(
    directory,
    "normal",
    QUICK_TIMING,
    {
      signalProcessGroup(pid, signal) {
        process.kill(-pid, signal);
      },
      spawnProcess,
      validateExecutionDirectory: validation.validate,
    },
  );
  await validation.entered;

  await withReboundProcessExecPath(
    candidate.executable,
    releasePausedAdmission.bind(undefined, validation, resultPromise),
  );

  expect(spawnProcess).toHaveBeenCalledTimes(1);
  expect(admittedRequests[0]?.executable)
    .toBe(TEST_MODULE_NODE_EXECUTABLE_PATH);
  expect(admittedRequests[0]?.args).toEqual([FIXTURE, "normal"]);
  expect(admittedRequests[0]?.executable).not.toBe(candidate.executable);
  expect(admittedRequests[0]?.args).not.toContain(candidate.executable);
  expect(existsSync(candidate.sentinel)).toBe(false);
}

async function releasePausedAdmission(
  validation: ReturnType<typeof deferredDirectoryValidation>,
  resultPromise: ReturnType<typeof executeFixture>,
): Promise<void> {
  validation.release();
  expect(await resultPromise).toEqual({
    ok: true,
    kind: "GCLOUD_VERSION",
    version: "577.0.0",
    responseSha256: DETERMINISTIC_VERSION_RESPONSE_SHA256,
    attemptCount: 1,
  });
}

function deterministicFixtureChild(): FakeTb2aChildProcess {
  const child = new FakeTb2aChildProcess();
  queueMicrotask(() => {
    child.stdout.emit("data", DETERMINISTIC_VERSION_OUTPUT);
    child.emit("exit", 0, null);
    child.emit("close", 0, null);
  });
  return child;
}

async function withExecPathCandidate<Result>(
  kind: ExecPathCandidateKind,
  run: (candidate: ExecPathCandidate) => Promise<Result>,
): Promise<Result> {
  const directory = mkdtempSync(join(tmpdir(), "mira-tb2a-exec-path-"));
  chmodSync(directory, 0o700);
  try {
    return await run(createExecPathCandidate(directory, kind));
  } finally {
    restoreProcessExecPath();
    rmSync(directory, { recursive: true, force: true });
  }
}

function createExecPathCandidate(
  directory: string,
  kind: ExecPathCandidateKind,
): ExecPathCandidate {
  if (kind === "regular-side-effect") {
    return execPathCandidate(directory, kind, "");
  }
  if (kind === "symlink-to-side-effect-wrapper") {
    const regular = execPathCandidate(
      directory,
      "regular-side-effect",
      "",
    );
    const symlink = join(directory, "symlink-wrapper");
    symlinkSync(regular.executable, symlink);
    return Object.freeze({
      name: kind,
      executable: symlink,
      sentinel: regular.sentinel,
    });
  }
  if (kind === "ignores-fixture-argv") {
    return execPathCandidate(
      directory,
      kind,
      "process.exitCode = 0;\n",
    );
  }
  if (kind === "filesystem-sentinel") {
    return execPathCandidate(
      directory,
      kind,
      "process.exitCode = 0;\n",
    );
  }
  return execPathCandidate(
    directory,
    kind,
    "process.stdout.write(JSON.stringify({"
      + "\"Google Cloud SDK\":\"577.0.0\""
      + "}));\n",
  );
}

function execPathCandidate(
  directory: string,
  name: string,
  behavior: string,
): ExecPathCandidate {
  const executable = join(directory, `${name}.mjs`);
  const sentinel = join(directory, `${name}.sentinel`);
  writeFileSync(
    executable,
    `#!${TEST_MODULE_NODE_EXECUTABLE_PATH}\n`
      + `import { writeFileSync } from "node:fs";\n`
      + `writeFileSync(${JSON.stringify(sentinel)}, "executed\\n");\n`
      + behavior,
    { mode: 0o700 },
  );
  return Object.freeze({ name, executable, sentinel });
}

async function withReboundProcessExecPath<Result>(
  executable: string,
  run: () => Promise<Result>,
): Promise<Result> {
  const descriptor = requiredOriginalProcessExecPathDescriptor();
  Object.defineProperty(process, "execPath", {
    ...descriptor,
    value: executable,
  });
  try {
    return await run();
  } finally {
    Object.defineProperty(process, "execPath", descriptor);
  }
}

function restoreProcessExecPath(): void {
  Object.defineProperty(
    process,
    "execPath",
    requiredOriginalProcessExecPathDescriptor(),
  );
}

function assertOriginalProcessExecPathRestored(): void {
  expect(Object.getOwnPropertyDescriptor(process, "execPath"))
    .toEqual(requiredOriginalProcessExecPathDescriptor());
  expect(process.execPath).toBe(TEST_MODULE_NODE_EXECUTABLE_PATH);
}

function requiredOriginalProcessExecPathDescriptor(): PropertyDescriptor {
  if (!ORIGINAL_PROCESS_EXEC_PATH_DESCRIPTOR
    || !("value" in ORIGINAL_PROCESS_EXEC_PATH_DESCRIPTOR)) {
    throw new Error("TEST_PROCESS_EXEC_PATH_DESCRIPTOR_MISSING");
  }
  return ORIGINAL_PROCESS_EXEC_PATH_DESCRIPTOR;
}

type ProxyTrapCounters = {
  getPrototypeOf: number;
  ownKeys: number;
  getOwnPropertyDescriptor: number;
  get: number;
  has: number;
};

type ProxyExecutionCase = Readonly<{
  name: string;
  request: unknown;
  counters: ProxyTrapCounters;
  afterInvocation?(): void;
}>;

function proxyExecutionCases(directory: string): readonly ProxyExecutionCase[] {
  return Object.freeze([
    proxiedOuterRequestCase(directory),
    proxiedNestedRequestCase(directory, "args"),
    proxiedNestedRequestCase(directory, "env"),
    proxiedNestedRequestCase(directory, "timing"),
    revokedOuterRequestCase(directory),
    revokedNestedEnvironmentCase(directory),
    revokeOuterRequestAfterInvocationCase(directory),
  ]);
}

function proxiedOuterRequestCase(directory: string): ProxyExecutionCase {
  const counters = emptyProxyTrapCounters();
  return Object.freeze({
    name: "outer request Proxy",
    request: trapGuardedProxy(mutableFixtureRequest(directory), counters),
    counters,
  });
}

function proxiedNestedRequestCase(
  directory: string,
  field: "args" | "env" | "timing",
): ProxyExecutionCase {
  const counters = emptyProxyTrapCounters();
  const request = mutableFixtureRequest(directory);
  if (field === "args") {
    request.args = trapGuardedProxy([...request.args], counters);
  } else if (field === "env") {
    request.env = trapGuardedProxy({}, counters);
  } else {
    request.timing = trapGuardedProxy({ ...request.timing }, counters);
  }
  return Object.freeze({
    name: `${field} Proxy`,
    request,
    counters,
  });
}

function revokedOuterRequestCase(directory: string): ProxyExecutionCase {
  const counters = emptyProxyTrapCounters();
  const revocable = Proxy.revocable(
    mutableFixtureRequest(directory),
    proxyTrapHandler(counters),
  );
  revocable.revoke();
  return Object.freeze({
    name: "revoked outer request Proxy",
    request: revocable.proxy,
    counters,
  });
}

function revokedNestedEnvironmentCase(
  directory: string,
): ProxyExecutionCase {
  const counters = emptyProxyTrapCounters();
  const request = mutableFixtureRequest(directory);
  const revocable = Proxy.revocable({}, proxyTrapHandler(counters));
  revocable.revoke();
  request.env = revocable.proxy;
  return Object.freeze({
    name: "revoked nested environment Proxy",
    request,
    counters,
  });
}

function revokeOuterRequestAfterInvocationCase(
  directory: string,
): ProxyExecutionCase {
  const counters = emptyProxyTrapCounters();
  const revocable = Proxy.revocable(
    mutableFixtureRequest(directory),
    proxyTrapHandler(counters),
  );
  return Object.freeze({
    name: "outer request Proxy revoked after invocation",
    request: revocable.proxy,
    counters,
    afterInvocation: revocable.revoke,
  });
}

function trapGuardedProxy<Value extends object>(
  target: Value,
  counters: ProxyTrapCounters,
): Value {
  return new Proxy(target, proxyTrapHandler<Value>(counters));
}

function proxyTrapHandler<Value extends object>(
  counters: ProxyTrapCounters,
): ProxyHandler<Value> {
  return Object.freeze({
    getPrototypeOf() {
      counters.getPrototypeOf += 1;
      throw new Error("TEST_PROXY_TRAP_SECRET");
    },
    ownKeys() {
      counters.ownKeys += 1;
      throw new Error("TEST_PROXY_TRAP_SECRET");
    },
    getOwnPropertyDescriptor() {
      counters.getOwnPropertyDescriptor += 1;
      throw new Error("TEST_PROXY_TRAP_SECRET");
    },
    get() {
      counters.get += 1;
      throw new Error("TEST_PROXY_TRAP_SECRET");
    },
    has() {
      counters.has += 1;
      throw new Error("TEST_PROXY_TRAP_SECRET");
    },
  });
}

function emptyProxyTrapCounters(): ProxyTrapCounters {
  return {
    getPrototypeOf: 0,
    ownKeys: 0,
    getOwnPropertyDescriptor: 0,
    get: 0,
    has: 0,
  };
}

function environmentWithOwnProto(
  base: Readonly<Record<string, string>>,
): Record<string, string> {
  const environment: Record<string, string> = {};
  Object.defineProperties(
    environment,
    Object.getOwnPropertyDescriptors(base),
  );
  Object.defineProperty(environment, "__proto__", {
    configurable: true,
    enumerable: true,
    value: "TEST_PROTO_POLLUTION",
    writable: true,
  });
  return environment;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForFile(path: string, timeoutMs: number): Promise<void> {
  await waitForCondition(() => existsSync(path), timeoutMs);
}

async function waitForCondition(
  condition: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error("TEST_CONDITION_TIMEOUT");
    await delay(5);
  }
}

async function withinTestDeadline<Value>(
  promise: Promise<Value>,
  timeoutMs: number,
): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<Value>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("TEST_PROMISE_TIMEOUT")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
