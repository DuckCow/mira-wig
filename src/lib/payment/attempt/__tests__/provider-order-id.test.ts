import { beforeEach, describe, expect, it, vi } from "vitest";

const entropyControl = vi.hoisted(() => {
  const chunks: Uint8Array[] = [];
  return { chunks, calls: 0 };
});

vi.mock("node:crypto", () => ({
  randomBytes: () => {
    entropyControl.calls += 1;
    const chunk = entropyControl.chunks.shift();
    if (!chunk) throw new Error("Missing controlled entropy chunk");
    return chunk;
  },
}));

import {
  generateEximbayProviderOrderId,
  isValidEximbayProviderOrderId,
} from "../provider-order-id";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

describe("EX2B1 provider-order identity generation", () => {
  beforeEach(() => {
    entropyControl.chunks.length = 0;
    entropyControl.calls = 0;
  });

  it("generates exactly c plus 24 lowercase base36 characters", () => {
    entropyControl.chunks.push(Uint8Array.from(Array.from({ length: 48 }, (_, index) => index)));

    const generated = generateEximbayProviderOrderId();

    expect(generated).toBe(`c${ALPHABET.slice(0, 24)}`);
    expect(generated).toHaveLength(25);
    expect(isValidEximbayProviderOrderId(generated)).toBe(true);
    expect(entropyControl.calls).toBe(1);
  });

  it("accepts byte 251 and rejects the threshold byte 252 and every byte above it", () => {
    const acceptedTail = Array.from({ length: 23 }, (_, index) => index);
    entropyControl.chunks.push(Uint8Array.from([251, 252, 253, 254, 255, ...acceptedTail]));

    const generated = generateEximbayProviderOrderId();

    expect(generated).toBe(`cz${ALPHABET.slice(0, 23)}`);
    expect(entropyControl.calls).toBe(1);
  });

  it("requests fresh CSPRNG bytes when a chunk contains no accepted byte", () => {
    entropyControl.chunks.push(
      Uint8Array.from({ length: 48 }, () => 252),
      Uint8Array.from({ length: 48 }, () => 35),
    );

    expect(generateEximbayProviderOrderId()).toBe(`c${"z".repeat(24)}`);
    expect(entropyControl.calls).toBe(2);
  });

  it.each([
    ["uppercase", "c00000000000000000000000A"],
    ["wrong prefix", "x000000000000000000000000"],
    ["too short", "c00000000000000000000000"],
    ["too long", "c0000000000000000000000000"],
    ["punctuation", "c00000000000000000000000-"],
    ["space", "c00000000000000000000000 "],
    ["control", "c00000000000000000000000\n"],
    ["Unicode substitution", "c00000000000000000000000０"],
  ])("rejects %s without normalization", (_name, value) => {
    expect(isValidEximbayProviderOrderId(value)).toBe(false);
  });
});
