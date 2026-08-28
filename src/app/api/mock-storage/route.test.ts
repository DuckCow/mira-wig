import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { MockStorageProvider } from "@/lib/storage/mock";
import { clearMockStorageStoreForTests } from "@/lib/storage/mock-store";
import { GET, OPTIONS, PUT } from "./route";

function requestFor(
  key: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/mock-storage?key=${encodeURIComponent(key)}`,
    init,
  );
}

beforeEach(() => clearMockStorageStoreForTests());

describe("mock storage upload state", () => {
  it("tracks exact object existence before PUT, after PUT, and after delete", async () => {
    const storage = new MockStorageProvider();
    const upload = await storage.getUploadUrl({
      purpose: "wig-style",
      contentType: "image/png",
    });

    await expect(storage.exists(upload.key)).resolves.toBe(false);

    const bytes = new Uint8Array([1, 2, 3, 4]);
    const putResponse = await PUT(requestFor(upload.key, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: bytes,
    }));
    expect(putResponse.status).toBe(200);
    await expect(storage.exists(upload.key)).resolves.toBe(true);
    await expect(storage.statObject(upload.key)).resolves.toEqual({
      byteLength: bytes.byteLength,
      contentType: "image/png",
    });
    await expect(storage.readObjectBounded(upload.key, 2)).resolves.toEqual({
      bytes: bytes.slice(0, 2),
      totalByteLength: bytes.byteLength,
      contentType: "image/png",
    });

    const getResponse = GET(requestFor(upload.key));
    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await getResponse.arrayBuffer())).toEqual(bytes);

    await storage.delete(upload.key);
    await expect(storage.exists(upload.key)).resolves.toBe(false);
    await expect(storage.statObject(upload.key)).resolves.toBeNull();
  });

  it("does not count an unknown key or GET fallback as existing", async () => {
    const storage = new MockStorageProvider();
    const key = "wig-style/never-uploaded.jpg";

    await expect(storage.exists(key)).resolves.toBe(false);
    expect(GET(requestFor(key)).status).toBe(200);
    await expect(storage.exists(key)).resolves.toBe(false);
  });

  it("preserves canned demo images, gray fallback, and self-origin CORS", () => {
    const catalogResponse = GET(requestFor("demo-catalog/hl-slkst.png"));
    expect(catalogResponse.status).toBe(200);
    expect(catalogResponse.headers.get("Content-Type")).toBe("image/png");

    const fittingResponse = GET(requestFor("demo-fitting-result/FA-BCHWV-HON-L-WV"));
    expect(fittingResponse.status).toBe(200);
    expect(fittingResponse.headers.get("Content-Type")).toBe("image/jpeg");

    const fallbackResponse = GET(requestFor("unknown/fallback"));
    expect(fallbackResponse.status).toBe(200);
    expect(fallbackResponse.headers.get("Content-Type")).toBe("image/png");

    const optionsResponse = OPTIONS();
    expect(optionsResponse.status).toBe(204);
    expect(optionsResponse.headers.get("Access-Control-Allow-Origin")).toBe(
      process.env.NEXTAUTH_URL ?? "http://localhost:3000",
    );
  });
});
