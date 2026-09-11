import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, extname, join, relative, resolve, sep } from "path";
import ts from "typescript";
import { ESLint } from "eslint";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const OWNER = "src/lib/payment/attempt/initiate.ts";
const PROVIDER_TYPES = "src/lib/payment/providers/types.ts";
const PROVIDER_CONTRACT = "src/lib/payment/providers/contract.ts";
const PROVIDER_INITIATION = "src/lib/payment/providers/initiation.ts";
const PROVIDER_FACTORY = "src/lib/payment/providers/factory.ts";
const PROVIDER_MOCK = "src/lib/payment/providers/mock.ts";
const TOSS_ADAPTER = "src/lib/payment/providers/toss/adapter.ts";
const RUNTIME_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const DECLARATION_FILE_PATTERN = /\.d\.(?:ts|mts|cts)$/;
const CAPABILITY_CARRIER_METHODS = new Set([
  "add",
  "at",
  "bind",
  "entries",
  "every",
  "filter",
  "find",
  "forEach",
  "get",
  "keys",
  "map",
  "next",
  "push",
  "resolve",
  "set",
  "some",
  "unshift",
  "values",
  "[Symbol.asyncIterator]",
  "[Symbol.iterator]",
]);
const MAX_CAPABILITY_TRACE_DEPTH = 128;
const temporaryProjects: string[] = [];
let cachedRepositoryAnalysis: ArchitectureAnalysis | undefined;

interface ArchitecturePolicy {
  owner: string;
  ownerExportAllowlist?: ReadonlyMap<string, OwnerExportKind>;
  canonicalCapabilityModule: string;
  canonicalCapabilityExport: string;
  restrictedModuleTargets: ReadonlySet<string>;
  capabilityExportAllowances: ReadonlyMap<string, ReadonlySet<string>>;
  declarationFileAllowances?: ReadonlyMap<string, PolicyAllowance>;
  ambientDeclarationAllowances?: ReadonlyMap<string, PolicyAllowance>;
  liveRepository: boolean;
}

type OwnerExportKind = "class" | "function" | "interface" | "type";

interface PolicyAllowance {
  role: string;
  reason: string;
}

interface ArchitectureAnalysis {
  rawCallers: string[];
  violations: string[];
  productionFiles: string[];
  declarationFiles: string[];
}

interface AmbientDeclarationSubject {
  identity: string;
  node: ts.Node;
}

interface CapabilityTrace {
  checker: ts.TypeChecker;
  canonicalInitiate: ts.Type;
  assignedSources: ReadonlyMap<ts.Symbol, readonly ts.Expression[]>;
  collectionSources: ReadonlyMap<ts.Symbol, readonly ts.Expression[]>;
  callableActive: Set<ts.Node>;
  callResultActive: Set<string>;
  collectionActive: Set<ts.Expression>;
  containmentActive: Set<ts.Node>;
  exportSymbolActive: Set<ts.Symbol>;
  sourceSymbolActive: Set<ts.Symbol>;
  symbolCallableActive: Set<ts.Symbol>;
  symbolContainmentActive: Set<ts.Symbol>;
  typeActive: Set<ts.Type>;
  typeSymbolActive: Set<ts.Symbol>;
  typeMemo: Map<ts.Type, boolean>;
  currentEnvironment: CallEnvironment | null;
  nextEnvironmentId: number;
  nodeIds: WeakMap<ts.Node, number>;
  nextNodeId: number;
  symbolIds: Map<ts.Symbol, number>;
  nextSymbolId: number;
  callEnvironmentActive: Set<string>;
}

interface ProvenanceSource {
  expression: ts.Expression;
  environment: CallEnvironment | null;
}

interface ParameterBinding {
  sources: readonly ProvenanceSource[];
  rest: boolean;
}

interface CallEnvironment {
  id: number;
  parent: CallEnvironment | null;
  bindings: ReadonlyMap<ts.ParameterDeclaration, ParameterBinding>;
}

interface GenericCallCase {
  name: string;
  sources: Readonly<Record<string, string>>;
  expectedCaller: string;
}

interface OwnerTypeExportCase {
  name: string;
  sources: Readonly<Record<string, string>>;
  exportName: string;
  exportKind: OwnerExportKind;
  expectedViolation: string;
}

interface GeneralTypeExportCase {
  name: string;
  sources: Readonly<Record<string, string>>;
  expectedViolation: string;
}

interface C2hPolicyCase {
  name: string;
  sources: Readonly<Record<string, string>>;
  allowedDeclarationFiles?: readonly string[];
  allowedAmbientDeclarations?: readonly string[];
  expectedViolations: readonly string[];
}

const C2H_AUDITOR_BYPASS_SOURCES: Readonly<Record<string, string>> = {
  "src/lib/payment/payment-leak.d.ts": [
    "export type AuditCapabilityLeak =",
    "  import(\"./providers/types\").PaymentInitiationProvider;",
    "",
  ].join("\n"),
  "src/lib/payment/ambient-leak.ts": [
    "export {};",
    "",
    "declare global {",
    "  interface AuditGlobalCapabilityLeak {",
    "    readonly capability:",
    "      import(\"./providers/types\").PaymentInitiationProvider;",
    "  }",
    "}",
    "",
  ].join("\n"),
  "src/lib/payment/attempt/initiate.ts": [
    "export {};",
    "",
    "declare global {",
    "  interface AuditGlobalCapabilityLeak {",
    "    readonly capability:",
    "      import(\"../providers/types\").PaymentInitiationProvider;",
    "  }",
    "}",
    "",
  ].join("\n"),
};

const GENERIC_CALL_REJECTION_CASES: readonly GenericCallCase[] = [
  {
    name: "generic box helper",
    sources: {
      "helper.ts": "export function box<T>(value: T): { value: T } { return { value }; }\n",
      "consumer.ts": "import { realRun } from './owner'; import { box } from './helper'; export async function consume() { await box(realRun).value('box'); }\n",
    },
    expectedCaller: "consumer.ts",
  },
  {
    name: "generic Map helper",
    sources: {
      "helper.ts": "export function mapValue<T>(key: string, value: T): Map<string, T> { return new Map([[key, value]]); }\n",
      "consumer.ts": "import { realRun } from './owner'; import { mapValue } from './helper'; export async function consume() { await mapValue('run', realRun).get('run')?.('map'); }\n",
    },
    expectedCaller: "consumer.ts",
  },
  {
    name: "generic Set helper",
    sources: {
      "helper.ts": "export const setValue = <T>(value: T): Set<T> => new Set([value]);\n",
      "consumer.ts": "import { realRun } from './owner'; import { setValue } from './helper'; export async function consume() { for (const run of setValue(realRun)) await run('set'); }\n",
    },
    expectedCaller: "consumer.ts",
  },
  {
    name: "generic factory",
    sources: {
      "helper.ts": "export function factory<T>(value: T): () => T { return () => value; }\n",
      "consumer.ts": "import { realRun } from './owner'; import { factory } from './helper'; export async function consume() { const run = factory(realRun)(); await run('factory'); }\n",
    },
    expectedCaller: "consumer.ts",
  },
  {
    name: "awaited generic factory",
    sources: {
      "helper.ts": "export async function asyncFactory<T>(value: T): Promise<() => T> { return () => value; }\n",
      "consumer.ts": "import { realRun } from './owner'; import { asyncFactory } from './helper'; export async function consume() { const get = await asyncFactory(realRun); const run = get(); await run('async-factory'); }\n",
    },
    expectedCaller: "consumer.ts",
  },
  {
    name: "Promise of generic Box",
    sources: {
      "helper.ts": "export async function asyncBox<T>(value: T): Promise<{ value: T }> { return { value }; }\n",
      "consumer.ts": "import { realRun } from './owner'; import { asyncBox } from './helper'; export async function consume() { const boxed = await asyncBox(realRun); await boxed.value('promise-box'); }\n",
    },
    expectedCaller: "consumer.ts",
  },
  {
    name: "rest-parameter helper",
    sources: {
      "helper.ts": "export function first<T>(...values: T[]): T { const [value] = values; if (!value) throw new Error('missing'); return value; }\n",
      "consumer.ts": "import { realRun } from './owner'; import { first } from './helper'; export async function consume() { await first(realRun)('rest'); }\n",
    },
    expectedCaller: "consumer.ts",
  },
  {
    name: "default-parameter helper",
    sources: {
      "helper.ts": "export function defaulted<T>(fallback: T, value: T = fallback): T { return value; }\n",
      "consumer.ts": "import { realRun } from './owner'; import { defaulted } from './helper'; export async function consume() { await defaulted(realRun)('default'); }\n",
    },
    expectedCaller: "consumer.ts",
  },
  {
    name: "object-destructured parameter",
    sources: {
      "helper.ts": "export function objectValue<T>({ value }: { value: T }): T { return value; }\n",
      "consumer.ts": "import { realRun } from './owner'; import { objectValue } from './helper'; export async function consume() { await objectValue({ value: realRun })('object'); }\n",
    },
    expectedCaller: "consumer.ts",
  },
  {
    name: "array-destructured parameter",
    sources: {
      "helper.ts": "export function arrayValue<T>([value]: [T]): T { return value; }\n",
      "consumer.ts": "import { realRun } from './owner'; import { arrayValue } from './helper'; export async function consume() { await arrayValue([realRun])('array'); }\n",
    },
    expectedCaller: "consumer.ts",
  },
  {
    name: "generic class method",
    sources: {
      "helper.ts": "export class Boxer { box<T>(value: T): { value: T } { return { value }; } }\n",
      "consumer.ts": "import { realRun } from './owner'; import { Boxer } from './helper'; export async function consume() { await new Boxer().box(realRun).value('method'); }\n",
    },
    expectedCaller: "consumer.ts",
  },
  {
    name: "nested two-helper chain",
    sources: {
      "helper.ts": "function inner<T>(value: T): { value: T } { return { value }; } export function outer<T>(value: T): { value: T } { return inner(value); }\n",
      "consumer.ts": "import { realRun } from './owner'; import { outer } from './helper'; export async function consume() { await outer(realRun).value('nested'); }\n",
    },
    expectedCaller: "consumer.ts",
  },
  {
    name: "barrel-re-exported helper",
    sources: {
      "helper.ts": "export function box<T>(value: T): { value: T } { return { value }; }\n",
      "barrel.ts": "export { box as wrap } from './helper';\n",
      "consumer.ts": "import { realRun } from './owner'; import { wrap } from './barrel'; export async function consume() { await wrap(realRun).value('barrel'); }\n",
    },
    expectedCaller: "consumer.ts",
  },
  {
    name: "bound helper with pre-applied capability argument",
    sources: {
      "helper.ts": "type Runner = (input: string) => Promise<void>; export function boxRun(value: Runner): { value: Runner } { return { value }; }\n",
      "consumer.ts": "import { realRun } from './owner'; import { boxRun } from './helper'; export async function consume() { const bound = boxRun.bind(undefined, realRun); await bound().value('bound'); }\n",
    },
    expectedCaller: "consumer.ts",
  },
  {
    name: "overload resolved to implementation",
    sources: {
      "helper.ts": "export function box(value: string): { value: string }; export function box<T>(value: T): { value: T }; export function box<T>(value: T): { value: T } { return { value }; }\n",
      "consumer.ts": "import { realRun } from './owner'; import { box } from './helper'; export async function consume() { await box(realRun).value('overload'); }\n",
    },
    expectedCaller: "consumer.ts",
  },
];

const OWNER_TYPE_EXPORT_REJECTION_CASES: readonly OwnerTypeExportCase[] = [
  {
    name: "required property",
    sources: {
      "owner.ts": "import type { RawProvider } from './raw'; export interface InitiatePaymentAttemptInput { auditCapability: RawProvider }\n",
    },
    exportName: "InitiatePaymentAttemptInput",
    exportKind: "interface",
    expectedViolation: "OWNER_CAPABILITY_EXPORT owner.ts:InitiatePaymentAttemptInput",
  },
  {
    name: "auditor exact optional property bypass",
    sources: {
      "owner.ts": "import type { RawProvider } from './raw'; export interface InitiatePaymentAttemptInput { auditCapability?: RawProvider }\n",
    },
    exportName: "InitiatePaymentAttemptInput",
    exportKind: "interface",
    expectedViolation: "OWNER_CAPABILITY_EXPORT owner.ts:InitiatePaymentAttemptInput",
  },
  {
    name: "nested result property",
    sources: {
      "owner.ts": "import type { RawProvider } from './raw'; export interface InitiatePaymentAttemptResult { nested: { provider: RawProvider } }\n",
    },
    exportName: "InitiatePaymentAttemptResult",
    exportKind: "interface",
    expectedViolation: "OWNER_CAPABILITY_EXPORT owner.ts:InitiatePaymentAttemptResult",
  },
  {
    name: "interface method return",
    sources: {
      "owner.ts": "import type { RawProvider } from './raw'; export interface InitiatePaymentAttemptInput { capability(): RawProvider }\n",
    },
    exportName: "InitiatePaymentAttemptInput",
    exportKind: "interface",
    expectedViolation: "OWNER_CAPABILITY_EXPORT owner.ts:InitiatePaymentAttemptInput",
  },
  {
    name: "interface call signature",
    sources: {
      "owner.ts": "import type { RawProvider } from './raw'; export interface InitiatePaymentAttemptInput { (input: string): RawProvider }\n",
    },
    exportName: "InitiatePaymentAttemptInput",
    exportKind: "interface",
    expectedViolation: "OWNER_CAPABILITY_EXPORT owner.ts:InitiatePaymentAttemptInput",
  },
  {
    name: "interface construct and accessor signatures",
    sources: {
      "owner.ts": "import type { RawProvider } from './raw'; export interface InitiatePaymentAttemptInput { new (): RawProvider; get capability(): RawProvider; set capability(value: RawProvider) }\n",
    },
    exportName: "InitiatePaymentAttemptInput",
    exportKind: "interface",
    expectedViolation: "OWNER_CAPABILITY_EXPORT owner.ts:InitiatePaymentAttemptInput",
  },
  {
    name: "interface index signature",
    sources: {
      "owner.ts": "import type { RawProvider } from './raw'; export interface InitiatePaymentAttemptInput { readonly [key: string]: RawProvider }\n",
    },
    exportName: "InitiatePaymentAttemptInput",
    exportKind: "interface",
    expectedViolation: "OWNER_CAPABILITY_EXPORT owner.ts:InitiatePaymentAttemptInput",
  },
  {
    name: "base interface",
    sources: {
      "base.ts": "import type { RawProvider } from './raw'; export interface CapabilityBase { provider: RawProvider }\n",
      "owner.ts": "import type { CapabilityBase } from './base'; export interface InitiatePaymentAttemptInput extends CapabilityBase { safe: string }\n",
    },
    exportName: "InitiatePaymentAttemptInput",
    exportKind: "interface",
    expectedViolation: "OWNER_CAPABILITY_EXPORT owner.ts:InitiatePaymentAttemptInput",
  },
  {
    name: "generic constraint",
    sources: {
      "owner.ts": "import type { RawProvider } from './raw'; export interface InitiatePaymentAttemptInput<T extends RawProvider> { safe: string }\n",
    },
    exportName: "InitiatePaymentAttemptInput",
    exportKind: "interface",
    expectedViolation: "OWNER_CAPABILITY_EXPORT owner.ts:InitiatePaymentAttemptInput",
  },
  {
    name: "generic default",
    sources: {
      "owner.ts": "import type { RawProvider } from './raw'; export interface InitiatePaymentAttemptInput<T = RawProvider> { safe: string }\n",
    },
    exportName: "InitiatePaymentAttemptInput",
    exportKind: "interface",
    expectedViolation: "OWNER_CAPABILITY_EXPORT owner.ts:InitiatePaymentAttemptInput",
  },
  {
    name: "direct type alias",
    sources: {
      "owner.ts": "import type { RawProvider } from './raw'; export type PaymentInitiateErrorCode = RawProvider;\n",
    },
    exportName: "PaymentInitiateErrorCode",
    exportKind: "type",
    expectedViolation: "OWNER_CAPABILITY_EXPORT owner.ts:PaymentInitiateErrorCode",
  },
  {
    name: "alias of alias",
    sources: {
      "owner.ts": "import type { RawProvider as HiddenProvider } from './raw'; type Hidden = HiddenProvider; export type PaymentInitiateErrorCode = Hidden;\n",
    },
    exportName: "PaymentInitiateErrorCode",
    exportKind: "type",
    expectedViolation: "OWNER_CAPABILITY_EXPORT owner.ts:PaymentInitiateErrorCode",
  },
  {
    name: "union and intersection alias",
    sources: {
      "owner.ts": "import type { RawProvider } from './raw'; export type PaymentInitiateErrorCode = RawProvider | (RawProvider & { tag: string });\n",
    },
    exportName: "PaymentInitiateErrorCode",
    exportKind: "type",
    expectedViolation: "OWNER_CAPABILITY_EXPORT owner.ts:PaymentInitiateErrorCode",
  },
  {
    name: "array tuple promise map and set alias",
    sources: {
      "owner.ts": "import type { RawProvider } from './raw'; export type PaymentInitiateErrorCode = readonly [RawProvider[], Promise<ReadonlyMap<string, Set<RawProvider>>>];\n",
    },
    exportName: "PaymentInitiateErrorCode",
    exportKind: "type",
    expectedViolation: "OWNER_CAPABILITY_EXPORT owner.ts:PaymentInitiateErrorCode",
  },
  {
    name: "function type alias",
    sources: {
      "owner.ts": "import type { RawProvider } from './raw'; export type PaymentInitiateErrorCode = (input: RawProvider) => RawProvider;\n",
    },
    exportName: "PaymentInitiateErrorCode",
    exportKind: "type",
    expectedViolation: "OWNER_CAPABILITY_EXPORT owner.ts:PaymentInitiateErrorCode",
  },
  {
    name: "mapped conditional and indexed-access alias",
    sources: {
      "owner.ts": [
        "import type { RawProvider } from './raw';",
        "type Shape = { provider: RawProvider };",
        "type Mapped = { [Key in keyof Shape]: Shape[Key] };",
        "type Conditional<Value> = Value extends true ? RawProvider : never;",
        "export type PaymentInitiateErrorCode = Mapped & { conditional: Conditional<true>; indexed: Shape['provider'] };",
        "",
      ].join("\n"),
    },
    exportName: "PaymentInitiateErrorCode",
    exportKind: "type",
    expectedViolation: "OWNER_CAPABILITY_EXPORT owner.ts:PaymentInitiateErrorCode",
  },
  {
    name: "recursive alias",
    sources: {
      "owner.ts": "import type { RawProvider } from './raw'; interface Recursive { next?: Recursive; provider?: RawProvider } export type PaymentInitiateErrorCode = Recursive;\n",
    },
    exportName: "PaymentInitiateErrorCode",
    exportKind: "type",
    expectedViolation: "OWNER_CAPABILITY_EXPORT owner.ts:PaymentInitiateErrorCode",
  },
  {
    name: "type-only re-export alias substitution",
    sources: {
      "leak.ts": "import type { RawProvider } from './raw'; export interface CapabilityContract { provider: RawProvider }\n",
      "owner.ts": "export type { CapabilityContract as InitiatePaymentAttemptInput } from './leak';\n",
    },
    exportName: "InitiatePaymentAttemptInput",
    exportKind: "interface",
    expectedViolation: "OWNER_CAPABILITY_EXPORT owner.ts:InitiatePaymentAttemptInput",
  },
];

