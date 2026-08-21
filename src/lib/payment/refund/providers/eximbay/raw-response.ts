export const EXIMBAY_REFUND_RAW_MAX_RESPONSE_BYTES = 65_536;
export const EXIMBAY_REFUND_RAW_MAX_RESPONSE_CHUNKS = 256;

export type EximbayRawResponseFailureCode =
  | "NON_2XX"
  | "INVALID_CONTENT_TYPE"
  | "BODY_TOO_LARGE"
  | "TOO_MANY_RESPONSE_CHUNKS"
  | "INVALID_RESPONSE_CHUNK"
  | "INVALID_UTF8"
  | "INVALID_JSON"
  | "DUPLICATE_JSON_KEY"
  | "UNKNOWN_SHAPE";

export type EximbayRawJsonResponse =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false; code: EximbayRawResponseFailureCode }>;

export async function readEximbayRawJsonResponse(
  response: Response,
): Promise<EximbayRawJsonResponse> {
  if (!Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
    return failure("NON_2XX");
  }
  if (!isJsonContentType(response.headers.get("content-type"))) {
    return failure("INVALID_CONTENT_TYPE");
  }
  const bytes = await readBoundedBody(response.body);
  if (!bytes.ok) return bytes;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.body);
  } catch {
    return failure("INVALID_UTF8");
  }
  return parseClosedJson(text);
}

type ByteBoundary =
  | Readonly<{ ok: true; body: Uint8Array }>
  | Readonly<{ ok: false; code: EximbayRawResponseFailureCode }>;

async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
): Promise<ByteBoundary> {
  if (!body) return Object.freeze({ ok: true, body: new Uint8Array() });
  const reader = body.getReader();
  const output = new Uint8Array(EXIMBAY_REFUND_RAW_MAX_RESPONSE_BYTES);
  let length = 0;
  let chunks = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      chunks += 1;
      if (chunks > EXIMBAY_REFUND_RAW_MAX_RESPONSE_CHUNKS) {
        await reader.cancel();
        return byteFailure("TOO_MANY_RESPONSE_CHUNKS");
      }
      if (!(next.value instanceof Uint8Array)) {
        await reader.cancel();
        return byteFailure("INVALID_RESPONSE_CHUNK");
      }
      if (next.value.byteLength > EXIMBAY_REFUND_RAW_MAX_RESPONSE_BYTES - length) {
        await reader.cancel();
        return byteFailure("BODY_TOO_LARGE");
      }
      output.set(next.value, length);
      length += next.value.byteLength;
    }
    return Object.freeze({ ok: true, body: output.slice(0, length) });
  } finally {
    reader.releaseLock();
  }
}

function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  return /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/iu.test(value);
}

function parseClosedJson(text: string): EximbayRawJsonResponse {
  try {
    new ClosedJsonScanner(text).scan();
    const value: unknown = JSON.parse(text);
    return Object.freeze({ ok: true, value });
  } catch (error) {
    return error instanceof ClosedJsonError
      ? failure(error.code)
      : failure("INVALID_JSON");
  }
}

class ClosedJsonError extends Error {
  constructor(readonly code: "INVALID_JSON" | "DUPLICATE_JSON_KEY") {
    super(code);
  }
}

type ObjectState = "keyOrEnd" | "key" | "colon" | "value" | "commaOrEnd";
type ArrayState = "valueOrEnd" | "value" | "commaOrEnd";
interface ObjectContext { readonly kind: "object"; readonly keys: Set<string>; state: ObjectState }
interface ArrayContext { readonly kind: "array"; state: ArrayState }
type Context = ObjectContext | ArrayContext;

class ClosedJsonScanner {
  #index = 0;
  #contexts: Context[] = [];

  constructor(private readonly text: string) {}

