import { describe, expect, it, vi } from "vitest";
import {
  defaultRefundDeploymentRehearsalChildDependencies,
  REFUND_DEPLOYMENT_REHEARSAL_MAX_OUTPUT_BYTES,
  runRefundDeploymentRehearsalChild,
  type RefundDeploymentRehearsalChildDependencies,
  type RefundDeploymentRehearsalChildResult,
  type RefundDeploymentRehearsalChildSpec,
} from "../refund-deployment-rehearsal-child";

const REAL_CHILD_PROTOCOL_DEADLINE_MS = 4_000;

describe("refund deployment rehearsal child supervisor", () => {
  it("accepts exactly one stdout JSON line and awaits clean child close", async () => {
    const observed = await runObservedChild(spec([
      "-e", 'process.stdout.write(JSON.stringify({ok:true,code:"SAFE"})+"\\n")',
    ]));

    expect(observed.result).toEqual({ ok: true, value: { ok: true, code: "SAFE" } });
  });

  it("accepts exactly one expected stderr failure line", async () => {
    await expect(runRefundDeploymentRehearsalChild({
      ...spec(["-e", 'process.stderr.write(JSON.stringify({ok:false,code:"SAFE_FAILURE"})+"\\n");process.exitCode=1']),
      expectedChannel: "STDERR",
      expectedExitCode: 1,
    })).resolves.toEqual({ ok: true, value: { ok: false, code: "SAFE_FAILURE" } });
  });

  it.each([
    ["extra line", ["-e", 'process.stdout.write("{}\\n{}\\n")'], "MALFORMED_OUTPUT"],
    ["wrong channel", ["-e", 'process.stderr.write("{}\\n")'], "WRONG_CHANNEL"],
    ["malformed JSON", ["-e", 'process.stdout.write("not-json\\n")'], "MALFORMED_OUTPUT"],
    ["malformed UTF-8", ["-e", "process.stdout.write(Buffer.from([0xc3,0x28,0x0a]))"], "MALFORMED_OUTPUT"],
    ["NUL output", ["-e", 'process.stdout.write("{\\u0000}\\n")'], "MALFORMED_OUTPUT"],
    ["no output", ["-e", ""], "NO_OUTPUT"],
    ["unexpected exit", ["-e", 'process.stdout.write("{}\\n");process.exitCode=2'], "UNEXPECTED_EXIT"],
    ["signal termination", ["-e", 'process.kill(process.pid,"SIGTERM")'], "SIGNAL_TERMINATION"],
  ] as const)("bounds %s", async (_name, args, reason) => {
    await expect(runRefundDeploymentRehearsalChild(spec(args))).resolves.toEqual({
      ok: false, reason,
    });
  });

  it.each(["STDOUT", "STDERR"] as const)("kills and bounds %s overflow", async (channel) => {
    const expression = channel === "STDOUT"
      ? 'process.stdout.write("x".repeat(40000))'
      : 'process.stderr.write("x".repeat(40000))';
    await expect(runRefundDeploymentRehearsalChild(spec(["-e", expression])))
      .resolves.toEqual({ ok: false, reason: "OUTPUT_OVERFLOW" });
  });

  it("accepts exactly 32768 captured bytes without classifying overflow", async () => {
    const framingBytes = Buffer.byteLength('{"value":""}\n');
    const valueBytes = REFUND_DEPLOYMENT_REHEARSAL_MAX_OUTPUT_BYTES - framingBytes;
    const observed = await runObservedChild(spec([
      "-e", `process.stdout.write(JSON.stringify({value:"x".repeat(${valueBytes})})+"\\n")`,
    ]));

    expect(observed.result).toMatchObject({ ok: true });
    if (!observed.result.ok || !isRecord(observed.result.value)) {
      throw new Error("Expected exact-boundary JSON object.");
    }
    expect(observed.result.value.value).toBe("x".repeat(valueBytes));
  });

  it("rejects exactly 32769 captured bytes as first-terminal OUTPUT_OVERFLOW", async () => {
    const framingBytes = Buffer.byteLength('{"value":""}\n');
    const valueBytes = REFUND_DEPLOYMENT_REHEARSAL_MAX_OUTPUT_BYTES + 1 - framingBytes;
    const observed = await runObservedChild(spec([
      "-e", `process.stdout.write(JSON.stringify({value:"x".repeat(${valueBytes})})+"\\n")`,
    ]));

    expect(observed.result).toEqual({ ok: false, reason: "OUTPUT_OVERFLOW" });
  });

  it("reconstructs a multibyte UTF-8 code point split across emitted chunks", async () => {
    const source = [
      'const bytes=Buffer.from("€");',
      'process.stdout.write(Buffer.from(\'{"value":"\'));',
      "process.stdout.write(bytes.subarray(0,1));",
      "setTimeout(()=>process.stdout.write(bytes.subarray(1,2)),20);",
      'setTimeout(()=>{process.stdout.write(bytes.subarray(2));process.stdout.write(Buffer.from(\'"}\\n\'));},40);',
    ].join("");
    const observed = await runObservedChild(spec(["-e", source]), true);

    expect(observed.dataChunkCount).toBeGreaterThanOrEqual(3);
    expect(observed.result).toEqual({ ok: true, value: { value: "€" } });
  });

  it("bounds an incomplete multibyte UTF-8 sequence after awaiting cleanup", async () => {
    const observed = await runObservedChild(spec([
      "-e", "process.stdout.write(Buffer.from([0x7b,0x22,0x78,0x22,0x3a,0x22,0xe2,0x0a]))",
    ]));

    expect(observed.result).toEqual({ ok: false, reason: "MALFORMED_OUTPUT" });
  });

  it("rejects simultaneous nonempty stdout and stderr without channel ambiguity", async () => {
    const observed = await runObservedChild(spec([
      "-e", 'process.stdout.write("{\\"ok\\":true}\\n");process.stderr.write("rejected-channel-data")',
    ]));

    expect(observed.result).toEqual({ ok: false, reason: "WRONG_CHANNEL" });
    expect(JSON.stringify(observed.result)).not.toMatch(/rejected-channel-data/u);
  });

  it.each([
    ["leading space", 'process.stdout.write(" {\\"ok\\":true}\\n")'],
    ["leading tab", 'process.stdout.write("\\t{\\"ok\\":true}\\n")'],
    ["trailing space", 'process.stdout.write("{\\"ok\\":true} \\n")'],
    ["trailing tab", 'process.stdout.write("{\\"ok\\":true}\\t\\n")'],
    ["CRLF", 'process.stdout.write("{\\"ok\\":true}\\r\\n")'],
    ["second newline", 'process.stdout.write("{\\"ok\\":true}\\n\\n")'],
    ["bytes after newline", 'process.stdout.write("{\\"ok\\":true}\\nextra")'],
    ["JSON array", 'process.stdout.write("[]\\n")'],
    ["JSON scalar", 'process.stdout.write("true\\n")'],
  ] as const)("rejects %s at the exact JSON-line transport boundary", async (_name, source) => {
    const observed = await runObservedChild(spec(["-e", source]));

    expect(observed.result).toEqual({ ok: false, reason: "MALFORMED_OUTPUT" });
  });

  it("rejects an explicit blank-line-only transport record", async () => {
    const observed = await runObservedChild(spec(["-e", 'process.stdout.write("\\n")']));

    expect(observed.result).toEqual({ ok: false, reason: "MALFORMED_OUTPUT" });
    expect(JSON.stringify(observed.result)).not.toContain("\\n");
  });

  it("rejects a valid JSON object followed by an explicit blank line", async () => {
    const observed = await runObservedChild(spec([
      "-e", 'process.stdout.write("{\\"transport\\":\\"RAW_TRANSPORT_SECRET\\"}\\n\\n")',
    ]));

    expect(observed.result).toEqual({ ok: false, reason: "MALFORMED_OUTPUT" });
    expect(JSON.stringify(observed.result)).not.toContain("RAW_TRANSPORT_SECRET");
  });

  it("rejects an otherwise valid JSON object without the final LF", async () => {
    const observed = await runObservedChild(spec([
      "-e", 'process.stdout.write("{\\"transport\\":\\"RAW_TRANSPORT_SECRET\\"}")',
    ]));

    expect(observed.result).toEqual({ ok: false, reason: "MALFORMED_OUTPUT" });
    expect(JSON.stringify(observed.result)).not.toContain("RAW_TRANSPORT_SECRET");
  });

  it("bounds synchronous spawn failure", async () => {
    const dependencies: RefundDeploymentRehearsalChildDependencies = {
      ...defaultRefundDeploymentRehearsalChildDependencies,
      spawnChild() { throw new Error("SPAWN_SECRET"); },
    };
    await expect(runRefundDeploymentRehearsalChild(spec(["-e", ""]), dependencies))
      .resolves.toEqual({ ok: false, reason: "SPAWN_FAILED" });
  });

  it("bounds an asynchronously emitted spawn failure", async () => {
    await expect(runRefundDeploymentRehearsalChild({
      ...spec([]), executable: "/definitely/not/a/rehearsal/executable",
    })).resolves.toEqual({ ok: false, reason: "SPAWN_FAILED" });
  });

  it("removes its stream and process listeners after awaiting close", async () => {
    const observed: Array<ReturnType<RefundDeploymentRehearsalChildDependencies["spawnChild"]>> = [];
    const dependencies: RefundDeploymentRehearsalChildDependencies = {
      ...defaultRefundDeploymentRehearsalChildDependencies,
      spawnChild(executable, args, options) {
        const child = defaultRefundDeploymentRehearsalChildDependencies
          .spawnChild(executable, args, options);
        observed.push(child);
        return child;
      },
    };

    await expect(runRefundDeploymentRehearsalChild(spec([
      "-e", 'process.stdout.write("{}\\n")',
    ]), dependencies)).resolves.toEqual({ ok: true, value: {} });
    const child = observed[0];
    if (!child) throw new Error("Expected one observed rehearsal child.");
    expect(child.stdout.listenerCount("data")).toBe(0);
    expect(child.stderr.listenerCount("data")).toBe(0);
    expect(child.listenerCount("error")).toBe(0);
    expect(child.listenerCount("close")).toBe(0);
  });

  it("fires the injected deadline, kills the child, awaits close, and clears its timer", async () => {
    const setTimer = vi.fn((callback: () => void, delayMs: number) => setTimeout(callback, delayMs));
    const clearTimer = vi.fn((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer));
    const dependencies: RefundDeploymentRehearsalChildDependencies = {
      ...defaultRefundDeploymentRehearsalChildDependencies,
      setTimer,
      clearTimer,
    };

    await expect(runRefundDeploymentRehearsalChild({
      ...spec(["-e", "setTimeout(()=>process.stdout.write('{}\\n'),10000)"]),
      deadlineMs: 20,
    }, dependencies)).resolves.toEqual({ ok: false, reason: "CHILD_TIMEOUT" });

    expect(setTimer).toHaveBeenCalledTimes(1);
    expect(clearTimer).toHaveBeenCalledTimes(1);
  });

  it("preserves CHILD_TIMEOUT when a child error arrives after the accepted deadline", async () => {
    const observed: Array<ReturnType<RefundDeploymentRehearsalChildDependencies["spawnChild"]>> = [];
    const deadlines: Array<() => void> = [];
    const clearTimer = vi.fn();
    const dependencies: RefundDeploymentRehearsalChildDependencies = {
      ...defaultRefundDeploymentRehearsalChildDependencies,
      spawnChild(executable, args, options) {
        const child = defaultRefundDeploymentRehearsalChildDependencies
          .spawnChild(executable, args, options);
        observed.push(child);
        return child;
      },
      setTimer(callback) {
        deadlines.push(callback);
        return setTimeout(() => undefined, 10_000);
      },
      clearTimer(timer) {
        clearTimeout(timer);
        clearTimer();
      },
    };
    let resolutions = 0;
    const operation = runRefundDeploymentRehearsalChild(spec([
      "-e", "setTimeout(()=>{},10000)",
    ]), dependencies).then((result) => {
      resolutions += 1;
      return result;
    });
    const child = observed[0];
    const deadline = deadlines[0];
    if (!child || !deadline) throw new Error("Expected captured child and deadline.");
    deadline();
    child.emit("error", new Error("LATE_TIMEOUT_ERROR_SECRET"));

    await expect(operation).resolves.toEqual({ ok: false, reason: "CHILD_TIMEOUT" });
    expect(resolutions).toBe(1);
    expect(clearTimer).toHaveBeenCalledTimes(1);
    expect(child.stdout.listenerCount("data")).toBe(0);
    expect(child.stderr.listenerCount("data")).toBe(0);
  });

  it("preserves first child error after partial stdout until the required close boundary", async () => {
    const children: Array<ReturnType<RefundDeploymentRehearsalChildDependencies["spawnChild"]>> = [];
    const events: string[] = [];
    let closed = false;
    let resolutions = 0;
    let resolvedAfterClose = false;
    const clearTimer = vi.fn((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer));
    const dependencies: RefundDeploymentRehearsalChildDependencies = {
      ...defaultRefundDeploymentRehearsalChildDependencies,
      spawnChild(executable, args, options) {
        const child = defaultRefundDeploymentRehearsalChildDependencies
          .spawnChild(executable, args, options);
        children.push(child);
        child.once("close", () => { closed = true; events.push("close"); });
        return child;
      },
      setTimer: () => setTimeout(() => undefined, 10_000),
      clearTimer,
    };
    const operation = runRefundDeploymentRehearsalChild(
      spec(["-e", "setTimeout(()=>{},10000)"]), dependencies,
    ).then((result) => {
      resolutions += 1;
      resolvedAfterClose = closed;
      events.push("resolved");
      return result;
    });
    const child = children[0];
    if (!child) throw new Error("Expected one partial-output race child.");

    events.push("partial-output");
    child.stdout.emit("data", Buffer.from('{"partial":"PARTIAL_RACE_SECRET'));
    events.push("child-error");
    child.emit("error", new Error("PARTIAL_CHILD_ERROR_SECRET"));
    await Promise.resolve();
    expect(resolutions).toBe(0);
    events.push("termination-requested");
    child.kill("SIGKILL");

    const result = await operation;
    expect(result).toEqual({ ok: false, reason: "SPAWN_FAILED" });
    expect(events).toEqual([
      "partial-output", "child-error", "termination-requested", "close", "resolved",
    ]);
    expect(JSON.stringify(result)).not.toMatch(/PARTIAL_RACE_SECRET|PARTIAL_CHILD_ERROR_SECRET/u);
    assertCompletedRaceChild(children, child, clearTimer, resolutions, resolvedAfterClose);
  });

  it("preserves CHILD_TIMEOUT when stdout emits late data before close", async () => {
    const children: Array<ReturnType<RefundDeploymentRehearsalChildDependencies["spawnChild"]>> = [];
    const deadlines: Array<() => void> = [];
    const events: string[] = [];
    let closed = false;
    let resolutions = 0;
    let resolvedAfterClose = false;
    const clearTimer = vi.fn((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer));
    const dependencies: RefundDeploymentRehearsalChildDependencies = {
      ...defaultRefundDeploymentRehearsalChildDependencies,
      spawnChild(executable, args, options) {
        const child = defaultRefundDeploymentRehearsalChildDependencies
          .spawnChild(executable, args, options);
        children.push(child);
        child.once("close", () => { closed = true; events.push("close"); });
        return child;
      },
      setTimer(callback) {
        deadlines.push(callback);
        return setTimeout(() => undefined, 10_000);
      },
      clearTimer,
    };
    const operation = runRefundDeploymentRehearsalChild(
      spec(["-e", "setTimeout(()=>{},10000)"]), dependencies,
    ).then((result) => {
      resolutions += 1;
      resolvedAfterClose = closed;
      events.push("resolved");
      return result;
    });
    const child = children[0];
    const deadline = deadlines[0];
    if (!child || !deadline) throw new Error("Expected one timeout-output race child.");

    events.push("deadline");
    deadline();
    events.push("late-output");
    child.stdout.emit("data", Buffer.from('{"late":"LATE_TIMEOUT_OUTPUT_SECRET"}\n'));
    expect(resolutions).toBe(0);

    const result = await operation;
    expect(result).toEqual({ ok: false, reason: "CHILD_TIMEOUT" });
    expect(events).toEqual(["deadline", "late-output", "close", "resolved"]);
    expect(JSON.stringify(result)).not.toContain("LATE_TIMEOUT_OUTPUT_SECRET");
    assertCompletedRaceChild(children, child, clearTimer, resolutions, resolvedAfterClose);
  });

  it("preserves OUTPUT_OVERFLOW when a child error arrives after overflow", async () => {
    const observed: Array<ReturnType<RefundDeploymentRehearsalChildDependencies["spawnChild"]>> = [];
    const dependencies: RefundDeploymentRehearsalChildDependencies = {
      ...defaultRefundDeploymentRehearsalChildDependencies,
      spawnChild(executable, args, options) {
        const child = defaultRefundDeploymentRehearsalChildDependencies
          .spawnChild(executable, args, options);
        observed.push(child);
        child.stdout.once("data", () => {
          setImmediate(() => child.emit("error", new Error("LATE_OVERFLOW_ERROR_SECRET")));
        });
        return child;
      },
    };

    await expect(runRefundDeploymentRehearsalChild(spec([
      "-e", 'process.stdout.write("x".repeat(40000));setTimeout(()=>{},10000)',
    ]), dependencies)).resolves.toEqual({ ok: false, reason: "OUTPUT_OVERFLOW" });
    const child = observed[0];
    if (!child) throw new Error("Expected captured overflow child.");
    expect(child.listenerCount("close")).toBe(0);
    expect(child.listenerCount("error")).toBe(0);
  });

  it("keeps parser failure and successful close settled against impossible late errors", async () => {
    for (const fixture of [
      Object.freeze({ args: ["-e", 'process.stdout.write("not-json\\n")'], expected: {
        ok: false, reason: "MALFORMED_OUTPUT",
      } }),
      Object.freeze({ args: ["-e", 'process.stdout.write("{}\\n")'], expected: {
        ok: true, value: {},
      } }),
    ]) {
      const observed: Array<ReturnType<RefundDeploymentRehearsalChildDependencies["spawnChild"]>> = [];
      const dependencies: RefundDeploymentRehearsalChildDependencies = {
        ...defaultRefundDeploymentRehearsalChildDependencies,
        spawnChild(executable, args, options) {
          const child = defaultRefundDeploymentRehearsalChildDependencies
            .spawnChild(executable, args, options);
          observed.push(child);
          return child;
        },
      };
      const result = await runRefundDeploymentRehearsalChild(spec(fixture.args), dependencies);
      expect(result).toEqual(fixture.expected);
      const child = observed[0];
      if (!child) throw new Error("Expected captured closed child.");
      const late = vi.fn();
      child.once("error", late);
      child.emit("error", new Error("IMPOSSIBLE_LATE_ERROR_SECRET"));
      expect(late).toHaveBeenCalledTimes(1);
      expect(result).toEqual(fixture.expected);
    }
  });
});