const GENERAL_TYPE_EXPORT_REJECTION_CASES: readonly GeneralTypeExportCase[] = [
  {
    name: "production interface",
    sources: {
      "consumer.ts": "import type { RawProvider } from './raw'; export interface CapabilityPort { provider: RawProvider }\n",
    },
    expectedViolation: "CAPABILITY_EXPORT consumer.ts:CapabilityPort",
  },
  {
    name: "production type alias",
    sources: {
      "consumer.ts": "import type { RawProvider } from './raw'; export type CapabilityPort = RawProvider;\n",
    },
    expectedViolation: "CAPABILITY_EXPORT consumer.ts:CapabilityPort",
  },
  {
    name: "nested generic wrapper",
    sources: {
      "consumer.ts": "import type { RawProvider } from './raw'; interface Box<T> { value: T } export type CapabilityBox = Promise<Box<ReadonlyMap<string, ReadonlySet<RawProvider>>>>;\n",
    },
    expectedViolation: "CAPABILITY_EXPORT consumer.ts:CapabilityBox",
  },
  {
    name: "namespace and declaration merge",
    sources: {
      "consumer.ts": "import type { RawProvider } from './raw'; export interface CapabilityNamespace { safe: string } export namespace CapabilityNamespace { export type Port = RawProvider; }\n",
    },
    expectedViolation: "CAPABILITY_EXPORT consumer.ts:CapabilityNamespace",
  },
  {
    name: "type-only barrel re-export",
    sources: {
      "leak.ts": "import type { RawProvider } from './raw'; export type CapabilityPort = RawProvider;\n",
      "barrel.ts": "export type { CapabilityPort as HiddenPort } from './leak';\n",
    },
    expectedViolation: "CAPABILITY_EXPORT barrel.ts:HiddenPort",
  },
  {
    name: "locally renamed canonical type",
    sources: {
      "consumer.ts": "import type { RawProvider as ExecutionPort } from './raw'; export interface RenamedPort { execution: ExecutionPort }\n",
    },
    expectedViolation: "CAPABILITY_EXPORT consumer.ts:RenamedPort",
  },
  {
    name: "unauthorized sibling in an authorized module",
    sources: {
      "authorized.ts": "import type { RawProvider } from './raw'; export declare function allowed(): RawProvider; export interface UnsafeSibling { provider: RawProvider }\n",
    },
    expectedViolation: "CAPABILITY_EXPORT authorized.ts:UnsafeSibling",
  },
];

const DECLARATION_POLICY_REJECTION_CASES: readonly C2hPolicyCase[] = [
  {
    name: "auditor exact declaration-file alias bypass",
    sources: {
      "src/lib/payment/payment-leak.d.ts": [
        "export type AuditCapabilityLeak =",
        "  import(\"./providers/types\").PaymentInitiationProvider;",
        "",
      ].join("\n"),
    },
    expectedViolations: [
      "DECLARATION_FILE_NOT_ALLOWLISTED src/lib/payment/payment-leak.d.ts",
      "CAPABILITY_EXPORT src/lib/payment/payment-leak.d.ts:AuditCapabilityLeak",
    ],
  },
  {
    name: "allowlisted exported interface containment",
    sources: {
      "src/capability-interface.d.ts": "export interface CapabilityInterface { capability: import('./lib/payment/providers/types').PaymentInitiationProvider }\n",
    },
    allowedDeclarationFiles: ["src/capability-interface.d.ts"],
    expectedViolations: ["CAPABILITY_EXPORT src/capability-interface.d.ts:CapabilityInterface"],
  },
  {
    name: "allowlisted type-only canonical re-export",
    sources: {
      "src/capability-reexport.d.ts": "export type { PaymentInitiationProvider } from './lib/payment/providers/types';\n",
    },
    allowedDeclarationFiles: ["src/capability-reexport.d.ts"],
    expectedViolations: [
      "DECLARATION_CAPABILITY_REEXPORT src/capability-reexport.d.ts:PaymentInitiationProvider",
      "CAPABILITY_EXPORT src/capability-reexport.d.ts:PaymentInitiationProvider",
    ],
  },
  {
    name: "allowlisted alias of alias",
    sources: {
      "src/capability-alias.d.ts": [
        "type Hidden = import('./lib/payment/providers/types').PaymentInitiationProvider;",
        "export type AliasOfAlias = Hidden;",
        "",
      ].join("\n"),
    },
    allowedDeclarationFiles: ["src/capability-alias.d.ts"],
    expectedViolations: ["CAPABILITY_EXPORT src/capability-alias.d.ts:AliasOfAlias"],
  },
  {
    name: "allowlisted nested Promise Map Set generic",
    sources: {
      "src/capability-nested.d.ts": [
        "interface Box<Value> { value: Value }",
        "export type NestedCapability = Promise<Box<Map<string, Set<import('./lib/payment/providers/types').PaymentInitiationProvider>>>>;",
        "",
      ].join("\n"),
    },
    allowedDeclarationFiles: ["src/capability-nested.d.ts"],
    expectedViolations: ["CAPABILITY_EXPORT src/capability-nested.d.ts:NestedCapability"],
  },
  {
    name: "allowlisted d.mts containment",
    sources: {
      "src/capability-leak.d.mts": "export type MtsCapability = import('./lib/payment/providers/types').PaymentInitiationProvider;\n",
    },
    allowedDeclarationFiles: ["src/capability-leak.d.mts"],
    expectedViolations: ["CAPABILITY_EXPORT src/capability-leak.d.mts:MtsCapability"],
  },
  {
    name: "allowlisted d.cts containment",
    sources: {
      "src/capability-leak.d.cts": "export type CtsCapability = import('./lib/payment/providers/types').PaymentInitiationProvider;\n",
    },
    allowedDeclarationFiles: ["src/capability-leak.d.cts"],
    expectedViolations: ["CAPABILITY_EXPORT src/capability-leak.d.cts:CtsCapability"],
  },
  {
    name: "safe-looking declaration remains forbidden until review",
    sources: {
      "src/safe-looking.d.ts": "export interface SafeLookingDeclaration { readonly label: string }\n",
    },
    expectedViolations: ["DECLARATION_FILE_NOT_ALLOWLISTED src/safe-looking.d.ts"],
  },
  {
    name: "reviewed root declaration modified to leak capability",
    sources: {
      "next-env.d.ts": "export interface FrameworkTypes { capability: import('./src/lib/payment/providers/types').PaymentInitiationProvider }\n",
    },
    allowedDeclarationFiles: ["next-env.d.ts"],
    expectedViolations: ["CAPABILITY_EXPORT next-env.d.ts:FrameworkTypes"],
  },
  {
    name: "allowlisted declaration merge still cannot add capability",
    sources: {
      "src/safe.ts": "export interface SafeContract { readonly label: string }\n",
      "src/safe-augmentation.d.ts": [
        "export {};",
        "declare module './safe' {",
        "  interface SafeContract {",
        "    capability: import('./lib/payment/providers/types').PaymentInitiationProvider;",
        "  }",
        "}",
        "",
      ].join("\n"),
    },
    allowedDeclarationFiles: ["src/safe-augmentation.d.ts"],
    allowedAmbientDeclarations: [
      "src/safe-augmentation.d.ts::module:\"./safe\"",
      "src/safe-augmentation.d.ts::module:\"./safe\"/interface:SafeContract",
    ],
    expectedViolations: [
      "AMBIENT_CAPABILITY src/safe-augmentation.d.ts::module:\"./safe\"",
      "AMBIENT_CAPABILITY src/safe-augmentation.d.ts::module:\"./safe\"/interface:SafeContract",
    ],
  },
];

const AMBIENT_POLICY_REJECTION_CASES: readonly C2hPolicyCase[] = [
  {
    name: "auditor exact declare-global bypass in a normal module",
    sources: {
      "src/ambient-global.ts": [
        "export {};",
        "",
        "declare global {",
        "  interface AuditGlobalCapabilityLeak {",
        "    readonly capability:",
        "      import(\"./lib/payment/providers/types\").PaymentInitiationProvider;",
        "  }",
        "}",
        "",
      ].join("\n"),
    },
    expectedViolations: [
      "AMBIENT_DECLARATION_NOT_ALLOWLISTED src/ambient-global.ts::global",
      "AMBIENT_CAPABILITY src/ambient-global.ts::global/interface:AuditGlobalCapabilityLeak",
    ],
  },
  {
    name: "declare-global bypass inside the owner",
    sources: {
      "src/lib/payment/attempt/initiate.ts": [
        "export {};",
        "declare global {",
        "  interface AuditGlobalCapabilityLeak {",
        "    readonly capability: import('../providers/types').PaymentInitiationProvider;",
        "  }",
        "}",
        "",
      ].join("\n"),
    },
    expectedViolations: [
      "AMBIENT_BOUNDARY src/lib/payment/attempt/initiate.ts::global",
      "AMBIENT_CAPABILITY src/lib/payment/attempt/initiate.ts::global/interface:AuditGlobalCapabilityLeak",
    ],
  },
  {
    name: "ambient module capability export",
    sources: {
      "src/ambient-module.d.ts": [
        "declare module 'audit-capability' {",
        "  export type Capability = import('./lib/payment/providers/types').PaymentInitiationProvider;",
        "}",
        "",
      ].join("\n"),
    },
    expectedViolations: [
      "DECLARATION_FILE_NOT_ALLOWLISTED src/ambient-module.d.ts",
      "AMBIENT_CAPABILITY src/ambient-module.d.ts::module:\"audit-capability\"/type:Capability",
    ],
  },
  {
    name: "external module augmentation",
    sources: {
      "src/safe.ts": "export interface SafeContract { readonly label: string }\n",
      "src/module-augmentation.ts": [
        "export {};",
        "declare module './safe' {",
        "  interface SafeContract {",
        "    capability: import('./lib/payment/providers/types').PaymentInitiationProvider;",
        "  }",
        "}",
        "",
      ].join("\n"),
    },
    expectedViolations: [
      "AMBIENT_DECLARATION_NOT_ALLOWLISTED src/module-augmentation.ts::module:\"./safe\"",
      "AMBIENT_CAPABILITY src/module-augmentation.ts::module:\"./safe\"/interface:SafeContract",
    ],
  },
  {
    name: "global namespace augmentation",
    sources: {
      "src/global-namespace.ts": [
        "export {};",
        "declare global {",
        "  namespace AuditNamespace {",
        "    type Capability = import('./lib/payment/providers/types').PaymentInitiationProvider;",
        "  }",
        "}",
        "",
      ].join("\n"),
    },
    expectedViolations: [
      "AMBIENT_DECLARATION_NOT_ALLOWLISTED src/global-namespace.ts::global/namespace:AuditNamespace",
      "AMBIENT_CAPABILITY src/global-namespace.ts::global/namespace:AuditNamespace/type:Capability",
    ],
  },
  {
    name: "nested ambient type alias",
    sources: {
      "src/ambient-nested.ts": [
        "export {};",
        "declare global {",
        "  type AuditNestedCapability = Promise<Map<string, Set<import('./lib/payment/providers/types').PaymentInitiationProvider>>>;",
        "}",
        "",
      ].join("\n"),
    },
    expectedViolations: [
      "AMBIENT_DECLARATION_NOT_ALLOWLISTED src/ambient-nested.ts::global/type:AuditNestedCapability",
      "AMBIENT_CAPABILITY src/ambient-nested.ts::global/type:AuditNestedCapability",
    ],
  },
  {
    name: "declaration merging across global files",
    sources: {
      "src/global-merge-a.ts": "interface AuditMergedContract { readonly safe: string }\n",
      "src/global-merge-b.ts": "interface AuditMergedContract { readonly capability: import('./lib/payment/providers/types').PaymentInitiationProvider }\n",
    },
    expectedViolations: [
      "AMBIENT_DECLARATION_NOT_ALLOWLISTED src/global-merge-a.ts::global/interface:AuditMergedContract",
      "AMBIENT_CAPABILITY src/global-merge-b.ts::global/interface:AuditMergedContract",
    ],
  },
  {
    name: "type-only barrel exposing a global namespace declaration",
    sources: {
      "src/ambient-capability.d.ts": [
        "export interface AmbientCapability { capability: import('./lib/payment/providers/types').PaymentInitiationProvider }",
        "export as namespace AuditAmbientCapability;",
        "",
      ].join("\n"),
      "src/ambient-barrel.ts": "export type { AmbientCapability } from './ambient-capability';\n",
    },
    expectedViolations: [
      "AMBIENT_DECLARATION_NOT_ALLOWLISTED src/ambient-capability.d.ts::global-namespace-export:AuditAmbientCapability",
      "CAPABILITY_EXPORT src/ambient-barrel.ts:AmbientCapability",
    ],
  },
];

