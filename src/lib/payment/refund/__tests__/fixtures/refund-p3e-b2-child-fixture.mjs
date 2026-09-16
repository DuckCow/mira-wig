import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import process from "node:process";
import { clearTimeout, setInterval, setTimeout } from "node:timers";

const descendantReadyProtocol = "TB2A_DESCENDANT_READY_V1";
const descendantReadyTimeoutMs = 30_000;
const mode = process.argv[2] ?? "";
const projectId = "mira-refund-sbx";
const projectNumber = "987654321098";
const serviceNames = [
  "cloudresourcemanager.googleapis.com",
  "serviceusage.googleapis.com",
  "storage.googleapis.com",
];

const writeJson = (value) => {
  process.stdout.write(JSON.stringify(value));
};

const keepAlive = () => {
  setInterval(() => undefined, 1_000);
};

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isPlainRecord = (value) => {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
};

/**
 * @param {string} serialized
 * @returns {unknown}
 */
const parseReadyRecordJson = (serialized) => {
  /** @type {unknown} */
  const value = JSON.parse(serialized);
  return value;
};

/**
 * @param {unknown} value
 * @param {number} expectedPid
 * @returns {boolean}
 */
const isReadyRecord = (value, expectedPid) => {
  if (!isPlainRecord(value)) return false;
  const keys = Object.keys(value).sort();
  return JSON.stringify(keys) === JSON.stringify([
    "completionMarkerArmed",
    "inheritedOutputOpen",
    "pid",
    "protocol",
    "signalHandlerInstalled",
  ]) && value.protocol === descendantReadyProtocol
    && typeof value.pid === "number"
    && Number.isSafeInteger(value.pid)
    && value.pid > 0
    && value.pid === expectedPid
    && value.signalHandlerInstalled === true
    && value.completionMarkerArmed === true
    && value.inheritedOutputOpen === true;
};

/**
 * @param {string} readyFile
 * @param {number} expectedPid
 * @returns {boolean}
 */
const readReadyRecord = (readyFile, expectedPid) => {
  try {
    return isReadyRecord(
      parseReadyRecordJson(readFileSync(readyFile, "utf8")),
      expectedPid,
    );
  } catch {
    return false;
  }
};

/**
 * @param {string} readyFile
 * @param {number} expectedPid
 * @returns {Promise<void>}
 */
