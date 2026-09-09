import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("private operator Server Actions origin boundary", () => {
  it("allows only the fixed gcloud proxy origin", () => {
    expect(nextConfig.experimental?.serverActions?.allowedOrigins).toEqual(["localhost:8085"]);
  });
});
