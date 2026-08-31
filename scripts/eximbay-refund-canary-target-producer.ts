import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { loadEximbayCanaryCommittedContractDigests } from
  "../src/lib/payment/refund/eximbay-refund-canary-committed-contracts";
import {
  EximbayCanaryProducerError,
  parseEximbayCanaryAttestation,
} from "../src/lib/payment/refund/eximbay-refund-canary-producer-contract";
import { materializeEximbayRefundCanaryTarget } from
  "../src/lib/payment/refund/eximbay-refund-canary-target-producer";
import { issueEximbayRefundCanaryApproval } from
  "../src/lib/payment/refund/issue-eximbay-refund-canary-approval";

const INPUT_MAX_BYTES = 64 * 1_024;

type ParsedCommand =
  | Readonly<{
    command: "materialize-target";
    paymentId: string;
    attestationPath: string;
  }>
  | Readonly<{
    command: "issue-approval";
    paymentId: string;
    attestationPath: string;
    runtimeReadbackPath: string;
    issuerPrincipalId: string;
  }>;

export function parseEximbayCanaryProducerArgs(args: readonly string[]): ParsedCommand {
  const command = args[0];
  if (command !== "materialize-target" && command !== "issue-approval") {
    throw new EximbayCanaryProducerError("CLI_ARGUMENTS_INVALID");
  }
  const values = parseFlags(args.slice(1));
  const commonKeys = ["--attestation", "--payment-id"];
  const expectedKeys = command === "materialize-target"
    ? commonKeys
    : [...commonKeys, "--issuer-principal", "--runtime-readback"];
  if (!sameKeys([...values.keys()].sort(), expectedKeys.sort())) {
    throw new EximbayCanaryProducerError("CLI_ARGUMENTS_INVALID");
  }
  const paymentId = required(values, "--payment-id");
  const attestationPath = required(values, "--attestation");
  if (command === "materialize-target") {
    return Object.freeze({ command, paymentId, attestationPath });
  }
  return Object.freeze({
    command,
    paymentId,
    attestationPath,
    runtimeReadbackPath: required(values, "--runtime-readback"),
    issuerPrincipalId: required(values, "--issuer-principal"),
  });
}

async function main(): Promise<void> {
  const command = parseEximbayCanaryProducerArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new EximbayCanaryProducerError("DATABASE_URL_REQUIRED");
  const attestationValue = await readBoundedJson(command.attestationPath);
  const attestation = parseEximbayCanaryAttestation(attestationValue);
  if (!attestation) throw new EximbayCanaryProducerError("ATTESTATION_INVALID");
  const contractDigests = await loadEximbayCanaryCommittedContractDigests(process.cwd());
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const result = command.command === "materialize-target"
      ? await materializeEximbayRefundCanaryTarget(client, {
        paymentId: command.paymentId,
        attestation,
        contractDigests,
      })
      : await issueEximbayRefundCanaryApproval(client, {
        paymentId: command.paymentId,
        attestation,
        contractDigests,
        runtimeReadback: await readBoundedJson(command.runtimeReadbackPath),
        issuerPrincipalId: command.issuerPrincipalId,
      });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await client.$disconnect();
  }
}

function parseFlags(args: readonly string[]): Map<string, string> {
  if (args.length === 0 || args.length % 2 !== 0) {
    throw new EximbayCanaryProducerError("CLI_ARGUMENTS_INVALID");
  }
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--") || values.has(flag)) {
      throw new EximbayCanaryProducerError("CLI_ARGUMENTS_INVALID");
    }
    values.set(flag, value);
  }
  return values;
}

function required(values: ReadonlyMap<string, string>, flag: string): string {
  const value = values.get(flag);
  if (!value) throw new EximbayCanaryProducerError("CLI_ARGUMENTS_INVALID");
  return value;
}

function sameKeys(actual: readonly string[], expected: readonly string[]): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function readBoundedJson(path: string): Promise<unknown> {
  const metadata = await stat(path).catch(() => null);
  if (!metadata?.isFile() || metadata.size < 2 || metadata.size > INPUT_MAX_BYTES) {
    throw new EximbayCanaryProducerError("INPUT_FILE_INVALID");
  }
  const source = await readFile(path, "utf8").catch(() => null);
  if (!source) throw new EximbayCanaryProducerError("INPUT_FILE_INVALID");
  try {
    return JSON.parse(source);
  } catch {
    throw new EximbayCanaryProducerError("INPUT_FILE_INVALID");
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && pathToFileURL(entry).href === import.meta.url);
}

if (isMainModule()) {
  main().catch((error: unknown) => {
    const code = error instanceof EximbayCanaryProducerError
      ? error.code
      : "EXIMBAY_CANARY_PRODUCER_FAILED";
    process.stderr.write(`${JSON.stringify({ ok: false, code })}\n`);
    process.exitCode = 1;
  });
}
