import "server-only";

import type { IncomingMessage, ServerResponse } from "node:http";
import type { PrismaClient } from "@prisma/client";
import {
  EXIMBAY_BF4_STATUS_ROUTE_ENABLED,
  handleEximbayBf4StatusRoute,
} from "@/lib/payment/eximbay/bf4-status-route";
import type { EximbayBf4Fetch } from "@/lib/payment/eximbay/bf4-contact";
import type { SyntheticSaleRuntimeConfiguration } from "./contract";
import type { SyntheticSaleRunOwner } from "./run";

const SECURITY_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

export type SyntheticSaleHttpDependencies = Readonly<{
  browserAsset: string;
  bf4Transport?: EximbayBf4Fetch;
  now?: () => Date;
}>;

export function createSyntheticSaleHttpHandler(
  client: PrismaClient,
  run: SyntheticSaleRunOwner,
  configuration: SyntheticSaleRuntimeConfiguration,
  dependencies: SyntheticSaleHttpDependencies,
): (request: Request) => Promise<Response> {
  const root = `/synthetic-sale/${run.capability}`;
  return async (request: Request): Promise<Response> => {
    const url = exactUrl(request.url, configuration.publicOrigin);
    if (!url) return response(400);
    if (url.pathname === "/api/payments/eximbay/status") return bf4(client, request, configuration, dependencies);
    return routeCapabilityRequest(request, url.pathname, root, run, dependencies);
  };
}

async function routeCapabilityRequest(
  request: Request,
  path: string,
  root: string,
  run: SyntheticSaleRunOwner,
  dependencies: SyntheticSaleHttpDependencies,
): Promise<Response> {
  if (request.method === "GET") return routeGet(path, root, run, dependencies.browserAsset);
  if (request.method === "POST" && path === `${root}/start`) return startRun(request, run);
  return response(404);
}

async function routeGet(
  path: string,
  root: string,
  run: SyntheticSaleRunOwner,
  browserAsset: string,
): Promise<Response> {
  if (path === root) {
    const current = await run.status();
    return htmlResponse(renderSalePage(root, current.state, current.sessionId));
  }
  if (path === `${root}/client.js`) return javascriptResponse(browserAsset);
  if (path === `${root}/status`) return jsonResponse(await run.status(), 200);
  const sessionId = returnSessionId(path);
  if (!sessionId) return response(404);
  const current = await run.status(sessionId);
  return current.state === "AMBIGUOUS" ? response(404) : htmlResponse(renderStatusPage(current.state));
}

async function startRun(request: Request, run: SyntheticSaleRunOwner): Promise<Response> {
  if (!emptyRequest(request)) return response(400);
  try {
    return jsonResponse(await run.start(), 200);
  } catch {
    return jsonResponse({ ok: false, state: (await run.status()).state }, 409);
  }
}

function bf4(
  client: PrismaClient,
  request: Request,
  configuration: SyntheticSaleRuntimeConfiguration,
  dependencies: SyntheticSaleHttpDependencies,
): Promise<Response> {
  return handleEximbayBf4StatusRoute(
    client,
    request,
    { ...configuration.providerEnv, [EXIMBAY_BF4_STATUS_ROUTE_ENABLED]: "ENABLED" },
    dependencies.bf4Transport ?? fetch,
    dependencies.now,
  );
}

export async function handleNodeHttpRequest(
  request: IncomingMessage,
  responseStream: ServerResponse,
  handler: (request: Request) => Promise<Response>,
  publicOrigin: string,
): Promise<void> {
  try {
    const method = request.method ?? "GET";
    const headers = new Headers();
    appendNodeHeaders(headers, request.headers);
    const init: RequestInit & { duplex?: "half" } = { method, headers };
    if (method !== "GET" && method !== "HEAD" && nodeRequestHasBody(request.headers)) {
      init.body = nodeBody(request);
      init.duplex = "half";
    }
    const webResponse = await handler(new Request(`${publicOrigin}${request.url ?? "/"}`, init));
    responseStream.statusCode = webResponse.status;
    webResponse.headers.forEach((value, name) => responseStream.setHeader(name, value));
    responseStream.end(Buffer.from(await webResponse.arrayBuffer()));
  } catch {
    responseStream.statusCode = 503;
    responseStream.end();
  }
}

function nodeRequestHasBody(headers: IncomingMessage["headers"]): boolean {
  if (headers["transfer-encoding"] !== undefined) return true;
  const length = headers["content-length"];
  if (Array.isArray(length)) return length.some((value) => value !== "0");
  return length !== undefined && length !== "0";
}

function appendNodeHeaders(headers: Headers, source: IncomingMessage["headers"]): void {
  for (const [name, value] of Object.entries(source)) appendNodeHeader(headers, name, value);
}

function appendNodeHeader(headers: Headers, name: string, value: string | string[] | undefined): void {
  if (Array.isArray(value)) {
    for (const item of value) headers.append(name, item);
  } else if (value !== undefined) {
    headers.set(name, value);
  }
}

function nodeBody(request: IncomingMessage): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      request.on("data", (chunk: Buffer | string) => {
        controller.enqueue(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      });
      request.once("end", () => controller.close());
      request.once("error", (error) => controller.error(error));
    },
    cancel() { request.destroy(); },
  });
}

function exactUrl(value: string, publicOrigin: string): URL | null {
  try {
    const url = new URL(value);
    return url.origin === publicOrigin && url.search === "" && url.hash === "" ? url : null;
  } catch {
    return null;
  }
}

function emptyRequest(request: Request): boolean {
  const length = request.headers.get("content-length");
  return request.body === null && (length === null || length === "0")
    && request.headers.get("content-type") === null;
}

function returnSessionId(path: string): string | null {
  const match = /^\/checkout\/return\/([^/]+)$/u.exec(path);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function javascriptResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { ...SECURITY_HEADERS, "Content-Type": "text/javascript; charset=utf-8" },
  });
}

function renderSalePage(root: string, state: string, sessionId?: string): string {
  const action = state === "WAITING"
    ? `<button type="button" data-synthetic-sale-start data-start-url="${root}/start">Pay USD 1.00</button><script type="module" src="${root}/client.js"></script>`
    : "";
  const statusLink = `${root}/status`;
  return documentHtml("Synthetic Eximbay SALE", `<main><h1>Synthetic Eximbay SALE</h1><p data-synthetic-sale-state>${escapeHtml(state)}</p>${action}<p><a href="${statusLink}">Status</a></p>${sessionId ? `<p>Session ${escapeHtml(sessionId)}</p>` : ""}</main>`);
}

function renderStatusPage(state: string): string {
  return documentHtml("Synthetic Eximbay status", `<main><h1>Synthetic Eximbay status</h1><p>${escapeHtml(state)}</p></main>`);
}

function documentHtml(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body>${body}</body></html>`;
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      ...SECURITY_HEADERS,
      "Content-Security-Policy": "default-src 'none'; script-src 'self' https://api-test.eximbay.com; connect-src 'self'; style-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function response(status: number): Response {
  return new Response(null, { status, headers: SECURITY_HEADERS });
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