describe("provider initiation ownership", () => {
  afterEach(() => {
    for (const directory of temporaryProjects.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  // Whole-repository TypeScript analysis took 27s alone and 69s in the full
  // parallel gate. Bound this one analysis at 120s without changing its scope.
  it("structurally limits the raw initiation capability to the committed CONTACTED owner", () => {
    const analysis = repositoryAnalysis();

    expect(analysis.violations).toEqual([]);
    expect(analysis.rawCallers).toEqual([OWNER]);
    expect(analysis.productionFiles).toContain("src/app/actions/payment.ts");
    expect(analysis.productionFiles).toContain("src/lib/payment/providers/toss/adapter.ts");
    expect(analysis.productionFiles).toContain("scripts/payment-reconcile.ts");
    expect(analysis.productionFiles).toContain("containers/refund-worker/entrypoint.ts");
  }, 120_000);

  it("freezes the exact live declaration inventory and reviewed ambient declarations", () => {
    const analysis = repositoryAnalysis();
    const policy = repositoryPolicy();

    expect(analysis.declarationFiles).toEqual(["next-env.d.ts"]);
    expect(analysis.productionFiles).toContain("next-env.d.ts");
    expect([...(policy.declarationFileAllowances?.keys() ?? [])]).toEqual(["next-env.d.ts"]);
    expect([...(policy.ambientDeclarationAllowances?.keys() ?? [])]).toEqual([
      "src/lib/auth.ts::module:\"next-auth\"",
      "src/lib/auth.ts::module:\"next-auth\"/interface:User",
      "src/lib/auth.ts::module:\"next-auth\"/interface:Session",
      "src/lib/auth.ts::module:\"next-auth/jwt\"",
      "src/lib/auth.ts::module:\"next-auth/jwt\"/interface:JWT",
      "src/lib/db.ts::global",
      "src/lib/db.ts::global/var:prisma",
    ]);
    expect(analysis.violations).toEqual([]);
  }, 60_000);

  it("excludes repository-root .local-review evidence without concealing genuine source ownership violations", () => {
    const fixture = createArchitectureFixture({
      "raw.ts": "export interface RawProvider { initiate(input: string): Promise<void> }\nexport declare const provider: RawProvider;\n",
      "owner.ts": "import { provider } from './raw';\nexport async function owner() { await provider.initiate('ok'); }\n",
      "src/real-violation.ts": "import { provider } from '../raw';\nexport async function violation() { await provider.initiate('no'); }\n",
      ".local-review/retained-copy.d.ts": "declare global { interface RetainedEvidence { readonly copied: string } }\nexport {};\n",
    }, {
      owner: "owner.ts",
      canonicalCapabilityModule: "raw.ts",
      canonicalCapabilityExport: "RawProvider",
      restrictedModuleTargets: new Set(["raw.ts"]),
      capabilityExportAllowances: new Map([["raw.ts", new Set(["provider"])]]),
      liveRepository: false,
    });
    const discovered = discoverAnalysisSourceFiles(fixture.root)
      .map((path) => normalizedRelative(fixture.root, path));
    const analysis = analyzeProgram(createStrictFixtureProgram(fixture.root), fixture.root, fixture.policy);

    expect(discovered).toEqual(expect.arrayContaining(["owner.ts", "raw.ts", "src/real-violation.ts"]));
    expect(discovered).not.toContain(".local-review/retained-copy.d.ts");
    expect(analysis.productionFiles).toContain("src/real-violation.ts");
    expect(analysis.declarationFiles).toEqual([]);
    expect(analysis.violations).toContain("CALL src/real-violation.ts");
    expect(analysis.violations).not.toEqual(expect.arrayContaining([expect.stringContaining(".local-review/")]));
  }, 30_000);

  it.each(DECLARATION_POLICY_REJECTION_CASES)(
    "rejects declaration-file policy bypass through $name",
    (testCase) => {
      const fixture = createC2hPolicyFixture(testCase);
      const program = createStrictFixtureProgram(fixture.root);
      const diagnostics = fixtureDiagnostics(program);
      const analysis = analyzeProgram(program, fixture.root, fixture.policy);

      expect(diagnostics).toEqual([]);
      for (const violation of testCase.expectedViolations) {
        expect(analysis.violations).toContain(violation);
      }
    },
    30_000,
  );

  it.each(AMBIENT_POLICY_REJECTION_CASES)(
    "rejects ambient/global augmentation through $name",
    (testCase) => {
      const fixture = createC2hPolicyFixture(testCase);
      const program = createStrictFixtureProgram(fixture.root);
      const diagnostics = fixtureDiagnostics(program);
      const analysis = analyzeProgram(program, fixture.root, fixture.policy);

      expect(diagnostics).toEqual([]);
      for (const violation of testCase.expectedViolations) {
        expect(analysis.violations).toContain(violation);
      }
    },
    30_000,
  );

  it("accepts an exact reviewed declaration file with an unrelated module-local type surface", () => {
    const fixture = createC2hPolicyFixture({
      name: "reviewed safe declaration",
      sources: {
        "src/reviewed-safe.d.ts": [
          "export interface PaymentInitiationProviderPreview { readonly label: string }",
          "export type ReviewedBox<Value extends string = string> = Promise<Map<string, Set<Value>>>;",
          "",
        ].join("\n"),
        "src/module-local-safe.ts": [
          "interface LocalPort { initiate(input: string): Promise<void> }",
          "export type LocalWrapper = Promise<Map<string, Set<LocalPort>>>;",
          "",
        ].join("\n"),
      },
      allowedDeclarationFiles: ["src/reviewed-safe.d.ts"],
      expectedViolations: [],
    });
    const program = createStrictFixtureProgram(fixture.root);
    const diagnostics = fixtureDiagnostics(program);
    const analysis = analyzeProgram(program, fixture.root, fixture.policy);

    expect(diagnostics).toEqual([]);
    expect(analysis.declarationFiles).toEqual(["src/reviewed-safe.d.ts"]);
    expect(analysis.violations).toEqual([]);
  }, 30_000);

  it("reproduces the exact C2H auditor bypasses under TypeScript before verifier rejection", () => {
    const fixture = createC2hAuditReproductionFixture();
    const program = createStrictFixtureProgram(fixture.root);
    const diagnostics = fixtureDiagnostics(program);
    const analysis = analyzeProgram(program, fixture.root, fixture.policy);

    expect(diagnostics).toEqual([]);
    expect(analysis.violations).toEqual(expect.arrayContaining([
      "DECLARATION_FILE_NOT_ALLOWLISTED src/lib/payment/payment-leak.d.ts",
      "CAPABILITY_EXPORT src/lib/payment/payment-leak.d.ts:AuditCapabilityLeak",
      "AMBIENT_DECLARATION_NOT_ALLOWLISTED src/lib/payment/ambient-leak.ts::global",
      "AMBIENT_CAPABILITY src/lib/payment/ambient-leak.ts::global/interface:AuditGlobalCapabilityLeak",
      "AMBIENT_BOUNDARY src/lib/payment/attempt/initiate.ts::global",
      "AMBIENT_CAPABILITY src/lib/payment/attempt/initiate.ts::global/interface:AuditGlobalCapabilityLeak",
    ]));
  }, 30_000);

  it("rejects capability bypasses and discovers every supported runtime extension", () => {
    const fixture = createBypassFixture();
    const analysis = analyzeProgram(
      ts.createProgram({
        rootNames: discoverAnalysisSourceFiles(fixture.root),
        options: {
          allowJs: true,
          checkJs: true,
          strict: true,
          noEmit: true,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          target: ts.ScriptTarget.ES2022,
        },
      }),
      fixture.root,
      {
        owner: "owner.ts",
        canonicalCapabilityModule: "raw.ts",
        canonicalCapabilityExport: "RawProvider",
        restrictedModuleTargets: new Set(["raw.ts", "adapter.ts", "resolver.ts"]),
        capabilityExportAllowances: new Map([
          ["raw.ts", new Set(["provider"])],
          ["adapter.ts", new Set(["provider"])],
          ["resolver.ts", new Set(["resolveInitiationProvider"])],
        ]),
        liveRepository: false,
      },
    );

    expect(analysis.rawCallers).toEqual([
      "alias.ts",
      "alternate.cts",
      "barrel-consumer.ts",
      "bracket.ts",
      "callable-consumer.ts",
      "destructure.ts",
      "direct.ts",
      "dynamic.ts",
      "executable/generated/hostile.js",
      "hostile.jsx",
      "hostile.mjs",
      "known-adapter.ts",
      "local-structural.ts",
      "namespace.ts",
      "nested-consumer.ts",
      "owner.ts",
      "promise-consumer.ts",
      "resolver-bypass.ts",
      "src/build/provider-consumer.ts",
      "src/dist/provider-consumer.ts",
      "src/out/provider-consumer.ts",
      "wrapper.ts",
    ]);
    expect(analysis.violations).toEqual(expect.arrayContaining([
      "CALL alias.ts",
      "CALL bracket.ts",
      "CALL destructure.ts",
      "CALL direct.ts",
      "CALL dynamic.ts",
      "CALL local-structural.ts",
      "CALL nested-consumer.ts",
      "CALL promise-consumer.ts",
      "CALL src/build/provider-consumer.ts",
      "CALL src/dist/provider-consumer.ts",
      "CALL src/out/provider-consumer.ts",
      "CALL wrapper.ts",
      "CAPABILITY_EXPORT barrel.ts:hidden",
      "CAPABILITY_EXPORT callable-wrapper.ts:renamedCallable",
      "CAPABILITY_EXPORT capability-shapes.ts:arrayCapability",
      "CAPABILITY_EXPORT capability-shapes.ts:genericCapability",
      "CAPABILITY_EXPORT capability-shapes.ts:intersectionCapability",
      "CAPABILITY_EXPORT capability-shapes.ts:recursiveCapability",
      "CAPABILITY_EXPORT capability-shapes.ts:tupleCapability",
      "CAPABILITY_EXPORT capability-shapes.ts:unionCapability",
      "CAPABILITY_EXPORT nested-wrapper.ts:nestedWrapper",
      "CAPABILITY_EXPORT promise-wrapper.ts:promiseWrapper",
      "DYNAMIC dynamic.ts -> raw.ts",
      "EXPORT reexport.ts -> raw.ts",
      "IMPORT alias.ts -> raw.ts",
      "IMPORT alternate.cts -> raw.ts",
      "IMPORT bracket.ts -> raw.ts",
      "IMPORT callable-wrapper.ts -> raw.ts",
      "IMPORT destructure.ts -> raw.ts",
      "IMPORT direct.ts -> raw.ts",
      "IMPORT executable/generated/hostile.js -> raw.ts",
      "IMPORT hostile.jsx -> raw.ts",
      "IMPORT hostile.mjs -> raw.ts",
      "IMPORT known-adapter.ts -> adapter.ts",
      "IMPORT namespace.ts -> raw.ts",
      "IMPORT resolver-bypass.ts -> resolver.ts",
      "IMPORT wrapper.ts -> raw.ts",
      "REQUIRE alternate.cjs -> raw.ts",
    ]));
    expect(analysis.violations.some((violation) => violation.startsWith("CALL owner.ts"))).toBe(false);
    expect(analysis.productionFiles).toEqual(expect.arrayContaining([
      "alternate.cjs",
      "alternate.cts",
      "executable/generated/hostile.js",
      "hostile.jsx",
      "hostile.mjs",
      "src/build/provider-consumer.ts",
      "src/dist/provider-consumer.ts",
      "src/out/provider-consumer.ts",
    ]));
  });

  it("rejects renamed capability propagation through generic containers without same-shape false positives", () => {
    const fixture = createGenericContainerFixture();
    const program = ts.createProgram({
      rootNames: discoverAnalysisSourceFiles(fixture.root),
      options: {
        strict: true,
        noEmit: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        target: ts.ScriptTarget.ES2022,
      },
    });
    const diagnostics = ts.getPreEmitDiagnostics(program)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    const analysis = analyzeProgram(program, fixture.root, fixture.policy);

    expect(diagnostics).toEqual([]);
    expect(analysis.rawCallers).toEqual([
      "alias-destructure-consumer.ts",
      "array-consumer.ts",
      "async-iterable-consumer.ts",
      "async-iterator-consumer.ts",
      "barrel-consumer.ts",
      "box-consumer.ts",
      "bracket-consumer.ts",
      "callback-consumer.ts",
      "factory-consumer.ts",
      "iterable-consumer.ts",
      "iterator-consumer.ts",
      "map-consumer.ts",
      "nested-consumer.ts",
      "promise-consumer.ts",
      "readonly-consumer.ts",
      "set-consumer.ts",
    ]);
    expect(analysis.violations).toEqual(expect.arrayContaining([
      "CALL alias-destructure-consumer.ts",
      "CALL array-consumer.ts",
      "CALL barrel-consumer.ts",
      "CALL box-consumer.ts",
      "CALL bracket-consumer.ts",
      "CALL callback-consumer.ts",
      "CALL factory-consumer.ts",
      "CALL async-iterable-consumer.ts",
      "CALL async-iterator-consumer.ts",
      "CALL iterable-consumer.ts",
      "CALL iterator-consumer.ts",
      "CALL map-consumer.ts",
      "CALL nested-consumer.ts",
      "CALL promise-consumer.ts",
      "CALL readonly-consumer.ts",
      "CALL set-consumer.ts",
      "CAPABILITY_EXPORT owner.ts:arrayOfMaps",
      "CAPABILITY_EXPORT owner.ts:boxed",
      "CAPABILITY_EXPORT owner.ts:capabilityMap",
      "CAPABILITY_EXPORT owner.ts:capabilitySet",
      "CAPABILITY_EXPORT owner.ts:containers",
      "CAPABILITY_EXPORT owner.ts:nested",
      "CAPABILITY_EXPORT owner.ts:promisedContainers",
      "CAPABILITY_EXPORT owner.ts:readonlyCapabilityMap",
      "CAPABILITY_EXPORT owner.ts:readonlyCapabilitySet",
    ]));
    expect(analysis.rawCallers).not.toContain("unrelated-initiate.ts");
    expect(analysis.rawCallers).not.toContain("unrelated-containers.ts");
    expect(analysis.violations.some((violation) => violation.includes("unrelated-"))).toBe(false);
  }, 30_000);

  it.each(GENERIC_CALL_REJECTION_CASES)(
    "binds actual arguments to formal parameters for $name",
    ({ sources, expectedCaller }) => {
      const fixture = createGenericCallCaseFixture(sources);
      const program = createStrictFixtureProgram(fixture.root);
      const diagnostics = fixtureDiagnostics(program);
      const analysis = analyzeProgram(program, fixture.root, fixture.policy);

      expect(diagnostics).toEqual([]);
      expect(analysis.rawCallers).toContain(expectedCaller);
      expect(analysis.violations).toContain(`CALL ${expectedCaller}`);
    },
    30_000,
  );

  it("freezes the exact owner export surface and rejects capability erasure", () => {
    const cases: readonly {
      name: string;
      ownerSource: string;
      expectedViolation: string;
    }[] = [
      {
        name: "new named export",
        ownerSource: "import { provider } from './raw'; export async function owner() { await provider.initiate('ok'); } export const leak = provider;\n",
        expectedViolation: "OWNER_EXPORT owner.ts:leak",
      },
      {
        name: "default export",
        ownerSource: "import { provider } from './raw'; export async function owner() { await provider.initiate('ok'); } export default provider;\n",
        expectedViolation: "OWNER_DEFAULT_EXPORT owner.ts",
      },
      {
        name: "allowlisted return changed to leak",
        ownerSource: "import { provider } from './raw'; export async function owner() { await provider.initiate('ok'); return provider; }\n",
        expectedViolation: "OWNER_CAPABILITY_EXPORT owner.ts:owner",
      },
      {
        name: "any-based provenance erasure",
        ownerSource: "import { provider } from './raw'; export function owner() { return provider.initiate.bind(provider) as any; }\n",
        expectedViolation: "CAPABILITY_ERASURE owner.ts:owner:assertion",
      },
      {
        name: "star re-export",
        ownerSource: "import { provider } from './raw'; export async function owner() { await provider.initiate('ok'); } export * from './safe';\n",
        expectedViolation: "OWNER_EXPORT_SYNTAX owner.ts",
      },
      {
        name: "re-export alias",
        ownerSource: "import { provider } from './raw'; export async function owner() { await provider.initiate('ok'); } export { safe as alias } from './safe';\n",
        expectedViolation: "OWNER_EXPORT_SYNTAX owner.ts",
      },
      {
        name: "CommonJS export",
        ownerSource: "declare const module: { exports: unknown }; import { provider } from './raw'; export async function owner() { await provider.initiate('ok'); } module.exports = provider;\n",
        expectedViolation: "OWNER_COMMONJS_EXPORT owner.ts",
      },
      {
        name: "namespace-like replacement",
        ownerSource: "import { provider } from './raw'; const run = async () => provider.initiate('ok'); export const owner = { run, leak: provider };\n",
        expectedViolation: "OWNER_EXPORT_KIND owner.ts:owner",
      },
    ];

    for (const testCase of cases) {
      const fixture = createOwnerExportFixture(testCase.ownerSource);
      const program = createStrictFixtureProgram(fixture.root);
      const diagnostics = fixtureDiagnostics(program);
      const analysis = analyzeProgram(program, fixture.root, fixture.policy);
      expect(diagnostics, testCase.name).toEqual([]);
      expect(analysis.violations, testCase.name).toContain(testCase.expectedViolation);
    }
  }, 30_000);

  it("keeps strict synthetic fixtures hermetic from repository ambient types", () => {
    const fixture = createOwnerExportFixture(
      "import { provider } from './raw'; import { safe } from './safe'; export async function owner() { await provider.initiate(safe); }\n",
    );
    const program = createStrictFixtureProgram(fixture.root);
    const sourcePaths = program.getSourceFiles().map(
      (sourceFile) => sourceFile.fileName.split(sep).join("/"),
    );
    expect(fixtureDiagnostics(program)).toEqual([]);
    expect(sourcePaths).toContain(`${fixture.root}/owner.ts`);
    expect(sourcePaths).toContain(`${fixture.root}/raw.ts`);
    expect(sourcePaths).toContain(`${fixture.root}/safe.ts`);
    expect(sourcePaths.some((path) => (
      path.endsWith("/typescript/lib/lib.es2022.full.d.ts")
    ))).toBe(true);
    expect(sourcePaths.filter((path) => (
      path.includes("/node_modules/@types/")
    ))).toEqual([]);
  }, 30_000);

  it.each(OWNER_TYPE_EXPORT_REJECTION_CASES)(
    "rejects owner type-only capability export through $name",
    (testCase) => {
      const fixture = createOwnerTypeExportFixture(testCase);
      const program = createStrictFixtureProgram(fixture.root);
      const diagnostics = fixtureDiagnostics(program);
      const analysis = analyzeProgram(program, fixture.root, fixture.policy);

      expect(diagnostics).toEqual([]);
      expect(analysis.violations).toContain(testCase.expectedViolation);
    },
    30_000,
  );

  it.each(GENERAL_TYPE_EXPORT_REJECTION_CASES)(
    "rejects general production type-only capability export through $name",
    (testCase) => {
      const fixture = createGeneralTypeExportFixture(testCase);
      const program = createStrictFixtureProgram(fixture.root);
      const diagnostics = fixtureDiagnostics(program);
      const analysis = analyzeProgram(program, fixture.root, fixture.policy);

      expect(diagnostics).toEqual([]);
      expect(analysis.violations).toContain(testCase.expectedViolation);
    },
    30_000,
  );

  it("accepts safe type-only owner, provider-contract, generic, and barrel surfaces", () => {
    const fixture = createSafeTypeExportFixture();
    const program = createStrictFixtureProgram(fixture.root);
    const diagnostics = fixtureDiagnostics(program);
    const analysis = analyzeProgram(program, fixture.root, fixture.policy);

    expect(diagnostics).toEqual([]);
    expect(analysis.rawCallers).toEqual(["owner.ts"]);
    expect(analysis.violations).toEqual([]);
  }, 30_000);

  it("accepts unrelated generic values and the unchanged legitimate owner", () => {
    const fixture = createUnrelatedGenericFixture();
    const program = createStrictFixtureProgram(fixture.root);
    const diagnostics = fixtureDiagnostics(program);
    const analysis = analyzeProgram(program, fixture.root, fixture.policy);

    expect(diagnostics).toEqual([]);
    expect(analysis.rawCallers).toEqual(["owner.ts"]);
    expect(analysis.violations).toEqual([]);
  }, 30_000);

  it("proves the removed production test seam cannot be imported", () => {
    const fixture = createRemovedSeamFixture();
    const program = ts.createProgram({
      rootNames: fixture.files,
      options: {
        strict: true,
        noEmit: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        target: ts.ScriptTarget.ES2022,
      },
    });
    const diagnostics = ts.getPreEmitDiagnostics(program)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));

    expect(diagnostics.some((message) => (
      message.includes("no exported member") && message.includes("initiatePaymentAttemptForTest")
    ))).toBe(true);
    expect(diagnostics.some((message) => (
      message.includes("no exported member") && message.includes("PaymentAttemptTestCoordination")
    ))).toBe(true);
    const productionText = readFileSync(join(ROOT, OWNER), "utf8");
    expect(productionText).not.toContain("ForTest");
    expect(productionText).not.toContain("TestCoordination");
  }, 30_000);

  it("makes ESLint reject unauthorized static imports and re-exports", async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "mira-initiation-eslint-"));
    temporaryProjects.push(fixtureRoot);
    copyFileSync(join(ROOT, "eslint.config.mjs"), join(fixtureRoot, "eslint.config.mjs"));
    copyFileSync(join(ROOT, "tsconfig.json"), join(fixtureRoot, "tsconfig.json"));
    symlinkSync(join(ROOT, "node_modules"), join(fixtureRoot, "node_modules"), "dir");
    const fixturePath = join(fixtureRoot, "src/lib/payment/ownership-hostile-fixture.ts");
    mkdirSync(dirname(fixturePath), { recursive: true });
    mkdirSync(join(fixtureRoot, "src/pages"), { recursive: true });
    writeFileSync(fixturePath, [
      "import { resolveInitiationProvider } from '@/lib/payment/providers/initiation';",
      "import { resolveInitiationProvider as hidden } from '@/lib/payment/providers/initiation';",
      "import * as initiation from '@/lib/payment/providers/initiation';",
      "export { resolveInitiationProvider } from '@/lib/payment/providers/initiation';",
      "import type { PaymentInitiationProvider } from '@/lib/payment/providers/types';",
      "import { createInitiationProvider } from '@/lib/payment/providers/factory';",
      "import { createMockPaymentProvider } from '@/lib/payment/providers/mock';",
      "import { createTossSandboxPaymentProvider } from '@/lib/payment/providers/toss/adapter';",
      "import { createMockPaymentInitiationProvider } from '@/lib/payment/providers/mock';",
      "import { differentlyNamedWrapper } from '@/lib/payment/providers/initiation';",
      "void hidden; void initiation; void createInitiationProvider; void createMockPaymentProvider; void createTossSandboxPaymentProvider;",
      "void createMockPaymentInitiationProvider; void differentlyNamedWrapper;",
      "export type HiddenCapability = PaymentInitiationProvider;",
      "",
    ].join("\n"), "utf8");
    const auditPaths: string[] = [];
    for (const [relativePath, source] of Object.entries({
      "src/lib/payment/providers/types.ts": "export interface PaymentInitiationProvider { initiate(input: string): Promise<void> }\n",
      ...C2H_AUDITOR_BYPASS_SOURCES,
    })) {
      const path = join(fixtureRoot, relativePath);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, source, "utf8");
      if (relativePath in C2H_AUDITOR_BYPASS_SOURCES) auditPaths.push(path);
    }
    const eslint = new ESLint({ cwd: fixtureRoot });
    const [result, ...auditResults] = await eslint.lintFiles([fixturePath, ...auditPaths]);
    if (!result) throw new Error("ESLint returned no hostile fixture result");
    const restrictedLines = result.messages
      .filter((message) => message.ruleId === "no-restricted-imports")
      .map((message) => message.line);
    let auditErrorCount = 0;
    for (const auditResult of auditResults) {
      for (const message of auditResult.messages) {
        if (message.severity === 2) auditErrorCount += 1;
      }
    }

    expect(restrictedLines).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(auditErrorCount).toBe(0);
  }, 30_000);

  it("keeps the superseded PRISTINE phase absent from production payment code", () => {
    const analysis = repositoryAnalysis();
    const offenders = analysis.productionFiles
      .filter((path) => path.startsWith("src/lib/payment/") || path.startsWith("src/app/actions/"))
      .filter((path) => readFileSync(join(ROOT, path), "utf8").includes("PRISTINE"));

    expect(offenders).toEqual([]);
  });
});

function repositoryAnalysis(): ArchitectureAnalysis {
  cachedRepositoryAnalysis ??= analyzeProgram(repositoryProgram(), ROOT, repositoryPolicy());
  return cachedRepositoryAnalysis;
}

function repositoryProgram(): ts.Program {
  const configPath = ts.findConfigFile(ROOT, (path) => ts.sys.fileExists(path), "tsconfig.json");
  if (!configPath) throw new Error("Missing tsconfig.json");
  const host: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    },
  };
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, host);
  if (!parsed) throw new Error("Unable to parse tsconfig.json");
  return ts.createProgram({
    rootNames: discoverAnalysisSourceFiles(ROOT),
    options: { ...parsed.options, allowJs: true },
  });
}

function repositoryPolicy(): ArchitecturePolicy {
  return {
    owner: OWNER,
    ownerExportAllowlist: new Map([
      ["PaymentInitiateErrorCode", "type"],
      ["PaymentInitiateException", "class"],
      ["InitiatePaymentAttemptInput", "interface"],
      ["InitiatePaymentAttemptResult", "interface"],
      ["InitiatePaymentAttemptExecution", "type"],
      ["initiatePaymentAttempt", "function"],
      ["initiatePaymentAttemptWithTransientAuthority", "function"],
      // Installed by 88f4e1b: the synthetic-sale wrapper still delegates to this
      // same CONTACTED owner; it neither returns nor exports the raw capability.
      ["initiateSyntheticSalePaymentAttemptWithTransientAuthority", "function"],
    ]),
    canonicalCapabilityModule: PROVIDER_TYPES,
    canonicalCapabilityExport: "PaymentInitiationProvider",
    restrictedModuleTargets: new Set([
      PROVIDER_INITIATION,
      PROVIDER_FACTORY,
      PROVIDER_MOCK,
      TOSS_ADAPTER,
    ]),
    capabilityExportAllowances: new Map([
      [PROVIDER_TYPES, new Set(["PaymentProvider"])],
      [PROVIDER_CONTRACT, new Set([
        "ProviderAdapterFactory",
        "ProviderPaymentAdapter",
      ])],
      [PROVIDER_INITIATION, new Set(["resolveInitiationProvider"])],
      [PROVIDER_FACTORY, new Set([
        "CreateInitiationProviderOptions",
        "createInitiationProvider",
      ])],
      [PROVIDER_MOCK, new Set([
        "createMockPaymentProvider",
        "createMockPaymentInitiationProvider",
      ])],
      [TOSS_ADAPTER, new Set(["createTossSandboxPaymentProvider"])],
    ]),
    declarationFileAllowances: new Map([
      ["next-env.d.ts", {
        role: "Next.js generated TypeScript environment references",
        reason: "The root tsconfig includes this framework-owned declaration entrypoint.",
      }],
    ]),
    ambientDeclarationAllowances: new Map([
      ["src/lib/auth.ts::module:\"next-auth\"", {
        role: "NextAuth session and user module augmentation",
        reason: "NextAuth callbacks and session consumers require the application id and role fields.",
      }],
      ["src/lib/auth.ts::module:\"next-auth\"/interface:User", {
        role: "NextAuth user role augmentation",
        reason: "The authenticated database user role is copied into the JWT and session.",
      }],
      ["src/lib/auth.ts::module:\"next-auth\"/interface:Session", {
        role: "NextAuth session identity augmentation",
        reason: "Application sessions expose the authenticated user id and optional role.",
      }],
      ["src/lib/auth.ts::module:\"next-auth/jwt\"", {
        role: "NextAuth JWT module augmentation",
        reason: "The JWT callback persists the application user id and optional role.",
      }],
      ["src/lib/auth.ts::module:\"next-auth/jwt\"/interface:JWT", {
        role: "NextAuth JWT identity fields",
        reason: "The session callback reads the persisted id and role from the JWT.",
      }],
      ["src/lib/db.ts::global", {
        role: "development Prisma client global augmentation",
        reason: "The development singleton survives Next.js module reloads without opening duplicate pools.",
      }],
      ["src/lib/db.ts::global/var:prisma", {
        role: "development Prisma client cache slot",
        reason: "The exact globalThis slot stores only the application PrismaClient singleton.",
      }],
    ]),
    liveRepository: true,
  };
}

