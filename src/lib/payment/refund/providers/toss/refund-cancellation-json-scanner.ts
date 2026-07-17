const ROOT_FIELDS = new Set([
  "paymentKey",
  "currency",
  "status",
  "totalAmount",
  "balanceAmount",
  "cancels",
]);
const CANCEL_FIELDS = new Set([
  "transactionKey",
  "cancelStatus",
  "cancelAmount",
  "cancelReason",
]);
const MAX_JSON_DEPTH = 64;

/** Narrow scanner for identity-bearing Toss cancellation response properties. */
export function rejectDuplicateTossCancellationKeys(json: string): void {
  new CancellationJsonScanner(json).scan();
}

class CancellationJsonScanner {
  readonly #json: string;
  #index = 0;

  constructor(json: string) {
    this.#json = json;
  }

  scan(): void {
    this.#whitespace();
    this.#object(1, ROOT_FIELDS, true);
    this.#whitespace();
    if (this.#index !== this.#json.length) throw new Error("Trailing JSON data.");
  }

  #value(depth: number): void {
    this.#whitespace();
    const token = this.#json[this.#index];
    if (token === '"') return void this.#string();
    if (token === "{") return this.#object(depth + 1);
    if (token === "[") return this.#array(depth + 1);
    if (token === "t") return this.#literal("true");
    if (token === "f") return this.#literal("false");
    if (token === "n") return this.#literal("null");
    this.#number();
  }

  #object(depth: number, trackedFields?: ReadonlySet<string>, root = false): void {
    this.#assertDepth(depth);
    this.#expect("{");
    this.#whitespace();
    if (this.#consume("}")) return;
    const seen = new Set<string>();
    while (true) {
      const key = this.#string();
      this.#trackProtectedKey(trackedFields, seen, key);
      this.#whitespace();
      this.#expect(":");
      this.#objectValue(root, key, depth);
      this.#whitespace();
      if (this.#consume("}")) return;
      this.#expect(",");
      this.#whitespace();
    }
  }

  #trackProtectedKey(
    trackedFields: ReadonlySet<string> | undefined,
    seen: Set<string>,
    key: string,
  ): void {
    if (!trackedFields?.has(key)) return;
    if (seen.has(key)) throw new Error("Duplicate protected JSON property.");
    seen.add(key);
  }

  #objectValue(root: boolean, key: string, depth: number): void {
    if (root && key === "cancels") this.#cancels(depth + 1);
    else this.#value(depth);
  }

  #array(depth: number): void {
    this.#assertDepth(depth);
    this.#expect("[");
    this.#whitespace();
    if (this.#consume("]")) return;
    while (true) {
      this.#value(depth);
      this.#whitespace();
      if (this.#consume("]")) return;
      this.#expect(",");
      this.#whitespace();
    }
  }

  #cancels(depth: number): void {
    this.#assertDepth(depth);
    this.#whitespace();
    if (this.#json[this.#index] !== "[") return this.#value(depth - 1);
    this.#expect("[");
    this.#whitespace();
    if (this.#consume("]")) return;
    while (true) {
      this.#whitespace();
      if (this.#json[this.#index] === "{") this.#object(depth + 1, CANCEL_FIELDS);
      else this.#value(depth);
      this.#whitespace();
      if (this.#consume("]")) return;
      this.#expect(",");
      this.#whitespace();
    }
  }

  #string(): string {
    const start = this.#index;
    this.#expect('"');
    while (this.#index < this.#json.length) {
      const character = this.#json[this.#index];
      this.#index += 1;
      if (character === '"') {
        const parsed: unknown = JSON.parse(this.#json.slice(start, this.#index));
        if (typeof parsed !== "string") throw new Error("Invalid JSON property.");
        return parsed;
      }
      if (character === "\\") this.#escape();
      else if (!character || character.charCodeAt(0) <= 0x1f) {
        throw new Error("Invalid JSON string.");
      }
    }
    throw new Error("Unterminated JSON string.");
  }

  #escape(): void {
    const escaped = this.#json[this.#index];
    this.#index += 1;
    if (escaped !== "u") {
      if (!escaped || !'"\\/bfnrt'.includes(escaped)) throw new Error("Invalid JSON escape.");
      return;
    }
    const unicode = this.#json.slice(this.#index, this.#index + 4);
    if (!/^[0-9a-fA-F]{4}$/.test(unicode)) throw new Error("Invalid Unicode escape.");
    this.#index += 4;
  }

  #number(): void {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      this.#json.slice(this.#index),
    );
    if (!match) throw new Error("Invalid JSON value.");
    this.#index += match[0].length;
  }

  #literal(value: string): void {
    if (!this.#json.startsWith(value, this.#index)) throw new Error("Invalid JSON literal.");
    this.#index += value.length;
  }

  #assertDepth(depth: number): void {
    if (depth > MAX_JSON_DEPTH) throw new Error("JSON nesting is too deep.");
  }

  #whitespace(): void {
    while (/\s/u.test(this.#json[this.#index] ?? "")) this.#index += 1;
  }

  #expect(value: string): void {
    if (!this.#consume(value)) throw new Error("Malformed JSON.");
  }

  #consume(value: string): boolean {
    if (this.#json[this.#index] !== value) return false;
    this.#index += 1;
    return true;
  }
}
