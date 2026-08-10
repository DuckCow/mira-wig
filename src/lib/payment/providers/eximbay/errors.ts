export class EximbayProtocolError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "EximbayProtocolError";
  }
}