function discoverRuntimeSourceFiles(directory: string): string[] {
  return discoverRuntimeSourceFilesFrom(directory, directory);
}

function discoverAnalysisSourceFiles(directory: string): string[] {
  return [...new Set([
    ...discoverRuntimeSourceFiles(directory),
    ...discoverDeclarationSourceFiles(directory),
  ])];
}

function discoverDeclarationSourceFiles(directory: string): string[] {
  return discoverDeclarationSourceFilesFrom(directory, directory);
}

function discoverDeclarationSourceFilesFrom(root: string, directory: string): string[] {
  const discovered: string[] = [];
  for (const entry of readdirSync(directory).sort((left, right) => left.localeCompare(right))) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (!excludedRepositoryDirectory(root, path)) {
        discovered.push(...discoverDeclarationSourceFilesFrom(root, path));
      }
      continue;
    }
    if (isDeclarationSourcePath(path)) discovered.push(path);
  }
  return discovered;
}

function discoverRuntimeSourceFilesFrom(root: string, directory: string): string[] {
  const discovered: string[] = [];
  for (const entry of readdirSync(directory).sort((left, right) => left.localeCompare(right))) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (!excludedProductionDirectory(root, path)) {
        discovered.push(...discoverRuntimeSourceFilesFrom(root, path));
      }
      continue;
    }
    if (isRuntimeSourcePath(path) && !isNonProductionFile(path)) discovered.push(path);
  }
  return discovered;
}

function excludedProductionDirectory(root: string, path: string): boolean {
  const relativePath = normalizedRelative(root, path);
  if (relativePath.split("/").includes("__tests__")) return true;
  return excludedRepositoryDirectory(root, path);
}

function excludedRepositoryDirectory(root: string, path: string): boolean {
  const relativePath = normalizedRelative(root, path);
  return new Set([
    ".git",
    ".next",
    ".local-review",
    "node_modules",
    "coverage",
    "dist",
    "build",
    "out",
  ]).has(relativePath);
}

function isRuntimeSourcePath(path: string): boolean {
  return RUNTIME_EXTENSIONS.has(extname(path));
}

function isDeclarationSourcePath(path: string): boolean {
  return DECLARATION_FILE_PATTERN.test(path.split(sep).join("/"));
}

function isNonProductionFile(path: string): boolean {
  const normalized = path.split(sep).join("/");
  return isDeclarationSourcePath(normalized)
    || /\.(?:test|spec)(?:\.[^.]+)?\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(normalized);
}

function analyzeProgram(program: ts.Program, root: string, policy: ArchitecturePolicy): ArchitectureAnalysis {
  const checker = program.getTypeChecker();
  const canonicalInitiate = canonicalInitiateType(program, checker, root, policy);
  const declarationFiles = discoverDeclarationSourceFiles(root)
    .map((path) => normalizedRelative(root, path));
  const declarationFileSet = new Set(declarationFiles);
  const production = program.getSourceFiles()
    .filter((sourceFile) => isProductionSource(sourceFile, root, declarationFileSet))
    .sort((left, right) => sourcePath(left, root).localeCompare(sourcePath(right, root)));
  const trace = createCapabilityTrace(program, checker, canonicalInitiate);
  const rawCallers = new Set<string>();
  const violations = new Set<string>();
  const seenAmbientAllowances = new Set<string>();

  for (const sourceFile of production) {
    const importer = sourcePath(sourceFile, root);
    inspectDeclarationFilePolicy(
      sourceFile,
      importer,
      root,
      program,
      trace,
      policy,
      violations,
    );
    inspectAmbientDeclarationPolicy(
      sourceFile,
      importer,
      trace,
      policy,
      seenAmbientAllowances,
      violations,
    );
    inspectNode(
      sourceFile,
      sourceFile,
      importer,
      root,
      program,
      checker,
      trace,
      policy,
      rawCallers,
      violations,
    );
    inspectCapabilityExports(sourceFile, importer, trace, policy, violations);
    inspectOwnerExportSurface(sourceFile, importer, trace, policy, violations);
    inspectCapabilityBoundaryErasure(sourceFile, importer, trace, policy, violations);
  }
  inspectStalePolicyAllowances(declarationFileSet, seenAmbientAllowances, policy, violations);

  return {
    rawCallers: [...rawCallers].sort((left, right) => left.localeCompare(right)),
    violations: [...violations].sort((left, right) => left.localeCompare(right)),
    productionFiles: production.map((sourceFile) => sourcePath(sourceFile, root)),
    declarationFiles,
  };
}

// C2H termination boundary: repository declaration files and ambient/module/global
// augmentations fail closed through exact policy entries, and every allowed surface
// is still capability-scanned. Arbitrary eval, runtime code generation, and
// nonliteral dynamic loading remain convention-owned residuals; this verifier is
// intentionally not a general-purpose JavaScript/TypeScript security analyzer.
function inspectDeclarationFilePolicy(
  sourceFile: ts.SourceFile,
  importer: string,
  root: string,
  program: ts.Program,
  trace: CapabilityTrace,
  policy: ArchitecturePolicy,
  violations: Set<string>,
): void {
  if (!isDeclarationSourcePath(importer)) return;
  const allowance = policy.declarationFileAllowances?.get(importer);
  if (!allowance) violations.add(`DECLARATION_FILE_NOT_ALLOWLISTED ${importer}`);
  if (allowance && !validPolicyAllowance(allowance)) {
    violations.add(`DECLARATION_FILE_ALLOWLIST_INVALID ${importer}`);
  }
  inspectDeclarationCapabilityReferences(sourceFile, importer, root, program, trace, policy, violations);
}