function spec(args: readonly string[]): RefundDeploymentRehearsalChildSpec {
  return {
    executable: process.execPath,
    args,
    cwd: process.cwd(),
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/wig_platform_test",
      NODE_ENV: "test",
    },
    deadlineMs: REAL_CHILD_PROTOCOL_DEADLINE_MS,
    expectedExitCode: 0,
    expectedChannel: "STDOUT",
  };
}

async function runObservedChild(
  childSpec: RefundDeploymentRehearsalChildSpec,
  countDataChunks = false,
): Promise<Readonly<{
  result: RefundDeploymentRehearsalChildResult;
  dataChunkCount: number;
}>> {
  const children: Array<ReturnType<RefundDeploymentRehearsalChildDependencies["spawnChild"]>> = [];
  const dataListeners: Array<(chunk: Buffer) => void> = [];
  let dataChunkCount = 0;
  let closed = false;
  let resolutions = 0;
  const clearTimer = vi.fn((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer));
  const dependencies: RefundDeploymentRehearsalChildDependencies = {
    ...defaultRefundDeploymentRehearsalChildDependencies,
    spawnChild(executable, args, options) {
      const child = defaultRefundDeploymentRehearsalChildDependencies
        .spawnChild(executable, args, options);
      children.push(child);
      child.once("close", () => { closed = true; });
      const onData = (): void => { dataChunkCount += 1; };
      dataListeners.push(onData);
      if (countDataChunks) child.stdout.on("data", onData);
      return child;
    },
    clearTimer,
  };
  const result = await runRefundDeploymentRehearsalChild(childSpec, dependencies).then((value) => {
    resolutions += 1;
    return value;
  });
  const child = children[0];
  const dataListener = dataListeners[0];
  if (!child || !dataListener) throw new Error("Expected one observed rehearsal child.");
  child.stdout.removeListener("data", dataListener);

  expect(children).toHaveLength(1);
  expect(resolutions).toBe(1);
  expect(closed).toBe(true);
  expect(clearTimer).toHaveBeenCalledTimes(1);
  expect(child.stdout.listenerCount("data")).toBe(0);
  expect(child.stderr.listenerCount("data")).toBe(0);
  expect(child.listenerCount("error")).toBe(0);
  expect(child.listenerCount("close")).toBe(0);
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true);

  return Object.freeze({ result, dataChunkCount });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertCompletedRaceChild(
  children: ReadonlyArray<ReturnType<RefundDeploymentRehearsalChildDependencies["spawnChild"]>>,
  child: ReturnType<RefundDeploymentRehearsalChildDependencies["spawnChild"]>,
  clearTimer: ReturnType<typeof vi.fn>,
  resolutions: number,
  resolvedAfterClose: boolean,
): void {
  expect(children).toHaveLength(1);
  expect(resolutions).toBe(1);
  expect(resolvedAfterClose).toBe(true);
  expect(clearTimer).toHaveBeenCalledTimes(1);
  expect(child.stdout.listenerCount("data")).toBe(0);
  expect(child.stderr.listenerCount("data")).toBe(0);
  expect(child.listenerCount("error")).toBe(0);
  expect(child.listenerCount("close")).toBe(0);
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
}
