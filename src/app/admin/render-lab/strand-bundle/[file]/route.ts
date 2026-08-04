import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

const FIXTURE_MANIFEST_PATH = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "src/lib/rendering/fixtures/r2-diagnostic-v1",
  "manifest.json",
);
const FIXTURE_BINARY_PATH = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "src/lib/rendering/fixtures/r2-diagnostic-v1",
  "strands.bin",
);

interface AllowedFixtureFile {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly contentType: string;
}

const SECURITY_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function secureResponse(
  body: BodyInit | null,
  status: number,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return new Response(body, {
    status,
    headers: { ...SECURITY_RESPONSE_HEADERS, ...headers },
  });
}

function responseBytes(fileBytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(fileBytes.byteLength);
  bytes.set(fileBytes);
  return bytes;
}

async function readAllowedFixtureFile(file: string): Promise<AllowedFixtureFile | null> {
  if (file === "manifest.json") {
    return {
      bytes: responseBytes(await readFile(FIXTURE_MANIFEST_PATH)),
      contentType: "application/json; charset=utf-8",
    };
  }
  if (file === "strands.bin") {
    return {
      bytes: responseBytes(await readFile(FIXTURE_BINARY_PATH)),
      contentType: "application/octet-stream",
    };
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly file: string }> },
): Promise<Response> {
  const guard = await requireAdmin();
  if (!guard.success) {
    return secureResponse(
      null,
      guard.errorCode === "UNAUTHENTICATED" ? 401 : 403,
    );
  }
  const { file } = await params;
  const fixtureFile = await readAllowedFixtureFile(file);
  if (fixtureFile === null) return secureResponse(null, 404);

  return secureResponse(
    fixtureFile.bytes,
    200,
    {
      "Content-Type": fixtureFile.contentType,
      "Content-Length": String(fixtureFile.bytes.byteLength),
    },
  );
}
