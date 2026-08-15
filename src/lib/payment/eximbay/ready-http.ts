import "server-only";
import {
  executeEximbayReadyContactPlanCore,
  type EximbayReadyAdmissionResult,
  type EximbayReadyContactPlanCore,
  type EximbayReadyTransportResponse,
} from "./ready-kernel";
import type { EximbayPaymentMode } from "@/lib/payment/providers/eximbay/types";

export const EXIMBAY_READY_TOTAL_DEADLINE_MS = 15_000;

const credentialAuthorityBrand: unique symbol = Symbol("EximbayReadyCredentialAuthority");
const credentialAuthorities = new WeakMap<object, CredentialAuthority>();

interface CredentialAuthority {
  readonly mode: EximbayPaymentMode;
  readonly apiKey: string;
}

interface ResponseReaderState {
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  completed: boolean;
}

export interface EximbayReadyCredentialAuthority {
  readonly [credentialAuthorityBrand]: true;
}

export type EximbayReadyFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type EximbayReadyHttpErrorCode =
  | "UNTRUSTED_CREDENTIAL_AUTHORITY"
  | "CREDENTIAL_MODE_MISMATCH"
  | "TRANSPORT_REUSED";

export class EximbayReadyHttpError extends Error {
  constructor(readonly code: EximbayReadyHttpErrorCode) {
    super(code);
    this.name = "EximbayReadyHttpError";
  }
}

export function createEximbayReadyCredentialAuthority(
  mode: EximbayPaymentMode,
  apiKey: string,
): EximbayReadyCredentialAuthority {
  const authority: EximbayReadyCredentialAuthority = {
    [credentialAuthorityBrand]: true,
  };
  Object.defineProperty(authority, credentialAuthorityBrand, { enumerable: false });
  credentialAuthorities.set(authority, Object.freeze({ mode, apiKey }));
  return Object.freeze(authority);
}

export async function executeEximbayReadyHttp(
  plan: EximbayReadyContactPlanCore,
  credentials: EximbayReadyCredentialAuthority,
  fetchImpl: EximbayReadyFetch = globalThis.fetch,
): Promise<EximbayReadyAdmissionResult> {
  const authority = credentialAuthorities.get(credentials);
  if (!authority) throw new EximbayReadyHttpError("UNTRUSTED_CREDENTIAL_AUTHORITY");
  if (authority.mode !== plan.mode) {
    throw new EximbayReadyHttpError("CREDENTIAL_MODE_MISMATCH");
  }

  let invoked = false;
  const readerState: ResponseReaderState = { reader: null, completed: false };
  const controller = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    return await executeEximbayReadyContactPlanCore(plan, async () => {
      if (invoked) throw new EximbayReadyHttpError("TRANSPORT_REUSED");
      invoked = true;
      deadline = setTimeout(() => controller.abort(), EXIMBAY_READY_TOTAL_DEADLINE_MS);
      const response = await fetchImpl(plan.endpoint, {
        method: plan.method,
        headers: {
          Authorization: createBasicAuthorization(authority.apiKey),
          "Content-Type": plan.contentType,
        },
        body: plan.body,
        redirect: "error",
        signal: controller.signal,
      });
      readerState.reader = response.body?.getReader() ?? null;
      return Object.freeze({
        status: response.status,
        contentType: response.headers.get("Content-Type"),
        body: responseBody(readerState.reader, () => {
          readerState.completed = true;
        }),
      }) satisfies EximbayReadyTransportResponse;
    });
  } finally {
    if (deadline !== undefined) clearTimeout(deadline);
    if (readerState.reader && !readerState.completed) await readerState.reader.cancel();
    readerState.reader?.releaseLock();
  }
}

function createBasicAuthorization(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
}

async function* responseBody(
  reader: ReadableStreamDefaultReader<Uint8Array> | null,
  markCompleted: () => void,
): AsyncGenerator<Uint8Array> {
  if (!reader) {
    markCompleted();
    return;
  }
  while (true) {
    const next = await reader.read();
    if (next.done) {
      markCompleted();
      return;
    }
    yield next.value;
  }
}
