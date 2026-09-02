import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium, type BrowserContext, type Route } from "playwright";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { EximbayReadyHandoffV1 } from "@/lib/payment/eximbay/sdk-handoff-contract";
import { SYNTHETIC_SALE_PUBLIC_ORIGIN as ORIGIN } from "../contract";
import { createSyntheticSaleHttpHandler } from "../http";

const ROOT = `/synthetic-sale/${"a".repeat(64)}`;
const SDK_URL = "https://api-test.eximbay.com/v2/javascriptSDK.js";
const API_URL = "https://api-test.eximbay.com/v1/payments";
const FORM_URL = "https://secureapi.test.eximbay.com/Gateway/BasicProcessor.krp";
const CSP = "default-src 'none'; script-src 'self' https://api-test.eximbay.com; connect-src 'self' https://api-test.eximbay.com; style-src 'none'; img-src 'none'; base-uri 'none'; form-action https://secureapi.test.eximbay.com; frame-ancestors 'none'";
const HANDOFF: EximbayReadyHandoffV1 = {
  kind: "EXIMBAY_READY_HANDOFF_V1", paymentId: "fake-payment", mode: "SANDBOX", sdkGeneration: "v2",
  payload: {
    fgkey: "PROVIDER_FREE_FAKE",
    payment: { transaction_type: "PAYMENT", order_id: "fake-order", currency: "USD", amount: "1.00", lang: "EN", payment_method: "P000" },
    merchant: { mid: "1849705C64" },
    buyer: { name: "Provider Free Fixture", email: "fixture@example.invalid" },
    url: { return_url: `${ORIGIN}/checkout/return/fake`, status_url: `${ORIGIN}/api/payments/eximbay/status` },
  },
};
type Scenario = "admitted" | "missing-connect" | "missing-form";
type Counts = { start: number; sdk: number; xhr: number; form: number; unexpected: string[] };