const waitForReadyRecord = async (readyFile, expectedPid) => {
  const deadline = Date.now() + descendantReadyTimeoutMs;
  while (!readReadyRecord(readyFile, expectedPid)) {
    if (Date.now() >= deadline) {
      throw new Error("DESCENDANT_READY_TIMEOUT");
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
  }
};

// Optional test-parent IPC; ordinary fixture/self-check invocations stay standalone.
if (["stdout-cap", "stderr-cap", "invalid-utf8"].includes(mode) && process.send) {
  await new Promise((resolveGo, rejectGo) => {
    const watchdog = setTimeout(() => rejectGo(new Error("FIXTURE_GO_TIMEOUT")), 30_000);
    process.once("message", (message) => {
      clearTimeout(watchdog);
      if (message !== "GO") { rejectGo(new Error("FIXTURE_GO_INVALID")); return; }
      process.disconnect();
      resolveGo(undefined);
    });
    process.send?.("READY");
  });
}

switch (mode) {
  case "normal":
  case "fast-exit":
    process.stderr.write("bounded fixture diagnostic");
    writeJson({ "Google Cloud SDK": "577.0.0" });
    break;
  case "nonzero":
    process.stderr.write("TEST_PRIVATE_STDERR_SECRET");
    process.exitCode = 7;
    break;
  case "ignore-term":
    process.on("SIGTERM", () => undefined);
    keepAlive();
    break;
  case "stdout-cap":
    process.stdout.write("x".repeat(70_000));
    keepAlive();
    break;
  case "stderr-cap":
    process.stderr.write("x".repeat(5_000));
    keepAlive();
    break;
  case "invalid-utf8":
    process.stdout.write(Buffer.from([0xff, 0xfe, 0xfd]));
    break;
  case "continuous-write": {
    let remaining = 1_000_000;
    const write = () => {
      while (remaining > 0) {
        const chunk = "x".repeat(Math.min(128, remaining));
        remaining -= chunk.length;
        if (!process.stderr.write(chunk)) {
          process.stderr.once("drain", write);
          return;
        }
      }
      writeJson({ "Google Cloud SDK": "577.0.0" });
    };
    write();
    break;
  }
  case "exit-with-descendant": {
    const readyFile = process.argv[3] ?? "";
    const completionFile = process.argv[4] ?? "";
    const descendant = spawn(
      process.execPath,
      [
        new URL(import.meta.url).pathname,
        "held-descendant",
        readyFile,
        completionFile,
      ],
      {
        detached: true,
        stdio: ["ignore", "inherit", "inherit"],
      },
    );
    if (!readyFile || !completionFile || descendant.pid === undefined) {
      process.stderr.write("DESCENDANT_START_FAILED");
      process.exit(65);
    }
    const descendantPid = descendant.pid;
    descendant.unref();
    try {
      await waitForReadyRecord(readyFile, descendantPid);
      process.exit(0);
    } catch {
      process.stderr.write("DESCENDANT_READY_TIMEOUT");
      process.kill(descendantPid, "SIGKILL");
      process.exit(66);
    }
    break;
  }
  case "held-descendant": {
    const readyFile = process.argv[3] ?? "";
    const completionFile = process.argv[4] ?? "";
    let completionStarted = false;
    process.on("SIGTERM", () => {
      if (completionStarted) return;
      completionStarted = true;
      if (completionFile) writeFileSync(completionFile, "completed\n");
      process.exit(0);
    });
    const inheritedOutputOpen =
      !process.stdout.destroyed && !process.stderr.destroyed;
    if (!readyFile || !completionFile || !inheritedOutputOpen) {
      process.stderr.write("DESCENDANT_READINESS_REJECTED");
      process.exit(67);
    }
    const temporaryReadyFile = `${readyFile}.tmp-${process.pid}`;
    writeFileSync(temporaryReadyFile, `${JSON.stringify({
      protocol: descendantReadyProtocol,
      pid: process.pid,
      signalHandlerInstalled: true,
      completionMarkerArmed: true,
      inheritedOutputOpen,
    })}\n`);
    renameSync(temporaryReadyFile, readyFile);
    setTimeout(() => process.exit(70), 60_000);
    break;
  }
  case "command:EFFECTIVE_CONFIG_GET":
    writeJson({
      core: {
        account: "synthetic.operator@example.test",
        disable_prompts: "true",
      },
    });
    break;
  case "command:GCLOUD_VERSION":
    writeJson({ "Google Cloud SDK": "577.0.0" });
    break;
  case "command:COLLECTOR_IDENTITY":
    writeJson([{ account: "synthetic.operator@example.test" }]);
    break;
  case "command:PROJECT_GET":
    writeJson({
      projectId,
      projectNumber,
      lifecycleState: "ACTIVE",
    });
    break;
  case "command:BILLING_INFO_GET":
    writeJson({ projectId, billingEnabled: true });
    break;
  case "command:BOOTSTRAP_SERVICES_LIST":
    writeJson([
      ...serviceNames.map((name) => ({
        name: `projects/${projectNumber}/services/${name}`,
        parent: `projects/${projectNumber}`,
        config: { name },
        state: "ENABLED",
      })),
      {
        name: `projects/${projectNumber}/services/logging.googleapis.com`,
        parent: `projects/${projectNumber}`,
        config: { name: "logging.googleapis.com" },
        state: "ENABLED",
      },
    ]);
    break;
  default:
    process.stderr.write("FIXTURE_MODE_REJECTED");
    process.exitCode = 64;
}
