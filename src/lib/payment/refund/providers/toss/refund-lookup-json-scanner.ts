const EXTRACTED_ROOT_FIELDS = new Set([
  "paymentKey", "method", "easyPay", "currency", "status",
  "totalAmount", "balanceAmount", "taxFreeAmount", "taxExemptionAmount", "cancels",
]);
const MAX_JSON_DEPTH = 64;

export function rejectDuplicateTossLookupRootKeys(json: string): void {
  new RootKeyScanner(json).scan();
}

class RootKeyScanner {
  readonly #json: string;
  #index = 0;
  readonly #seen = new Set<string>();

  constructor(json: string) {
    this.#json = json;
  }

  scan(): void {
    this.#whitespace();
    this.#expect("{");
    this.#whitespace();
    if (this.#consume("}")) return this.#finish();
    while (true) {
      const key = this.#string();
      if (EXTRACTED_ROOT_FIELDS.has(key)) {
        if (this.#seen.has(key)) throw new Error("Duplicate extracted JSON property.");
        this.#seen.add(key);
      }
      this.#whitespace();
      this.#expect(":");
      this.#value(1);
      this.#whitespace();
      if (this.#consume("}")) return this.#finish();
      this.#expect(",");
      this.#whitespace();
    }
  }

  #finish(): void {
    this.#whitespace();
    if (this.#index !== this.#json.length) throw new Error("Trailing JSON data.");
  }

  #value(depth: number): void {
    if (depth > MAX_JSON_DEPTH) throw new Error("JSON nesting is too deep.");
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

  #object(depth: number): void {
    this.#expect("{");
    this.#whitespace();
    if (this.#consume("}")) return;
    while (true) {
      this.#string();
      this.#whitespace();
      this.#expect(":");
      this.#value(depth);
      this.#whitespace();
      if (this.#consume("}")) return;
      this.#expect(",");
      this.#whitespace();
    }
  }

  #array(depth: number): void {
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
      else if (!character || character.charCodeAt(0) <= 0x1f) throw new Error("Invalid JSON string.");
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
    const remaining = this.#json.slice(this.#index);
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(remaining);
    if (!match) throw new Error("Invalid JSON value.");
    this.#index += match[0].length;
  }

  #literal(value: string): void {
    if (!this.#json.startsWith(value, this.#index)) throw new Error("Invalid JSON literal.");
    this.#index += value.length;
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
