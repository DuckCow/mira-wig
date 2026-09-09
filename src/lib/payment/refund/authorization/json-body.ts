import { RefundAuthorizationError } from "./contract";

export async function readAuthorizationJson(request: Pick<Request, "body">, maximumBytes = 4096): Promise<unknown> {
  if (!request.body) throw new RefundAuthorizationError("INVALID_INPUT");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > maximumBytes || chunks.length >= 64) {
        await reader.cancel();
        throw new RefundAuthorizationError("INVALID_INPUT");
      }
      chunks.push(next.value);
    }
    return parseJsonBytes(Buffer.concat(chunks));
  } finally {
    reader.releaseLock();
  }
}


function parseJsonBytes(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) throw new RefundAuthorizationError("INVALID_INPUT");
    throw error;
  }
}