function inspectDeclarationCapabilityReferences(
  sourceFile: ts.SourceFile,
  importer: string,
  root: string,
  program: ts.Program,
  trace: CapabilityTrace,
  policy: ArchitecturePolicy,
  violations: Set<string>,
): void {
  const visit = (node: ts.Node): void => {
    if (declarationImportsCanonicalCapability(node, sourceFile, root, program, policy)) {
      violations.add(`DECLARATION_CAPABILITY_IMPORT ${importer}:${policy.canonicalCapabilityExport}`);
    }
    if (declarationReexportsCanonicalCapability(node, sourceFile, root, program, policy)) {
      violations.add(`DECLARATION_CAPABILITY_REEXPORT ${importer}:${policy.canonicalCapabilityExport}`);
    }
    if (ts.isImportTypeNode(node) && typeExposesInitiation(
      trace.checker.getTypeFromTypeNode(node),
      trace,
      0,
    )) {
      violations.add(`DECLARATION_CAPABILITY_IMPORT ${importer}:${policy.canonicalCapabilityExport}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function declarationImportsCanonicalCapability(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  root: string,
  program: ts.Program,
  policy: ArchitecturePolicy,
): boolean {
  if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return false;
  const target = resolvedModulePath(node.moduleSpecifier.text, sourceFile, root, program);
  return target === policy.canonicalCapabilityModule
    && importsName(node, [policy.canonicalCapabilityExport]);
}

function declarationReexportsCanonicalCapability(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  root: string,
  program: ts.Program,
  policy: ArchitecturePolicy,
): boolean {
  if (!ts.isExportDeclaration(node) || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) {
    return false;
  }
  const target = resolvedModulePath(node.moduleSpecifier.text, sourceFile, root, program);
  return target === policy.canonicalCapabilityModule
    && exportIncludesName(node, policy.canonicalCapabilityExport);
}

function exportIncludesName(declaration: ts.ExportDeclaration, name: string): boolean {
  if (!declaration.exportClause || ts.isNamespaceExport(declaration.exportClause)) return true;
  return declaration.exportClause.elements.some((element) => (
    (element.propertyName ?? element.name).text === name
  ));
}

function inspectAmbientDeclarationPolicy(
  sourceFile: ts.SourceFile,
  importer: string,
  trace: CapabilityTrace,
  policy: ArchitecturePolicy,
  seenAllowances: Set<string>,
  violations: Set<string>,
): void {
  for (const subject of ambientDeclarationSubjects(sourceFile)) {
    const key = `${importer}::${subject.identity}`;
    if (ambientDeclarationsForbiddenAtBoundary(importer, policy)) {
      violations.add(`AMBIENT_BOUNDARY ${key}`);
    }
    const allowance = policy.ambientDeclarationAllowances?.get(key);
    if (!allowance) {
      violations.add(`AMBIENT_DECLARATION_NOT_ALLOWLISTED ${key}`);
    } else if (seenAllowances.has(key)) {
      violations.add(`AMBIENT_DECLARATION_DUPLICATE ${key}`);
    } else {
      seenAllowances.add(key);
      if (!validPolicyAllowance(allowance)) violations.add(`AMBIENT_ALLOWLIST_INVALID ${key}`);
    }
    if (nodeTypeSurfaceExposesInitiation(subject.node, trace)) {
      violations.add(`AMBIENT_CAPABILITY ${key}`);
    }
  }
}

function ambientDeclarationsForbiddenAtBoundary(importer: string, policy: ArchitecturePolicy): boolean {
  return importer === policy.owner || importer.startsWith("src/lib/payment/providers/");
}

function ambientDeclarationSubjects(sourceFile: ts.SourceFile): AmbientDeclarationSubject[] {
  const subjects: AmbientDeclarationSubject[] = [];
  const visit = (node: ts.Node, scope: readonly string[], ambientScope: boolean): void => {
    if (ts.isNamespaceExportDeclaration(node)) {
      subjects.push({ identity: `global-namespace-export:${node.name.text}`, node });
      return;
    }
    if (ts.isModuleDeclaration(node) && governedAmbientModule(node, sourceFile, ambientScope)) {
      const nextScope = [...scope, ambientModuleSegment(node)];
      subjects.push({ identity: nextScope.join("/"), node });
      ts.forEachChild(node, (child) => visit(child, nextScope, true));
      return;
    }
    const leaf = ambientLeafSegment(node, sourceFile, ambientScope);
    if (leaf) subjects.push({ identity: [...scopeForLeaf(scope), leaf].join("/"), node });
    ts.forEachChild(node, (child) => visit(child, scope, ambientScope));
  };
  visit(sourceFile, [], false);
  return subjects;
}

function governedAmbientModule(
  node: ts.ModuleDeclaration,
  sourceFile: ts.SourceFile,
  ambientScope: boolean,
): boolean {
  if (ambientScope || ts.isStringLiteral(node.name)) {
    return true;
  }
  if (hasDeclareModifier(node)) return true;
  return !ts.isExternalModule(sourceFile) && node.parent === sourceFile;
}

function ambientModuleSegment(node: ts.ModuleDeclaration): string {
  if ((node.flags & ts.NodeFlags.GlobalAugmentation) !== 0) return "global";
  if (ts.isStringLiteral(node.name)) return `module:${JSON.stringify(node.name.text)}`;
  return `namespace:${node.name.text}`;
}

function ambientLeafSegment(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  ambientScope: boolean,
): string | null {
  if (!ambientScope && !globalAmbientLeaf(node, sourceFile)) return null;
  return ambientTypeLeafSegment(node) ?? ambientValueLeafSegment(node, sourceFile);
}

function ambientTypeLeafSegment(node: ts.Node): string | null {
  if (ts.isInterfaceDeclaration(node)) return `interface:${node.name.text}`;
  if (ts.isTypeAliasDeclaration(node)) return `type:${node.name.text}`;
  if (ts.isClassDeclaration(node)) return `class:${node.name?.text ?? "<anonymous>"}`;
  if (ts.isEnumDeclaration(node)) return `enum:${node.name.text}`;
  return null;
}

function ambientValueLeafSegment(node: ts.Node, sourceFile: ts.SourceFile): string | null {
  if (ts.isFunctionDeclaration(node)) return `function:${node.name?.text ?? "<anonymous>"}`;
  if (ts.isVariableStatement(node)) return `var:${variableStatementNames(node, sourceFile).join(",")}`;
  return null;
}

function globalAmbientLeaf(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  if (ts.isExternalModule(sourceFile) || node.parent !== sourceFile) return false;
  if (sourceFile.isDeclarationFile || hasDeclareModifier(node)) return true;
  return ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node);
}

function hasDeclareModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    && (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword) ?? false);
}

function variableStatementNames(node: ts.VariableStatement, sourceFile: ts.SourceFile): string[] {
  return node.declarationList.declarations
    .map((declaration) => declaration.name.getText(sourceFile))
    .sort((left, right) => left.localeCompare(right));
}

function scopeForLeaf(scope: readonly string[]): readonly string[] {
  return scope.length > 0 ? scope : ["global"];
}

function nodeTypeSurfaceExposesInitiation(node: ts.Node, trace: CapabilityTrace): boolean {
  let exposes = false;
  const visit = (candidate: ts.Node): void => {
    if (exposes) return;
    if (ts.isTypeNode(candidate) && typeExposesInitiation(
      trace.checker.getTypeFromTypeNode(candidate),
      trace,
      0,
    )) {
      exposes = true;
      return;
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return exposes;
}

function inspectStalePolicyAllowances(
  declarationFiles: ReadonlySet<string>,
  seenAmbientAllowances: ReadonlySet<string>,
  policy: ArchitecturePolicy,
  violations: Set<string>,
): void {
  inspectStaleDeclarationAllowances(declarationFiles, policy, violations);
  inspectStaleAmbientAllowances(seenAmbientAllowances, policy, violations);
}

function inspectStaleDeclarationAllowances(
  declarationFiles: ReadonlySet<string>,
  policy: ArchitecturePolicy,
  violations: Set<string>,
): void {
  for (const [path, allowance] of policy.declarationFileAllowances ?? []) {
    if (!exactNormalizedRepositoryPath(path) || !validPolicyAllowance(allowance)) {
      violations.add(`DECLARATION_FILE_ALLOWLIST_INVALID ${path}`);
    }
    if (!declarationFiles.has(path)) violations.add(`DECLARATION_FILE_ALLOWLIST_STALE ${path}`);
  }
}

function inspectStaleAmbientAllowances(
  seenAmbientAllowances: ReadonlySet<string>,
  policy: ArchitecturePolicy,
  violations: Set<string>,
): void {
  for (const [key, allowance] of policy.ambientDeclarationAllowances ?? []) {
    if (!exactAmbientAllowanceKey(key) || !validPolicyAllowance(allowance)) {
      violations.add(`AMBIENT_ALLOWLIST_INVALID ${key}`);
    }
    if (!seenAmbientAllowances.has(key)) violations.add(`AMBIENT_ALLOWLIST_STALE ${key}`);
  }
}

function exactNormalizedRepositoryPath(path: string): boolean {
  if (path.length === 0 || path.startsWith("/") || path.includes("\\") || path.includes("*")) return false;
  return !path.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

function exactAmbientAllowanceKey(key: string): boolean {
  const separatorIndex = key.indexOf("::");
  if (separatorIndex <= 0 || separatorIndex === key.length - 2) return false;
  return exactNormalizedRepositoryPath(key.slice(0, separatorIndex));
}

function validPolicyAllowance(allowance: PolicyAllowance): boolean {
  return allowance.role.trim().length > 0 && allowance.reason.trim().length > 0;
}

function inspectOwnerExportSurface(
  sourceFile: ts.SourceFile,
  importer: string,
  trace: CapabilityTrace,
  policy: ArchitecturePolicy,
  violations: Set<string>,
): void {
  const allowlist = policy.ownerExportAllowlist;
  if (importer !== policy.owner || !allowlist) return;
  const moduleSymbol = trace.checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) throw new Error(`Missing owner module symbol: ${importer}`);
  const exports = trace.checker.getExportsOfModule(moduleSymbol);
  const actualNames = new Set(exports.map((symbol) => symbol.name));
  for (const name of actualNames) {
    if (!allowlist.has(name)) violations.add(`OWNER_EXPORT ${importer}:${name}`);
  }
  for (const [name, kind] of allowlist) {
    inspectAllowedOwnerExport(exports, name, kind, importer, trace, violations);
  }
  inspectOwnerExportSyntax(sourceFile, importer, violations);
}

function inspectAllowedOwnerExport(
  exports: readonly ts.Symbol[],
  name: string,
  kind: OwnerExportKind,
  importer: string,
  trace: CapabilityTrace,
  violations: Set<string>,
): void {
  const exported = exports.find((symbol) => symbol.name === name);
  if (!exported) {
    violations.add(`OWNER_EXPORT_MISSING ${importer}:${name}`);
    return;
  }
  const resolved = resolveAlias(exported, trace.checker);
  if (!resolved.declarations?.some((declaration) => ownerExportKind(declaration) === kind)) {
    violations.add(`OWNER_EXPORT_KIND ${importer}:${name}`);
  }
  if (exportExposesInitiation(resolved, trace)) {
    violations.add(`OWNER_CAPABILITY_EXPORT ${importer}:${name}`);
  }
}

function ownerExportKind(declaration: ts.Declaration): OwnerExportKind | null {
  if (ts.isClassDeclaration(declaration)) return "class";
  if (ts.isFunctionDeclaration(declaration)) return "function";
  if (ts.isInterfaceDeclaration(declaration)) return "interface";
  return ts.isTypeAliasDeclaration(declaration) ? "type" : null;
}

function inspectOwnerExportSyntax(
  sourceFile: ts.SourceFile,
  importer: string,
  violations: Set<string>,
): void {
  const visit = (node: ts.Node): void => {
    if (ts.isExportDeclaration(node)) violations.add(`OWNER_EXPORT_SYNTAX ${importer}`);
    if (ts.isExportAssignment(node)) violations.add(`OWNER_DEFAULT_EXPORT ${importer}`);
    if (isCommonJsExport(node)) violations.add(`OWNER_COMMONJS_EXPORT ${importer}`);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function isCommonJsExport(node: ts.Node): boolean {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false;
  return isCommonJsExportTarget(node.left);
}

function isCommonJsExportTarget(node: ts.Expression): boolean {
  if (ts.isIdentifier(node)) return node.text === "exports";
  if (ts.isPropertyAccessExpression(node)) {
    if (ts.isIdentifier(node.expression) && node.expression.text === "module") {
      return node.name.text === "exports";
    }
    return isCommonJsExportTarget(node.expression);
  }
  return ts.isElementAccessExpression(node) && isCommonJsExportTarget(node.expression);
}

function inspectCapabilityBoundaryErasure(
  sourceFile: ts.SourceFile,
  importer: string,
  trace: CapabilityTrace,
  policy: ArchitecturePolicy,
  violations: Set<string>,
): void {
  const boundaryNames = capabilityBoundaryNames(importer, policy);
  if (!boundaryNames || boundaryNames.size === 0) return;
  const moduleSymbol = trace.checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return;
  for (const exported of trace.checker.getExportsOfModule(moduleSymbol)) {
    if (!boundaryNames.has(exported.name)) continue;
    const resolved = resolveAlias(exported, trace.checker);
    for (const declaration of resolved.declarations ?? []) {
      inspectErasureNode(declaration, importer, exported.name, trace, violations);
    }
  }
}

function capabilityBoundaryNames(
  importer: string,
  policy: ArchitecturePolicy,
): ReadonlySet<string> | undefined {
  if (importer !== policy.owner) return policy.capabilityExportAllowances.get(importer);
  return new Set(policy.ownerExportAllowlist?.keys() ?? []);
}

function inspectErasureNode(
  declaration: ts.Declaration,
  importer: string,
  exportName: string,
  trace: CapabilityTrace,
  violations: Set<string>,
): void {
  const sourceText = declaration.getFullText();
  if (/@ts-(?:ignore|expect-error)|eslint-disable/.test(sourceText)) {
    violations.add(`CAPABILITY_ERASURE ${importer}:${exportName}:suppression`);
  }
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.AnyKeyword || node.kind === ts.SyntaxKind.UnknownKeyword) {
      violations.add(`CAPABILITY_ERASURE ${importer}:${exportName}:unsafe-type`);
    }
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      const asserted = trace.checker.getTypeFromTypeNode(node.type);
      const unsafeType = (asserted.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
      const doubleAssertion = ts.isAsExpression(node.expression)
        || ts.isTypeAssertionExpression(node.expression);
      const erasedCapability = expressionContainsInitiation(node.expression, trace, 0)
        && !typeExposesInitiation(asserted, trace, 0);
      if (unsafeType || doubleAssertion || erasedCapability) {
        violations.add(`CAPABILITY_ERASURE ${importer}:${exportName}:assertion`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(declaration);
}

function inspectNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  importer: string,
  root: string,
  program: ts.Program,
  checker: ts.TypeChecker,
  trace: CapabilityTrace,
  policy: ArchitecturePolicy,
  rawCallers: Set<string>,
  violations: Set<string>,
): void {
  inspectRawCall(node, importer, trace, policy, rawCallers, violations);
  inspectStaticImport(node, sourceFile, importer, root, program, checker, policy, violations);
  inspectStaticExport(node, sourceFile, importer, root, program, policy, violations);
  inspectDynamicImport(node, sourceFile, importer, root, program, policy, violations);
  inspectCommonJsRequire(node, sourceFile, importer, root, program, policy, violations);
  ts.forEachChild(node, (child) => {
    inspectNode(
      child,
      sourceFile,
      importer,
      root,
      program,
      checker,
      trace,
      policy,
      rawCallers,
      violations,
    );
  });
}

function inspectRawCall(
  node: ts.Node,
  importer: string,
  trace: CapabilityTrace,
  policy: ArchitecturePolicy,
  rawCallers: Set<string>,
  violations: Set<string>,
): void {
  if (!ts.isCallExpression(node) || !isRawInitiationCall(node, trace)) return;
  rawCallers.add(importer);
  if (importer !== policy.owner) violations.add(`CALL ${importer}`);
}

function inspectStaticImport(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  importer: string,
  root: string,
  program: ts.Program,
  checker: ts.TypeChecker,
  policy: ArchitecturePolicy,
  violations: Set<string>,
): void {
  if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return;
  const target = resolvedModulePath(node.moduleSpecifier.text, sourceFile, root, program);
  if (target && importViolates(node, importer, target, checker, policy)) {
    violations.add(`IMPORT ${importer} -> ${target}`);
  }
}

function inspectStaticExport(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  importer: string,
  root: string,
  program: ts.Program,
  policy: ArchitecturePolicy,
  violations: Set<string>,
): void {
  if (!ts.isExportDeclaration(node) || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) return;
  const target = resolvedModulePath(node.moduleSpecifier.text, sourceFile, root, program);
  if (target && exportViolates(node, importer, target, policy)) {
    violations.add(`EXPORT ${importer} -> ${target}`);
  }
}

function inspectDynamicImport(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  importer: string,
  root: string,
  program: ts.Program,
  policy: ArchitecturePolicy,
  violations: Set<string>,
): void {
  if (!isDynamicImport(node)) return;
  const argument = node.arguments[0];
  if (!argument || !ts.isStringLiteral(argument)) return;
  const target = resolvedModulePath(argument.text, sourceFile, root, program);
  if (target && restrictedTarget(target, policy) && importer !== policy.owner) {
    violations.add(`DYNAMIC ${importer} -> ${target}`);
  }
}

function inspectCommonJsRequire(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  importer: string,
  root: string,
  program: ts.Program,
  policy: ArchitecturePolicy,
  violations: Set<string>,
): void {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== "require") return;
  const argument = node.arguments[0];
  if (!argument || !ts.isStringLiteral(argument)) return;
  const target = resolvedModulePath(argument.text, sourceFile, root, program);
  if (target && restrictedTarget(target, policy) && importer !== policy.owner) {
    violations.add(`REQUIRE ${importer} -> ${target}`);
  }
}

function isRawInitiationCall(
  node: ts.CallExpression,
  trace: CapabilityTrace,
): boolean {
  return expressionIsInitiationCallable(node.expression, trace, 0);
}

function importViolates(
  declaration: ts.ImportDeclaration,
  importer: string,
  target: string,
  checker: ts.TypeChecker,
  policy: ArchitecturePolicy,
): boolean {
  if (policy.restrictedModuleTargets.has(target)) {
    if (!policy.liveRepository) return importer !== policy.owner;
    return restrictedLiveImport(declaration, importer, target);
  }
  if (target === PROVIDER_TYPES && importsName(declaration, ["PaymentInitiationProvider", "PaymentProvider"])) {
    return importer !== policy.owner && !isProviderInfrastructure(importer);
  }
  if (target === PROVIDER_CONTRACT && importsName(declaration, ["ProviderPaymentAdapter"])) {
    return !isProviderInfrastructure(importer);
  }
  return false;
}

function restrictedLiveImport(declaration: ts.ImportDeclaration, importer: string, target: string): boolean {
  if (target === PROVIDER_INITIATION) {
    return importsName(declaration, ["resolveInitiationProvider"]) && importer !== OWNER;
  }
  if (target === PROVIDER_FACTORY) {
    return importsName(declaration, ["createInitiationProvider"]) && importer !== PROVIDER_INITIATION;
  }
  if (target === PROVIDER_MOCK) return restrictedMockImport(declaration, importer);
  if (target === TOSS_ADAPTER) return restrictedTossImport(declaration, importer);
  return true;
}

function restrictedMockImport(declaration: ts.ImportDeclaration, importer: string): boolean {
  if (importsName(declaration, ["createMockPaymentProvider"])) return true;
  return importsName(declaration, ["createMockPaymentInitiationProvider"]) && importer !== PROVIDER_FACTORY;
}

function restrictedTossImport(declaration: ts.ImportDeclaration, importer: string): boolean {
  void importer;
  return importsName(declaration, ["createTossSandboxPaymentProvider"]);
}

function exportViolates(
  declaration: ts.ExportDeclaration,
  importer: string,
  target: string,
  policy: ArchitecturePolicy,
): boolean {
  if (!restrictedTarget(target, policy)) return false;
  if (importer === policy.owner) return false;
  if (!policy.liveRepository) return true;
  if (!declaration.exportClause) return true;
  if (!ts.isNamedExports(declaration.exportClause)) return true;
  return declaration.exportClause.elements.some((element) => (
    [
      "resolveInitiationProvider",
      "createInitiationProvider",
      "createMockPaymentProvider",
      "createMockPaymentInitiationProvider",
      "createTossSandboxPaymentProvider",
    ]
      .includes((element.propertyName ?? element.name).text)
  ));
}

function importsName(declaration: ts.ImportDeclaration, names: readonly string[]): boolean {
  const clause = declaration.importClause;
  if (!clause) return true;
  if (clause.name && names.includes("default")) return true;
  if (!clause.namedBindings) return false;
  if (ts.isNamespaceImport(clause.namedBindings)) return true;
  return clause.namedBindings.elements.some((element) => names.includes((element.propertyName ?? element.name).text));
}

function inspectCapabilityExports(
  sourceFile: ts.SourceFile,
  importer: string,
  trace: CapabilityTrace,
  policy: ArchitecturePolicy,
  violations: Set<string>,
): void {
  const { checker } = trace;
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return;
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const resolved = resolveAlias(exported, checker);
    if (capabilityExportAuthorized(sourceFile, importer, exported, resolved, policy)) continue;
    if (exportExposesInitiation(resolved, trace)) {
      violations.add(`CAPABILITY_EXPORT ${importer}:${exported.name}`);
    }
  }
}

function capabilityExportAuthorized(
  sourceFile: ts.SourceFile,
  importer: string,
  exported: ts.Symbol,
  resolved: ts.Symbol,
  policy: ArchitecturePolicy,
): boolean {
  const canonical = importer === policy.canonicalCapabilityModule
    && exported.name === policy.canonicalCapabilityExport;
  const explicit = policy.capabilityExportAllowances.get(importer)?.has(exported.name) ?? false;
  if (!canonical && !explicit) return false;
  return resolved.declarations?.some((declaration) => declaration.getSourceFile() === sourceFile) ?? false;
}

function exportExposesInitiation(
  symbol: ts.Symbol,
  trace: CapabilityTrace,
): boolean {
  const resolved = resolveAlias(symbol, trace.checker);
  if (trace.exportSymbolActive.has(resolved)) return false;
  trace.exportSymbolActive.add(resolved);
  try {
    const declared = trace.checker.getDeclaredTypeOfSymbol(resolved);
    if (typeExposesInitiation(declared, trace, 0)) return true;
    if (typeOnlyDeclarationsExposeInitiation(resolved.declarations ?? [], trace)) return true;
    if ((resolved.flags & ts.SymbolFlags.Module) !== 0 && moduleExportsInitiation(resolved, trace)) {
      return true;
    }
    return (resolved.flags & ts.SymbolFlags.Value) !== 0
      && symbolContainsInitiation(resolved, trace, 0);
  } finally {
    trace.exportSymbolActive.delete(resolved);
  }
}

function typeOnlyDeclarationsExposeInitiation(
  declarations: readonly ts.Declaration[],
  trace: CapabilityTrace,
): boolean {
  return declarations.some((declaration) => {
    if (!ts.isInterfaceDeclaration(declaration) && !ts.isTypeAliasDeclaration(declaration)) {
      return false;
    }
    return declarationTypeNodes(declaration).some((node) => (
      typeExposesInitiation(trace.checker.getTypeFromTypeNode(node), trace, 0)
    ));
  });
}

function declarationTypeNodes(declaration: ts.InterfaceDeclaration | ts.TypeAliasDeclaration): ts.TypeNode[] {
  const nodes: ts.TypeNode[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node)) nodes.push(node);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(declaration, visit);
  return nodes;
}

function moduleExportsInitiation(symbol: ts.Symbol, trace: CapabilityTrace): boolean {
  return trace.checker.getExportsOfModule(symbol).some((nested) => (
    exportExposesInitiation(resolveAlias(nested, trace.checker), trace)
  ));
}

function canonicalInitiateType(
  program: ts.Program,
  checker: ts.TypeChecker,
  root: string,
  policy: ArchitecturePolicy,
): ts.Type {
  const sourceFile = program.getSourceFiles().find((candidate) => (
    sourcePath(candidate, root) === policy.canonicalCapabilityModule
  ));
  if (!sourceFile) throw new Error("Missing canonical initiation capability module");
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) throw new Error("Missing canonical initiation capability module symbol");
  const exported = checker.getExportsOfModule(moduleSymbol)
    .find((candidate) => candidate.name === policy.canonicalCapabilityExport);
  if (!exported) throw new Error("Missing canonical initiation capability export");
  const capability = checker.getDeclaredTypeOfSymbol(resolveAlias(exported, checker));
  const initiate = capability.getProperty("initiate");
  const declaration = initiate?.valueDeclaration ?? initiate?.declarations?.[0];
  if (!initiate || !declaration) throw new Error("Canonical capability has no initiate declaration");
  return checker.getTypeOfSymbolAtLocation(initiate, declaration);
}

function resolveAlias(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  return (symbol.flags & ts.SymbolFlags.Alias) === 0 ? symbol : checker.getAliasedSymbol(symbol);
}

function resolveValueSymbol(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  const resolved = resolveAlias(symbol, checker);
  const declaration = resolved.valueDeclaration;
  if (!declaration || !ts.isShorthandPropertyAssignment(declaration)) return resolved;
  const value = checker.getShorthandAssignmentValueSymbol(declaration);
  return value ? resolveAlias(value, checker) : resolved;
}

function createCapabilityTrace(
  program: ts.Program,
  checker: ts.TypeChecker,
  canonicalInitiate: ts.Type,
): CapabilityTrace {
  const assignedSources = new Map<ts.Symbol, ts.Expression[]>();
  const collectionSources = new Map<ts.Symbol, ts.Expression[]>();
  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.isDeclarationFile) {
      indexCapabilityFlow(sourceFile, checker, assignedSources, collectionSources);
    }
  }
  return {
    checker,
    canonicalInitiate,
    assignedSources,
    collectionSources,
    callableActive: new Set(),
    callResultActive: new Set(),
    collectionActive: new Set(),
    containmentActive: new Set(),
    exportSymbolActive: new Set(),
    sourceSymbolActive: new Set(),
    symbolCallableActive: new Set(),
    symbolContainmentActive: new Set(),
    typeActive: new Set(),
    typeSymbolActive: new Set(),
    typeMemo: new Map(),
    currentEnvironment: null,
    nextEnvironmentId: 1,
    nodeIds: new WeakMap(),
    nextNodeId: 1,
    symbolIds: new Map(),
    nextSymbolId: 1,
    callEnvironmentActive: new Set(),
  };
}

function indexCapabilityFlow(
  node: ts.Node,
  checker: ts.TypeChecker,
  assignedSources: Map<ts.Symbol, ts.Expression[]>,
  collectionSources: Map<ts.Symbol, ts.Expression[]>,
): void {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    addExpressionSource(assignedSources, expressionRootSymbol(node.left, checker), node.right);
  }
  if (ts.isCallExpression(node)) {
    indexCollectionMutation(node, checker, collectionSources);
  }
  ts.forEachChild(node, (child) => {
    indexCapabilityFlow(child, checker, assignedSources, collectionSources);
  });
}

function indexCollectionMutation(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
  collectionSources: Map<ts.Symbol, ts.Expression[]>,
): void {
  const member = accessedMember(call.expression);
  if (!member) return;
  const symbol = expressionRootSymbol(member.receiver, checker);
  if (!symbol) return;
  if (member.name === "set") {
    addExpressionSource(collectionSources, symbol, call.arguments[1]);
    return;
  }
  if (!["add", "push", "unshift"].includes(member.name)) return;
  for (const argument of call.arguments) addExpressionSource(collectionSources, symbol, argument);
}

function addExpressionSource(
  sources: Map<ts.Symbol, ts.Expression[]>,
  symbol: ts.Symbol | undefined,
  expression: ts.Expression | undefined,
): void {
  if (!symbol || !expression) return;
  const existing = sources.get(symbol) ?? [];
  existing.push(expression);
  sources.set(symbol, existing);
}

interface AccessedMember {
  receiver: ts.Expression;
  name: string;
}

function accessedMember(expression: ts.Expression): AccessedMember | null {
  if (ts.isPropertyAccessExpression(expression)) {
    return { receiver: expression.expression, name: expression.name.text };
  }
  if (!ts.isElementAccessExpression(expression) || !expression.argumentExpression) return null;
  const argument = expression.argumentExpression;
  const wellKnown = wellKnownIteratorName(argument);
  if (wellKnown) return { receiver: expression.expression, name: wellKnown };
  if (!ts.isStringLiteral(argument) && !ts.isNumericLiteral(argument)) return null;
  return { receiver: expression.expression, name: argument.text };
}

function wellKnownIteratorName(expression: ts.Expression): string | null {
  if (!ts.isPropertyAccessExpression(expression)) return null;
  if (!ts.isIdentifier(expression.expression) || expression.expression.text !== "Symbol") return null;
  if (expression.name.text === "iterator") return "[Symbol.iterator]";
  return expression.name.text === "asyncIterator" ? "[Symbol.asyncIterator]" : null;
}

function expressionRootSymbol(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): ts.Symbol | undefined {
  if (ts.isIdentifier(expression)) {
    const symbol = checker.getSymbolAtLocation(expression);
    return symbol ? resolveValueSymbol(symbol, checker) : undefined;
  }
  const member = accessedMember(expression);
  if (member) return expressionRootSymbol(member.receiver, checker);
  const wrapped = wrappedExpression(expression);
  return wrapped ? expressionRootSymbol(wrapped, checker) : undefined;
}

function wrappedExpression(expression: ts.Expression): ts.Expression | null {
  if (ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isNonNullExpression(expression)
    || ts.isSatisfiesExpression(expression)
    || ts.isAwaitExpression(expression)) {
    return expression.expression;
  }
  return null;
}

function expressionIsInitiationCallable(
  expression: ts.Expression,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  assertCapabilityTraceDepth(depth);
  if (trace.callableActive.has(expression)) return false;
  const type = trace.checker.getTypeAtLocation(expression);
  if (isInitiationCallable(type, trace.canonicalInitiate)) return true;
  trace.callableActive.add(expression);
  const result = expressionCallableBySyntax(expression, trace, depth + 1);
  trace.callableActive.delete(expression);
  return result;
}

function expressionCallableBySyntax(
  expression: ts.Expression,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  const wrapped = wrappedExpression(expression);
  if (wrapped) return expressionIsInitiationCallable(wrapped, trace, depth);
  if (ts.isIdentifier(expression)) return identifierIsInitiationCallable(expression, trace, depth);
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    return accessedExpressionIsInitiationCallable(expression, trace, depth);
  }
  if (ts.isCallExpression(expression)) return callProducesInitiationCallable(expression, trace, depth);
  if (ts.isConditionalExpression(expression)) {
    return expressionIsInitiationCallable(expression.whenTrue, trace, depth)
      || expressionIsInitiationCallable(expression.whenFalse, trace, depth);
  }
  if (ts.isBinaryExpression(expression)) {
    return expressionIsInitiationCallable(expression.left, trace, depth)
      || expressionIsInitiationCallable(expression.right, trace, depth);
  }
  return false;
}

function identifierIsInitiationCallable(
  identifier: ts.Identifier,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  const symbol = trace.checker.getSymbolAtLocation(identifier);
  return symbol ? symbolIsInitiationCallable(resolveValueSymbol(symbol, trace.checker), trace, depth) : false;
}

function symbolIsInitiationCallable(
  symbol: ts.Symbol,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  assertCapabilityTraceDepth(depth);
  if (trace.symbolCallableActive.has(symbol)) return false;
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (declaration) {
    const type = trace.checker.getTypeOfSymbolAtLocation(symbol, declaration);
    if (isInitiationCallable(type, trace.canonicalInitiate)) return true;
  }
  trace.symbolCallableActive.add(symbol);
  const result = symbolValueSources(symbol, trace, depth + 1).some((source) => (
    sourceIsInitiationCallable(source, trace, depth + 1)
  ));
  trace.symbolCallableActive.delete(symbol);
  return result;
}

function accessedExpressionIsInitiationCallable(
  expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  const member = accessedMember(expression);
  if (!member) return dynamicAccessIsInitiationCallable(expression, trace, depth);
  const sources = propertyValueSources(member.receiver, member.name, trace, depth + 1);
  if (sources.some((source) => sourceIsInitiationCallable(source, trace, depth + 1))) return true;
  const receiverType = trace.checker.getTypeAtLocation(member.receiver);
  if (typeExposesInitiation(receiverType, trace, depth + 1)) return false;
  const candidateType = trace.checker.getTypeAtLocation(expression);
  if (CAPABILITY_CARRIER_METHODS.has(member.name)) return false;
  if (callableReturnsCapability(candidateType, trace, depth + 1)) return false;
  return candidateType.getCallSignatures().length > 0
    && expressionContainsInitiation(member.receiver, trace, depth + 1);
}

function dynamicAccessIsInitiationCallable(
  expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  const candidateType = trace.checker.getTypeAtLocation(expression);
  if (callableReturnsCapability(candidateType, trace, depth + 1)) return false;
  return candidateType.getCallSignatures().length > 0
    && expressionContainsInitiation(expression.expression, trace, depth + 1);
}

function callableReturnsCapability(
  type: ts.Type,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  return type.getCallSignatures().some((signature) => typeExposesInitiation(
    trace.checker.getReturnTypeOfSignature(signature),
    trace,
    depth + 1,
  ));
}

function memberReceiver(
  expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): ts.Expression {
  return expression.expression;
}

function callProducesInitiationCallable(
  call: ts.CallExpression,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  const member = accessedMember(call.expression);
  if (member?.name === "bind") {
    return expressionIsInitiationCallable(member.receiver, trace, depth + 1);
  }
  const resolved = trace.checker.getResolvedSignature(call);
  if (resolved && typeExposesInitiation(
    trace.checker.getReturnTypeOfSignature(resolved),
    trace,
    depth + 1,
  )) return true;
  return callResultSources(call, trace, depth + 1).some((source) => (
    sourceIsInitiationCallable(source, trace, depth + 1)
  ));
}

function expressionContainsInitiation(
  expression: ts.Expression,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  assertCapabilityTraceDepth(depth);
  if (trace.containmentActive.has(expression)) return false;
  if (expressionIsInitiationCallable(expression, trace, depth + 1)) return true;
  if (typeExposesInitiation(trace.checker.getTypeAtLocation(expression), trace, depth + 1)) return true;
  trace.containmentActive.add(expression);
  const result = expressionContainsBySyntax(expression, trace, depth + 1);
  trace.containmentActive.delete(expression);
  return result;
}

function expressionContainsBySyntax(
  expression: ts.Expression,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  const wrapped = wrappedExpression(expression);
  if (wrapped) return expressionContainsInitiation(wrapped, trace, depth);
  if (ts.isIdentifier(expression)) return identifierContainsInitiation(expression, trace, depth);
  const structured = structuredExpressionContains(expression, trace, depth);
  if (structured !== null) return structured;
  const accessed = accessedOrFunctionContains(expression, trace, depth);
  if (accessed !== null) return accessed;
  return branchingExpressionContains(expression, trace, depth);
}

function structuredExpressionContains(
  expression: ts.Expression,
  trace: CapabilityTrace,
  depth: number,
): boolean | null {
  if (ts.isObjectLiteralExpression(expression)) return objectLiteralContainsInitiation(expression, trace, depth);
  if (ts.isArrayLiteralExpression(expression)) return arrayLiteralContainsInitiation(expression, trace, depth);
  if (ts.isNewExpression(expression)) return expressionListContainsInitiation(expression.arguments ?? [], trace, depth);
  if (ts.isCallExpression(expression)) {
    return callResultSources(expression, trace, depth).some((source) => (
      sourceContainsInitiation(source, trace, depth + 1)
    ));
  }
  return null;
}

function accessedOrFunctionContains(
  expression: ts.Expression,
  trace: CapabilityTrace,
  depth: number,
): boolean | null {
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    const member = accessedMember(expression);
    if (!member) return expressionContainsInitiation(memberReceiver(expression), trace, depth);
    return propertyValueSources(member.receiver, member.name, trace, depth).some((source) => (
      sourceContainsInitiation(source, trace, depth + 1)
    ));
  }
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return functionReturnExpressions(expression).some((returned) => (
      expressionContainsInitiation(returned, trace, depth + 1)
    ));
  }
  return null;
}

function branchingExpressionContains(
  expression: ts.Expression,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  if (ts.isConditionalExpression(expression)) {
    return expressionContainsInitiation(expression.whenTrue, trace, depth)
      || expressionContainsInitiation(expression.whenFalse, trace, depth);
  }
  if (ts.isBinaryExpression(expression)) {
    return expressionContainsInitiation(expression.left, trace, depth)
      || expressionContainsInitiation(expression.right, trace, depth);
  }
  return false;
}

function identifierContainsInitiation(
  identifier: ts.Identifier,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  const symbol = trace.checker.getSymbolAtLocation(identifier);
  return symbol ? symbolContainsInitiation(resolveValueSymbol(symbol, trace.checker), trace, depth) : false;
}

function symbolContainsInitiation(
  symbol: ts.Symbol,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  assertCapabilityTraceDepth(depth);
  if (trace.symbolContainmentActive.has(symbol)) return false;
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (declaration) {
    const type = trace.checker.getTypeOfSymbolAtLocation(symbol, declaration);
    if (typeExposesInitiation(type, trace, depth + 1)) return true;
  }
  trace.symbolContainmentActive.add(symbol);
  const sources = [
    ...symbolValueSources(symbol, trace, depth + 1),
    ...(trace.collectionSources.get(symbol) ?? [])
      .map((expression) => provenanceSource(expression, trace)),
  ];
  const result = sources.some((source) => sourceContainsInitiation(source, trace, depth + 1))
    || symbolFunctionReturns(symbol).some((returned) => (
      expressionContainsInitiation(returned, trace, depth + 1)
    ));
  trace.symbolContainmentActive.delete(symbol);
  return result;
}

function objectLiteralContainsInitiation(
  object: ts.ObjectLiteralExpression,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  return object.properties.some((property) => {
    if (ts.isPropertyAssignment(property)) {
      return expressionContainsInitiation(property.initializer, trace, depth + 1);
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      return expressionContainsInitiation(property.name, trace, depth + 1);
    }
    if (ts.isSpreadAssignment(property)) {
      return expressionContainsInitiation(property.expression, trace, depth + 1);
    }
    return false;
  });
}

function arrayLiteralContainsInitiation(
  array: ts.ArrayLiteralExpression,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  return array.elements.some((element) => {
    const value = ts.isSpreadElement(element) ? element.expression : element;
    return expressionContainsInitiation(value, trace, depth + 1);
  });
}

function expressionListContainsInitiation(
  expressions: readonly ts.Expression[],
  trace: CapabilityTrace,
  depth: number,
): boolean {
  return expressions.some((expression) => expressionContainsInitiation(expression, trace, depth + 1));
}

function provenanceSource(
  expression: ts.Expression,
  trace: CapabilityTrace,
  environment: CallEnvironment | null = trace.currentEnvironment,
): ProvenanceSource {
  return { expression, environment };
}

function withSourceEnvironment<T>(
  source: ProvenanceSource,
  trace: CapabilityTrace,
  operation: (expression: ts.Expression) => T,
): T {
  const previous = trace.currentEnvironment;
  trace.currentEnvironment = source.environment;
  try {
    return operation(source.expression);
  } finally {
    trace.currentEnvironment = previous;
  }
}

function sourceContainsInitiation(
  source: ProvenanceSource,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  return withSourceEnvironment(source, trace, (expression) => (
    expressionContainsInitiation(expression, trace, depth + 1)
  ));
}

function sourceIsInitiationCallable(
  source: ProvenanceSource,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  return withSourceEnvironment(source, trace, (expression) => (
    expressionIsInitiationCallable(expression, trace, depth + 1)
  ));
}

function flatMapSources(
  sources: readonly ProvenanceSource[],
  trace: CapabilityTrace,
  operation: (expression: ts.Expression) => ProvenanceSource[],
): ProvenanceSource[] {
  return sources.flatMap((source) => withSourceEnvironment(source, trace, operation));
}

function activeParameterBinding(
  symbol: ts.Symbol,
  trace: CapabilityTrace,
): ParameterBinding | null {
  for (const declaration of symbol.declarations ?? []) {
    if (ts.isParameter(declaration)) {
      const binding = activeParameterDeclarationBinding(declaration, trace);
      if (binding) return binding;
    }
  }
  return null;
}

function activeParameterDeclarationBinding(
  parameter: ts.ParameterDeclaration,
  trace: CapabilityTrace,
): ParameterBinding | null {
  let environment = trace.currentEnvironment;
  while (environment) {
    const binding = environment.bindings.get(parameter);
    if (binding) return binding;
    environment = environment.parent;
  }
  return null;
}

function symbolValueSources(
  symbol: ts.Symbol,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  assertCapabilityTraceDepth(depth);
  if (trace.sourceSymbolActive.has(symbol)) return [];
  const parameterBinding = activeParameterBinding(symbol, trace);
  if (parameterBinding) return [...parameterBinding.sources];
  trace.sourceSymbolActive.add(symbol);
  const sources = [...(trace.assignedSources.get(symbol) ?? [])]
    .map((expression) => provenanceSource(expression, trace));
  for (const declaration of symbol.declarations ?? []) {
    sources.push(...declarationValueSources(declaration, trace, depth + 1));
  }
  trace.sourceSymbolActive.delete(symbol);
  return sources;
}

function declarationValueSources(
  declaration: ts.Declaration,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  if (ts.isVariableDeclaration(declaration)) return variableDeclarationSources(declaration, trace, depth);
  if (ts.isBindingElement(declaration)) return bindingElementSources(declaration, trace, depth);
  if (ts.isParameter(declaration)) return parameterValueSources(declaration, trace, depth);
  if (ts.isPropertyAssignment(declaration)) return [provenanceSource(declaration.initializer, trace)];
  if (ts.isPropertyDeclaration(declaration) && declaration.initializer) {
    return [provenanceSource(declaration.initializer, trace)];
  }
  if (ts.isExportAssignment(declaration)) return [provenanceSource(declaration.expression, trace)];
  return [];
}

function variableDeclarationSources(
  declaration: ts.VariableDeclaration,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  if (declaration.initializer) return [provenanceSource(declaration.initializer, trace)];
  const list = declaration.parent;
  const loop = list.parent;
  if (!ts.isForOfStatement(loop) || loop.initializer !== list) return [];
  return collectionElementSources(loop.expression, trace, depth + 1);
}

function bindingElementSources(
  element: ts.BindingElement,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  const pattern = element.parent;
  const bases = bindingPatternSources(pattern, trace, depth + 1);
  if (ts.isObjectBindingPattern(pattern)) {
    const name = bindingPropertyName(element);
    return name ? flatMapSources(bases, trace, (base) => propertyValueSources(base, name, trace, depth + 1)) : [];
  }
  return flatMapSources(bases, trace, (base) => collectionElementSources(base, trace, depth + 1));
}

function bindingPatternSources(
  pattern: ts.BindingPattern,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  const parent = pattern.parent;
  if (ts.isVariableDeclaration(parent)) return variableDeclarationSources(parent, trace, depth + 1);
  if (ts.isBindingElement(parent)) return bindingElementSources(parent, trace, depth + 1);
  if (ts.isParameter(parent)) return parameterValueSources(parent, trace, depth + 1);
  return [];
}

function bindingPropertyName(element: ts.BindingElement): string | null {
  const name = element.propertyName ?? element.name;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function parameterValueSources(
  parameter: ts.ParameterDeclaration,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  const direct = activeParameterDeclarationBinding(parameter, trace);
  if (direct) return [...direct.sources];
  const callback = parameter.parent;
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return [];
  const call = callback.parent;
  if (!ts.isCallExpression(call) || !call.arguments.includes(callback)) return [];
  const member = accessedMember(call.expression);
  if (!member || !["forEach", "map", "filter", "find", "some", "every"].includes(member.name)) return [];
  const index = callback.parameters.indexOf(parameter);
  if (index !== 0) return [];
  return collectionElementSources(member.receiver, trace, depth + 1);
}

function propertyValueSources(
  receiver: ts.Expression,
  name: string,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  assertCapabilityTraceDepth(depth);
  const nextValue = iteratorResultValueSources(receiver, name, trace, depth + 1);
  if (nextValue.length > 0) return nextValue;
  const direct = directValueSources(receiver, trace, depth + 1);
  const sources: ProvenanceSource[] = [];
  for (const candidate of direct) {
    const nested = withSourceEnvironment(candidate, trace, (expression) => {
      const resolved: ProvenanceSource[] = [];
      if (ts.isObjectLiteralExpression(expression)) {
        resolved.push(...objectPropertySources(expression, name, trace, depth + 1));
      } else if (ts.isArrayLiteralExpression(expression) && /^\d+$/.test(name)) {
        resolved.push(...arrayElementSources(expression, trace, depth + 1));
      } else if (expression !== receiver) {
        resolved.push(...propertyValueSources(expression, name, trace, depth + 1));
      }
      return resolved;
    });
    sources.push(...nested);
  }
  return sources;
}

function directValueSources(
  expression: ts.Expression,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  const wrapped = wrappedExpression(expression);
  if (wrapped) return directValueSources(wrapped, trace, depth + 1);
  const resolved = resolvedDirectValueSources(expression, trace, depth);
  if (resolved) return resolved;
  return [provenanceSource(expression, trace)];
}

function resolvedDirectValueSources(
  expression: ts.Expression,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] | null {
  if (ts.isIdentifier(expression)) return identifierValueSources(expression, trace, depth + 1);
  if (ts.isCallExpression(expression)) return sourcesOrExpression(
    callResultSources(expression, trace, depth + 1),
    expression,
    trace,
  );
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    const member = accessedMember(expression);
    if (member) {
      return sourcesOrExpression(
        propertyValueSources(member.receiver, member.name, trace, depth + 1),
        expression,
        trace,
      );
    }
  }
  if (ts.isElementAccessExpression(expression)) {
    return sourcesOrExpression(
      collectionElementSources(expression.expression, trace, depth + 1),
      expression,
      trace,
    );
  }
  return null;
}

function identifierValueSources(
  identifier: ts.Identifier,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  const symbol = trace.checker.getSymbolAtLocation(identifier);
  if (!symbol) return [provenanceSource(identifier, trace)];
  return sourcesOrExpression(
    symbolValueSources(resolveValueSymbol(symbol, trace.checker), trace, depth + 1),
    identifier,
    trace,
  );
}

function sourcesOrExpression(
  sources: ProvenanceSource[],
  expression: ts.Expression,
  trace?: CapabilityTrace,
): ProvenanceSource[] {
  if (sources.length > 0) return sources;
  if (!trace) throw new Error("Missing capability trace for fallback provenance source");
  return [provenanceSource(expression, trace)];
}

function objectPropertySources(
  object: ts.ObjectLiteralExpression,
  name: string,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  const sources: ProvenanceSource[] = [];
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && propertyNameText(property.name) === name) {
      sources.push(provenanceSource(property.initializer, trace));
    } else if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) {
      sources.push(provenanceSource(property.name, trace));
    } else if (ts.isSpreadAssignment(property)) {
      sources.push(...propertyValueSources(property.expression, name, trace, depth + 1));
    }
  }
  return sources;
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function iteratorResultValueSources(
  receiver: ts.Expression,
  name: string,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  if (name !== "value" || !ts.isCallExpression(receiver)) return [];
  const member = accessedMember(receiver.expression);
  if (member?.name !== "next") return [];
  return collectionElementSources(member.receiver, trace, depth + 1);
}

function callResultSources(
  call: ts.CallExpression,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  assertCapabilityTraceDepth(depth);
  const key = `${nodeIdentity(call, trace)}:${trace.currentEnvironment?.id ?? 0}`;
  if (trace.callResultActive.has(key)) return [];
  trace.callResultActive.add(key);
  const sources = callResultSourcesBySyntax(call, trace, depth);
  trace.callResultActive.delete(key);
  return sources;
}

function callResultSourcesBySyntax(
  call: ts.CallExpression,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  const member = accessedMember(call.expression);
  if (member && ["get", "at"].includes(member.name)) {
    return collectionElementSources(member.receiver, trace, depth + 1);
  }
  const promiseSources = promiseResolutionSources(call, member, trace);
  if (promiseSources) return promiseSources;
  if (ts.isArrowFunction(call.expression) || ts.isFunctionExpression(call.expression)) {
    const environment = createCallEnvironment(call.expression, call.arguments, trace);
    return functionReturnExpressions(call.expression)
      .map((expression) => provenanceSource(expression, trace, environment));
  }
  return calledSymbolReturns(call, trace);
}

function promiseResolutionSources(
  call: ts.CallExpression,
  member: AccessedMember | null,
  trace: CapabilityTrace,
): ProvenanceSource[] | null {
  if (member?.name !== "resolve" || !ts.isIdentifier(member.receiver)) return null;
  if (member.receiver.text !== "Promise") return null;
  return call.arguments[0] ? [provenanceSource(call.arguments[0], trace)] : [];
}

function calledSymbolReturns(call: ts.CallExpression, trace: CapabilityTrace): ProvenanceSource[] {
  const invocation = resolvedInvocation(call, trace);
  if (!invocation) return [];
  const symbol = declarationSymbol(invocation.declaration, trace.checker);
  const key = callEnvironmentKey(call, symbol, trace.currentEnvironment, trace);
  if (trace.callEnvironmentActive.has(key)) return [];
  trace.callEnvironmentActive.add(key);
  try {
    const parent = enclosingFactoryEnvironment(call.expression, invocation.declaration, trace);
    const previous = trace.currentEnvironment;
    trace.currentEnvironment = parent ?? previous;
    let environment: CallEnvironment;
    try {
      environment = createCallEnvironment(invocation.declaration, invocation.arguments, trace);
    } finally {
      trace.currentEnvironment = previous;
    }
    return functionReturnExpressions(invocation.declaration)
      .map((expression) => provenanceSource(expression, trace, environment));
  } finally {
    trace.callEnvironmentActive.delete(key);
  }
}

interface ResolvedInvocation {
  declaration: ts.FunctionLikeDeclaration;
  arguments: readonly ts.Expression[];
}

function resolvedInvocation(
  call: ts.CallExpression,
  trace: CapabilityTrace,
): ResolvedInvocation | null {
  const bound = resolvedBoundInvocation(call.expression, call.arguments, trace);
  if (bound) return bound;
  const signatureDeclaration = trace.checker.getResolvedSignature(call)?.declaration;
  const implementation = signatureDeclaration
    ? implementationDeclaration(signatureDeclaration, call.expression, trace.checker)
    : functionDeclarationForExpression(call.expression, trace.checker);
  return implementation ? { declaration: implementation, arguments: call.arguments } : null;
}

function resolvedBoundInvocation(
  callee: ts.Expression,
  invocationArguments: readonly ts.Expression[],
  trace: CapabilityTrace,
): ResolvedInvocation | null {
  const origin = boundOrigin(callee, trace.checker);
  if (!origin) return null;
  const declaration = functionDeclarationForExpression(origin.target, trace.checker);
  if (!declaration) return null;
  return {
    declaration,
    arguments: [...origin.arguments, ...invocationArguments],
  };
}

interface BoundOrigin {
  target: ts.Expression;
  arguments: readonly ts.Expression[];
}

function boundOrigin(expression: ts.Expression, checker: ts.TypeChecker): BoundOrigin | null {
  const unwrapped = wrappedExpression(expression);
  if (unwrapped) return boundOrigin(unwrapped, checker);
  if (ts.isCallExpression(expression)) return directBoundOrigin(expression);
  for (const initializer of variableInitializers(expression, checker)) {
    const origin = boundOrigin(initializer, checker);
    if (origin) return origin;
  }
  return null;
}

function directBoundOrigin(expression: ts.CallExpression): BoundOrigin | null {
  const member = accessedMember(expression.expression);
  return member?.name === "bind"
    ? { target: member.receiver, arguments: expression.arguments.slice(1) }
    : null;
}

function functionDeclarationForExpression(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): ts.FunctionLikeDeclaration | null {
  const unwrapped = wrappedExpression(expression);
  if (unwrapped) return functionDeclarationForExpression(unwrapped, checker);
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return expression;
  const declared = functionDeclarationsForExpression(expression, checker)[0];
  if (declared) return declared;
  for (const initializer of variableInitializers(expression, checker)) {
    const nested = functionDeclarationForExpression(initializer, checker);
    if (nested) return nested;
  }
  return null;
}

function functionDeclarationsForExpression(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): ts.FunctionLikeDeclaration[] {
  const symbol = checker.getSymbolAtLocation(expression);
  if (!symbol) return [];
  const resolved = resolveAlias(symbol, checker);
  return (resolved.declarations ?? []).filter(isFunctionWithBody);
}

function variableInitializers(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): ts.Expression[] {
  if (!ts.isIdentifier(expression)) return [];
  const symbol = checker.getSymbolAtLocation(expression);
  const resolved = symbol ? resolveValueSymbol(symbol, checker) : undefined;
  return (resolved?.declarations ?? [])
    .filter(ts.isVariableDeclaration)
    .map((declaration) => declaration.initializer)
    .filter(isExpression);
}

function implementationDeclaration(
  declaration: ts.Node,
  expression: ts.Expression,
  checker: ts.TypeChecker,
): ts.FunctionLikeDeclaration | null {
  if (isFunctionWithBody(declaration)) return declaration;
  return functionDeclarationForExpression(expression, checker);
}

function declarationSymbol(
  declaration: ts.FunctionLikeDeclaration,
  checker: ts.TypeChecker,
): ts.Symbol | undefined {
  if (declaration.name) return checker.getSymbolAtLocation(declaration.name);
  return checker.getSymbolAtLocation(declaration);
}

function callEnvironmentKey(
  call: ts.CallExpression,
  symbol: ts.Symbol | undefined,
  parent: CallEnvironment | null,
  trace: CapabilityTrace,
): string {
  return `${nodeIdentity(call, trace)}:${symbol ? symbolIdentity(symbol, trace) : 0}:${parent?.id ?? 0}`;
}

function nodeIdentity(node: ts.Node, trace: CapabilityTrace): number {
  const existing = trace.nodeIds.get(node);
  if (existing) return existing;
  const created = trace.nextNodeId;
  trace.nextNodeId += 1;
  trace.nodeIds.set(node, created);
  return created;
}

function symbolIdentity(symbol: ts.Symbol, trace: CapabilityTrace): number {
  const resolved = resolveAlias(symbol, trace.checker);
  const existing = trace.symbolIds.get(resolved);
  if (existing) return existing;
  const created = trace.nextSymbolId;
  trace.nextSymbolId += 1;
  trace.symbolIds.set(resolved, created);
  return created;
}

function createCallEnvironment(
  declaration: ts.FunctionLikeDeclaration,
  invocationArguments: readonly ts.Expression[],
  trace: CapabilityTrace,
): CallEnvironment {
  const bindings = new Map<ts.ParameterDeclaration, ParameterBinding>();
  const environment: CallEnvironment = {
    id: trace.nextEnvironmentId,
    parent: trace.currentEnvironment,
    bindings,
  };
  trace.nextEnvironmentId += 1;
  let argumentIndex = 0;
  for (const parameter of declaration.parameters) {
    if (parameter.dotDotDotToken) {
      bindings.set(parameter, {
        sources: invocationArguments.slice(argumentIndex)
          .map((argument) => provenanceSource(argument, trace)),
        rest: true,
      });
      argumentIndex = invocationArguments.length;
      continue;
    }
    const argument = invocationArguments[argumentIndex];
    argumentIndex += 1;
    if (argument) {
      bindings.set(parameter, { sources: [provenanceSource(argument, trace)], rest: false });
    } else if (parameter.initializer) {
      bindings.set(parameter, {
        sources: [provenanceSource(parameter.initializer, trace, environment)],
        rest: false,
      });
    } else {
      bindings.set(parameter, { sources: [], rest: false });
    }
  }
  return environment;
}

function enclosingFactoryEnvironment(
  callee: ts.Expression,
  declaration: ts.FunctionLikeDeclaration,
  trace: CapabilityTrace,
): CallEnvironment | null {
  const factory = enclosingFunction(declaration.parent);
  if (!factory) return null;
  const originCall = callProducingExpression(callee, trace.checker);
  if (!originCall) return null;
  const invocation = resolvedInvocation(originCall, trace);
  if (!invocation || invocation.declaration !== factory) return null;
  const parent = enclosingFactoryEnvironment(originCall.expression, factory, trace);
  const previous = trace.currentEnvironment;
  trace.currentEnvironment = parent ?? previous;
  try {
    return createCallEnvironment(factory, invocation.arguments, trace);
  } finally {
    trace.currentEnvironment = previous;
  }
}

function enclosingFunction(node: ts.Node | undefined): ts.FunctionLikeDeclaration | null {
  let current = node;
  while (current) {
    if (isFunctionWithBody(current)) return current;
    current = current.parent;
  }
  return null;
}

function callProducingExpression(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): ts.CallExpression | null {
  const unwrapped = wrappedExpression(expression);
  if (unwrapped) return callProducingExpression(unwrapped, checker);
  if (ts.isCallExpression(expression)) return expression;
  for (const initializer of variableInitializers(expression, checker)) {
    const call = callProducingExpression(initializer, checker);
    if (call) return call;
  }
  return null;
}

function symbolFunctionReturns(symbol: ts.Symbol): ts.Expression[] {
  const returned: ts.Expression[] = [];
  for (const declaration of symbol.declarations ?? []) {
    if (isFunctionWithBody(declaration)) returned.push(...functionReturnExpressions(declaration));
  }
  return returned;
}

function functionReturnExpressions(declaration: ts.FunctionLikeDeclaration): ts.Expression[] {
  if (ts.isArrowFunction(declaration) && !ts.isBlock(declaration.body)) return [declaration.body];
  if (!declaration.body) return [];
  const returned: ts.Expression[] = [];
  collectReturnExpressions(declaration.body, returned);
  return returned;
}

function collectReturnExpressions(node: ts.Node, returned: ts.Expression[]): void {
  if (ts.isYieldExpression(node) && node.expression) {
    returned.push(node.expression);
    return;
  }
  if (ts.isReturnStatement(node) && node.expression) {
    returned.push(node.expression);
    return;
  }
  if (isNestedFunction(node)) return;
  ts.forEachChild(node, (child) => collectReturnExpressions(child, returned));
}

function isNestedFunction(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node);
}

function isFunctionWithBody(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)) && node.body !== undefined;
}

function collectionElementSources(
  expression: ts.Expression,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  assertCapabilityTraceDepth(depth);
  if (trace.collectionActive.has(expression)) return [];
  trace.collectionActive.add(expression);
  const sources = collectionElementSourcesBySyntax(expression, trace, depth);
  trace.collectionActive.delete(expression);
  return sources;
}

function collectionElementSourcesBySyntax(
  expression: ts.Expression,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  const wrapped = wrappedExpression(expression);
  if (wrapped) return collectionElementSources(wrapped, trace, depth + 1);
  const direct = directCollectionSources(expression, trace, depth);
  if (direct) return direct;
  if (ts.isElementAccessExpression(expression)) {
    return collectionElementSourcesFromValues(
      collectionElementSources(expression.expression, trace, depth + 1),
      trace,
      depth + 1,
    );
  }
  if (ts.isCallExpression(expression)) return callCollectionSources(expression, trace, depth + 1);
  if (ts.isPropertyAccessExpression(expression)) {
    const member = accessedMember(expression);
    if (member?.name === "value") return iteratorResultValueSources(member.receiver, "value", trace, depth + 1);
    if (member) {
      return flatMapSources(
        propertyValueSources(member.receiver, member.name, trace, depth + 1),
        trace,
        (source) => collectionElementSources(source, trace, depth + 1),
      );
    }
  }
  return [];
}

function directCollectionSources(
  expression: ts.Expression,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] | null {
  if (ts.isIdentifier(expression)) return identifierCollectionSources(expression, trace, depth + 1);
  if (ts.isArrayLiteralExpression(expression)) return arrayElementSources(expression, trace, depth + 1);
  if (ts.isNewExpression(expression)) return newCollectionSources(expression, trace, depth + 1);
  return null;
}

function identifierCollectionSources(
  identifier: ts.Identifier,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  const symbol = trace.checker.getSymbolAtLocation(identifier);
  if (!symbol) return [];
  const resolved = resolveValueSymbol(symbol, trace.checker);
  const parameterBinding = activeParameterBinding(resolved, trace);
  const sources = parameterBinding?.rest ? [...parameterBinding.sources] : [];
  sources.push(...(trace.collectionSources.get(resolved) ?? [])
    .map((expression) => provenanceSource(expression, trace)));
  for (const value of symbolValueSources(resolved, trace, depth + 1)) {
    sources.push(...withSourceEnvironment(value, trace, (expression) => (
      collectionElementSources(expression, trace, depth + 1)
    )));
  }
  return sources;
}

function arrayElementSources(
  array: ts.ArrayLiteralExpression,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  const sources: ProvenanceSource[] = [];
  for (const element of array.elements) {
    if (ts.isSpreadElement(element)) {
      sources.push(...collectionElementSources(element.expression, trace, depth + 1));
    } else {
      sources.push(provenanceSource(element, trace));
    }
  }
  return sources;
}

function newCollectionSources(
  expression: ts.NewExpression,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  const argument = expression.arguments?.[0];
  if (!argument) return [];
  if (constructorName(expression.expression) !== "Map") {
    return collectionElementSources(argument, trace, depth + 1);
  }
  return flatMapSources(
    collectionElementSources(argument, trace, depth + 1),
    trace,
    (entry) => ts.isArrayLiteralExpression(entry)
      ? [entry.elements[1]].filter(isExpression).map((value) => provenanceSource(value, trace))
      : [],
  );
}

function constructorName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function isExpression(node: ts.Node | undefined): node is ts.Expression {
  return node !== undefined && ts.isExpression(node);
}

function isType(type: ts.Type | undefined): type is ts.Type {
  return type !== undefined;
}

function callCollectionSources(
  call: ts.CallExpression,
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  const member = accessedMember(call.expression);
  if (member && [
    "values",
    "keys",
    "entries",
    "next",
    "[Symbol.asyncIterator]",
    "[Symbol.iterator]",
  ].includes(member.name)) {
    return collectionElementSources(member.receiver, trace, depth + 1);
  }
  if (member && ["get", "at"].includes(member.name)) {
    return collectionElementSourcesFromValues(
      collectionElementSources(member.receiver, trace, depth + 1),
      trace,
      depth + 1,
    );
  }
  return collectionElementSourcesFromValues(callResultSources(call, trace, depth + 1), trace, depth + 1);
}

function collectionElementSourcesFromValues(
  values: readonly ProvenanceSource[],
  trace: CapabilityTrace,
  depth: number,
): ProvenanceSource[] {
  const sources: ProvenanceSource[] = [];
  for (const value of values) {
    const nested = withSourceEnvironment(value, trace, (expression) => (
      collectionElementSources(expression, trace, depth + 1)
    ));
    sources.push(...(nested.length > 0 ? nested : [value]));
  }
  return sources;
}

function typeExposesInitiation(
  type: ts.Type,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  assertCapabilityTraceDepth(depth);
  if (isTerminalType(type)) return false;
  const memoized = trace.typeMemo.get(type);
  if (memoized !== undefined) return memoized;
  if (trace.typeActive.has(type)) return false;
  trace.typeActive.add(type);
  const result = typeDirectlyExposesInitiation(type, trace, depth);
  trace.typeActive.delete(type);
  trace.typeMemo.set(type, result);
  return result;
}

function typeDirectlyExposesInitiation(
  type: ts.Type,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  if (isInitiationCallable(type, trace.canonicalInitiate)) return true;
  if (directContainedTypes(type, trace).some((contained) => (
    typeExposesInitiation(contained, trace, depth + 1)
  ))) return true;
  const surface = surfaceContainedTypes(type, trace);
  if (hasAnalyzableDeclaration(type)) {
    return surface.some((contained) => typeExposesInitiation(contained, trace, depth + 1));
  }
  return surface.some((contained) => builtInSurfaceExposesInitiation(contained, trace, depth + 1));
}

function builtInSurfaceExposesInitiation(
  type: ts.Type,
  trace: CapabilityTrace,
  depth: number,
): boolean {
  return builtInContainedTypeExposesInitiation(type, trace, depth, new Set());
}

function builtInContainedTypeExposesInitiation(
  type: ts.Type,
  trace: CapabilityTrace,
  depth: number,
  visited: Set<ts.Type>,
): boolean {
  if (visited.has(type) || isTerminalType(type)) return false;
  if (isInitiationCallable(type, trace.canonicalInitiate)) return true;
  if (hasAnalyzableDeclaration(type)) return typeExposesInitiation(type, trace, depth + 1);
  visited.add(type);
  return directContainedTypes(type, trace).some((contained) => (
    builtInContainedTypeExposesInitiation(contained, trace, depth, visited)
  ));
}

function isInitiationCallable(
  candidate: ts.Type,
  canonicalInitiate: ts.Type,
): boolean {
  return candidate.getCallSignatures().some((signature) => (
    signatureOriginatesFromCanonicalInitiate(signature, canonicalInitiate)
  ));
}

function signatureOriginatesFromCanonicalInitiate(
  signature: ts.Signature,
  canonicalInitiate: ts.Type,
): boolean {
  if (!signature.declaration) return false;
  return canonicalInitiate.getCallSignatures().some((canonical) => (
    canonical.declaration === signature.declaration
  ));
}

function directContainedTypes(type: ts.Type, trace: CapabilityTrace): ts.Type[] {
  const contained = type.isUnionOrIntersection() ? [...type.types] : [];
  contained.push(...typeReferenceArguments(type, trace.checker));
  if (type.aliasTypeArguments) contained.push(...type.aliasTypeArguments);
  const constraint = trace.checker.getBaseConstraintOfType(type);
  if (constraint && constraint !== type) contained.push(constraint);
  const defaultType = trace.checker.getDefaultFromTypeParameter(type);
  if (defaultType && defaultType !== type) contained.push(defaultType);
  if (type.isClassOrInterface()) contained.push(...trace.checker.getBaseTypes(type));
  for (const indexKind of [ts.IndexKind.Number, ts.IndexKind.String]) {
    const indexed = trace.checker.getIndexTypeOfType(type, indexKind);
    if (indexed) contained.push(indexed);
  }
  contained.push(...advancedContainedTypes(type, trace));
  return contained;
}

function advancedContainedTypes(type: ts.Type, trace: CapabilityTrace): ts.Type[] {
  if (isConditionalType(type)) {
    return [
      type.checkType,
      type.extendsType,
      type.resolvedTrueType,
      type.resolvedFalseType,
      trace.checker.getTypeFromTypeNode(type.root.node.trueType),
      trace.checker.getTypeFromTypeNode(type.root.node.falseType),
    ].filter(isType);
  }
  if (isIndexedAccessType(type)) {
    return [
      type.objectType,
      type.indexType,
      type.constraint,
      type.simplifiedForReading,
      type.simplifiedForWriting,
    ].filter(isType);
  }
  if (isIndexType(type)) return [type.type];
  if (isSubstitutionType(type)) return [type.baseType, type.constraint];
  if (isTemplateLiteralType(type)) return [...type.types];
  return [];
}

function isConditionalType(type: ts.Type): type is ts.ConditionalType {
  return (type.flags & ts.TypeFlags.Conditional) !== 0 && "root" in type;
}

function isIndexedAccessType(type: ts.Type): type is ts.IndexedAccessType {
  return (type.flags & ts.TypeFlags.IndexedAccess) !== 0 && "objectType" in type;
}

function isIndexType(type: ts.Type): type is ts.IndexType {
  return (type.flags & ts.TypeFlags.Index) !== 0 && "type" in type;
}

function isSubstitutionType(type: ts.Type): type is ts.SubstitutionType {
  return (type.flags & ts.TypeFlags.Substitution) !== 0 && "baseType" in type;
}

function isTemplateLiteralType(type: ts.Type): type is ts.TemplateLiteralType {
  return (type.flags & ts.TypeFlags.TemplateLiteral) !== 0 && "types" in type;
}

function surfaceContainedTypes(type: ts.Type, trace: CapabilityTrace): ts.Type[] {
  const contained: ts.Type[] = [];
  for (const signature of [...type.getCallSignatures(), ...type.getConstructSignatures()]) {
    contained.push(...signatureContainedTypes(signature, trace));
  }
  contained.push(...propertyTypes(type, trace));
  return contained;
}

function signatureContainedTypes(signature: ts.Signature, trace: CapabilityTrace): ts.Type[] {
  const contained = [trace.checker.getReturnTypeOfSignature(signature)];
  for (const parameter of signature.parameters) {
    const declaration = parameter.valueDeclaration ?? parameter.declarations?.[0] ?? signature.declaration;
    if (declaration) contained.push(trace.checker.getTypeOfSymbolAtLocation(parameter, declaration));
  }
  for (const typeParameter of signature.typeParameters ?? []) {
    const constraint = trace.checker.getBaseConstraintOfType(typeParameter);
    const defaultType = trace.checker.getDefaultFromTypeParameter(typeParameter);
    if (constraint) contained.push(constraint);
    if (defaultType) contained.push(defaultType);
  }
  return contained;
}

function typeReferenceArguments(type: ts.Type, checker: ts.TypeChecker): readonly ts.Type[] {
  return isTypeReference(type) ? checker.getTypeArguments(type) : [];
}

function propertyTypes(type: ts.Type, trace: CapabilityTrace): ts.Type[] {
  const types: ts.Type[] = [];
  for (const property of trace.checker.getPropertiesOfType(type)) {
    const resolved = resolveAlias(property, trace.checker);
    if (trace.typeSymbolActive.has(resolved)) continue;
    const declaration = resolved.valueDeclaration ?? resolved.declarations?.[0];
    if (!declaration) continue;
    trace.typeSymbolActive.add(resolved);
    types.push(trace.checker.getTypeOfSymbolAtLocation(resolved, declaration));
    trace.typeSymbolActive.delete(resolved);
  }
  return types;
}

function hasAnalyzableDeclaration(type: ts.Type): boolean {
  const symbols = [type.aliasSymbol, type.symbol].filter((symbol) => symbol !== undefined);
  return symbols.some((symbol) => symbol.declarations?.some((declaration) => (
    !declaration.getSourceFile().isDeclarationFile
  )) ?? false);
}

function isTypeReference(type: ts.Type): type is ts.TypeReference {
  return "objectFlags" in type
    && typeof type.objectFlags === "number"
    && (type.objectFlags & ts.ObjectFlags.Reference) !== 0;
}

function isTerminalType(type: ts.Type): boolean {
  const terminal = ts.TypeFlags.Any
    | ts.TypeFlags.Unknown
    | ts.TypeFlags.Never
    | ts.TypeFlags.StringLike
    | ts.TypeFlags.NumberLike
    | ts.TypeFlags.BigIntLike
    | ts.TypeFlags.BooleanLike
    | ts.TypeFlags.ESSymbolLike
    | ts.TypeFlags.Void
    | ts.TypeFlags.Undefined
    | ts.TypeFlags.Null;
  return (type.flags & terminal) !== 0;
}

function assertCapabilityTraceDepth(depth: number): void {
  if (depth <= MAX_CAPABILITY_TRACE_DEPTH) return;
  throw new Error("Provider initiation capability analysis exceeded its fail-closed depth bound");
}

function restrictedTarget(target: string, policy: ArchitecturePolicy): boolean {
  return policy.restrictedModuleTargets.has(target);
}

function isProviderInfrastructure(path: string): boolean {
  return path.startsWith("src/lib/payment/providers/");
}

function isDynamicImport(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword;
}

function resolvedModulePath(
  specifier: string,
  sourceFile: ts.SourceFile,
  root: string,
  program: ts.Program,
): string | null {
  const resolvedModule = ts.resolveModuleName(
    specifier,
    sourceFile.fileName,
    program.getCompilerOptions(),
    ts.sys,
  ).resolvedModule;
  if (!resolvedModule) return null;
  return normalizedRelative(root, resolvedModule.resolvedFileName);
}

function isProductionSource(
  sourceFile: ts.SourceFile,
  root: string,
  declarationFiles: ReadonlySet<string>,
): boolean {
  const path = sourcePath(sourceFile, root);
  if (path.startsWith("../")) return false;
  if (sourceFile.isDeclarationFile) return declarationFiles.has(path);
  if (!isRuntimeSourcePath(path)) return false;
  if (path.includes("/__tests__/")) return false;
  return !isNonProductionFile(path);
}

function sourcePath(sourceFile: ts.SourceFile, root: string): string {
  return normalizedRelative(root, sourceFile.fileName);
}

function normalizedRelative(root: string, path: string): string {
  return relative(resolve(root), resolve(path)).split(sep).join("/");
}

function createBypassFixture(): { root: string; files: string[] } {
  const root = mkdtempSync(join(tmpdir(), "mira-initiation-architecture-"));
  temporaryProjects.push(root);
  const sources: Readonly<Record<string, string>> = {
    "raw.ts": "export interface RawProvider { initiate(input: string): Promise<void> }\nexport declare const provider: RawProvider;\n",
    "adapter.ts": "export { provider } from './raw';\n",
    "resolver.ts": "import { provider } from './raw';\nexport function resolveInitiationProvider() { return provider; }\n",
    "owner.ts": "import { provider } from './raw';\nexport async function owner() { await provider.initiate('ok'); }\n",
    "direct.ts": "import { provider } from './raw';\nexport async function direct() { await provider.initiate('x'); }\n",
    "alias.ts": "import { provider } from './raw';\nexport async function alias() { const start = provider.initiate; await start('x'); }\n",
    "destructure.ts": "import { provider } from './raw';\nexport async function destructure() { const { initiate } = provider; await initiate('x'); }\n",
    "bracket.ts": "import { provider } from './raw';\nexport async function bracket() { await provider['initiate']('x'); }\n",
    "callable-wrapper.ts": "import { provider } from './raw';\nexport const renamedCallable = provider.initiate;\n",
    "callable-consumer.ts": "import { renamedCallable } from './callable-wrapper';\nexport async function callableConsumer() { await renamedCallable('x'); }\n",
    "wrapper.ts": "import { provider } from './raw';\nexport async function wrapper() { const wrapped = () => provider.initiate('x'); await wrapped(); }\n",
    "reexport.ts": "export { provider as hidden } from './raw';\n",
    "barrel.ts": "export { hidden } from './reexport';\n",
    "barrel-consumer.ts": "import { hidden } from './barrel';\nexport async function barrelConsumer() { await hidden.initiate('x'); }\n",
    "dynamic.ts": "export async function dynamic() { const { provider } = await import('./raw'); await provider.initiate('x'); }\n",
    "namespace.ts": "import * as raw from './raw';\nexport async function namespace() { await raw.provider.initiate('x'); }\n",
    "known-adapter.ts": "import { provider } from './adapter';\nexport async function knownAdapter() { await provider.initiate('x'); }\n",
    "resolver-bypass.ts": "import { resolveInitiationProvider } from './resolver';\nexport async function resolverBypass() { await resolveInitiationProvider().initiate('x'); }\n",
    "local-structural.ts": "import { provider } from './raw';\ninterface RenamedCapability { run(input: string): Promise<void> }\nconst local: RenamedCapability = { run: provider.initiate.bind(provider) };\nexport async function localStructural() { await local.run('x'); }\n",
    "capability-shapes.ts": [
      "import type { RawProvider } from './raw';",
      "interface Box<T> { nested: T }",
      "interface RecursiveBox { next?: RecursiveBox; provider?: RawProvider }",
      "export declare const arrayCapability: RawProvider[];",
      "export declare const tupleCapability: readonly [string, RawProvider];",
      "export declare const unionCapability: RawProvider | { safe: string };",
      "export declare const intersectionCapability: RawProvider & { tag: string };",
      "export declare const genericCapability: Box<RawProvider>;",
      "export declare const recursiveCapability: RecursiveBox;",
      "",
    ].join("\n"),
    "nested-wrapper.ts": "import { provider } from './raw';\nexport function nestedWrapper() { return { nested: { provider } }; }\n",
    "nested-consumer.ts": "import { nestedWrapper } from './nested-wrapper';\nexport async function nestedConsumer() { await nestedWrapper().nested.provider.initiate('x'); }\n",
    "promise-wrapper.ts": "import { provider } from './raw';\nexport async function promiseWrapper() { return { nested: [provider] }; }\n",
    "promise-consumer.ts": "import { promiseWrapper } from './promise-wrapper';\nexport async function promiseConsumer() { const wrapped = await promiseWrapper(); await wrapped.nested[0]?.initiate('x'); }\n",
    "executable/generated/hostile.js": "import { provider } from '../../raw';\nexport async function generatedHostile() { await provider.initiate('x'); }\n",
    "src/build/provider-consumer.ts": "import { provider } from '../../raw';\nexport async function buildConsumer() { await provider.initiate('x'); }\n",
    "src/dist/provider-consumer.ts": "import { provider } from '../../raw';\nexport async function distConsumer() { await provider.initiate('x'); }\n",
    "src/out/provider-consumer.ts": "import { provider } from '../../raw';\nexport async function outConsumer() { await provider.initiate('x'); }\n",
    "hostile.jsx": "import { provider } from './raw';\nexport async function jsxHostile() { await provider.initiate('x'); }\n",
    "hostile.mjs": "import { provider } from './raw';\nexport async function mjsHostile() { await provider.initiate('x'); }\n",
    "alternate.cts": "import { provider } from './raw';\nexport async function ctsRuntime() { await provider.initiate('x'); }\n",
    "alternate.cjs": "const { provider } = require('./raw');\nvoid provider;\n",
  };
  const files: string[] = [];
  for (const [relativePath, source] of Object.entries(sources)) {
    const path = join(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source, "utf8");
    files.push(path);
  }
  return { root, files };
}

function createRemovedSeamFixture(): { root: string; files: string[] } {
  const root = mkdtempSync(join(tmpdir(), "mira-removed-initiation-seam-"));
  temporaryProjects.push(root);
  const path = join(root, "production-import.ts");
  const initiateModule = join(ROOT, "src/lib/payment/attempt/initiate");
  writeFileSync(path, [
    `import { initiatePaymentAttemptForTest, type PaymentAttemptTestCoordination } from '${initiateModule}';`,
    "void initiatePaymentAttemptForTest;",
    "export type Coordination = PaymentAttemptTestCoordination;",
    "",
  ].join("\n"), "utf8");
  return { root, files: [path] };
}

function createGenericContainerFixture(): {
  root: string;
  files: string[];
  policy: ArchitecturePolicy;
} {
  const root = mkdtempSync(join(tmpdir(), "mira-initiation-containers-"));
  temporaryProjects.push(root);
  const sources: Readonly<Record<string, string>> = {
    "raw.ts": [
      "export interface RawProvider { initiate(input: string): Promise<void> }",
      "export declare const provider: RawProvider;",
      "",
    ].join("\n"),
    "owner.ts": [
      "import { provider } from './raw';",
      "interface LocalCapability { run(input: string): Promise<void> }",
      "interface Box<T> { value: T }",
      "const run = provider.initiate.bind(provider);",
      "const local: LocalCapability = { run };",
      "export const capabilityMap = new Map<string, LocalCapability>();",
      "capabilityMap.set('x', local);",
      "export const capabilitySet = new Set<LocalCapability>([local]);",
      "export const readonlyCapabilityMap: ReadonlyMap<string, LocalCapability> = capabilityMap;",
      "export const readonlyCapabilitySet: ReadonlySet<LocalCapability> = capabilitySet;",
      "export const boxed: Box<LocalCapability> = { value: local };",
      "export const nested = { containers: { map: capabilityMap, set: capabilitySet } };",
      "export const arrayOfMaps: readonly Map<string, LocalCapability>[] = [capabilityMap];",
      "export function containers() { return nested.containers; }",
      "export async function promisedContainers() { return { map: capabilityMap, set: capabilitySet }; }",
      "export const promisedLike: PromiseLike<ReadonlySet<LocalCapability>> = Promise.resolve(capabilitySet);",
      "export function capabilities(): Iterable<LocalCapability> { return capabilitySet; }",
      "export function capabilityIterator(): Iterator<LocalCapability> { return capabilitySet.values(); }",
      "export async function* asyncCapabilities(): AsyncIterable<LocalCapability> { yield local; }",
      "export function asyncCapabilityIterator(): AsyncIterator<LocalCapability> { return asyncCapabilities()[Symbol.asyncIterator](); }",
      "",
    ].join("\n"),
    "map-consumer.ts": "import { capabilityMap } from './owner';\nexport async function consumeMap() { await capabilityMap.get('x')?.run('map'); }\n",
    "set-consumer.ts": "import { capabilitySet } from './owner';\nexport async function consumeSet() { for (const capability of capabilitySet) await capability.run('set'); }\n",
    "readonly-consumer.ts": [
      "import { readonlyCapabilityMap, readonlyCapabilitySet } from './owner';",
      "export async function consumeReadonly() {",
      "  await readonlyCapabilityMap.get('x')?.run('readonly-map');",
      "  for (const capability of readonlyCapabilitySet) await capability.run('readonly-set');",
      "}",
      "",
    ].join("\n"),
    "box-consumer.ts": "import { boxed } from './owner';\nexport async function consumeBox() { await boxed.value.run('box'); }\n",
    "callback-consumer.ts": "import { capabilitySet } from './owner';\nexport function consumeCallback() { capabilitySet.forEach((capability) => { void capability.run('callback'); }); }\n",
    "factory-consumer.ts": "import { containers } from './owner';\nexport async function consumeFactory() { await containers().map.get('x')?.run('factory'); }\n",
    "iterable-consumer.ts": "import { capabilities } from './owner';\nexport async function consumeIterable() { const [capability] = [...capabilities()]; await capability?.run('iterable'); }\n",
    "async-iterable-consumer.ts": "import { asyncCapabilities } from './owner';\nexport async function consumeAsyncIterable() { for await (const capability of asyncCapabilities()) await capability.run('async-iterable'); }\n",
    "async-iterator-consumer.ts": "import { asyncCapabilityIterator } from './owner';\nexport async function consumeAsyncIterator() { const result = await asyncCapabilityIterator().next(); if (!result.done) await result.value.run('async-iterator'); }\n",
    "iterator-consumer.ts": "import { capabilityIterator } from './owner';\nexport async function consumeIterator() { const result = capabilityIterator().next(); if (!result.done) await result.value.run('iterator'); }\n",
    "promise-consumer.ts": [
      "import { promisedContainers, promisedLike } from './owner';",
      "export async function consumePromise() {",
      "  const containers = await promisedContainers();",
      "  await containers.map.get('x')?.run('promise-map');",
      "  for (const capability of await promisedLike) await capability.run('promise-set');",
      "}",
      "",
    ].join("\n"),
    "nested-consumer.ts": "import { nested } from './owner';\nexport async function consumeNested() { await nested.containers.map.get('x')?.run('nested'); }\n",
    "array-consumer.ts": "import { arrayOfMaps } from './owner';\nexport async function consumeArray() { await arrayOfMaps[0]?.get('x')?.run('array'); }\n",
    "alias-destructure-consumer.ts": [
      "import { capabilityMap } from './owner';",
      "export async function consumeAlias() {",
      "  const capability = capabilityMap.get('x');",
      "  if (!capability) return;",
      "  const { run: execute } = capability;",
      "  await execute('alias');",
      "}",
      "",
    ].join("\n"),
    "bracket-consumer.ts": "import { capabilityMap } from './owner';\nexport async function consumeBracket() { await capabilityMap.get('x')?.['run']('bracket'); }\n",
    "barrel.ts": "export { capabilityMap as renamedMap } from './owner';\n",
    "barrel-consumer.ts": "import { renamedMap } from './barrel';\nexport async function consumeBarrel() { await renamedMap.get('x')?.run('barrel'); }\n",
    "unrelated-initiate.ts": [
      "interface LocalInitiator { initiate(input: string): Promise<void> }",
      "const local: LocalInitiator = { initiate: async () => undefined };",
      "export async function unrelatedInitiate() { await local.initiate('safe'); }",
      "",
    ].join("\n"),
    "unrelated-containers.ts": [
      "interface LocalCallable { run(input: string): Promise<void> }",
      "const local: LocalCallable = { run: async () => undefined };",
      "export const unrelatedMap = new Map<string, LocalCallable>([['x', local]]);",
      "export const unrelatedSet = new Set<LocalCallable>([local]);",
      "export async function unrelatedContainers() {",
      "  await unrelatedMap.get('x')?.run('safe-map');",
      "  for (const capability of unrelatedSet) await capability.run('safe-set');",
      "}",
      "",
    ].join("\n"),
  };
  const files: string[] = [];
  for (const [relativePath, source] of Object.entries(sources)) {
    const path = join(root, relativePath);
    writeFileSync(path, source, "utf8");
    files.push(path);
  }
  return {
    root,
    files,
    policy: {
      owner: "owner.ts",
      canonicalCapabilityModule: "raw.ts",
      canonicalCapabilityExport: "RawProvider",
      restrictedModuleTargets: new Set(["raw.ts"]),
      capabilityExportAllowances: new Map([["raw.ts", new Set(["provider"])]]),
      liveRepository: false,
    },
  };
}

function createGenericCallCaseFixture(
  caseSources: Readonly<Record<string, string>>,
): { root: string; policy: ArchitecturePolicy } {
  return createArchitectureFixture({
    "raw.ts": "export interface RawProvider { initiate(input: string): Promise<void> } export declare const provider: RawProvider;\n",
    "owner.ts": "import { provider } from './raw'; export const realRun = provider.initiate.bind(provider); export async function owner() { await provider.initiate('owner'); }\n",
    ...caseSources,
  }, {
    owner: "owner.ts",
    canonicalCapabilityModule: "raw.ts",
    canonicalCapabilityExport: "RawProvider",
    restrictedModuleTargets: new Set(["raw.ts"]),
    capabilityExportAllowances: new Map([["raw.ts", new Set(["provider"])]]),
    liveRepository: false,
  });
}

function createOwnerExportFixture(
  ownerSource: string,
): { root: string; policy: ArchitecturePolicy } {
  return createArchitectureFixture({
    "raw.ts": "export interface RawProvider { initiate(input: string): Promise<void> } export declare const provider: RawProvider;\n",
    "safe.ts": "export const safe = 'safe';\n",
    "owner.ts": ownerSource,
  }, {
    owner: "owner.ts",
    ownerExportAllowlist: new Map([["owner", "function"]]),
    canonicalCapabilityModule: "raw.ts",
    canonicalCapabilityExport: "RawProvider",
    restrictedModuleTargets: new Set(["raw.ts"]),
    capabilityExportAllowances: new Map([["raw.ts", new Set(["provider"])]]),
    liveRepository: false,
  });
}

function createOwnerTypeExportFixture(
  testCase: OwnerTypeExportCase,
): { root: string; policy: ArchitecturePolicy } {
  return createArchitectureFixture({
    "raw.ts": "export interface RawProvider { initiate(input: string): Promise<void> } export declare const provider: RawProvider;\n",
    ...testCase.sources,
  }, {
    owner: "owner.ts",
    ownerExportAllowlist: new Map([[testCase.exportName, testCase.exportKind]]),
    canonicalCapabilityModule: "raw.ts",
    canonicalCapabilityExport: "RawProvider",
    restrictedModuleTargets: new Set(["raw.ts"]),
    capabilityExportAllowances: new Map([["raw.ts", new Set(["provider"])]]),
    liveRepository: false,
  });
}

function createGeneralTypeExportFixture(
  testCase: GeneralTypeExportCase,
): { root: string; policy: ArchitecturePolicy } {
  return createArchitectureFixture({
    "raw.ts": "export interface RawProvider { initiate(input: string): Promise<void> } export declare const provider: RawProvider;\n",
    "owner.ts": "import { provider } from './raw'; export async function owner() { await provider.initiate('owner'); }\n",
    ...testCase.sources,
  }, {
    owner: "owner.ts",
    ownerExportAllowlist: new Map([["owner", "function"]]),
    canonicalCapabilityModule: "raw.ts",
    canonicalCapabilityExport: "RawProvider",
    restrictedModuleTargets: new Set(["raw.ts"]),
    capabilityExportAllowances: new Map([
      ["raw.ts", new Set(["provider"])],
      ["authorized.ts", new Set(["allowed"])],
    ]),
    liveRepository: false,
  });
}

function createSafeTypeExportFixture(): { root: string; policy: ArchitecturePolicy } {
  return createArchitectureFixture({
    "raw.ts": "export interface RawProvider { initiate(input: string): Promise<void> } export declare const provider: RawProvider;\n",
    "owner.ts": [
      "import { provider } from './raw';",
      "export type PaymentInitiateErrorCode = 'SAFE';",
      "export class PaymentInitiateException extends Error {}",
      "export interface InitiatePaymentAttemptInput { sessionId: string; now?: Date }",
      "export interface InitiatePaymentAttemptResult { paymentId: string }",
      "export async function initiatePaymentAttempt(): Promise<InitiatePaymentAttemptResult> {",
      "  await provider.initiate('owner');",
      "  return { paymentId: 'safe' };",
      "}",
      "",
    ].join("\n"),
    "authorized.ts": [
      "import type { RawProvider } from './raw';",
      "export declare function allowed(): RawProvider;",
      "export interface SafeSibling { label: string; optional?: { nested: number } }",
      "",
    ].join("\n"),
    "safe-types.ts": [
      "interface LocalValue { run(input: string): Promise<void> }",
      "export interface PaymentInitiationProviderPreview {",
      "  readonly label: string;",
      "  optional?: { nested: LocalValue };",
      "  initiate(input: string): Promise<{ safe: string }>;",
      "}",
      "export interface GenericPreview<Value extends LocalValue = LocalValue> {",
      "  map: Map<string, Value>;",
      "  set: Set<Value>;",
      "  promised: Promise<Value>;",
      "}",
      "export type GenericAlias<Value extends LocalValue = LocalValue> = GenericPreview<Value>;",
      "",
    ].join("\n"),
    "safe-barrel.ts": "export type { GenericAlias as SafeAlias, PaymentInitiationProviderPreview as Preview } from './safe-types';\n",
  }, {
    owner: "owner.ts",
    ownerExportAllowlist: new Map([
      ["PaymentInitiateErrorCode", "type"],
      ["PaymentInitiateException", "class"],
      ["InitiatePaymentAttemptInput", "interface"],
      ["InitiatePaymentAttemptResult", "interface"],
      ["initiatePaymentAttempt", "function"],
    ]),
    canonicalCapabilityModule: "raw.ts",
    canonicalCapabilityExport: "RawProvider",
    restrictedModuleTargets: new Set(),
    capabilityExportAllowances: new Map([
      ["raw.ts", new Set(["provider"])],
      ["authorized.ts", new Set(["allowed"])],
    ]),
    liveRepository: false,
  });
}

function createUnrelatedGenericFixture(): { root: string; policy: ArchitecturePolicy } {
  return createArchitectureFixture({
    "raw.ts": "export interface RawProvider { initiate(input: string): Promise<void> } export declare const provider: RawProvider;\n",
    "owner.ts": "import { provider } from './raw'; export async function owner() { await provider.initiate('owner'); }\n",
    "helper.ts": [
      "export function box<T>(value: T): { value: T } { return { value }; }",
      "export function mapValue<T>(value: T): Map<string, T> { return new Map([['value', value]]); }",
      "export function setValue<T>(value: T): Set<T> { return new Set([value]); }",
      "export function factory<T>(value: T): () => T { return () => value; }",
      "",
    ].join("\n"),
    "consumer.ts": [
      "import { box, factory, mapValue, setValue } from './helper';",
      "const local = { run: async (_input: string) => undefined, initiate: async (_input: string) => undefined };",
      "export async function consume() {",
      "  await box(local).value.run('box');",
      "  await mapValue(local).get('value')?.run('map');",
      "  for (const value of setValue(local)) await value.run('set');",
      "  await factory(local)().initiate('factory');",
      "}",
      "",
    ].join("\n"),
  }, {
    owner: "owner.ts",
    ownerExportAllowlist: new Map([["owner", "function"]]),
    canonicalCapabilityModule: "raw.ts",
    canonicalCapabilityExport: "RawProvider",
    restrictedModuleTargets: new Set(["raw.ts"]),
    capabilityExportAllowances: new Map([["raw.ts", new Set(["provider"])]]),
    liveRepository: false,
  });
}

function createC2hPolicyFixture(
  testCase: C2hPolicyCase,
): { root: string; policy: ArchitecturePolicy } {
  return createArchitectureFixture({
    "src/lib/payment/providers/types.ts": [
      "export interface PaymentInitiationProvider { initiate(input: string): Promise<void> }",
      "export interface SafeProviderContract { readonly label: string }",
      "",
    ].join("\n"),
    "src/lib/payment/attempt/initiate.ts": "export const safeOwnerMarker = 'safe';\n",
    ...testCase.sources,
  }, {
    owner: "src/lib/payment/attempt/initiate.ts",
    canonicalCapabilityModule: "src/lib/payment/providers/types.ts",
    canonicalCapabilityExport: "PaymentInitiationProvider",
    restrictedModuleTargets: new Set(),
    capabilityExportAllowances: new Map(),
    declarationFileAllowances: policyAllowances(
      testCase.allowedDeclarationFiles ?? [],
      "reviewed declaration fixture",
    ),
    ambientDeclarationAllowances: policyAllowances(
      testCase.allowedAmbientDeclarations ?? [],
      "reviewed ambient declaration fixture",
    ),
    liveRepository: false,
  });
}

function createC2hAuditReproductionFixture(): {
  root: string;
  policy: ArchitecturePolicy;
} {
  return createC2hPolicyFixture({
    name: "exact auditor bypass reproduction",
    sources: C2H_AUDITOR_BYPASS_SOURCES,
    expectedViolations: [],
  });
}

function policyAllowances(paths: readonly string[], role: string): ReadonlyMap<string, PolicyAllowance> {
  return new Map(paths.map((path) => [path, {
    role,
    reason: "The fixture explicitly reviews this exact path and declaration identity.",
  }]));
}

function createArchitectureFixture(
  sources: Readonly<Record<string, string>>,
  policy: ArchitecturePolicy,
): { root: string; policy: ArchitecturePolicy } {
  const root = mkdtempSync(join(tmpdir(), "mira-initiation-c2f-"));
  temporaryProjects.push(root);
  for (const [relativePath, source] of Object.entries(sources)) {
    const path = join(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source, "utf8");
  }
  return { root, policy };
}

function createStrictFixtureProgram(root: string): ts.Program {
  return ts.createProgram({
    rootNames: discoverAnalysisSourceFiles(root),
    options: {
      allowJs: true,
      strict: true,
      noEmit: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      types: [],
    },
  });
}

function fixtureDiagnostics(program: ts.Program): string[] {
  return ts.getPreEmitDiagnostics(program)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
}
