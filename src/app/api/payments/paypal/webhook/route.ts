const CUTOVER_MESSAGE = "legacy payment cutover — 신 코어 B4가 인수 예정";

export const runtime = "nodejs";

export function POST() {
  console.warn(CUTOVER_MESSAGE);
  return Response.json({ error: CUTOVER_MESSAGE }, { status: 503 });
}