// Explicit opt-in: this suite needs a visible desktop and installed Chrome.
// Run with MIRA_HEADED_CSP=1 and a dummy DATABASE_URL; no DB method is permitted.
describe.skipIf(process.env.MIRA_HEADED_CSP !== "1")("provider-free recovered SDK under actual CSP", () => {
  it.each<Scenario>(["admitted", "missing-connect", "missing-form"])("%s", async (scenario) => {
    const proxy = createServer((_request, response) => { response.writeHead(502); response.end(); });
    proxy.on("connect", (_request, socket) => socket.destroy());
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const address = proxy.address();
    if (!address || typeof address === "string") throw new Error("PROXY_ADDRESS_UNAVAILABLE");
    const browser = await chromium.launch({
      channel: "chrome", headless: false,
      ignoreDefaultArgs: ["--disable-popup-blocking"],
      proxy: { server: `http://127.0.0.1:${address.port}` },
      args: ["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
    });
    try {
      const context = await browser.newContext({ serviceWorkers: "block", bypassCSP: false });
      await exercise(context, scenario);
    } finally {
      await browser.close();
      await new Promise<void>((resolve, reject) => proxy.close((error) => error ? reject(error) : resolve()));
    }
  }, 30_000);
});

async function exercise(context: BrowserContext, scenario: Scenario): Promise<void> {
  const counts: Counts = { start: 0, sdk: 0, xhr: 0, form: 0, unexpected: [] };
  const handler = await httpFixture(counts);
  const sdk = await readFile(new URL("./fixtures/eximbay-sandbox-d324cb48.js.txt", import.meta.url));
  expect(createHash("sha256").update(sdk).digest("hex")).toBe("d324cb484f3c4c56f949329f5ddf4ca62e012c72ef530febe3ce77db35a396b7");
  await context.route("**/*", (route) => fulfill(route, { handler, sdk, counts, scenario }));
  await context.addInitScript(observeMechanics);
  const page = await context.newPage();
  const popups: import("playwright").Page[] = [];
  page.on("popup", (popup) => popups.push(popup));
  page.on("dialog", (dialog) => { void dialog.dismiss(); });
  await page.goto(`${ORIGIN}${ROOT}`);
  const button = await page.locator("[data-synthetic-sale-start]").boundingBox();
  if (!button) throw new Error("PAY_BUTTON_MISSING");
  // One literal input click; no page evaluation/readback until the handoff settles.
  await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
  await page.waitForTimeout(1500);
  const root = page.locator("html");
  expect(await root.getAttribute("data-trusted-clicks")).toBe("1");
  expect(await root.getAttribute("data-xhr-attempts")).toBe("1");
  expect(counts.start).toBe(1);
  expect(counts.sdk).toBe(1);
  expect(counts.unexpected).toEqual([]);
  const violations = await root.getAttribute("data-csp-violations");
  if (scenario === "missing-connect") {
    expect(violations).toBe("connect-src");
    expect(counts.xhr).toBe(0);
    expect(counts.form).toBe(0);
    expect(popups).toHaveLength(0);
    return;
  }
  expect(counts.xhr).toBe(1);
  expect(await root.getAttribute("data-window-open")).toBe("WINDOW_PROXY");
  expect(await root.getAttribute("data-form-attempts")).toBe("1");
  expect(popups).toHaveLength(1);
  expect(popups[0]?.isClosed()).toBe(false);
  if (scenario === "missing-form") {
    expect(violations).toBe("form-action");
    expect(counts.form).toBe(0);
    return;
  }
  expect(violations).toBeNull();
  expect(counts.form).toBe(1);
  expect(popups[0]?.url()).toBe(FORM_URL);
  expect(await popups[0]?.title()).toBe("Locally fulfilled payment window");
}

async function httpFixture(counts: Counts) {
  const compiled = await build({
    entryPoints: ["src/lib/payment/synthetic-sale/browser.ts"], bundle: true, write: false,
    platform: "browser", target: ["chrome111", "safari16.4"], format: "esm", minify: true,
    tsconfig: "tsconfig.json",
  });
  const asset = compiled.outputFiles[0];
  if (!asset) throw new Error("BROWSER_BUILD_MISSING");
  // The durable run/provider boundary is fake. Any accidental DB entry fails immediately.
  const forbiddenDb = new Proxy(db, { get() { throw new Error("DATABASE_ACCESS_FORBIDDEN"); } });
  return createSyntheticSaleHttpHandler(forbiddenDb, {
    capability: "a".repeat(64), runIdentity: "b".repeat(32),
    status: () => Promise.resolve({ state: "WAITING", sessionId: "fake-session" }),
    start: () => { counts.start += 1; return Promise.resolve(HANDOFF); },
  }, { capability: "a".repeat(64), publicOrigin: ORIGIN, providerEnv: {} }, { browserAsset: asset.text });
}

async function fulfill(route: Route, fixture: {
  handler: (request: Request) => Promise<Response>; sdk: Buffer; counts: Counts; scenario: Scenario;
}): Promise<void> {
  const { handler, sdk, counts, scenario } = fixture;
  const request = route.request();
  const url = request.url();
  if (url === SDK_URL) {
    counts.sdk += 1;
    await route.fulfill({ contentType: "text/javascript", body: sdk });
  } else if (url === API_URL) {
    expect(request.method()).toBe("POST");
    expect(JSON.parse(request.postData() ?? "null")).toEqual(HANDOFF.payload);
    counts.xhr += 1;
    await route.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": ORIGIN },
      body: JSON.stringify({ url: FORM_URL, display_type: "P", ostype: "P" }) });
  } else if (url === FORM_URL) {
    expect(request.method()).toBe("POST");
    expect(new URLSearchParams(request.postData() ?? "").get("param3")).toBe("OPENAPI");
    counts.form += 1;
    await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Locally fulfilled payment window</title>" });
  } else if ([`${ORIGIN}${ROOT}`, `${ORIGIN}${ROOT}/client.js`, `${ORIGIN}${ROOT}/start`].includes(url)) {
    const response = await handler(new Request(url, { method: request.method() }));
    const headers = Object.fromEntries(response.headers);
    if (headers["content-security-policy"]) {
      expect(headers["content-security-policy"]).toBe(CSP);
      headers["content-security-policy"] = policyFor(scenario);
    }
    await route.fulfill({ status: response.status, headers, body: await response.text() });
  } else {
    counts.unexpected.push(url);
    await route.abort("blockedbyclient");
  }
}

function policyFor(scenario: Scenario): string {
  if (scenario === "missing-connect") return CSP.replace("connect-src 'self' https://api-test.eximbay.com", "connect-src 'self'");
  if (scenario === "missing-form") return CSP.replace("form-action https://secureapi.test.eximbay.com", "form-action 'none'");
  return CSP;
}

function observeMechanics(): void {
  const increment = (name: string) => {
    const root = document.documentElement;
    root.setAttribute(name, String(Number(root.getAttribute(name) ?? "0") + 1));
  };
  document.addEventListener("click", (event) => { if (event.isTrusted) increment("data-trusted-clicks"); });
  document.addEventListener("securitypolicyviolation", (event) => {
    document.documentElement.setAttribute("data-csp-violations", event.effectiveDirective);
  });
  const open = window.open;
  window.open = function (...args) {
    const result = Reflect.apply(open, window, args);
    document.documentElement.setAttribute("data-window-open", result ? "WINDOW_PROXY" : "NULL");
    return result;
  };
  // Native receiver is preserved explicitly by Reflect.apply below.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    increment("data-xhr-attempts");
    Reflect.apply(send, this, args);
  };
  // Native receiver is preserved explicitly by Reflect.apply below.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const submit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    increment("data-form-attempts");
    Reflect.apply(submit, this, []);
  };
}