  scan(): void {
    this.#whitespace();
    this.#value();
    while (this.#contexts.length > 0) this.#step();
    this.#whitespace();
    if (this.#index !== this.text.length) this.#invalid();
  }

  #step(): void {
    const context = this.#contexts.at(-1);
    if (!context) return;
    if (context.kind === "object") this.#object(context);
    else this.#array(context);
  }

  #object(context: ObjectContext): void {
    this.#whitespace();
    if (context.state === "keyOrEnd") {
      if (this.#consume("}")) return void this.#contexts.pop();
      context.state = "key";
    }
    if (context.state === "key") {
      const key = this.#string();
      if (context.keys.has(key)) this.#duplicate();
      context.keys.add(key);
      context.state = "colon";
    }
    this.#whitespace();
    if (context.state === "colon") {
      this.#expect(":");
      context.state = "value";
    }
    if (context.state === "value") {
      context.state = "commaOrEnd";
      return this.#value();
    }
    this.#whitespace();
    if (this.#consume("}")) return void this.#contexts.pop();
    this.#expect(",");
    context.state = "key";
  }

  #array(context: ArrayContext): void {
    this.#whitespace();
    if (context.state === "valueOrEnd") {
      if (this.#consume("]")) return void this.#contexts.pop();
      context.state = "commaOrEnd";
      return this.#value();
    }
    if (context.state === "value") {
      context.state = "commaOrEnd";
      return this.#value();
    }
    if (this.#consume("]")) return void this.#contexts.pop();
    this.#expect(",");
    context.state = "value";
  }

  #value(): void {
    this.#whitespace();
    const token = this.text[this.#index];
    if (token === "{") return this.#beginObject();
    if (token === "[") return this.#beginArray();
    if (token === "\"") return void this.#string();
    if (token === "t") return this.#literal("true");
    if (token === "f") return this.#literal("false");
    if (token === "n") return this.#literal("null");
    this.#number();
  }

  #beginObject(): void {
    this.#expect("{");
    this.#contexts.push({ kind: "object", keys: new Set<string>(), state: "keyOrEnd" });
  }

  #beginArray(): void {
    this.#expect("[");
    this.#contexts.push({ kind: "array", state: "valueOrEnd" });
  }

  #string(): string {
    const start = this.#index;
    this.#expect("\"");
    while (this.#index < this.text.length) {
      const character = this.text[this.#index];
      this.#index += 1;
      if (character === "\"") return this.#decodedString(start);
      if (character === "\\") this.#escape();
      else if (!character || character.charCodeAt(0) <= 0x1f) this.#invalid();
    }
    return this.#invalid();
  }

  #decodedString(start: number): string {
    const value: unknown = JSON.parse(this.text.slice(start, this.#index));
    return typeof value === "string" ? value : this.#invalid();
  }

  #escape(): void {
    const escaped = this.text[this.#index];
    this.#index += 1;
    if (escaped !== "u") {
      if (!escaped || !"\"\\/bfnrt".includes(escaped)) this.#invalid();
      return;
    }
    const unicode = this.text.slice(this.#index, this.#index + 4);
    if (!/^[0-9a-fA-F]{4}$/u.test(unicode)) this.#invalid();
    this.#index += 4;
  }

  #number(): void {
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u
      .exec(this.text.slice(this.#index));
    if (!match) return this.#invalid();
    this.#index += match[0].length;
  }

  #literal(value: string): void {
    if (!this.text.startsWith(value, this.#index)) return this.#invalid();
    this.#index += value.length;
  }

  #whitespace(): void {
    while (/^[\t\n\r ]$/u.test(this.text[this.#index] ?? "")) this.#index += 1;
  }

  #expect(value: string): void { if (!this.#consume(value)) this.#invalid(); }
  #consume(value: string): boolean {
    if (this.text[this.#index] !== value) return false;
    this.#index += 1;
    return true;
  }

  #invalid(): never { throw new ClosedJsonError("INVALID_JSON"); }
  #duplicate(): never { throw new ClosedJsonError("DUPLICATE_JSON_KEY"); }
}

function failure(code: EximbayRawResponseFailureCode): EximbayRawJsonResponse {
  return Object.freeze({ ok: false, code });
}

function byteFailure(code: EximbayRawResponseFailureCode): ByteBoundary {
  return Object.freeze({ ok: false, code });
}
