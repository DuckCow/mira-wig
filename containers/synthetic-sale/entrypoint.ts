import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { db } from "../../src/lib/db.js";
import { parseSyntheticSaleRuntimeConfiguration } from "../../src/lib/payment/synthetic-sale/contract.js";
import { createSyntheticSaleRunOwner } from "../../src/lib/payment/synthetic-sale/run.js";
import {
  createSyntheticSaleHttpHandler,
  handleNodeHttpRequest,
} from "../../src/lib/payment/synthetic-sale/http.js";

const CONNECTION_NAME = "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18";
const PROXY = "/usr/local/bin/cloud-sql-proxy";
const READINESS = "http://127.0.0.1:9801/readiness";
const BROWSER_ASSET = "/app/browser/synthetic-sale-client.js";

export async function main(env: Readonly<Record<string, string | undefined>> = process.env): Promise<void> {
  const configuration = parseSyntheticSaleRuntimeConfiguration(env);
  if (!configuration || env.K_SERVICE !== "mira-p3e-sbx-synthetic-sale") {
    throw new Error("SYNTHETIC_SALE_RUNTIME_INPUT_INVALID");
  }
  const proxy = startProxy();
  try {
    await awaitReadiness(proxy);
    const browserAsset = await readFile(BROWSER_ASSET, "utf8");
    const run = createSyntheticSaleRunOwner(db, configuration);
    const handler = createSyntheticSaleHttpHandler(db, run, configuration, { browserAsset });
    const server = createServer((request, response) => {
      void handleNodeHttpRequest(request, response, handler, configuration.publicOrigin);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(Number(env.PORT ?? "8080"), "0.0.0.0", resolve);
    });
    process.stdout.write(`${JSON.stringify({ ok: true, code: "SYNTHETIC_SALE_READY", operatorPath: `/synthetic-sale/${run.capability}` })}\n`);
    await new Promise<void>((resolve) => {
      const close = (): void => {
        server.close(() => resolve());
      };
      process.once("SIGTERM", close);
      process.once("SIGINT", close);
      proxy.once("exit", close);
    });
  } finally {
    proxy.kill("SIGTERM");
    await db.$disconnect().catch(() => undefined);
  }
}

function startProxy(): ChildProcess {
  const proxy = spawn(PROXY, [
    "--structured-logs",
    "--private-ip",
    "--unix-socket=/cloudsql",
    "--health-check",
    "--http-address=127.0.0.1",
    "--http-port=9801",
    "--exit-zero-on-sigterm",
    CONNECTION_NAME,
  ], { stdio: ["ignore", "ignore", "ignore"] });
  return proxy;
}

async function awaitReadiness(proxy: ChildProcess): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (proxy.exitCode !== null) throw new Error("SYNTHETIC_SALE_PROXY_EXITED");
    try {
      if ((await fetch(READINESS)).ok) return;
    } catch {
      // Readiness is the only accepted transition; diagnostics are not emitted.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("SYNTHETIC_SALE_PROXY_TIMEOUT");
}

await main();
