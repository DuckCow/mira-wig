# Eximbay BF3-R2 Offline ECMAScript Syntax / Bounded Source-Shape Evidence Contract v0.1

## Status

```text
DOCUMENT CLASS:
  ZERO-PROVIDER-CONTACT OFFLINE EVIDENCE CONTRACT

RISK CLASS:
  HIGH — PAYMENT SDK SUPPLY-CHAIN / RETAINED-SOURCE ANALYSIS

TASK CLASSIFICATION:
  TEST_ONLY CONTRACT CORRECTION

CURRENT TASK-LEVEL AUTHORIZATION:
  DOCUMENTATION_ONLY

BF3-R1 DURABLE RESULT:
  INSTALLED / PRESERVED

BF3-R1 LIFECYCLE CLOSURE:
  INSTALLED / BOUND BY ACTUAL MERGE + FILE IDENTITY

NEXT LAWFUL GATE ENTERING THIS CANDIDATE:
  NO_PROVIDER_CONTACT_NEEDED_YET

BF3-R2 CONTRACT:
  FINAL CORRECTED CANDIDATE

PROVIDER CONTACT:
  NONE AUTHORIZED

RETAINED-SOURCE ANALYSIS TOOL EXECUTION:
  NOT AUTHORIZED

TEST-ONLY SYNTHETIC HARNESS / MATRIX VALIDATION:
  COMPLETED

RETAINED SDK COMPILE-ONLY CHECK:
  NOT AUTHORIZED

RETAINED SDK JAVASCRIPT EVALUATION:
  NONE AUTHORIZED

BROWSER EXECUTION:
  NONE AUTHORIZED

BF3-R2 EXECUTION:
  NOT AUTHORIZED

EXIMBAY SDK CANONICAL VERSION:
  UNRESOLVED

EX2B2:
  BLOCKED

NEXT:
  ONE BF3R2-AUD-002 FOCUSED CLOSURE REVIEW ONLY
```

This bounded correction preserves the nine already closed findings and
completes the mechanical correction of BF3R2-AUD-002. It does not execute BF3-R2,
parse or source-inspect either
retained SDK body, construct a `vm.Script` from either retained body, contact
Eximbay, or load a browser. The authoring-only local inventory and synthetic
preflight described below used no retained SDK text and grants no future
execution authority.

The exact launcher, harness, containment profile, schema corrections, and
reachable-state rules in Sections 36–45 are normative and decision-bearing.
Where an earlier sentence conflicts with Sections 36–45, those later sections
control. This narrow precedence exists only to complete BF3R2-AUD-002;
BF3R2-AUD-003 remains closed and the broad review is not reopened.

## 1. Purpose and exact question

BF3-R2 is a prospective, separately gated method for answering only:

```text
Do the exact retained TEST V2 and TEST V1 Unicode source texts receive the
same bounded Script-syntax and syntactic source-shape observations from:

1. one pinned Espree Script parse; and
2. one independent Node/V8 compile-only Script construction?
```

It does not answer browser compatibility, useful runtime behavior, provider
recommendation, SDK canonicality, current provider response identity, or
EX2B2 readiness.

## 2. Governing installed authority

This candidate is subordinate to, in order:

1. [BF3-R1 Lifecycle Closure v0.1](./eximbay-bf3-r1-lifecycle-closure-v0.1.md), installed by merge `dc0c90b66ea4e1d901e152714e4c9b8959bb6bb7`.
2. [BF3-R1 E1 Derived-Evidence Result Evidence / Independent Adjudication v0.1](./eximbay-bf3-r1-derived-evidence-result-adjudication-v0.1.md), installed by merge `482bfbb20063eaf525756f159d9532d3abb9e938`.
3. [BF3-R1 Content-Type Anomaly Retained-Byte Derived-Evidence Contract v0.1](./eximbay-bf3-r1-content-type-anomaly-retained-byte-evidence-contract-v0.1.md).
4. [BF3 Static JavaScript SDK Result Evidence / Independent Adjudication v0.1](./eximbay-bf3-static-sdk-result-adjudication-v0.1.md).
5. [BF3 Static JavaScript SDK Evidence / Execution Contract v0.1](./eximbay-bf3-static-javascript-sdk-evidence-contract-v0.1.md).
6. The exact external evidence identities frozen in this contract.
7. The primary specifications and tool documentation in Section 4.

The installed lifecycle closure identity was independently recomputed from the
exact file at the installed merge, not from a working-tree copy, filename,
README, decision log, Git blob ID, or author-reported pre-merge hash:

```text
BF3R1LifecycleClosureMergeSha:
  dc0c90b66ea4e1d901e152714e4c9b8959bb6bb7

BF3R1LifecycleClosurePath:
  docs/engineering/eximbay-bf3-r1-lifecycle-closure-v0.1.md

BF3R1LifecycleClosureByteCount:
  10013

BF3R1LifecycleClosureSha256:
  53ab1638326a6e377aa92eec25257afde50fd3a7b5b79fdf4fed30c2db392880

BF3R2-AUD-001:
  CLOSED
```

The entering state is immutable:

```text
BF3-R1 CONTRACT:
  INSTALLED

BF3-R1 E1 PACKAGE:
  VALID

BF3-R1 E1 EXECUTION:
  CONFORMANT

DERIVED SEMANTIC EVIDENCE:
  COMPLETE_ADMITTED

HISTORICAL BF3 RESULT:
  IMMUTABLE

BF3-R1 E1 RE-EXECUTION:
  NOT AUTHORIZED

PROVIDER CONTACT:
  NOT AUTHORIZED

EX2B2:
  BLOCKED

NEXT LAWFUL GATE:
  NO_PROVIDER_CONTACT_NEEDED_YET
```

BF3-R2 is additive. It does not reopen BF3 or BF3-R1 E1 and is not a repeat of
the BF3-R1 E1 method.

## 3. Current-task non-authority and activity separation

The four activity classes are distinct:

```text
A. ANALYSIS HARNESS EXECUTION
   Future authority: only the exact separately pinned offline harness and
   exact verified parser/runtime closure, after reviewed merge and a separate
   explicit BF3-R2 invocation.

B. RETAINED SDK PARSING / COMPILE-ONLY CHECK
   Future authority: exactly one Espree parse and one vm.Script construction
   per decoded original source, only after every global gate passes.

C. RETAINED SDK JAVASCRIPT EVALUATION
   Authority: NONE, always prohibited by BF3-R2.

D. BROWSER / PROVIDER CONTACT
   Authority: NONE; browser requests 0 and provider requests 0.
```

Espree is implemented in JavaScript, so the future analysis harness necessarily
executes pinned analysis-tool JavaScript. That fact never converts retained SDK
text into evaluated JavaScript.

## 4. Fixed primary-source findings

Retrieval date: **2026-08-12**.

### 4.1 ECMAScript edition and grammar goal

The normative language edition is the fixed
[ECMAScript 2026 / ECMA-262 17th edition](https://tc39.es/ecma262/2026/), not
the moving latest specification.

ECMA-262 2026 Section 5.1.4 defines `Script` and `Module` as two alternative
syntactic grammar goals. Section 16.1.5 defines `ParseScript` by parsing the
source text as `Script`; Section 16.1.1 separately supplies Script Early Error
rules; and Section 16.1.6 defines `ScriptEvaluation` as the later operation that
creates and uses an execution context. See the fixed
[syntactic grammar](https://tc39.es/ecma262/2026/multipage/notational-conventions.html#sec-syntactic-grammar)
and [Scripts and Modules](https://tc39.es/ecma262/2026/multipage/ecmascript-language-scripts-and-modules.html#sec-parse-script).

Therefore:

```text
BF3-R2 grammar goal:
  Script

Module goal:
  PROHIBITED

successful parsing / Early Error acceptance:
  distinct from ScriptEvaluation

successful Script syntax witness:
  does not establish evaluation, browser loading, or useful runtime behavior
```

The Script goal matches the installed evidence that current provider
documentation models the SDK as a classic external script. BF3-R2 does not
infer browser-load success from that match.

### 4.2 Node `vm.Script`

The exact current authority is
[Node.js v24.18.0 `node:vm`](https://nodejs.org/download/release/v24.18.0/docs/api/vm.html#new-vmscriptcode-options).
It states that constructing `new vm.Script(code, options)` compiles `code` but
does not run it; the separate `runInContext`, `runInNewContext`, and
`runInThisContext` methods run compiled code.

BF3-R2 authorizes only construction. All `script.runIn*`, all `vm.runIn*`, and
`script.createCachedData()` calls are prohibited. `importModuleDynamically` is
omitted, and no source-map URL property is read or fetched.

### 4.3 Espree

The official [Espree parser README](https://github.com/eslint/js/blob/main/packages/espree/README.md#options)
documents `ecmaVersion: 2026`, `sourceType: "script"`, `range`, `loc`,
`comment`, `tokens`, and the `globalReturn`, `impliedStrict`, and `jsx`
features. It also states that Espree has no tolerant option. ESLint documents
`sourceType: "script"` as non-module shared-global Script mode in its
[language options](https://eslint.org/docs/latest/use/configure/language-options).

## 5. Authoring-only local toolchain inventory

No package was installed, updated, or downloaded. The existing lock and local
installation contain:

| Package | Locked/installed version | `package-lock.json` integrity |
| --- | --- | --- |
| `espree` | `10.4.0` | `sha512-j6PAQ2uUr79PZhBjP5C5fhl8e39FmRnOjsD5lGnWrFU8i2G776tBK7+nP8KuQUTTyAZUwfQqXAgrVH5MbH9CYQ==` |
| `acorn` | `8.16.0` | `sha512-UVJyE9MttOsBQIDKw1skb9nAwQuR5wuGD3+82K6JgJlm/Y+KI92oNsMNGZCYdDsVtRHSak0pcV5Dno5+4jh9sw==` |
| `acorn-jsx` | `5.3.2` | `sha512-rq9s+JNhf0IChjtDXxllJ7g41oZk5SlXtp0LHwyA5cejwn7vKmKp4pPri6YEePv2PU65sAsegbXtIinmDFDXgQ==` |
| `eslint-visitor-keys` | `4.2.1` | `sha512-Uhdk5sfqcee/9H/rCOJikYz67o0a2Tw2hGRPOG2Y1R2dg7brRe1uG0yaNQDHu+TO/uQPF/5eCapvYSmHUjt7JQ==` |

The frozen local execution identity is:

```text
working directory:
  /Users/duckcow/workspace/mira

Node process.execPath:
  /opt/homebrew/Cellar/node@24/24.18.0/bin/node

Node version:
  v24.18.0

V8 version:
  13.6.233.17-node.50

Node executable bytes:
  68384

Node executable SHA-256:
  7bf42b0fd150fdb2d2ffe5e2ae83d2e2fec70411c7694ba59aaf6c145b2c637d

package-lock.json bytes:
  357705

package-lock.json SHA-256:
  594ab37544f7c782fb66b246675022bfe803d63c9148dace3aa7f447926d3013

authoring environment NODE_OPTIONS:
  ABSENT

authoring environment NODE_PATH:
  ABSENT
```

### 5.1 Entrypoint identities

| Package | Resolved runtime entrypoint | `package.json` bytes / SHA-256 | Entrypoint bytes / SHA-256 |
| --- | --- | --- | --- |
| `espree` | `node_modules/espree/dist/espree.cjs` | `2314` / `76d68e5b8ac5aae00882165c4feae4a8a8825ccb4ea76ab8af0f02ba320fd250` | `31219` / `e87a07d485a7454be1c17240c5112516e4e92748647d92e7a692665b2c51920f` |
| `acorn` | `node_modules/acorn/dist/acorn.js` | `1061` / `705aa08b7b4fee1112244952b4843c40c381a3c7a9fc77101f369a172865bfac` | `242818` / `2261c5f0e4abe860e889dfc67081683a4ba4d27deb7f4cbc8ad06a1b7fdd510c` |
| `acorn-jsx` | `node_modules/acorn-jsx/index.js` | `581` / `5e123a5ee3b16fd10fe4b44ef70ff7885f05117fb9ae75f72a0d821f919d423d` | `15827` / `5ab23edca59b840bc26ba711131a5b649540b70da53d70ae1bbcdb13480c1aa1` |
| `eslint-visitor-keys` | `node_modules/eslint-visitor-keys/dist/eslint-visitor-keys.cjs` | `2222` / `f479c384cbd48ab3d95ba3f02f332ee42320b408a09f1cb8f1d3da96273ed4d3` | `7586` / `fb38b107549dfcae42f93ab3eed605860a526cf81b5199c3a6935bb74e0f6694` |

Espree's CommonJS entrypoint loads all three other packages. `acorn-jsx` is
loaded by that entrypoint even when JSX parsing is disabled.

### 5.2 Deterministic package-directory closure

Package-lock integrity is not treated as proof of current `node_modules`
bytes. `BF3R2_PACKAGE_DIRECTORY_MANIFEST_V1` recursively enumerates each exact
package directory. Every entry must be a directory or a regular non-symlink
file; any symlink or other file type fails. Each file contributes one UTF-8
line:

```text
<path relative to node_modules/><TAB><decimal byte count><TAB><lowercase SHA-256><LF>
```

Paths use `/`, contain no `.` or `..` component, and are sorted by unsigned
UTF-8 byte order. The SHA-256 of the complete line sequence is the package
manifest hash. The frozen identities are:

| Package | Regular files | Symlinks | Manifest SHA-256 |
| --- | ---: | ---: | --- |
| `espree` | 10 | 0 | `8e30b6d0429c7335016f10c9bf8041b094a43fb381694f1278acc506ac2efdf2` |
| `acorn` | 10 | 0 | `7c6dd254a48de5b35447f72073ab363e742c08ee8576c27e38f4c42533bf550b` |
| `acorn-jsx` | 6 | 0 | `d3ac9280bcaf5fd88c897259787193200f85d6f2be5bf78866c3713a822abd6a` |
| `eslint-visitor-keys` | 9 | 0 | `049733debade3d5643c59cad036488c8c144284644eb54c25c9356b2d9d405c6` |

All four package manifests, exact entrypoint resolutions, versions, lock
integrities, package metadata hashes, and runtime entrypoint hashes must match
before retained source is read into either syntax witness.

## 6. Future execution containment

The only qualifying implementations are the exact embedded launcher in
Section 36 and Node harness V4 in Section 37. A future executor does not
generate, rewrite, transpile, wrap, or substitute either. Their semantic-byte
extraction rules are frozen in those sections. The harness identity is:

```text
HarnessPath: /private/tmp/mira-bf3r2/harness-v4.cjs
HarnessByteCount: 107473
HarnessSha256: fbc8642fa193f8e2282898d68ab065be179c7d354b07df1c2f46408709e5a521
```

The host boundary is the exact `/usr/bin/sandbox-exec` binary and exact embedded
profile in Section 37:

```text
SandboxExecPath: /usr/bin/sandbox-exec
SandboxExecByteCount: 102560
SandboxExecSha256: fd89e1f6e6d822fcc0f3844bd11fecdc9b68f705f80c32f4334bc23913d5451b
NetworkProfilePath: /private/tmp/mira-bf3r2/deny-network.sb
NetworkProfileByteCount: 44
NetworkProfileSha256: 5c358b8d847211333e7ba22df82d84f796b5f30a41a2682209a949d783adbd08
```

The environment-clearing launcher is also frozen:

```text
EnvironmentEnforcementPath: /usr/bin/env
EnvironmentEnforcementByteCount: 102368
EnvironmentEnforcementSha256: 5f7e5b1c7e0e934b8f2891cb8d3f3fe726bbf294a5869b5925d423b71198ee38
```

Before extraction, `/private/tmp/mira-bf3r2` must be newly created with mode
`0700`, owned by the invoking user, and contain no prior entries. Extraction
uses `O_CREAT|O_EXCL|O_NOFOLLOW`, mode `0600`, writes the exact semantic bytes,
performs complete read-back, and compares byte count, SHA-256, and direct byte
equality. A pre-existing path, symlink, different byte, BOM, CR, or missing
final LF is `TOOLCHAIN_IDENTITY_FAILED`. The same rules apply to the profile.

The exact future process is launched from working directory
`/Users/duckcow/workspace/mira` only through the exact Section 36 `/bin/sh`
launcher. Its fixed child vector is:

```text
/usr/bin/env -i
  BF3R2_LAUNCH_FD=3
  HOME=/private/tmp/mira-bf3r2/home
  LANG=C
  TMPDIR=/private/tmp/mira-bf3r2/tmp
  /usr/bin/sandbox-exec
  -f /private/tmp/mira-bf3r2/deny-network.sb
  /opt/homebrew/Cellar/node@24/24.18.0/bin/node
  /private/tmp/mira-bf3r2/harness-v4.cjs
  --mode run
  --run-id <^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$>
  --contract-merge <reviewed installed 40-lowercase-hex merge SHA>
  --contract-sha256 <exact installed contract SHA-256 at that merge>
  --harness-sha256 fbc8642fa193f8e2282898d68ab065be179c7d354b07df1c2f46408709e5a521
  --profile-sha256 5c358b8d847211333e7ba22df82d84f796b5f30a41a2682209a949d783adbd08
  --launch-token-path <exact mode/run-derived path>
  --launch-parent-pid <launcher decimal PID>
```

macOS injects one fixed CoreFoundation value at process creation. The harness
therefore requires the complete child environment to have exactly these five
entries and values, and no others:

```text
BF3R2_LAUNCH_FD=3
HOME=/private/tmp/mira-bf3r2/home
LANG=C
TMPDIR=/private/tmp/mira-bf3r2/tmp
__CF_USER_TEXT_ENCODING=0x1F5:0x3:0x33
```

The pre-Node launcher is primary startup authority and accepts no Node startup
flag. `process.execArgv == []`, exact environment, and cache inspection are
defense in depth only and never establish that no preload ran. `NODE_OPTIONS`
and `NODE_PATH` are absent because the exact environment admits neither. The
pre-parser `require.cache` must contain only the realpath of the harness main
module. All parser paths are absolute, regular, non-symlink paths whose
realpaths, package manifests, entrypoints, versions, and complete directory
manifests match Section 5. Alternate/global resolution and a prepopulated
decision-bearing cache are `TOOLCHAIN_IDENTITY_FAILED`.

The profile uses host-enforced `(deny network*)`, inherited by the Node process
and every child. Before parser loading, the harness attempts only a local
`127.0.0.1` ephemeral bind/listen. Exactly `EPERM` or `EACCES` proves the
boundary. A successful bind or any other result is `NETWORK_CONTAINMENT_FAILED`
and stops before retained decoding. Authoring validation distinguished this
from ordinary failure: the same synthetic bind succeeded without containment,
failed `EPERM` with the frozen profile, and an allow-network profile made the
harness fail closed. No external connection was attempted.

No `npx`, `npm install`, `npm update`, `npm ci`, `pnpm`, `yarn dlx`, `curl`,
`wget`, provider request, SDK request, source-map fetch, remote import, alternate
parser, global package, or package-manager fallback exists. A missing package
is a local toolchain failure.

## 7. Prohibited retained-source loading and evaluation

The retained SDK path or text must never be supplied to:

```text
require
import
dynamic import
Module._compile
eval
new Function
vm.compileFunction
vm.SourceTextModule
vm.runInContext / vm.runInNewContext / vm.runInThisContext / any vm.runIn*
script.runInContext / script.runInNewContext / script.runInThisContext
browser <script>
Playwright
Puppeteer
jsdom execution
```

The only V8 interaction with retained text is the one exact compile-only
`new vm.Script` construction per asset in Section 12. No run method may follow.

## 8. Repository and contract authority gate

The primary entering authority is the installed lifecycle closure:

```text
merge SHA:
  dc0c90b66ea4e1d901e152714e4c9b8959bb6bb7

path:
  docs/engineering/eximbay-bf3-r1-lifecycle-closure-v0.1.md

bytes:
  10013

SHA-256:
  53ab1638326a6e377aa92eec25257afde50fd3a7b5b79fdf4fed30c2db392880
```

The prior installed BF3-R1 durable record remains additionally bound as:

```text
merge SHA:
  482bfbb20063eaf525756f159d9532d3abb9e938

record path:
  docs/engineering/eximbay-bf3-r1-derived-evidence-result-adjudication-v0.1.md

record bytes:
  15211

record SHA-256:
  f84ac369a30a496a8e1f98d1987439d6a9ee905bb1b986d3073089513603e65f
```

A future run uses exact `git show <merge>:<path>` bytes to verify all four
lifecycle fields, verifies that lifecycle merge is an ancestor of the actual
reviewed BF3-R2 contract merge, and binds the actual SHA-256 of this contract
file at that merge. It does not read the working-tree copies as authority. A
missing merge, non-ancestor authority, lifecycle mismatch, wrong installed
record, candidate-only contract, or contract-file mismatch stops before
external evidence inspection with execution terminal state only:

```text
process exit: 66
terminal state: UPSTREAM_LIFECYCLE_AUTHORITY_FAILED
EcmaSourceShapeEvidence-v1: NOT CREATED
```

There is no fallback to the stale embedded BF3-R1 result status, README,
decision log, filename existence, working-tree file, or Git blob SHA. No
repair, checkout, fetch, reset, or substitution is authorized during the
future evidence run.

## 9. BF3-R1 package and historical source custody gate

### 9.1 BF3-R1 E1 package

The derived run is:

```text
derivedRunId:
  20260812T003616Z-88533a1e

external root:
  /Users/duckcow/mira-evidence/eximbay-bf3-r1/20260812T003616Z-88533a1e

DerivedEvidencePackageIntegrity-v1 basename:
  bf3-r1-derived-evidence-package-integrity-v1-20260812T003616Z-88533a1e.json

bytes / SHA-256:
  1423 / f5ce567de7ecfb1aa6a729c624417f1d02243f7e8258835d8880af2f65e52f1e

DerivedEvidence-v1 basename:
  bf3-r1-derived-evidence-v1-20260812T003616Z-88533a1e.json

original and archive bytes / SHA-256:
  8233 / 76ae11e1e5c2de3d09ef0ac016274279f9738d825be4ebe9c38c6efe33f55a55
```

Before interpreting source, the future gate must revalidate the complete
three-file package read-only: no-follow regular-file status, expected counts
and hashes, distinct original/archive stable filesystem identities, direct
byte equality, `BF3_CANONICAL_JSON_UTF8_V1` canonical bytes, exact installed
schemas, `PACKAGE_VALID / NONE`, and the admitted facts recorded by the durable
result. It must not re-execute BF3-R1 E1.

### 9.2 Historical BF3 source assets

The exact semantic source inputs remain:

| Ordinal | Identity | Original/archive basename | Bytes | SHA-256 |
| ---: | --- | --- | ---: | --- |
| 1 | `TEST_V2` | `01-test-v2-javascriptSDK.js` | 4287 | `d324cb484f3c4c56f949329f5ddf4ca62e012c72ef530febe3ce77db35a396b7` |
| 2 | `TEST_V1` | `02-test-v1-javascriptSDK.js` | 3459 | `9b818e54c11267d85f9c57a0e2e10370abb850d1a20df4368cde4b4bd8a89ef2` |

Their root remains historical BF3 run
`/Users/duckcow/mira-evidence/eximbay-bf3/20260811T220109Z-c4779de2/`.
For both original/archive pairs, reuse
`BF3R1_HISTORICAL_CUSTODY_NOFOLLOW_V1`: each path entry itself is a regular
non-symlink, the pair has distinct stable filesystem identities, both complete
reads match the expected count/hash, and direct byte equality succeeds.

All BF3-R1 package and historical asset checks are one global gate. A failure
in any member is `UPSTREAM_CUSTODY_FAILED`; no asset proceeds alone. The
archive is custody proof only. The original file is the sole semantic source
input and no source may be substituted.

## 10. Exact UTF-8 source decode

Reuse without change:

```text
BF3R1_WHATWG_UTF8_DECODE_WITHOUT_BOM_OR_FAIL_V1
```

The method performs fatal WHATWG UTF-8 decoding over the exact original bytes,
preserves a decoded leading U+FEFF, performs no replacement decoding and no
Unicode normalization, and reproduces the installed BF3-R1 preflight vectors.
Re-running it under BF3-R2 is a new BF3-R2 method invocation, not BF3-R1 E1
re-execution.

`utf8DecodeOutcome` is `SUCCEEDED`, `INVALID_UTF8`, or `METHOD_FAILED` after a
valid global gate and is `null` when the global gate prevents decoding.

## 11. Pinned Espree Script witness

Method identifier:

```text
BF3R2_ESPREE_SCRIPT_PARSE_V2
```

Call `espree.parse(decodedSourceText, options)` exactly once per decoded asset
with this complete option object:

```json
{
  "ecmaVersion": 2026,
  "sourceType": "script",
  "range": true,
  "loc": false,
  "tokens": false,
  "comment": true,
  "ecmaFeatures": {
    "globalReturn": false,
    "impliedStrict": false,
    "jsx": false
  }
}
```

No option is inherited. `allowReserved`, `sourceFile`, `latest`, module,
commonjs, unambiguous mode, JSX, TypeScript, Babel syntax, tolerant/recovery
mode, and extensions are absent or prohibited.

The result vocabulary is exact:

```text
SUCCEEDED
  the exact Espree parse invocation returned normally. This outcome ends at
  the parse-call boundary.

SYNTAX_REJECTED
  the exact parse call threw SyntaxError.

METHOD_FAILED
  the exact Espree parse invocation threw a non-SyntaxError operational
  failure.
```

No error message, stack, token text, snippet, range, line, or column is
retained or logged. A caught `SyntaxError` is reduced immediately to the enum.
Once `espreeParseOutcome == SUCCEEDED`, AST admission, invariant, comment,
range, traversal, classification, predicate, aggregation, or vector failure
may only set `sourceShapeOutcome == SOURCE_SHAPE_METHOD_FAILED`; it never
mutates the completed parse fact.

## 12. Independent V8 compile-only Script witness

Method identifier:

```text
BF3R2_NODE_VM_SCRIPT_COMPILE_ONLY_V1
```

Construct exactly once per decoded asset:

```text
new vm.Script(decodedSourceText, {
  filename: "bf3-r2-retained-script.js",
  lineOffset: 0,
  columnOffset: 0,
  produceCachedData: false
})
```

`cachedData` and `importModuleDynamically` are omitted. No property of the
returned Script is inspected except successful construction; in particular,
`sourceMapURL`, `cachedData`, and `cachedDataProduced` are not read. The Script
object is discarded without any run or cache method.

The exact outcome vocabulary is:

```text
SUCCEEDED
  construction returned a vm.Script object.

SYNTAX_REJECTED
  construction threw SyntaxError.

METHOD_FAILED
  construction produced any other operational failure.
```

Error messages and stacks are suppressed and never enter evidence.

## 13. Dual Script-syntax outcome

`dualScriptSyntaxOutcome` is selected by first matching rule:

| Precedence | Condition | Outcome |
| ---: | --- | --- |
| 1 | either witness is `null` or `METHOD_FAILED` | `METHOD_INCOMPLETE` |
| 2 | both are `SUCCEEDED` | `BOTH_ACCEPTED` |
| 3 | both are `SYNTAX_REJECTED` | `BOTH_REJECTED` |
| 4 | Espree succeeded; V8 rejected | `ESPREE_ACCEPTED_V8_REJECTED` |
| 5 | Espree rejected; V8 succeeded | `ESPREE_REJECTED_V8_ACCEPTED` |

`BOTH_ACCEPTED` means only that both exact pinned witnesses accepted the exact
decoded source. It is not a formal proof of ECMA-262 validity. `BOTH_REJECTED`
is complete dual-witness negative syntax evidence, not universal rejection by
every ECMAScript implementation.

## 14. Script-goal and non-evaluation preflight

Before retained decoding, both witnesses must reproduce this synthetic set:

| Vector | Source class | Espree | V8 | Additional invariant |
| --- | --- | --- | --- | --- |
| `ORDINARY_SCRIPT` | `var x = 1;` | accept | accept | Program is Script |
| `MODULE_EXPORT` | `export {};` | syntax reject | syntax reject | proves Script, not Module |
| `GLOBAL_RETURN` | top-level `return 1;` | syntax reject | syntax reject | global return remains disabled |
| `MODERN_SCRIPT` | optional chaining, nullish coalescing, class static block | accept | accept | no claim that V8 implements every 2026 feature |
| `NON_EXECUTION_SENTINEL` | exact source below | accept | accept | sentinel remains exactly unchanged after parse/construction |

The fixed host-global key is
`__MIRA_BF3R2_NON_EVALUATION_SENTINEL_7F4C9A__`. Its initial host value is the
Number `0`. The exact UTF-8, LF-only, no-BOM synthetic source is:

```javascript
globalThis["__MIRA_BF3R2_NON_EVALUATION_SENTINEL_7F4C9A__"] += 1;
```

The semantic source includes the displayed final LF. Its byte count is `66`
and its SHA-256 is
`ae7d03d79aa631f24bd44de860fcf67feee7822ff3099c2d9874e35616333e5c`.
Before Espree it must be `0`; after the exact Espree parse it must remain
`0`; after exact `vm.Script` construction it must remain `0`. The harness then
deletes the property in `finally` and proves the key is absent. This source
would deterministically increment the host-visible Number if evaluated in the
host realm. Any mutation or cleanup failure is
`NON_EVALUATION_PREFLIGHT_FAILED`; no retained decoding begins.

## 15. Source-shape admission and AST validation

Source-shape extraction is admitted only when both witness outcomes are
`SUCCEEDED`. Otherwise:

```text
sourceShapeOutcome:
  NOT_ADMITTED

sourceShape:
  null
```

The one returned Espree AST is reused; no second parse occurs. Before
extraction it must satisfy `BF3R2_ESPREE_AST_ADMISSION_V2`:

- root type `Program`, `sourceType == "script"`, and a safe, in-bounds,
  nondecreasing root range; the root range is not treated as raw-source
  coverage;
- every visited node has a two-integer in-bounds nondecreasing range;
- traversal uses only the exact `eslint-visitor-keys` 4.2.1 `KEYS` mapping;
- every node type has an exact visitor-key entry and every declared child is a
  node, null, or ordered node array as applicable;
- repeated object identity, cycles, malformed comments, invalid ranges, or an
  unknown node type fail the method; and
- comments have valid ranges, never enter ordinary node traversal, and are
  used only by the bounded classifier below.

A validation or extraction failure yields `SOURCE_SHAPE_METHOD_FAILED` with no
partial source-shape object. The AST is never serialized, logged, or retained.

The complete decoded source coverage is independently
`[0, decodedSourceUtf16Length)`. Espree 10.4.0 synthetic verification froze
these actual Program ranges: leading whitespace `"  x;" -> [2,4]`, trailing
whitespace `"x;  " -> [0,2]`, both `"  x;  " -> [2,4]`, empty source
`"" -> [0,0]`, and whitespace-only `"   \n\t" -> [0,5]`. All five parse,
admit, and aggregate successfully. No rule requires non-empty whitespace-padded
Program range to span the raw source.

## 16. Frozen target vocabulary and lexical-context classifier

The only searchable target strings, in this order, are:

```text
EXIMBAY
request_pay
https://api-test.eximbay.com
https://api.eximbay.com
/v1/payments
```

No newly encountered identifier, literal, URL, path, or comment may be
promoted into evidence.

`BF3R2_UTF16_OVERLAPPING_EXACT_OCCURRENCES_V1` operates over the decoded
JavaScript String's UTF-16 code-unit index space, the same index space used by
Espree ranges. For each target it finds every exact case-sensitive raw spelling,
including overlapping matches, by resuming at `start + 1`. Every occurrence is
the half-open interval `[start,end)`, where
`end = start + targetUtf16Length`. No offsets enter final evidence.

Containment is exactly `containerStart <= occurrenceStart && occurrenceEnd <=
containerEnd`. Intersection is exactly `occurrenceStart < containerEnd &&
containerStart < occurrenceEnd`; adjacent intervals do not intersect. Thus the
identifier and comment in `EXIMBAY/*adjacent*/;` share a boundary but the
occurrence remains `CODE` rather than ambiguous. Static carriers are only
string-valued `Literal` nodes and `TemplateElement` nodes.

`BF3R2_HALF_OPEN_LEXICAL_CONTEXT_PARTITION_V2` applies this exclusive
first-match partition:

```text
COMMENT
  wholly contained in exactly one comment range and intersects no static carrier

STRING_OR_TEMPLATE_STATIC_TEXT
  wholly contained in exactly one static-carrier range and intersects no comment

CODE
  intersects neither comment nor static-carrier range

UNCLASSIFIED
  every other case, including a boundary-crossing or conflicting range
```

For each target record `exactOccurrenceCount`, then the four class counts in
the order above. Their sum must equal `exactOccurrenceCount`. The output
contains no offsets or source. `UNCLASSIFIED` is a bounded completed result,
not silently promoted to `CODE`; it emits a warning and remains visible to the
later adjudicator.

`CODE` means only outside the two excluded lexical carrier classes. It does
not prove that the occurrence is an identifier, reachable, or executable.
Template quasi raw text is static-carrier text; an occurrence within a
`${...}` expression is classified from that expression and normally becomes
the residual `CODE`. A regex literal is not a string-valued Literal carrier,
so a raw target within regex syntax is also residual `CODE`. Escaped identifier
or property spellings do not become raw occurrences, although the independent
static AST property predicate may recognize an escaped string property's
decoded value. The synthetic boundary, template, regex, and escape vectors in
Section 39 freeze these distinctions.

## 17. Exact static property and EXIMBAY base predicates

`BF3R2_STATIC_PROPERTY_NAME_V1(node, name)` is true only for:

- a non-computed `Identifier` property/key whose `name` equals `name`; or
- a `Literal` property/key whose string `value` equals `name`, with computed or
  ordinary literal-key syntax.

Zero-expression template properties are deliberately omitted. No computed
expression, concatenation, variable, or dataflow is resolved.

`BF3R2_STATIC_EXIMBAY_BASE_V1` recognizes only:

1. `Identifier` with name `EXIMBAY`; or
2. non-optional `MemberExpression` whose object is the `Identifier` `window`,
   `globalThis`, or `self`, and whose static property is `EXIMBAY`.

`this.EXIMBAY`, optional chains, aliases, scope identity, and dataflow are not
recognized. A match is a static syntactic pattern only; even a locally shadowed
`window` still receives no browser-global claim.

## 18. `request_pay` member and call-callee predicates

`EXIMBAY_REQUEST_PAY_MEMBER_PATTERN` matches a non-optional
`MemberExpression` exactly when its object matches
`BF3R2_STATIC_EXIMBAY_BASE_V1` and its property statically equals
`request_pay`. Record `eximbayRequestPayMemberPatternCount`.

`EXIMBAY_REQUEST_PAY_CALL_CALLEE_PATTERN` matches a non-optional
`CallExpression` exactly when its direct callee matches the member predicate.
Record `eximbayRequestPayCallCalleePatternCount`.

Neither predicate unwraps `ChainExpression`, resolves aliases, or establishes
member existence, callability, reachability, execution, or success.

## 19. Direct function-binding predicate

`functionLike` means exactly `FunctionExpression` or
`ArrowFunctionExpression`. A qualifying object property is exactly a
`Property` with `kind == "init"`, a static `request_pay` key, and a
function-like value. Concise object methods qualify because Espree represents
their value as `FunctionExpression`; getters, setters, spreads, classes, and
non-function values do not.

`BF3R2_DIRECT_REQUEST_PAY_FUNCTION_BINDING_V1` counts one match for each:

1. `AssignmentExpression` with operator `=` whose left side matches
   `EXIMBAY_REQUEST_PAY_MEMBER_PATTERN` and right side is function-like;
2. `AssignmentExpression` with operator `=` whose left side is the identifier
   `EXIMBAY` and right side is an `ObjectExpression`, once per qualifying
   property;
3. `VariableDeclarator` whose id is the identifier `EXIMBAY` and initializer is
   an `ObjectExpression`, once per qualifying property; or
4. `AssignmentExpression` with operator `=` whose left side is a
   `window`/`globalThis`/`self` static EXIMBAY base and right side is an
   `ObjectExpression`, once per qualifying property.

This covers the reviewed direct assignment, arrow, computed string property,
object initializer, declaration initializer, and browser-name member forms.
It excludes `Object.defineProperty`, `Object.assign`, prototypes, aliases,
computed dataflow, closure analysis, minifier reconstruction, and control-flow
analysis. A positive count remains a syntactic pattern only.

## 20. Static endpoint/path carriers

For each of:

```text
https://api-test.eximbay.com
https://api.eximbay.com
/v1/payments
```

the corresponding static-string-carrier count is exactly its
`STRING_OR_TEMPLATE_STATIC_TEXT` occurrence count from Section 16. The method
does not decode escape spellings, concatenate strings, infer network use,
select endpoints, or infer request construction.

## 21. Bounded source-shape vector

No coarse AST totals are collected because they do not materially narrow the
next adjudication. No full AST, arbitrary node detail, identifier, literal,
comment, range, line, column, or source excerpt enters evidence.

The exact ordered vector is:

```text
0  EXIMBAY CODE occurrence count
1  request_pay CODE occurrence count
2  EXIMBAY_REQUEST_PAY_MEMBER_PATTERN count
3  EXIMBAY_REQUEST_PAY_CALL_CALLEE_PATTERN count
4  directRequestPayFunctionBindingPatternCount
5  test-origin static-string-carrier count
6  production-origin static-string-carrier count
7  /v1/payments static-string-carrier count
```

`decodedSourceUtf16Length` must satisfy
`Number.isSafeInteger(value) && value >= 0`. Every occurrence count,
classification count, pattern count, carrier count, vector element, byte count,
and other evidence integer must be a non-negative safe integer. Every bounded
source-derived count additionally satisfies `count <=
decodedSourceUtf16Length`; increments and sums are checked before admission.
Any violation after successful syntax witnesses is
`SOURCE_SHAPE_METHOD_FAILED`, preserving the completed syntax facts. No rounded
unsafe Number enters evidence.

For hashing only, construct the exact
transient object with field order `schema`, `version`, `values`:

```text
schema: mira.eximbay.bf3-r2-bounded-source-shape-vector
version: 1
values: the exact eight-integer array above
```

Canonicalize it with `BF3_CANONICAL_JSON_UTF8_V1`, including its single final
LF, and compute SHA-256. The digest is
`boundedSourceShapeVectorSha256`; it is a hash of this approved bounded vector
serialization, not a hash of the AST or source.

## 22. Frozen synthetic source-shape vectors

These vectors use synthetic source only. The expected vector is the exact
eight-element Section 21 order.

| ID | Synthetic source shape | Expected vector | Additional lexical fact |
| --- | --- | --- | --- |
| A | `var EXIMBAY = { request_pay: function () {} };` | `[1,1,0,0,1,0,0,0]` | both names `CODE` |
| B | `EXIMBAY.request_pay();` | `[1,1,1,1,0,0,0,0]` | direct call-callee only |
| C | `EXIMBAY["request_pay"] = () => {};` | `[1,0,1,0,1,0,0,0]` | `request_pay` is one static-string occurrence |
| D | `window.EXIMBAY = { request_pay() {} };` | `[1,1,0,0,1,0,0,0]` | browser-name base is syntactic only |
| E | one string containing `EXIMBAY request_pay https://api-test.eximbay.com/v1/payments` | `[0,0,0,0,0,1,0,1]` | four matching targets are static-string only |
| F | one line comment `// EXIMBAY.request_pay` | `[0,0,0,0,0,0,0,0]` | both names are one `COMMENT` occurrence |
| G | `obj[dynamicName] = function () {};` | `[0,0,0,0,0,0,0,0]` | dynamic property is not resolved |

Every other target/class count is zero for A–G unless explicitly stated. The
preflight must reproduce the complete five-target lexical records, pattern
counts, vector, and vector hash for all seven before historical decoding. A
mismatch sets `toolchainIdentityOutcome` to `FAILED` before retained decoding;
there is no fallback and no per-asset result is invented.

## 23. V2/V1 comparison model

The comparison object has only fixed bounded facts. Each status is exactly
`EQUAL`, `DIFFERENT`, or `NOT_COMPARABLE`.

`comparisonOutcome` is `COMPLETED` when every comparison status was derived
mechanically, including legitimate `NOT_COMPARABLE` statuses, or
`METHOD_FAILED` when operational derivation failed. `METHOD_FAILED` requires
all five statuses to be `NOT_COMPARABLE`; no partial comparison is authoritative
and no alternate comparator is selected. Global-gate failures create no
semantic artifact and therefore have no comparison object.

```text
dualScriptSyntaxOutcomeComparison
  EQUAL or DIFFERENT only when neither asset is METHOD_INCOMPLETE;
  otherwise NOT_COMPARABLE.

sourceShapeOutcomeComparison
  EQUAL or DIFFERENT only when both outcomes are non-null and neither is
  SOURCE_SHAPE_METHOD_FAILED; otherwise NOT_COMPARABLE.

boundedPatternCountsComparison
staticStringCarrierCountsComparison
boundedSourceShapeVectorEquality
  EQUAL or DIFFERENT only when both sourceShapeOutcome values are COMPLETED;
  otherwise NOT_COMPARABLE.
```

The exact compared pattern tuple is member count, call-callee count, then
direct-binding count. The exact static-carrier tuple is test origin,
production origin, then `/v1/payments`. Vector equality is a direct comparison
of the eight integers; equal hashes may corroborate but never substitute for
direct vector equality.

Historical raw-byte inequality is always carried as:

```text
CARRIED_FORWARD_FROM_HISTORICAL_BF3
```

Equal syntax outcomes, counts, or vectors do not establish semantic SDK
equivalence.

## 24. Evidence ceiling and explicit non-claims

BF3-R2 never concludes that:

- `BOTH_ACCEPTED` proves ECMA-262 validity formally or proves browser
  compatibility;
- `BOTH_ACCEPTED` proves evaluation, useful runtime behavior, or error-free
  execution;
- an EXIMBAY base/member/direct-binding pattern proves a browser global exists
  or `request_pay` is callable;
- a call-callee pattern proves a call executes, is reachable, or succeeds;
- endpoint/path static strings prove network use, endpoint selection, or
  request construction;
- equal bounded vectors prove semantic identity;
- any V1/V2 difference selects a canonical SDK;
- either source is current, supported, preferred, or officially recommended
  by Eximbay;
- current provider responses equal the historical bytes;
- the historical Content-Type anomaly is harmless; or
- EX2B2 is ready.

## 25. `EcmaSourceShapeEvidence-v1` schema

The semantic artifact is exactly one JSON object with these fields in this
order. Every field is required; no extension field is allowed.

| Field | Type | Nullable | Constraint |
| --- | --- | --- | --- |
| `schema` | string | no | `mira.eximbay.bf3-r2-ecma-source-shape-evidence` |
| `version` | integer | no | `1` |
| `runId` | string | no | `^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$` |
| `historicalBf3RunId` | string | no | `20260811T220109Z-c4779de2` |
| `bf3r1DerivedRunId` | string | no | `20260812T003616Z-88533a1e` |
| `contractIdentity` | string | no | `EXIMBAY-BF3-R2-OFFLINE-ECMASCRIPT-SOURCE-SHAPE-EVIDENCE-CONTRACT-v0.1` |
| `launchAuthority` | object | no | exact corrected Section 41 object |
| `repositoryAuthority` | object | no | exact Section 25.1 object |
| `upstreamAuthority` | object | no | exact Section 25.2 object |
| `executionEnvironment` | object | no | exact Section 25.3 object |
| `methods` | object | no | exact Section 25.4 object |
| `globalGates` | object | no | exact Section 25.5 object |
| `assets` | array | no | exactly two Section 25.6 records, V2 then V1 |
| `comparison` | object | no | exact Section 25.7 object |
| `warnings` | array | no | exact Section 27 records and order |
| `evidenceOutcome` | string enum | no | exact Section 26 vocabulary |
| `completedAt` | string | no | canonical UTC semantic-cutoff timestamp |

### 25.1 Repository authority object

The fields, in order, are:

| Field | Type | Exact constraint |
| --- | --- | --- |
| `bf3r1LifecycleClosureMergeSha` | string | `dc0c90b66ea4e1d901e152714e4c9b8959bb6bb7` |
| `bf3r1LifecycleClosurePath` | string | exact Section 8 path |
| `bf3r1LifecycleClosureByteCount` | integer | `10013` |
| `bf3r1LifecycleClosureSha256` | string | `53ab1638326a6e377aa92eec25257afde50fd3a7b5b79fdf4fed30c2db392880` |
| `bf3r2ContractPath` | string | `docs/engineering/eximbay-bf3-r2-offline-ecmascript-source-shape-evidence-contract-v0.1.md` |
| `bf3r2ContractMergeSha` | string | actual reviewed 40-lowercase-hex merge SHA |
| `bf3r2ContractFileSha256` | string | actual installed 64-lowercase-hex file hash at that merge |

### 25.2 Upstream authority object

The fields, in order, are:

| Field | Type | Constraint |
| --- | --- | --- |
| `bf3r1PackageIntegrityBasename` | string | exact Section 9.1 basename |
| `bf3r1PackageIntegrityByteCount` | integer | `1423` |
| `bf3r1PackageIntegritySha256` | string | exact Section 9.1 hash |
| `bf3r1PackageIntegrityVerification` | object | exact single-file object below |
| `bf3r1PackageIntegrityClaimsOutcome` | enum | `VERIFIED_REQUIRED_BINDINGS`, `MISMATCH`, or `NOT_VERIFIED` |
| `bf3r1DerivedEvidenceBasename` | string | exact Section 9.1 basename |
| `bf3r1DerivedEvidenceByteCount` | integer | `8233` |
| `bf3r1DerivedEvidenceSha256` | string | exact Section 9.1 hash |
| `bf3r1DerivedEvidenceVerification` | object | exact original/archive pair below |
| `bf3r1DerivedEvidenceCanonicalSchemaOutcome` | enum | `VERIFIED`, `MISMATCH`, or `NOT_VERIFIED` |
| `historicalAssets` | array | exactly two immutable identity objects |
| `historicalAssetVerifications` | array | exactly two pair objects, V2 then V1 |
| `upstreamAdmittedFactsOutcome` | enum | `VERIFIED`, `MISMATCH`, or `NOT_VERIFIED` |

Each historical asset object has fields `ordinal`, `identity`, `basename`,
`expectedByteCount`, and `expectedSha256` in that order and exactly the values
from Section 9.2.

The single-file verification object has fields
`regularNonSymlinkFileStatus`, `observedByteCount`, `observedSha256`, and
`expectedIdentityOutcome` in that order. File status is
`VERIFIED_REGULAR_NON_SYMLINK`, `MISSING_NONREGULAR_OR_SYMLINK`, or
`NOT_VERIFIED`; observed count/hash are both null or both non-null; and expected
identity is `MATCH`, `MISMATCH`, or `NOT_VERIFIED`.

Every original/archive pair object has exactly these fields in order:

```text
originalRegularNonSymlinkFileStatus
originalDeviceIdentifier
originalFileIdentifier
archiveRegularNonSymlinkFileStatus
archiveDeviceIdentifier
archiveFileIdentifier
filesystemIdentityOutcome
originalObservedByteCount
originalObservedSha256
archiveObservedByteCount
archiveObservedSha256
originalArchiveDirectByteEquality
expectedIdentityOutcome
```

The file statuses use the single-file vocabulary. Device/file pairs and
count/hash pairs are each both null or both non-null. Filesystem identity is
`DISTINCT`, `SAME`, or `NOT_VERIFIED`; direct equality is `EQUAL`, `MISMATCH`,
or `NOT_VERIFIED`; expected identity is `MATCH`, `MISMATCH`, or
`NOT_VERIFIED`. `MATCH` requires two regular non-symlinks, distinct stable
identities, both expected complete counts/hashes, and direct equality. The two
historical asset verification records are positionally bound to the two
historical asset identity records.

`upstreamAdmittedFactsOutcome == VERIFIED` requires the canonical, schema-valid
BF3-R1 evidence to contain the exact run, package, execution, semantic outcome,
historical asset identities, and next-gate facts installed by the durable
record. It performs no BF3-R1 method re-execution and admits no source text.

### 25.3 Execution environment object

Section 41 adds the Git bootstrap identity, approved built-in set, and fifth
launch-FD environment entry to this ordered object.

The fields, in order, are:

```text
nodeExecPath
nodeVersion
nodeExecutableByteCount
nodeExecutableSha256
v8Version
workingDirectory
environmentEnforcementPath
environmentEnforcementByteCount
environmentEnforcementSha256
packageLockPath
packageLockByteCount
packageLockSha256
nodeOptionsState
nodePathState
processExecArgv
environment
harnessPath
harnessByteCount
harnessSha256
networkEnforcementPath
networkEnforcementByteCount
networkEnforcementSha256
networkProfilePath
networkProfileByteCount
networkProfileSha256
packageClosures
networkCapability
packageManagerUse
```

All strings and integers equal Sections 5 and 6. Environment enforcement,
harness, network enforcement, and profile identities are independently bound.
`nodeOptionsState` and
`nodePathState` are `ABSENT`; `processExecArgv` is `[]`; `environment` is the
exact five-entry Section 6 object; `networkCapability` is
`PROHIBITED_AND_CONTAINED`; and `packageManagerUse` is `NONE`. Harness,
enforcement binary, and profile identities are exact Section 6 values.
For production evidence,
`executionEnvironment.harnessByteCount == admittedHarnessIdentity.byteCount`
and
`executionEnvironment.harnessSha256 == admittedHarnessIdentity.sha256`.
A merely well-formed different positive count or lowercase 64-hex hash fails
production validation before canonicalization or package admission.

`packageClosures` has exactly four records in Espree, Acorn, acorn-jsx,
eslint-visitor-keys order. Each record has `packageName`, `version`,
`lockIntegrity`, `packageJsonPath`, `packageJsonByteCount`,
`packageJsonSha256`, `runtimeEntrypointPath`, `runtimeEntrypointByteCount`,
`runtimeEntrypointSha256`, `packageFileCount`, and
`packageDirectoryManifestSha256`, all non-null and equal to Section 5.

### 25.4 Methods object

The fields and exact values, in order, are:

| Field | Exact value |
| --- | --- |
| `launchAuthorityMethodIdentifier` | `BF3R2_EXTERNAL_FD3_PARENT_CHILD_LAUNCH_AUTHORITY_V2` |
| `bootstrapBoundaryMethodIdentifier` | `BF3R2_APPROVED_BUILTIN_BOOTSTRAP_AND_GIT_IDENTITY_V1` |
| `stagePrecedenceMethodIdentifier` | `BF3R2_REACHABLE_STAGE_PRECEDENCE_V4` |
| `processEnvironmentAdmissionMethodIdentifier` | `BF3R2_PROCESS_ENVIRONMENT_DEFENSE_IN_DEPTH_V4` |
| `moduleCacheResolutionMethodIdentifier` | `BF3R2_MODULE_CACHE_DEFENSE_IN_DEPTH_V3` |
| `networkContainmentPreflightMethodIdentifier` | `BF3R2_HOST_DENY_NETWORK_LOOPBACK_BIND_V1` |
| `lifecycleAuthorityMethodIdentifier` | `BF3R2_INSTALLED_LIFECYCLE_AUTHORITY_V1` |
| `custodyMethodIdentifier` | `BF3R1_HISTORICAL_CUSTODY_NOFOLLOW_V1` |
| `utf8DecodeMethodIdentifier` | `BF3R1_WHATWG_UTF8_DECODE_WITHOUT_BOM_OR_FAIL_V1` |
| `espreeMethodIdentifier` | `BF3R2_ESPREE_SCRIPT_PARSE_V2` |
| `espreeOptions` | exact Section 11 object with the displayed field order |
| `v8MethodIdentifier` | `BF3R2_NODE_VM_SCRIPT_COMPILE_ONLY_V1` |
| `v8Options` | exact Section 12 object with the displayed field order |
| `astAdmissionMethodIdentifier` | `BF3R2_ESPREE_AST_ADMISSION_V2` |
| `rawOccurrenceEnumeratorMethodIdentifier` | `BF3R2_UTF16_OVERLAPPING_EXACT_OCCURRENCES_V1` |
| `lexicalContextClassifierMethodIdentifier` | `BF3R2_HALF_OPEN_LEXICAL_CONTEXT_PARTITION_V2` |
| `staticPropertyMethodIdentifier` | `BF3R2_STATIC_PROPERTY_NAME_V1` |
| `staticEximbayBaseMethodIdentifier` | `BF3R2_STATIC_EXIMBAY_BASE_V1` |
| `requestPayMemberMethodIdentifier` | `BF3R2_EXIMBAY_REQUEST_PAY_MEMBER_V1` |
| `callCalleeMethodIdentifier` | `BF3R2_EXIMBAY_REQUEST_PAY_CALL_CALLEE_V1` |
| `directBindingMethodIdentifier` | `BF3R2_DIRECT_REQUEST_PAY_FUNCTION_BINDING_V1` |
| `endpointCarrierMethodIdentifier` | `BF3R2_STATIC_ENDPOINT_PATH_CARRIER_V1` |
| `sourceShapeAggregationMethodIdentifier` | `BF3R2_SOURCE_SHAPE_AGGREGATION_V2` |
| `boundedVectorMethodIdentifier` | `BF3R2_BOUNDED_VECTOR_CONSTRUCTION_V2` |
| `boundedVectorCanonicalHashMethodIdentifier` | `BF3R2_BOUNDED_VECTOR_CANONICAL_HASH_V2` |
| `comparisonMethodIdentifier` | `BF3R2_V1_V2_BOUNDED_COMPARISON_WITH_METHOD_FAILURE_V3` |
| `warningMethodIdentifier` | `BF3R2_WARNING_DERIVATION_V2` |
| `semanticOutcomeMethodIdentifier` | `BF3R2_TOP_LEVEL_SEMANTIC_OUTCOME_V3` |
| `analysisHarnessImplementationIdentifier` | `BF3R2_ANALYSIS_HARNESS_V4` |
| `harnessExtractionMethodIdentifier` | `BF3R2_INSTALLED_CONTRACT_EXACT_HARNESS_EXTRACTION_V1` |
| `harnessExtractionAdmissionMethodIdentifier` | `BF3R2_INSTALLED_CONTRACT_HARNESS_IDENTITY_ADMISSION_V1` |
| `evidenceSchemaConstructionMethodIdentifier` | `BF3R2_EVIDENCE_SCHEMA_CONSTRUCTION_AND_VALIDATION_V5` |
| `productionEvidenceValidatorMethodIdentifier` | `BF3R2_EXACT_RECURSIVE_CLOSED_PRODUCTION_EVIDENCE_VALIDATOR_V2` |
| `upstreamAuthorityValidatorMethodIdentifier` | `BF3R2_EXACT_UPSTREAM_AUTHORITY_VALIDATOR_V1` |
| `executionEnvironmentValidatorMethodIdentifier` | `BF3R2_EXACT_EXECUTION_ENVIRONMENT_VALIDATOR_V2` |
| `productionNegativeSchemaVectorMethodIdentifier` | `BF3R2_PRODUCTION_SCHEMA_NEGATIVE_VECTORS_V2` |
| `syntheticValidationMethodIdentifier` | `BF3R2_SEPARATE_TEST_ONLY_SYNTHETIC_VALIDATION_V2` |
| `packageWriteMethodIdentifier` | `BF3R2_SEMANTIC_ORIGINAL_ARCHIVE_WRITE_VERIFY_V5` |
| `packageIntegrityMethodIdentifier` | `BF3R2_NONRECURSIVE_VALID_PACKAGE_INTEGRITY_V3` |
| `terminalStateMethodIdentifier` | `BF3R2_EXECUTION_TERMINAL_STATE_V2` |
| `launchTerminalMapperMethodIdentifier` | `BF3R2_EXACT_LAUNCH_TERMINAL_MAPPER_V1` |
| `launchTemporaryStateCleanupMethodIdentifier` | `BF3R2_LAUNCH_TEMPORARY_STATE_CLEANUP_V1` |
| `processMatrixMethodIdentifier` | `BF3R2_ACTUAL_LAUNCHER_PROCESS_MATRIX_V2` |
| `packageManifestMethodIdentifier` | `BF3R2_PACKAGE_DIRECTORY_MANIFEST_V1` |
| `canonicalSerializationMethodIdentifier` | `BF3_CANONICAL_JSON_UTF8_V1` |

All fields are required in precisely this order even when every corresponding
count is zero. These identities are the names of distinct functions in the
embedded harness; any source change changes the complete harness hash and
therefore cannot retain the same complete reviewed implementation identity.

### 25.5 Global gates object

The semantic artifact has exactly five fields in order:
`preNodeLaunchHandshakeOutcome`, `repositoryAuthorityOutcome`,
`toolchainIdentityOutcome`, `networkContainmentOutcome`, and
`upstreamCustodyOutcome`. Every value is `VERIFIED`. A failure before semantic
admission is an execution terminal state in Section 42 and creates no semantic
artifact.

### 25.6 Per-asset record

Each asset has exactly these fields in order:

| Field | Type | Nullable | Constraint |
| --- | --- | --- | --- |
| `ordinal` | integer | no | `1` or `2` |
| `identity` | string | no | `TEST_V2` or `TEST_V1` |
| `basename` | string | no | exact Section 9.2 basename |
| `expectedByteCount` | integer | no | exact Section 9.2 count |
| `expectedSha256` | string | no | exact Section 9.2 hash |
| `decodedSourceUtf16Length` | integer | yes | non-negative safe integer after successful decode; otherwise null |
| `utf8DecodeOutcome` | enum | yes | Section 10 or null before eligible decode |
| `espreeParseOutcome` | enum | yes | Section 11 or null unless UTF-8 succeeded |
| `v8CompileOutcome` | enum | yes | Section 12 or null unless UTF-8 succeeded |
| `dualScriptSyntaxOutcome` | enum | yes | Section 13; null only before eligible decode |
| `sourceShapeOutcome` | enum | yes | `COMPLETED`, `NOT_ADMITTED`, `SOURCE_SHAPE_METHOD_FAILED`, or null before eligible decode |
| `sourceShape` | object | yes | exact object below, non-null iff outcome `COMPLETED` |

The `sourceShape` fields, in order, are:

```text
lexicalContextCounts
eximbayRequestPayMemberPatternCount
eximbayRequestPayCallCalleePatternCount
directRequestPayFunctionBindingPatternCount
testOriginStaticStringCarrierCount
productionOriginStaticStringCarrierCount
v1PaymentsPathStaticStringCarrierCount
boundedSourceShapeVector
boundedSourceShapeVectorSha256
```

`lexicalContextCounts` has exactly five records in Section 16 order. Each
record has `targetId`, `exactOccurrenceCount`, `commentCount`,
`stringOrTemplateStaticTextCount`, `codeCount`, and `unclassifiedCount` in that
order. Target IDs are `EXIMBAY`, `REQUEST_PAY`, `TEST_ORIGIN`,
`PRODUCTION_ORIGIN`, and `V1_PAYMENTS_PATH`. Counts are non-negative safe integers
and the four class counts sum exactly to the occurrence count.

The bounded vector has exactly eight non-negative safe integers and mechanically
equals the scalar fields and lexical counts in Section 21. Its hash is 64
lowercase hexadecimal and is recomputed from the exact canonical wrapper.

### 25.7 Comparison object

The fields, in order, are:

```text
leftAssetOrdinal: 1
leftAssetIdentity: TEST_V2
rightAssetOrdinal: 2
rightAssetIdentity: TEST_V1
historicalRawByteInequalityEvidence: CARRIED_FORWARD_FROM_HISTORICAL_BF3
comparisonOutcome
dualScriptSyntaxOutcomeComparison
sourceShapeOutcomeComparison
boundedPatternCountsComparison
staticStringCarrierCountsComparison
boundedSourceShapeVectorEquality
```

`comparisonOutcome` uses Section 23's two-value vocabulary. The five comparison
fields use only its three-value status vocabulary.

## 26. Total semantic outcome vocabulary

`evidenceOutcome` is exactly one of:

```text
ECMASCRIPT_EVIDENCE_INCOMPLETE
PARSER_DISAGREEMENT_EVIDENCE_COMPLETE
SYNTAX_ONLY_EVIDENCE_COMPLETE
SOURCE_SHAPE_EVIDENCE_COMPLETE
```

After all authority gates are VERIFIED, select by first match: any UTF-8 or
witness operational incompleteness, source-shape method failure, or comparison
METHOD_FAILED gives `ECMASCRIPT_EVIDENCE_INCOMPLETE`; either parser
disagreement gives `PARSER_DISAGREEMENT_EVIDENCE_COMPLETE`; at least one
`BOTH_REJECTED` with no operational failure gives
`SYNTAX_ONLY_EVIDENCE_COMPLETE`; otherwise both accepted with completed shapes
gives `SOURCE_SHAPE_EVIDENCE_COMPLETE`. Pre-admission failures have no
`evidenceOutcome` because no semantic artifact exists.

## 27. Warning model

Each warning has exactly `code`, nullable `assetOrdinal`, and `detail` in that
order. `detail` is always null. Emit every true predicate exactly once in this
order: run-level warnings first in the order below, then asset ordinal
ascending and code order below.

```text
COMPARISON_METHOD_FAILED
  comparisonOutcome == METHOD_FAILED; assetOrdinal null

UTF8_INVALID
  affected asset utf8DecodeOutcome == INVALID_UTF8

UTF8_METHOD_FAILED
  affected asset utf8DecodeOutcome == METHOD_FAILED

ESPREE_METHOD_FAILED
  affected asset espreeParseOutcome == METHOD_FAILED

V8_METHOD_FAILED
  affected asset v8CompileOutcome == METHOD_FAILED

PARSER_DISAGREEMENT
  affected asset has either disagreement dual outcome

SOURCE_SHAPE_METHOD_FAILED
  affected asset sourceShapeOutcome == SOURCE_SHAPE_METHOD_FAILED

LEXICAL_CONTEXT_UNCLASSIFIED
  affected completed source shape has any unclassifiedCount > 0
```

Deterministic syntax rejection alone is not a warning.

## 28. Stage and cross-field invariants

The historical candidate order below is superseded by the executable corrected
order in Section 40. Bootstrap and external launch admission are separate from
evidence-authority stages, and repository authority is the first such stage.

```text
repository authority
-> toolchain / containment / synthetic preflight
-> BF3-R1 package and historical source custody
-> exact UTF-8 decode
-> one Espree parse and one vm.Script construction per decoded source
-> source-shape extraction only for dual acceptance
-> comparison and warnings
-> ECMA_SOURCE_SHAPE_SEMANTIC_CUTOFF
```

Per-asset invariants are exact:

```text
utf8DecodeOutcome != SUCCEEDED
  -> both witness outcomes null
     dualScriptSyntaxOutcome == METHOD_INCOMPLETE
     sourceShapeOutcome == NOT_ADMITTED
     sourceShape == null

utf8DecodeOutcome == SUCCEEDED
  -> both witness outcomes non-null
     dualScriptSyntaxOutcome non-null

dualScriptSyntaxOutcome == BOTH_ACCEPTED
  -> sourceShapeOutcome == COMPLETED or SOURCE_SHAPE_METHOD_FAILED

dualScriptSyntaxOutcome != BOTH_ACCEPTED
  -> sourceShapeOutcome == NOT_ADMITTED
     sourceShape == null

sourceShapeOutcome == COMPLETED
  <-> sourceShape is non-null and every shape invariant is satisfied

sourceShapeOutcome != COMPLETED
  -> sourceShape == null
```

Both independent syntax witnesses are attempted after successful UTF-8 even
if the first syntax witness rejects. An operational failure in one does not
erase a completed observation from the other. No partial shape fact survives
a shape-method failure. `comparisonOutcome == METHOD_FAILED` requires all five
comparison statuses to be `NOT_COMPARABLE`; `COMPLETED` requires each status to
equal the Section 23 mechanical rule.

## 29. Canonical serialization and semantic cutoff

Reuse `BF3_CANONICAL_JSON_UTF8_V1` without modification. Its exact typed JSON
model, Unicode-scalar rules, escaping, integer forms, schema member order,
array order, two-space indentation, LF-only layout, BOM prohibition, and one
final LF apply.

After every semantic field, warning, and comparison is terminal, freeze:

```text
ECMA_SOURCE_SHAPE_SEMANTIC_CUTOFF
```

Construct and validate the semantic object once, canonicalize once, and
serialize once. The resulting immutable byte sequence is the only source for
both original and archive. Package-write facts never alter semantic fields or
cause reconstruction.

## 30. External evidence custody

The exact root and layout are:

```text
/Users/duckcow/mira-evidence/eximbay-bf3-r2/<RUN_ID>/
  bf3-r2-ecma-source-shape-evidence-package-integrity-v1-<RUN_ID>.json
  original/
    bf3-r2-ecma-source-shape-evidence-v1-<RUN_ID>.json
  archive/
    bf3-r2-ecma-source-shape-evidence-v1-<RUN_ID>.json
```

No retained SDK, BF3 artifact, or BF3-R1 artifact is copied into this root.
Write the one immutable semantic byte sequence to two separate regular
non-symlink files. Require complete read-back, byte count, SHA-256, direct
equality to the immutable sequence, distinct stable filesystem identities,
and direct original/archive byte equality. Symlinks and hard links fail.

### 30.1 `EcmaSourceShapeEvidencePackageIntegrity-v1`

Only the exact reachable, read-back-verified durable `PACKAGE_VALID` schema in
Section 43 is normative. Package failures are exact execution terminal states
and observable allowed file sets; no integrity file testifies that its own
construction, write, or read-back failed.

## 31. Toolchain adversarial matrix

Every case has one fail-closed behavior and no fallback:

| Case | Exact safe behavior |
| --- | --- |
| Wrong Node binary/path/hash | `TOOLCHAIN_IDENTITY_FAILED`; stop before source enters a parser |
| Wrong V8 version | same |
| Caller `NODE_OPTIONS` or `NODE_PATH` | exact launcher removes it with `/usr/bin/env -i`; no preload/path reaches child |
| Direct Node preload, including self-erasing | `LAUNCH_AUTHORITY_FAILED`; no semantic or external-launch artifact |
| Extra launcher field such as `-r`, `--require`, or `--import` | launcher exit 64 before Node starts |
| Wrong `package-lock.json` count/hash | same |
| Correct package version but mutated parser file | package manifest/entrypoint mismatch -> same |
| Missing parser dependency | same; no download |
| Different Acorn version or resolution | same |
| Parser `SyntaxError` | `SYNTAX_REJECTED`; suppress message; still run the independent V8 witness |
| Parser operational exception | `METHOD_FAILED`; suppress details; no parser fallback; V8 observation may still complete |
| V8 `SyntaxError` | `SYNTAX_REJECTED`; suppress message; never run the Script |
| V8 operational exception | `METHOD_FAILED`; suppress details; no alternate compiler |

The future harness must also include a synthetic fault-injection preflight that
proves its classifier maps an injected non-SyntaxError parser failure and an
injected non-SyntaxError V8 failure to `METHOD_FAILED` without exposing the
injected message. Fault injection is synthetic harness control only and is
never applied by mutating the verified parser or Node runtime.

## 32. Threat and stop model

| Threat | Required disposition |
| --- | --- |
| Retained SDK is imported, required, or evaluated | stop; evidence incomplete; no retry or alternate route |
| Any Script run method becomes reachable or is called | stop; retained-source evaluation boundary violated |
| A network operation is admitted by the host boundary | stop before source analysis |
| Arbitrary hook affects module loading | toolchain identity failure |
| Parser error text leaks source context | method failure; no evidence artifact with leaked text |
| AST/source/ranges are serialized | source-shape method failure; discard partial output |
| Parser witnesses disagree | retain bounded disagreement enum; source shape not admitted |
| Source-shape classifier sees boundary ambiguity | count `UNCLASSIFIED`; never coerce to code/string/comment |
| Interesting new identifier or endpoint appears | ignore; target vocabulary remains closed |
| Package write fails | preserve the exact Section 43 allowed file set; return its terminal code; do not admit the package |

## 33. Provider-canonicality, EX2B2, and next-gate boundary

Throughout BF3-R2:

```text
EXIMBAY SDK CANONICAL VERSION:
  UNRESOLVED

EX2B2:
  BLOCKED
```

BF3-R2 execution selects no SDK version and authorizes no EX2B2 design or
implementation. A later independent adjudicator may select exactly one
narrowest next-lawful-gate class:

```text
NO_PROVIDER_CONTACT_NEEDED_YET
HEADER_REQUEST_CONTEXT_EVIDENCE_REQUIRED
CONTROLLED_BROWSER_EVIDENCE_REQUIRED
VENDOR_CLARIFICATION_REQUIRED
EVIDENCE_PATH_STOP
```

This contract preselects none. A new class requires an explicitly reviewed
contract revision and cannot be invented by the executor.

## 34. Required adversarial self-audit

```text
Q1. Can the parser harness execute the retained SDK?
NO

Q2. Can vm.Script be followed by any run method under BF3-R2?
NO

Q3. Does BOTH_ACCEPTED mean ECMA-262 validity has been formally proven?
NO

Q4. Does an EXIMBAY.request_pay member/function/call pattern establish runtime
callability or execution?
NO

Q5. Can equal bounded source-shape vectors establish semantic SDK identity?
NO

Q6. Can R2 select V1 or V2 as provider-canonical merely from static source shape?
NO

Q7. Can a missing parser package be downloaded during future execution?
NO

Q8. Does this authoring task itself authorize any parsing of retained SDK source?
NO

Q9. Does this authoring task authorize EX2B2?
NO
```

## 35. Lifecycle, review, and change control

The required lifecycle is:

```text
corrected candidate contract
-> one focused BF3R2-AUD-002 closure review
-> reviewed merge
-> one separate explicit invocation pinning the exact harness
-> at most one conformant zero-contact BF3-R2 run
-> immutable EcmaSourceShapeEvidence-v1 and non-recursive integrity record
-> independent package and semantic adjudication
-> durable repository result/adjudication record
-> only then selection of a next gate
```

No execution occurs from the authoring or review session. Any change to source
identity, authority gate, Node/parser closure, decode, parser options, V8
construction, AST predicate, target vocabulary, schema, outcome, custody, or
next-gate classes requires a new version and independent review.

For this documentation candidate verify only:

```text
all local Markdown links resolve
git diff --check passes
changed paths are exactly this contract, engineering README, and decision log
index remains empty
no source/schema/migration/test/runtime/dependency/configuration change
no retained SDK source read, parse, inspection, compile, or evaluation
no provider or browser request
no evidence artifact change
no stage, commit, push, PR, or merge
```

Browser tests, Prisma commands, and BF3-R2 execution are outside this bounded
correction. `npm run verify` is required by the repository gate after the
documentation change; it grants no BF3-R2 execution authority.

## 36. Exact reviewed pre-Node launcher source

The exact begin marker is `# BF3R2_LAUNCHER_UTF8_BEGIN`; the exact end marker
is `# BF3R2_LAUNCHER_UTF8_END`. Each occurs exactly once. Launcher semantic
bytes are every byte after the LF terminating the begin-marker line through
the LF immediately before the end-marker line. Encoding is UTF-8, line endings
are LF only, BOM and CR are prohibited, and the final semantic byte is LF.

```sh
# BF3R2_LAUNCHER_UTF8_BEGIN
#!/bin/sh
set -uC
umask 077

launcher_identity=BF3R2_POSIX_PRE_NODE_LAUNCHER_V3
harness_implementation_identity=BF3R2_ANALYSIS_HARNESS_V4
harness_path=/private/tmp/mira-bf3r2/harness-v4.cjs
harness_byte_count=107473
harness_sha256=fbc8642fa193f8e2282898d68ab065be179c7d354b07df1c2f46408709e5a521
harness_binding=$harness_implementation_identity:$harness_path:$harness_byte_count:$harness_sha256
profile_path=/private/tmp/mira-bf3r2/deny-network.sb
profile_sha256=5c358b8d847211333e7ba22df82d84f796b5f30a41a2682209a949d783adbd08
node_path=/opt/homebrew/Cellar/node@24/24.18.0/bin/node
run_root=
run_root_owned=0
token_path=
receipt_path=
ack_path=
binding_path=

cleanup_path() {
  cleanup_target=$1
  if [ -d "$cleanup_target" ] && [ ! -L "$cleanup_target" ]; then
    /bin/rmdir "$cleanup_target"
  else
    /bin/rm -f "$cleanup_target"
  fi
}

cleanup_launch_temporary_state() {
  [ "$run_root_owned" -eq 1 ] || return 0
  cleanup_ok=0
  for cleanup_target in "$receipt_path" "$ack_path" "$token_path" "$binding_path"; do
    [ -n "$cleanup_target" ] || continue
    if [ -e "$cleanup_target" ] || [ -L "$cleanup_target" ]; then
      cleanup_path "$cleanup_target" || cleanup_ok=1
    fi
  done
  return "$cleanup_ok"
}

finish_terminal() {
  terminal_reason=$1
  terminal_code=$2
  if ! cleanup_launch_temporary_state; then
    printf 'BF3R2_PRIMARY_TERMINAL=%s\n' "$terminal_reason" >&2
    printf '%s\n' LAUNCH_TEMPORARY_STATE_CLEANUP_FAILED >&2
    exit 87
  fi
  printf '%s\n' "$terminal_reason" >&2
  exit "$terminal_code"
}

if [ "$#" -lt 1 ]; then
  finish_terminal INVALID_INVOCATION 64
fi

mode=$1
case $mode in
  run)
    [ "$#" -eq 4 ] || finish_terminal INVALID_INVOCATION 64
    synthetic_fault=NONE
    ;;
  synthetic-vector)
    [ "$#" -eq 5 ] || finish_terminal INVALID_INVOCATION 64
    synthetic_fault=$5
    case $synthetic_fault in
      NONE|LAUNCH_CHANNEL_UNAVAILABLE|LAUNCH_TOKEN_FAILED|LAUNCH_BINDING_MISMATCH|CHILD_RECEIPT_WRITE_FAILED|RECEIPT_MISSING|RECEIPT_MALFORMED|RECEIPT_MISMATCH|CHILD_EXITS_BEFORE_RECEIPT|STALE_AUTHORITY_METADATA|EXTERNAL_AUTHORITY_WRITE_FAILED|TEMP_CLEANUP_FAILURE|REPOSITORY_AUTHORITY_FAILED|TOOLCHAIN_IDENTITY_FAILED|NETWORK_CONTAINMENT_FAILED|UPSTREAM_CUSTODY_FAILED|UTF8_METHOD_FAILED|COMPARISON_METHOD_FAILED|SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED|ORIGINAL_WRITE_FAILED|ARCHIVE_WRITE_FAILED|READBACK_FAILED|IDENTITY_OR_EQUALITY_FAILED|PACKAGE_INTEGRITY_CONSTRUCTION_FAILED|PACKAGE_INTEGRITY_WRITE_FAILED|PACKAGE_INTEGRITY_READBACK_FAILED) ;;
      *) finish_terminal INVALID_INVOCATION 64 ;;
    esac
    ;;
  *) finish_terminal INVALID_INVOCATION 64 ;;
esac
run_id=$2
contract_merge=$3
contract_sha256=$4
case $run_id in
  [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
  *) finish_terminal INVALID_INVOCATION 64 ;;
esac
case $contract_merge in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
  *) finish_terminal INVALID_INVOCATION 64 ;;
esac
case $contract_sha256 in *[!0-9a-f]*) finish_terminal INVALID_INVOCATION 64 ;; esac
if [ "${#contract_sha256}" -ne 64 ]; then
  finish_terminal INVALID_INVOCATION 64
fi
validated_contract_sha256=$contract_sha256
contract_sha256=${contract_sha256%???}
case $contract_sha256 in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
  *) finish_terminal INVALID_INVOCATION 64 ;;
esac
contract_sha256=$validated_contract_sha256

if [ "$harness_binding" != BF3R2_ANALYSIS_HARNESS_V4:/private/tmp/mira-bf3r2/harness-v4.cjs:107473:fbc8642fa193f8e2282898d68ab065be179c7d354b07df1c2f46408709e5a521 ]; then
  finish_terminal TOOLCHAIN_IDENTITY_FAILED 67
fi

if [ "$mode" = run ]; then
  run_root=/Users/duckcow/mira-evidence/eximbay-bf3-r2/$run_id
  receipt_status=PACKAGE_VALID
  authority_path=$run_root/bf3-r2-external-launch-authority-v1-$run_id.json
else
  run_root=/private/tmp/mira-bf3r2/synthetic/$run_id
  receipt_status=SYNTHETIC_VECTOR_PASS
  authority_path=$run_root/bf3-r2-synthetic-launch-observation-v1-$run_id.json
fi

if [ -e "$run_root" ] || [ -L "$run_root" ]; then
  finish_terminal RUN_ROOT_ALREADY_EXISTS 70
fi
if ! /bin/mkdir -m 700 "$run_root"; then
  finish_terminal LAUNCH_CHANNEL_UNAVAILABLE 78
fi
run_root_owned=1
token_path=$run_root/.launch-token-v1
receipt_path=$run_root/.child-launch-receipt-v1
ack_path=$run_root/.child-clean-launch-ack-v1
binding_path=$run_root/.launch-binding-decoy-v1

if [ "$synthetic_fault" = LAUNCH_CHANNEL_UNAVAILABLE ]; then
  /bin/mkdir -m 700 "$token_path" || finish_terminal LAUNCH_CHANNEL_UNAVAILABLE 78
fi
if [ "$synthetic_fault" = CHILD_RECEIPT_WRITE_FAILED ]; then
  /bin/mkdir -m 700 "$receipt_path" || finish_terminal LAUNCH_CHANNEL_UNAVAILABLE 78
fi
if [ "$synthetic_fault" = STALE_AUTHORITY_METADATA ]; then
  if ! (set -C; printf '%s\n' TEST_ONLY_STALE_AUTHORITY > "$authority_path"); then
    finish_terminal LAUNCH_CHANNEL_UNAVAILABLE 78
  fi
fi
if [ "$synthetic_fault" = TEMP_CLEANUP_FAILURE ]; then
  /bin/mkdir -m 700 "$binding_path" || finish_terminal LAUNCH_CHANNEL_UNAVAILABLE 78
  printf '%s\n' TEST_ONLY_CLEANUP_BLOCKER > "$binding_path/blocker" || finish_terminal LAUNCH_CHANNEL_UNAVAILABLE 78
fi

token_marker=BF3R2_LAUNCH_TOKEN_V2
[ "$synthetic_fault" = LAUNCH_TOKEN_FAILED ] && token_marker=BF3R2_INVALID_TEST_TOKEN
if ! (set -C; printf '%s\n%s\n%s\n%s\n%s\n%s\n%s\n' "$token_marker" "$mode" "$run_id" "$contract_merge" "$contract_sha256" "$$" "$synthetic_fault" > "$token_path"); then
  [ "$synthetic_fault" = LAUNCH_CHANNEL_UNAVAILABLE ] && finish_terminal LAUNCH_CHANNEL_UNAVAILABLE 78
  finish_terminal LAUNCH_TOKEN_FAILED 79
fi

launch_fd_path=$token_path
if [ "$synthetic_fault" = LAUNCH_BINDING_MISMATCH ]; then
  if ! (set -C; printf '%s\n%s\n%s\n%s\n%s\n%s\n%s\n' BF3R2_LAUNCH_TOKEN_V2 "$mode" "$run_id" "$contract_merge" "$contract_sha256" "$$" "$synthetic_fault" > "$binding_path"); then
    finish_terminal LAUNCH_TOKEN_FAILED 79
  fi
  launch_fd_path=$binding_path
fi

set +e
if [ "$mode" = run ]; then
  /usr/bin/env -i \
    BF3R2_LAUNCH_FD=3 \
    HOME=/private/tmp/mira-bf3r2/home \
    LANG=C \
    TMPDIR=/private/tmp/mira-bf3r2/tmp \
    /usr/bin/sandbox-exec \
    -f "$profile_path" \
    "$node_path" \
    "$harness_path" \
    --mode "$mode" \
    --run-id "$run_id" \
    --contract-merge "$contract_merge" \
    --contract-sha256 "$contract_sha256" \
    --harness-sha256 "$harness_sha256" \
    --profile-sha256 "$profile_sha256" \
    --launch-token-path "$token_path" \
    --launch-parent-pid "$$" \
    3< "$launch_fd_path"
else
  /usr/bin/env -i \
    BF3R2_LAUNCH_FD=3 \
    HOME=/private/tmp/mira-bf3r2/home \
    LANG=C \
    TMPDIR=/private/tmp/mira-bf3r2/tmp \
    /usr/bin/sandbox-exec \
    -f "$profile_path" \
    "$node_path" \
    "$harness_path" \
    --mode "$mode" \
    --run-id "$run_id" \
    --contract-merge "$contract_merge" \
    --contract-sha256 "$contract_sha256" \
    --harness-sha256 "$harness_sha256" \
    --profile-sha256 "$profile_sha256" \
    --launch-token-path "$token_path" \
    --launch-parent-pid "$$" \
    --synthetic-fault "$synthetic_fault" \
    3< "$launch_fd_path"
fi
child_status=$?

if [ ! -f "$ack_path" ] || [ -L "$ack_path" ]; then
  case $synthetic_fault in
    LAUNCH_TOKEN_FAILED) finish_terminal LAUNCH_TOKEN_FAILED 79 ;;
    LAUNCH_BINDING_MISMATCH) finish_terminal LAUNCH_BINDING_MISMATCH 80 ;;
  esac
  [ "$child_status" -eq 65 ] && finish_terminal LAUNCH_AUTHORITY_FAILED 65
  finish_terminal CHILD_STARTUP_FAILED 84
fi
expected_ack=$(printf '%s\n%s\n%s\n%s\n%s\n%s\n' BF3R2_CHILD_CLEAN_LAUNCH_ACK_V1 "$mode" "$run_id" "$contract_merge" "$contract_sha256" "$synthetic_fault")
observed_ack=$(/bin/cat "$ack_path") || finish_terminal CHILD_STARTUP_FAILED 84
[ "$observed_ack" = "$expected_ack" ] || finish_terminal LAUNCH_BINDING_MISMATCH 80

if [ "$child_status" -ne 0 ]; then
  case $child_status in
    65) finish_terminal LAUNCH_AUTHORITY_FAILED 65 ;;
    66) finish_terminal UPSTREAM_LIFECYCLE_AUTHORITY_FAILED 66 ;;
    67) finish_terminal TOOLCHAIN_IDENTITY_FAILED 67 ;;
    68) finish_terminal NETWORK_CONTAINMENT_FAILED 68 ;;
    69) finish_terminal UPSTREAM_CUSTODY_FAILED 69 ;;
    71) finish_terminal SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED 71 ;;
    72) finish_terminal ORIGINAL_WRITE_FAILED 72 ;;
    73) finish_terminal ARCHIVE_WRITE_FAILED 73 ;;
    74) finish_terminal EVIDENCE_VERIFICATION_FAILED 74 ;;
    75) finish_terminal PACKAGE_INTEGRITY_WRITE_FAILED 75 ;;
    76) finish_terminal PACKAGE_INTEGRITY_READBACK_FAILED 76 ;;
    77) finish_terminal CHILD_RECEIPT_WRITE_FAILED 77 ;;
    78) finish_terminal LAUNCH_CHANNEL_UNAVAILABLE 78 ;;
    79) finish_terminal LAUNCH_TOKEN_FAILED 79 ;;
    80) finish_terminal LAUNCH_BINDING_MISMATCH 80 ;;
    84) finish_terminal CHILD_STARTUP_FAILED 84 ;;
    *)
      printf 'BF3R2_UNCLASSIFIED_CHILD_STATUS=%s\n' "$child_status" >&2
      finish_terminal CHILD_STARTUP_FAILED 84
      ;;
  esac
fi

if [ ! -f "$receipt_path" ] || [ -L "$receipt_path" ]; then
  finish_terminal LAUNCH_RECEIPT_MISSING 81
fi
if ! exec 4< "$receipt_path"; then
  finish_terminal LAUNCH_RECEIPT_MISSING 81
fi
IFS= read -r receipt_marker <&4 || finish_terminal LAUNCH_RECEIPT_MALFORMED 82
IFS= read -r receipt_mode <&4 || finish_terminal LAUNCH_RECEIPT_MALFORMED 82
IFS= read -r receipt_run_id <&4 || finish_terminal LAUNCH_RECEIPT_MALFORMED 82
IFS= read -r receipt_merge <&4 || finish_terminal LAUNCH_RECEIPT_MALFORMED 82
IFS= read -r receipt_contract_sha256 <&4 || finish_terminal LAUNCH_RECEIPT_MALFORMED 82
IFS= read -r receipt_fault <&4 || finish_terminal LAUNCH_RECEIPT_MALFORMED 82
IFS= read -r receipt_result <&4 || finish_terminal LAUNCH_RECEIPT_MALFORMED 82
if IFS= read -r receipt_extra <&4; then
  finish_terminal LAUNCH_RECEIPT_MALFORMED 82
fi
exec 4<&-

if [ "$receipt_marker" != BF3R2_CHILD_LAUNCH_RECEIPT_V2 ] ||
   [ "$receipt_mode" != "$mode" ] ||
   [ "$receipt_run_id" != "$run_id" ] ||
   [ "$receipt_merge" != "$contract_merge" ] ||
   [ "$receipt_contract_sha256" != "$contract_sha256" ] ||
   [ "$receipt_fault" != "$synthetic_fault" ] ||
   [ "$receipt_result" != "$receipt_status" ]; then
  finish_terminal LAUNCH_RECEIPT_MISMATCH 83
fi

if ! cleanup_launch_temporary_state; then
  printf '%s\n' LAUNCH_TEMPORARY_STATE_CLEANUP_FAILED >&2
  exit 87
fi
if [ -e "$authority_path" ] || [ -L "$authority_path" ]; then
  finish_terminal STALE_LAUNCH_METADATA 86
fi
if [ "$synthetic_fault" = EXTERNAL_AUTHORITY_WRITE_FAILED ]; then
  authority_path=$run_root/.missing-authority-parent/authority.json
fi

if [ "$mode" = run ]; then
  if ! (set -C; printf '{\n  "schema": "mira.eximbay.bf3-r2-external-launch-authority",\n  "version": 1,\n  "runId": "%s",\n  "launcherIdentity": "%s",\n  "launcherInterpreterPath": "/bin/sh",\n  "mode": "run",\n  "contractMergeSha": "%s",\n  "contractSha256": "%s",\n  "harnessSha256": "%s",\n  "networkProfileSha256": "%s",\n  "launchTokenFd": 3,\n  "callerNodeStartupFlagsAccepted": false,\n  "childReceiptOutcome": "MATCH",\n  "externalLaunchAuthorityOutcome": "ADMITTED"\n}\n' "$run_id" "$launcher_identity" "$contract_merge" "$contract_sha256" "$harness_sha256" "$profile_sha256" > "$authority_path"); then
    finish_terminal EXTERNAL_LAUNCH_AUTHORITY_WRITE_FAILED 85
  fi
  printf '%s\n' BF3R2_EXTERNAL_LAUNCH_ADMITTED
else
  if ! (set -C; printf '{\n  "schema": "mira.eximbay.bf3-r2-synthetic-launch-observation",\n  "version": 1,\n  "scope": "TEST_ONLY",\n  "runId": "%s",\n  "launcherIdentity": "%s",\n  "mode": "synthetic-vector",\n  "syntheticFault": "%s",\n  "childReceiptOutcome": "MATCH",\n  "productionAuthorityOutcome": "NOT_ADMITTED"\n}\n' "$run_id" "$launcher_identity" "$synthetic_fault" > "$authority_path"); then
    finish_terminal EXTERNAL_LAUNCH_AUTHORITY_WRITE_FAILED 85
  fi
  printf '%s\n' BF3R2_SYNTHETIC_LAUNCH_OBSERVED
fi
exit 0
# BF3R2_LAUNCHER_UTF8_END
```

The extracted launcher is `12533` bytes with SHA-256
`5c1128131238ea25e30fcdd62d9ff1373462ef545116d50fbda200281c63a72f`.
Its method identity is `BF3R2_POSIX_PRE_NODE_LAUNCHER_V3`; it is extracted as
`/private/tmp/mira-bf3r2/launcher-v3.sh`, mode `0600`, and invoked only as
`/bin/sh /private/tmp/mira-bf3r2/launcher-v3.sh ...`. It is never sourced.

Production mode accepts exactly four positional data fields: `run`, run ID,
40-lowercase-hex installed contract merge SHA, and 64-lowercase-hex installed
contract SHA-256. TEST-ONLY `synthetic-vector` accepts the same four fields plus
one enumerated fault selector. Missing, extra, or non-enumerated fields are
exit `64 INVALID_INVOCATION` before Node starts. No field can begin with `-`;
no Node option field exists. It contains no `eval`, command string, PATH lookup,
generated code, or unquoted data expansion. Its fixed child command is exactly
the source above:
`/usr/bin/env -i`, five fixed environment entries, `/usr/bin/sandbox-exec -f`,
the fixed profile, fixed Node, fixed harness, then eight fixed option names and
their grammar-checked data values. Caller `NODE_OPTIONS`, `NODE_PATH`, shell
functions, aliases, and PATH are not inherited.

`/bin/sh` is inspected with `lstat`, then resolved. On the reviewed host it is
a regular non-symlink file whose resolved path is `/bin/sh`, byte count is
`101232`, and SHA-256 is
`e4d71aa95be0725c351e9d1d273d35ccdb0a8bdb31a57927c8738431b89788f5`.
Future execution requires the same path type, resolved target, byte count, and
hash. A platform on which `/bin/sh` is a symlink may qualify only after a new
review freezes both the link text and resolved-target identity; the current
identity must not be reinterpreted.

## 37. Exact reviewed Node analysis harness V4 source

The exact begin marker is `// BF3R2_HARNESS_UTF8_BEGIN`; the exact end marker
is `// BF3R2_HARNESS_UTF8_END`. Each occurs exactly once. Harness semantic
bytes are every byte after the LF terminating the begin-marker line through the
LF immediately before the end-marker line. Encoding is UTF-8, line endings are
LF only, BOM and CR are prohibited, and the final semantic byte is LF.

```javascript
// BF3R2_HARNESS_UTF8_BEGIN
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const vm = require("node:vm");

const REPOSITORY_ROOT = "/Users/duckcow/workspace/mira";
const HARNESS_PATH = "/private/tmp/mira-bf3r2/harness-v4.cjs";
const PROFILE_PATH = "/private/tmp/mira-bf3r2/deny-network.sb";
const NODE_PATH = "/opt/homebrew/Cellar/node@24/24.18.0/bin/node";
const GIT_PATH = "/opt/homebrew/bin/git";
const GIT_REAL_PATH = "/opt/homebrew/Cellar/git/2.52.0_1/bin/git";
const GIT_IDENTITY = Object.freeze({byteCount:3603968,sha256:"ec24d6af5c519b2f708ae5464f23f85dd3a3cc96e161c0b751f879a3a516ee74"});
const CONTRACT_PATH = "docs/engineering/eximbay-bf3-r2-offline-ecmascript-source-shape-evidence-contract-v0.1.md";
const LAUNCHER_IDENTITY = "BF3R2_POSIX_PRE_NODE_LAUNCHER_V3";
const LAUNCH_TOKEN_FD = 3;
const HARNESS_IMPLEMENTATION_IDENTITY = "BF3R2_ANALYSIS_HARNESS_V4";
const HARNESS_EXTRACTION_METHOD_IDENTITY = "BF3R2_INSTALLED_CONTRACT_EXACT_HARNESS_EXTRACTION_V1";
const TERMINAL = Object.freeze({
  INVALID_INVOCATION:64,
  LAUNCH_AUTHORITY_FAILED:65,
  UPSTREAM_LIFECYCLE_AUTHORITY_FAILED:66,
  TOOLCHAIN_IDENTITY_FAILED:67,
  NETWORK_CONTAINMENT_FAILED:68,
  UPSTREAM_CUSTODY_FAILED:69,
  RUN_ROOT_ALREADY_EXISTS:70,
  SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED:71,
  ORIGINAL_WRITE_FAILED:72,
  ARCHIVE_WRITE_FAILED:73,
  EVIDENCE_VERIFICATION_FAILED:74,
  PACKAGE_INTEGRITY_WRITE_FAILED:75,
  PACKAGE_INTEGRITY_READBACK_FAILED:76,
  CHILD_RECEIPT_WRITE_FAILED:77,
  LAUNCH_CHANNEL_UNAVAILABLE:78,
  LAUNCH_TOKEN_FAILED:79,
  LAUNCH_BINDING_MISMATCH:80,
  LAUNCH_RECEIPT_MISSING:81,
  LAUNCH_RECEIPT_MALFORMED:82,
  LAUNCH_RECEIPT_MISMATCH:83,
  CHILD_STARTUP_FAILED:84,
  EXTERNAL_LAUNCH_AUTHORITY_WRITE_FAILED:85,
  STALE_LAUNCH_METADATA:86,
  LAUNCH_TEMPORARY_STATE_CLEANUP_FAILED:87
});
const SYNTHETIC_FAULTS = Object.freeze([
  "NONE","LAUNCH_CHANNEL_UNAVAILABLE","LAUNCH_TOKEN_FAILED","LAUNCH_BINDING_MISMATCH","CHILD_RECEIPT_WRITE_FAILED","RECEIPT_MISSING","RECEIPT_MALFORMED","RECEIPT_MISMATCH","CHILD_EXITS_BEFORE_RECEIPT","STALE_AUTHORITY_METADATA","EXTERNAL_AUTHORITY_WRITE_FAILED","TEMP_CLEANUP_FAILURE","REPOSITORY_AUTHORITY_FAILED","TOOLCHAIN_IDENTITY_FAILED","NETWORK_CONTAINMENT_FAILED","UPSTREAM_CUSTODY_FAILED","UTF8_METHOD_FAILED","COMPARISON_METHOD_FAILED","SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED","ORIGINAL_WRITE_FAILED","ARCHIVE_WRITE_FAILED","READBACK_FAILED","IDENTITY_OR_EQUALITY_FAILED","PACKAGE_INTEGRITY_CONSTRUCTION_FAILED","PACKAGE_INTEGRITY_WRITE_FAILED","PACKAGE_INTEGRITY_READBACK_FAILED"
]);
const SYNTHETIC_RESULT_FAULTS = Object.freeze([...SYNTHETIC_FAULTS,"UTF8_INVALID","ESPREE_METHOD_FAILED","V8_METHOD_FAILED","SOURCE_SHAPE_METHOD_FAILED"]);
const LIFECYCLE = Object.freeze({
  mergeSha: "dc0c90b66ea4e1d901e152714e4c9b8959bb6bb7",
  path: "docs/engineering/eximbay-bf3-r1-lifecycle-closure-v0.1.md",
  byteCount: 10013,
  sha256: "53ab1638326a6e377aa92eec25257afde50fd3a7b5b79fdf4fed30c2db392880"
});
const BF3R1_RESULT = Object.freeze({
  mergeSha: "482bfbb20063eaf525756f159d9532d3abb9e938",
  path: "docs/engineering/eximbay-bf3-r1-derived-evidence-result-adjudication-v0.1.md",
  byteCount: 15211,
  sha256: "f84ac369a30a496a8e1f98d1987439d6a9ee905bb1b986d3073089513603e65f"
});
const NODE_IDENTITY = Object.freeze({
  version: "v24.18.0",
  v8: "13.6.233.17-node.50",
  byteCount: 68384,
  sha256: "7bf42b0fd150fdb2d2ffe5e2ae83d2e2fec70411c7694ba59aaf6c145b2c637d"
});
const SANDBOX_IDENTITY = Object.freeze({
  path: "/usr/bin/sandbox-exec",
  byteCount: 102560,
  sha256: "fd89e1f6e6d822fcc0f3844bd11fecdc9b68f705f80c32f4334bc23913d5451b"
});
const ENV_IDENTITY = Object.freeze({
  path: "/usr/bin/env",
  byteCount: 102368,
  sha256: "5f7e5b1c7e0e934b8f2891cb8d3f3fe726bbf294a5869b5925d423b71198ee38"
});
const PROFILE_IDENTITY = Object.freeze({
  byteCount: 44,
  sha256: "5c358b8d847211333e7ba22df82d84f796b5f30a41a2682209a949d783adbd08"
});
const PACKAGE_LOCK = Object.freeze({
  path: `${REPOSITORY_ROOT}/package-lock.json`,
  byteCount: 357705,
  sha256: "594ab37544f7c782fb66b246675022bfe803d63c9148dace3aa7f447926d3013"
});
const PACKAGE_CLOSURES = Object.freeze([
  Object.freeze({name:"espree",version:"10.4.0",lockIntegrity:"sha512-j6PAQ2uUr79PZhBjP5C5fhl8e39FmRnOjsD5lGnWrFU8i2G776tBK7+nP8KuQUTTyAZUwfQqXAgrVH5MbH9CYQ==",root:`${REPOSITORY_ROOT}/node_modules/espree`,entry:`${REPOSITORY_ROOT}/node_modules/espree/dist/espree.cjs`,packageJsonBytes:2314,packageJsonSha256:"76d68e5b8ac5aae00882165c4feae4a8a8825ccb4ea76ab8af0f02ba320fd250",entryBytes:31219,entrySha256:"e87a07d485a7454be1c17240c5112516e4e92748647d92e7a692665b2c51920f",fileCount:10,manifestSha256:"8e30b6d0429c7335016f10c9bf8041b094a43fb381694f1278acc506ac2efdf2"}),
  Object.freeze({name:"acorn",version:"8.16.0",lockIntegrity:"sha512-UVJyE9MttOsBQIDKw1skb9nAwQuR5wuGD3+82K6JgJlm/Y+KI92oNsMNGZCYdDsVtRHSak0pcV5Dno5+4jh9sw==",root:`${REPOSITORY_ROOT}/node_modules/acorn`,entry:`${REPOSITORY_ROOT}/node_modules/acorn/dist/acorn.js`,packageJsonBytes:1061,packageJsonSha256:"705aa08b7b4fee1112244952b4843c40c381a3c7a9fc77101f369a172865bfac",entryBytes:242818,entrySha256:"2261c5f0e4abe860e889dfc67081683a4ba4d27deb7f4cbc8ad06a1b7fdd510c",fileCount:10,manifestSha256:"7c6dd254a48de5b35447f72073ab363e742c08ee8576c27e38f4c42533bf550b"}),
  Object.freeze({name:"acorn-jsx",version:"5.3.2",lockIntegrity:"sha512-rq9s+JNhf0IChjtDXxllJ7g41oZk5SlXtp0LHwyA5cejwn7vKmKp4pPri6YEePv2PU65sAsegbXtIinmDFDXgQ==",root:`${REPOSITORY_ROOT}/node_modules/acorn-jsx`,entry:`${REPOSITORY_ROOT}/node_modules/acorn-jsx/index.js`,packageJsonBytes:581,packageJsonSha256:"5e123a5ee3b16fd10fe4b44ef70ff7885f05117fb9ae75f72a0d821f919d423d",entryBytes:15827,entrySha256:"5ab23edca59b840bc26ba711131a5b649540b70da53d70ae1bbcdb13480c1aa1",fileCount:6,manifestSha256:"d3ac9280bcaf5fd88c897259787193200f85d6f2be5bf78866c3713a822abd6a"}),
  Object.freeze({name:"eslint-visitor-keys",version:"4.2.1",lockIntegrity:"sha512-Uhdk5sfqcee/9H/rCOJikYz67o0a2Tw2hGRPOG2Y1R2dg7brRe1uG0yaNQDHu+TO/uQPF/5eCapvYSmHUjt7JQ==",root:`${REPOSITORY_ROOT}/node_modules/eslint-visitor-keys`,entry:`${REPOSITORY_ROOT}/node_modules/eslint-visitor-keys/dist/eslint-visitor-keys.cjs`,packageJsonBytes:2222,packageJsonSha256:"f479c384cbd48ab3d95ba3f02f332ee42320b408a09f1cb8f1d3da96273ed4d3",entryBytes:7586,entrySha256:"fb38b107549dfcae42f93ab3eed605860a526cf81b5199c3a6935bb74e0f6694",fileCount:9,manifestSha256:"049733debade3d5643c59cad036488c8c144284644eb54c25c9356b2d9d405c6"})
]);
const TARGETS = Object.freeze([
  Object.freeze({id:"EXIMBAY",text:"EXIMBAY"}),
  Object.freeze({id:"REQUEST_PAY",text:"request_pay"}),
  Object.freeze({id:"TEST_ORIGIN",text:"https://api-test.eximbay.com"}),
  Object.freeze({id:"PRODUCTION_ORIGIN",text:"https://api.eximbay.com"}),
  Object.freeze({id:"V1_PAYMENTS_PATH",text:"/v1/payments"})
]);
const ESPREE_OPTIONS = Object.freeze({
  ecmaVersion: 2026,
  sourceType: "script",
  range: true,
  loc: false,
  tokens: false,
  comment: true,
  ecmaFeatures: Object.freeze({globalReturn:false,impliedStrict:false,jsx:false})
});
const VM_OPTIONS = Object.freeze({filename:"bf3-r2-retained-script.js",lineOffset:0,columnOffset:0,produceCachedData:false});
const SENTINEL_KEY = "__MIRA_BF3R2_NON_EVALUATION_SENTINEL_7F4C9A__";
const SENTINEL_SOURCE = `globalThis["${SENTINEL_KEY}"] += 1;\n`;
const EXPECTED_ENV = Object.freeze({
  BF3R2_LAUNCH_FD: "3",
  HOME: "/private/tmp/mira-bf3r2/home",
  LANG: "C",
  TMPDIR: "/private/tmp/mira-bf3r2/tmp",
  __CF_USER_TEXT_ENCODING: "0x1F5:0x3:0x33"
});
const METHOD_IDENTITIES = Object.freeze({
  launchAuthorityMethodIdentifier:"BF3R2_EXTERNAL_FD3_PARENT_CHILD_LAUNCH_AUTHORITY_V2",
  bootstrapBoundaryMethodIdentifier:"BF3R2_APPROVED_BUILTIN_BOOTSTRAP_AND_GIT_IDENTITY_V1",
  stagePrecedenceMethodIdentifier:"BF3R2_REACHABLE_STAGE_PRECEDENCE_V4",
  processEnvironmentAdmissionMethodIdentifier:"BF3R2_PROCESS_ENVIRONMENT_DEFENSE_IN_DEPTH_V4",
  moduleCacheResolutionMethodIdentifier:"BF3R2_MODULE_CACHE_DEFENSE_IN_DEPTH_V3",
  networkContainmentPreflightMethodIdentifier:"BF3R2_HOST_DENY_NETWORK_LOOPBACK_BIND_V1",
  lifecycleAuthorityMethodIdentifier:"BF3R2_INSTALLED_LIFECYCLE_AUTHORITY_V1",
  custodyMethodIdentifier:"BF3R1_HISTORICAL_CUSTODY_NOFOLLOW_V1",
  utf8DecodeMethodIdentifier:"BF3R1_WHATWG_UTF8_DECODE_WITHOUT_BOM_OR_FAIL_V1",
  espreeMethodIdentifier:"BF3R2_ESPREE_SCRIPT_PARSE_V2",
  espreeOptions:ESPREE_OPTIONS,
  v8MethodIdentifier:"BF3R2_NODE_VM_SCRIPT_COMPILE_ONLY_V1",
  v8Options:VM_OPTIONS,
  astAdmissionMethodIdentifier:"BF3R2_ESPREE_AST_ADMISSION_V2",
  rawOccurrenceEnumeratorMethodIdentifier:"BF3R2_UTF16_OVERLAPPING_EXACT_OCCURRENCES_V1",
  lexicalContextClassifierMethodIdentifier:"BF3R2_HALF_OPEN_LEXICAL_CONTEXT_PARTITION_V2",
  staticPropertyMethodIdentifier:"BF3R2_STATIC_PROPERTY_NAME_V1",
  staticEximbayBaseMethodIdentifier:"BF3R2_STATIC_EXIMBAY_BASE_V1",
  requestPayMemberMethodIdentifier:"BF3R2_EXIMBAY_REQUEST_PAY_MEMBER_V1",
  callCalleeMethodIdentifier:"BF3R2_EXIMBAY_REQUEST_PAY_CALL_CALLEE_V1",
  directBindingMethodIdentifier:"BF3R2_DIRECT_REQUEST_PAY_FUNCTION_BINDING_V1",
  endpointCarrierMethodIdentifier:"BF3R2_STATIC_ENDPOINT_PATH_CARRIER_V1",
  sourceShapeAggregationMethodIdentifier:"BF3R2_SOURCE_SHAPE_AGGREGATION_V2",
  boundedVectorMethodIdentifier:"BF3R2_BOUNDED_VECTOR_CONSTRUCTION_V2",
  boundedVectorCanonicalHashMethodIdentifier:"BF3R2_BOUNDED_VECTOR_CANONICAL_HASH_V2",
  comparisonMethodIdentifier:"BF3R2_V1_V2_BOUNDED_COMPARISON_WITH_METHOD_FAILURE_V3",
  warningMethodIdentifier:"BF3R2_WARNING_DERIVATION_V2",
  semanticOutcomeMethodIdentifier:"BF3R2_TOP_LEVEL_SEMANTIC_OUTCOME_V3",
  analysisHarnessImplementationIdentifier:HARNESS_IMPLEMENTATION_IDENTITY,
  harnessExtractionMethodIdentifier:HARNESS_EXTRACTION_METHOD_IDENTITY,
  harnessExtractionAdmissionMethodIdentifier:"BF3R2_INSTALLED_CONTRACT_HARNESS_IDENTITY_ADMISSION_V1",
  evidenceSchemaConstructionMethodIdentifier:"BF3R2_EVIDENCE_SCHEMA_CONSTRUCTION_AND_VALIDATION_V5",
  productionEvidenceValidatorMethodIdentifier:"BF3R2_EXACT_RECURSIVE_CLOSED_PRODUCTION_EVIDENCE_VALIDATOR_V2",
  upstreamAuthorityValidatorMethodIdentifier:"BF3R2_EXACT_UPSTREAM_AUTHORITY_VALIDATOR_V1",
  executionEnvironmentValidatorMethodIdentifier:"BF3R2_EXACT_EXECUTION_ENVIRONMENT_VALIDATOR_V2",
  productionNegativeSchemaVectorMethodIdentifier:"BF3R2_PRODUCTION_SCHEMA_NEGATIVE_VECTORS_V2",
  syntheticValidationMethodIdentifier:"BF3R2_SEPARATE_TEST_ONLY_SYNTHETIC_VALIDATION_V2",
  packageWriteMethodIdentifier:"BF3R2_SEMANTIC_ORIGINAL_ARCHIVE_WRITE_VERIFY_V5",
  packageIntegrityMethodIdentifier:"BF3R2_NONRECURSIVE_VALID_PACKAGE_INTEGRITY_V3",
  terminalStateMethodIdentifier:"BF3R2_EXECUTION_TERMINAL_STATE_V2",
  launchTerminalMapperMethodIdentifier:"BF3R2_EXACT_LAUNCH_TERMINAL_MAPPER_V1",
  launchTemporaryStateCleanupMethodIdentifier:"BF3R2_LAUNCH_TEMPORARY_STATE_CLEANUP_V1",
  processMatrixMethodIdentifier:"BF3R2_ACTUAL_LAUNCHER_PROCESS_MATRIX_V2",
  packageManifestMethodIdentifier:"BF3R2_PACKAGE_DIRECTORY_MANIFEST_V1",
  canonicalSerializationMethodIdentifier:"BF3_CANONICAL_JSON_UTF8_V1"
});
const ASSETS = Object.freeze([
  Object.freeze({ordinal:1,identity:"TEST_V2",basename:"01-test-v2-javascriptSDK.js",byteCount:4287,sha256:"d324cb484f3c4c56f949329f5ddf4ca62e012c72ef530febe3ce77db35a396b7"}),
  Object.freeze({ordinal:2,identity:"TEST_V1",basename:"02-test-v1-javascriptSDK.js",byteCount:3459,sha256:"9b818e54c11267d85f9c57a0e2e10370abb850d1a20df4368cde4b4bd8a89ef2"})
]);
const BF3_ROOT = "/Users/duckcow/mira-evidence/eximbay-bf3/20260811T220109Z-c4779de2";
const BF3R1_ROOT = "/Users/duckcow/mira-evidence/eximbay-bf3-r1/20260812T003616Z-88533a1e";

function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function assert(condition, code) { if (!condition) fail(code); }
function isSafeNonNegative(value) { return Number.isSafeInteger(value) && value >= 0; }
function assertBounded(value, sourceLength) {
  assert(isSafeNonNegative(sourceLength), "SOURCE_SHAPE_METHOD_FAILED");
  assert(isSafeNonNegative(value) && value <= sourceLength, "SOURCE_SHAPE_METHOD_FAILED");
  return value;
}
function increment(value, sourceLength) { return assertBounded(value + 1, sourceLength); }
function fileBytesIdentity(file, expectedCount, expectedHash, failureCode="TOOLCHAIN_IDENTITY_FAILED") {
  const stat = fs.lstatSync(file);
  assert(stat.isFile() && !stat.isSymbolicLink(), failureCode);
  const bytes = fs.readFileSync(file);
  assert(bytes.length === expectedCount && sha256(bytes) === expectedHash, failureCode);
  return bytes;
}
function validateHarnessIdentity(value, code="SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED") {
  exactKeys(value,["methodIdentity","harnessImplementationIdentity","extractionMethodIdentity","byteCount","sha256"],code);
  assert(Object.isFrozen(value)&&value.methodIdentity===METHOD_IDENTITIES.harnessExtractionAdmissionMethodIdentifier&&value.harnessImplementationIdentity===HARNESS_IMPLEMENTATION_IDENTITY&&value.extractionMethodIdentity===HARNESS_EXTRACTION_METHOD_IDENTITY&&isSafeNonNegative(value.byteCount)&&value.byteCount>0,code);
  assertHash(value.sha256,code);
}
function harnessIdentityFromExtractedBytes(harnessBytes) {
  const identity=Object.freeze({methodIdentity:METHOD_IDENTITIES.harnessExtractionAdmissionMethodIdentifier,harnessImplementationIdentity:HARNESS_IMPLEMENTATION_IDENTITY,extractionMethodIdentity:HARNESS_EXTRACTION_METHOD_IDENTITY,byteCount:harnessBytes.length,sha256:sha256(harnessBytes)});
  validateHarnessIdentity(identity,"TOOLCHAIN_IDENTITY_FAILED");return identity;
}
function admitHarnessIdentity(repositoryAuthority,harnessBytes,launcherHarnessSha256) {
  exactKeys(repositoryAuthority,["contractAuthorityOutcome","contractMergeSha","contractSha256"],"TOOLCHAIN_IDENTITY_FAILED");
  assert(Object.isFrozen(repositoryAuthority)&&repositoryAuthority.contractAuthorityOutcome==="ADMITTED", "TOOLCHAIN_IDENTITY_FAILED");
  const admittedHarnessIdentity=harnessIdentityFromExtractedBytes(harnessBytes);
  assert(admittedHarnessIdentity.sha256===launcherHarnessSha256,"TOOLCHAIN_IDENTITY_FAILED");
  return admittedHarnessIdentity;
}
function sortedManifest(root) {
  const rootStat = fs.lstatSync(root);
  assert(rootStat.isDirectory() && !rootStat.isSymbolicLink() && fs.realpathSync(root) === root, "TOOLCHAIN_IDENTITY_FAILED");
  const parent = path.dirname(root);
  const lines = [];
  function walk(directory) {
    for (const name of fs.readdirSync(directory)) {
      const absolute = path.join(directory, name);
      const stat = fs.lstatSync(absolute);
      assert(!stat.isSymbolicLink(), "TOOLCHAIN_IDENTITY_FAILED");
      if (stat.isDirectory()) walk(absolute);
      else {
        assert(stat.isFile(), "TOOLCHAIN_IDENTITY_FAILED");
        const bytes = fs.readFileSync(absolute);
        const relative = path.relative(parent, absolute).split(path.sep).join("/");
        assert(!relative.split("/").some((part) => part === "." || part === ".."), "TOOLCHAIN_IDENTITY_FAILED");
        lines.push(`${relative}\t${bytes.length}\t${sha256(bytes)}\n`);
      }
    }
  }
  walk(root);
  lines.sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  return {fileCount:lines.length,sha256:sha256(Buffer.from(lines.join(""),"utf8"))};
}
function admitProcessEnvironment(execArgv, environment, cacheKeys, mainPath) {
  if (!Array.isArray(execArgv) || execArgv.length !== 0) return false;
  const expectedKeys = Object.keys(EXPECTED_ENV).sort();
  const observedKeys = Object.keys(environment).sort();
  if (JSON.stringify(expectedKeys) !== JSON.stringify(observedKeys)) return false;
  if (expectedKeys.some((key) => environment[key] !== EXPECTED_ENV[key])) return false;
  if (Object.hasOwn(environment,"NODE_OPTIONS") || Object.hasOwn(environment,"NODE_PATH")) return false;
  return cacheKeys.length === 1 && cacheKeys[0] === mainPath;
}
function expectedRunRoot(mode, runId) {
  return mode === "run" ? `/Users/duckcow/mira-evidence/eximbay-bf3-r2/${runId}` : `/private/tmp/mira-bf3r2/synthetic/${runId}`;
}
function verifyExternalLaunchAuthority(args) {
  if (process.env.BF3R2_LAUNCH_FD !== String(LAUNCH_TOKEN_FD)) fail("LAUNCH_AUTHORITY_FAILED");
  const runRoot = expectedRunRoot(args.mode,args.runId);
  if (args.launchTokenPath !== `${runRoot}/.launch-token-v1` || String(process.ppid) !== args.launchParentPid) fail("LAUNCH_BINDING_MISMATCH");
  let tokenStat,fdStat,descriptorBytes,pathBytes;
  try {
    tokenStat=fs.lstatSync(args.launchTokenPath);
    fdStat=fs.fstatSync(LAUNCH_TOKEN_FD);
    descriptorBytes=fs.readFileSync(LAUNCH_TOKEN_FD);
    pathBytes=fs.readFileSync(args.launchTokenPath);
  } catch { fail("LAUNCH_CHANNEL_UNAVAILABLE"); }
  assert(tokenStat.isFile() && !tokenStat.isSymbolicLink() && (tokenStat.mode & 0o777) === 0o600, "LAUNCH_TOKEN_FAILED");
  assert(tokenStat.dev === fdStat.dev && tokenStat.ino === fdStat.ino, "LAUNCH_BINDING_MISMATCH");
  const expected = Buffer.from(`BF3R2_LAUNCH_TOKEN_V2\n${args.mode}\n${args.runId}\n${args.contractMerge}\n${args.contractSha256}\n${args.launchParentPid}\n${args.syntheticFault}\n`,"utf8");
  assert(descriptorBytes.equals(expected) && pathBytes.equals(expected), "LAUNCH_TOKEN_FAILED");
  return {runRoot,tokenByteCount:expected.length,tokenSha256:sha256(expected),childHandshakeOutcome:"VERIFIED"};
}
function verifyBootstrapIdentity() {
  const link = fs.lstatSync(GIT_PATH);
  assert(link.isSymbolicLink() && fs.readlinkSync(GIT_PATH) === "../Cellar/git/2.52.0_1/bin/git", "UPSTREAM_LIFECYCLE_AUTHORITY_FAILED");
  assert(fs.realpathSync(GIT_PATH) === GIT_REAL_PATH, "UPSTREAM_LIFECYCLE_AUTHORITY_FAILED");
  fileBytesIdentity(GIT_REAL_PATH,GIT_IDENTITY.byteCount,GIT_IDENTITY.sha256,"UPSTREAM_LIFECYCLE_AUTHORITY_FAILED");
}
function verifyProcessEnvironment(args) {
  const mainPath = fs.realpathSync(process.argv[1]);
  const cacheKeys = Object.keys(require.cache);
  assert(admitProcessEnvironment(process.execArgv, process.env, cacheKeys, mainPath), "TOOLCHAIN_IDENTITY_FAILED");
  assert(process.cwd() === REPOSITORY_ROOT, "TOOLCHAIN_IDENTITY_FAILED");
  assert(process.execPath === NODE_PATH, "TOOLCHAIN_IDENTITY_FAILED");
  assert(process.version === NODE_IDENTITY.version && process.versions.v8 === NODE_IDENTITY.v8, "TOOLCHAIN_IDENTITY_FAILED");
  fileBytesIdentity(NODE_PATH, NODE_IDENTITY.byteCount, NODE_IDENTITY.sha256);
  fileBytesIdentity(HARNESS_PATH,fs.lstatSync(HARNESS_PATH).size,args.harnessSha256);
  fileBytesIdentity(PACKAGE_LOCK.path, PACKAGE_LOCK.byteCount, PACKAGE_LOCK.sha256);
}
function verifyResolutionCandidate(candidate, closure) {
  if (candidate !== closure.entry || fs.realpathSync(candidate) !== candidate) return false;
  const packageJson = path.join(closure.root,"package.json");
  try {
    fileBytesIdentity(packageJson,closure.packageJsonBytes,closure.packageJsonSha256);
    fileBytesIdentity(candidate,closure.entryBytes,closure.entrySha256);
    const manifest = sortedManifest(closure.root);
    const metadata = JSON.parse(fs.readFileSync(packageJson,"utf8"));
    return metadata.name === closure.name && metadata.version === closure.version && manifest.fileCount === closure.fileCount && manifest.sha256 === closure.manifestSha256;
  } catch { return false; }
}
function loadParserClosure() {
  for (const closure of PACKAGE_CLOSURES) assert(verifyResolutionCandidate(closure.entry,closure), "TOOLCHAIN_IDENTITY_FAILED");
  const before = Object.keys(require.cache);
  assert(before.length === 1 && before[0] === fs.realpathSync(process.argv[1]), "TOOLCHAIN_IDENTITY_FAILED");
  const espree = require(PACKAGE_CLOSURES[0].entry);
  const visitorKeysModule = require(PACKAGE_CLOSURES[3].entry);
  assert(require.resolve(PACKAGE_CLOSURES[0].entry) === PACKAGE_CLOSURES[0].entry, "TOOLCHAIN_IDENTITY_FAILED");
  for (const closure of PACKAGE_CLOSURES) {
    const realRoot = `${closure.root}${path.sep}`;
    assert(Object.keys(require.cache).some((entry) => entry === closure.entry || entry.startsWith(realRoot)), "TOOLCHAIN_IDENTITY_FAILED");
  }
  return {espree,visitorKeys:visitorKeysModule.KEYS};
}
function networkContainmentPreflight() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    let settled = false;
    server.once("error", (error) => {
      if (settled) return;
      settled = true;
      if (error && (error.code === "EPERM" || error.code === "EACCES")) resolve();
      else reject(Object.assign(new Error("NETWORK_CONTAINMENT_FAILED"),{code:"NETWORK_CONTAINMENT_FAILED"}));
    });
    server.listen(0,"127.0.0.1",() => {
      if (settled) return;
      settled = true;
      server.close(() => reject(Object.assign(new Error("NETWORK_CONTAINMENT_FAILED"),{code:"NETWORK_CONTAINMENT_FAILED"})));
    });
  });
}
function gitBytes(revision, file) {
  const result = spawnSync(GIT_PATH,["show",`${revision}:${file}`],{cwd:REPOSITORY_ROOT,encoding:null,maxBuffer:2_000_000,env:EXPECTED_ENV});
  assert(result.status === 0 && Buffer.isBuffer(result.stdout), "UPSTREAM_LIFECYCLE_AUTHORITY_FAILED");
  return result.stdout;
}
function verifyGitFile(revision, file, byteCount, digest) {
  const bytes = gitBytes(revision,file);
  assert(bytes.length === byteCount && sha256(bytes) === digest, "UPSTREAM_LIFECYCLE_AUTHORITY_FAILED");
}
function verifyRepositoryAuthority(contractMerge, contractHash) {
  verifyGitFile(LIFECYCLE.mergeSha,LIFECYCLE.path,LIFECYCLE.byteCount,LIFECYCLE.sha256);
  verifyGitFile(BF3R1_RESULT.mergeSha,BF3R1_RESULT.path,BF3R1_RESULT.byteCount,BF3R1_RESULT.sha256);
  const ancestor = spawnSync(GIT_PATH,["merge-base","--is-ancestor",LIFECYCLE.mergeSha,contractMerge],{cwd:REPOSITORY_ROOT,env:EXPECTED_ENV});
  assert(ancestor.status === 0, "UPSTREAM_LIFECYCLE_AUTHORITY_FAILED");
  const contract = gitBytes(contractMerge,CONTRACT_PATH);
  assert(sha256(contract) === contractHash, "UPSTREAM_LIFECYCLE_AUTHORITY_FAILED");
  return Object.freeze({contractAuthorityOutcome:"ADMITTED",contractMergeSha:contractMerge,contractSha256:contractHash});
}
function parseEspree(espree, source) {
  try { return {outcome:"SUCCEEDED",ast:espree.parse(source,ESPREE_OPTIONS)}; }
  catch (error) { return {outcome:error instanceof SyntaxError?"SYNTAX_REJECTED":"METHOD_FAILED",ast:null}; }
}
function compileV8(source,injectFailure=false) {
  if(injectFailure) return "METHOD_FAILED";
  try { new vm.Script(source,VM_OPTIONS); return "SUCCEEDED"; }
  catch (error) { return error instanceof SyntaxError?"SYNTAX_REJECTED":"METHOD_FAILED"; }
}
function deriveDual(espreeOutcome, v8Outcome) {
  if (espreeOutcome === "METHOD_FAILED" || v8Outcome === "METHOD_FAILED") return "METHOD_INCOMPLETE";
  if (espreeOutcome === "SUCCEEDED" && v8Outcome === "SUCCEEDED") return "BOTH_ACCEPTED";
  if (espreeOutcome === "SYNTAX_REJECTED" && v8Outcome === "SYNTAX_REJECTED") return "BOTH_REJECTED";
  if (espreeOutcome === "SUCCEEDED") return "ESPREE_ACCEPTED_V8_REJECTED";
  return "ESPREE_REJECTED_V8_ACCEPTED";
}
function validRange(range, sourceLength) {
  return Array.isArray(range) && range.length === 2 && isSafeNonNegative(range[0]) && isSafeNonNegative(range[1]) && range[0] <= range[1] && range[1] <= sourceLength;
}
function traverseAndAdmit(ast, comments, sourceLength, visitorKeys, visit) {
  assert(isSafeNonNegative(sourceLength), "SOURCE_SHAPE_METHOD_FAILED");
  assert(ast && ast.type === "Program" && ast.sourceType === "script" && validRange(ast.range,sourceLength), "SOURCE_SHAPE_METHOD_FAILED");
  const seen = new Set();
  function walk(node) {
    assert(node && typeof node === "object" && typeof node.type === "string" && !seen.has(node), "SOURCE_SHAPE_METHOD_FAILED");
    seen.add(node);
    assert(validRange(node.range,sourceLength), "SOURCE_SHAPE_METHOD_FAILED");
    const keys = visitorKeys[node.type];
    assert(Array.isArray(keys), "SOURCE_SHAPE_METHOD_FAILED");
    visit(node);
    for (const key of keys) {
      const child = node[key];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) { for (const item of child) walk(item); }
      else walk(child);
    }
  }
  walk(ast);
  assert(Array.isArray(comments), "SOURCE_SHAPE_METHOD_FAILED");
  for (const comment of comments) assert(comment && (comment.type === "Line" || comment.type === "Block") && validRange(comment.range,sourceLength), "SOURCE_SHAPE_METHOD_FAILED");
}
function enumerateOccurrences(source,target) {
  assert(typeof source === "string" && typeof target === "string" && target.length > 0 && isSafeNonNegative(source.length), "SOURCE_SHAPE_METHOD_FAILED");
  const output = [];
  let from = 0;
  while (from <= source.length - target.length) {
    const start = source.indexOf(target,from);
    if (start === -1) break;
    const end = start + target.length;
    assert(validRange([start,end],source.length), "SOURCE_SHAPE_METHOD_FAILED");
    output.push([start,end]);
    from = start + 1;
  }
  return output;
}
function contains(container, occurrence) { return container[0] <= occurrence[0] && occurrence[1] <= container[1]; }
function intersects(left,right) { return left[0] < right[1] && right[0] < left[1]; }
function classifyOccurrence(occurrence, commentRanges, carrierRanges) {
  const commentIntersections = commentRanges.filter((range) => intersects(range,occurrence));
  const carrierIntersections = carrierRanges.filter((range) => intersects(range,occurrence));
  const commentContainers = commentIntersections.filter((range) => contains(range,occurrence));
  const carrierContainers = carrierIntersections.filter((range) => contains(range,occurrence));
  if (commentContainers.length === 1 && carrierIntersections.length === 0) return "COMMENT";
  if (carrierContainers.length === 1 && commentIntersections.length === 0) return "STRING_OR_TEMPLATE_STATIC_TEXT";
  if (commentIntersections.length === 0 && carrierIntersections.length === 0) return "CODE";
  return "UNCLASSIFIED";
}
function staticProperty(node,name) {
  if (!node) return false;
  if (!node.computed && node.type === "Identifier") return node.name === name;
  return node.type === "Literal" && typeof node.value === "string" && node.value === name;
}
function staticEximbayBase(node) {
  if (!node) return false;
  if (node.type === "Identifier") return node.name === "EXIMBAY";
  return node.type === "MemberExpression" && !node.optional && node.object && node.object.type === "Identifier" && ["window","globalThis","self"].includes(node.object.name) && staticProperty(node.property,"EXIMBAY");
}
function requestPayMember(node) { return Boolean(node && node.type === "MemberExpression" && !node.optional && staticEximbayBase(node.object) && staticProperty(node.property,"request_pay")); }
function callCallee(node) { return Boolean(node && node.type === "CallExpression" && !node.optional && requestPayMember(node.callee)); }
function functionLike(node) { return Boolean(node && (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression")); }
function qualifyingObjectProperties(node) {
  if (!node || node.type !== "ObjectExpression") return 0;
  return node.properties.filter((property) => property.type === "Property" && property.kind === "init" && staticProperty(property.key,"request_pay") && functionLike(property.value)).length;
}
function directBindingCount(node) {
  if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.id.name === "EXIMBAY") return qualifyingObjectProperties(node.init);
  if (node.type !== "AssignmentExpression" || node.operator !== "=") return 0;
  if (requestPayMember(node.left) && functionLike(node.right)) return 1;
  if (node.left.type === "Identifier" && node.left.name === "EXIMBAY") return qualifyingObjectProperties(node.right);
  if (staticEximbayBase(node.left) && node.left.type === "MemberExpression") return qualifyingObjectProperties(node.right);
  return 0;
}
function canonicalBytes(value) {
  function validate(item) {
    if (item === null || typeof item === "boolean" || typeof item === "string") {
      if (typeof item === "string") for (let index=0; index<item.length; index+=1) {
        const code = item.charCodeAt(index);
        if (code >= 0xD800 && code <= 0xDBFF) { assert(index+1<item.length && item.charCodeAt(index+1)>=0xDC00 && item.charCodeAt(index+1)<=0xDFFF,"SOURCE_SHAPE_METHOD_FAILED"); index+=1; }
        else assert(code < 0xDC00 || code > 0xDFFF,"SOURCE_SHAPE_METHOD_FAILED");
      }
      return;
    }
    if (typeof item === "number") { assert(Number.isSafeInteger(item),"SOURCE_SHAPE_METHOD_FAILED"); return; }
    if (Array.isArray(item)) { item.forEach(validate); return; }
    assert(item && typeof item === "object" && Object.getPrototypeOf(item) === Object.prototype,"SOURCE_SHAPE_METHOD_FAILED");
    Object.values(item).forEach(validate);
  }
  validate(value);
  return Buffer.from(`${JSON.stringify(value,null,2)}\n`,"utf8");
}
function vectorHash(values) {
  assert(Array.isArray(values) && values.length === 8,"SOURCE_SHAPE_METHOD_FAILED");
  values.forEach((value) => assert(isSafeNonNegative(value),"SOURCE_SHAPE_METHOD_FAILED"));
  return sha256(canonicalBytes({schema:"mira.eximbay.bf3-r2-bounded-source-shape-vector",version:1,values}));
}
function buildSourceShape(source, ast, visitorKeys) {
  const sourceLength = source.length;
  assert(isSafeNonNegative(sourceLength),"SOURCE_SHAPE_METHOD_FAILED");
  const comments = ast.comments;
  const nodes = [];
  traverseAndAdmit(ast,comments,sourceLength,visitorKeys,(node) => nodes.push(node));
  const commentRanges = comments.map((comment) => comment.range);
  const carrierRanges = nodes.filter((node) => (node.type === "Literal" && typeof node.value === "string") || node.type === "TemplateElement").map((node) => node.range);
  const lexicalContextCounts = TARGETS.map((target) => {
    const counts = {targetId:target.id,exactOccurrenceCount:0,commentCount:0,stringOrTemplateStaticTextCount:0,codeCount:0,unclassifiedCount:0};
    for (const occurrence of enumerateOccurrences(source,target.text)) {
      counts.exactOccurrenceCount = increment(counts.exactOccurrenceCount,sourceLength);
      const classification = classifyOccurrence(occurrence,commentRanges,carrierRanges);
      const key = {COMMENT:"commentCount",STRING_OR_TEMPLATE_STATIC_TEXT:"stringOrTemplateStaticTextCount",CODE:"codeCount",UNCLASSIFIED:"unclassifiedCount"}[classification];
      counts[key] = increment(counts[key],sourceLength);
    }
    assert(counts.commentCount+counts.stringOrTemplateStaticTextCount+counts.codeCount+counts.unclassifiedCount===counts.exactOccurrenceCount,"SOURCE_SHAPE_METHOD_FAILED");
    return counts;
  });
  let memberCount=0,calleeCount=0,bindingCount=0;
  for (const node of nodes) {
    if (requestPayMember(node)) memberCount=increment(memberCount,sourceLength);
    if (callCallee(node)) calleeCount=increment(calleeCount,sourceLength);
    const direct = directBindingCount(node);
    assertBounded(direct,sourceLength);
    bindingCount=assertBounded(bindingCount+direct,sourceLength);
  }
  const byId = Object.fromEntries(lexicalContextCounts.map((record) => [record.targetId,record]));
  const testCarrier=byId.TEST_ORIGIN.stringOrTemplateStaticTextCount;
  const productionCarrier=byId.PRODUCTION_ORIGIN.stringOrTemplateStaticTextCount;
  const pathCarrier=byId.V1_PAYMENTS_PATH.stringOrTemplateStaticTextCount;
  const vector=[byId.EXIMBAY.codeCount,byId.REQUEST_PAY.codeCount,memberCount,calleeCount,bindingCount,testCarrier,productionCarrier,pathCarrier];
  vector.forEach((value) => assertBounded(value,sourceLength));
  return {lexicalContextCounts,eximbayRequestPayMemberPatternCount:memberCount,eximbayRequestPayCallCalleePatternCount:calleeCount,directRequestPayFunctionBindingPatternCount:bindingCount,testOriginStaticStringCarrierCount:testCarrier,productionOriginStaticStringCarrierCount:productionCarrier,v1PaymentsPathStaticStringCarrierCount:pathCarrier,boundedSourceShapeVector:vector,boundedSourceShapeVectorSha256:vectorHash(vector)};
}
function compareAssets(assets) {
  const [left,right]=assets;
  const status=(a,b,eligible=true)=>eligible?(JSON.stringify(a)===JSON.stringify(b)?"EQUAL":"DIFFERENT"):"NOT_COMPARABLE";
  const shapesCompleted=left.sourceShapeOutcome==="COMPLETED"&&right.sourceShapeOutcome==="COMPLETED";
  return {leftAssetOrdinal:1,leftAssetIdentity:"TEST_V2",rightAssetOrdinal:2,rightAssetIdentity:"TEST_V1",historicalRawByteInequalityEvidence:"CARRIED_FORWARD_FROM_HISTORICAL_BF3",comparisonOutcome:"COMPLETED",dualScriptSyntaxOutcomeComparison:status(left.dualScriptSyntaxOutcome,right.dualScriptSyntaxOutcome,!assets.some((asset)=>asset.dualScriptSyntaxOutcome==="METHOD_INCOMPLETE")),sourceShapeOutcomeComparison:status(left.sourceShapeOutcome,right.sourceShapeOutcome,!assets.some((asset)=>asset.sourceShapeOutcome==="SOURCE_SHAPE_METHOD_FAILED")),boundedPatternCountsComparison:status(left.sourceShape&&[left.sourceShape.eximbayRequestPayMemberPatternCount,left.sourceShape.eximbayRequestPayCallCalleePatternCount,left.sourceShape.directRequestPayFunctionBindingPatternCount],right.sourceShape&&[right.sourceShape.eximbayRequestPayMemberPatternCount,right.sourceShape.eximbayRequestPayCallCalleePatternCount,right.sourceShape.directRequestPayFunctionBindingPatternCount],shapesCompleted),staticStringCarrierCountsComparison:status(left.sourceShape&&[left.sourceShape.testOriginStaticStringCarrierCount,left.sourceShape.productionOriginStaticStringCarrierCount,left.sourceShape.v1PaymentsPathStaticStringCarrierCount],right.sourceShape&&[right.sourceShape.testOriginStaticStringCarrierCount,right.sourceShape.productionOriginStaticStringCarrierCount,right.sourceShape.v1PaymentsPathStaticStringCarrierCount],shapesCompleted),boundedSourceShapeVectorEquality:status(left.sourceShape&&left.sourceShape.boundedSourceShapeVector,right.sourceShape&&right.sourceShape.boundedSourceShapeVector,shapesCompleted)};
}
function failedComparison() {
  return {leftAssetOrdinal:1,leftAssetIdentity:"TEST_V2",rightAssetOrdinal:2,rightAssetIdentity:"TEST_V1",historicalRawByteInequalityEvidence:"CARRIED_FORWARD_FROM_HISTORICAL_BF3",comparisonOutcome:"METHOD_FAILED",dualScriptSyntaxOutcomeComparison:"NOT_COMPARABLE",sourceShapeOutcomeComparison:"NOT_COMPARABLE",boundedPatternCountsComparison:"NOT_COMPARABLE",staticStringCarrierCountsComparison:"NOT_COMPARABLE",boundedSourceShapeVectorEquality:"NOT_COMPARABLE"};
}
function compareAssetsSafely(assets,injectFailure=false) {
  try { if(injectFailure) fail("SYNTHETIC_COMPARISON_FAILURE"); return compareAssets(assets); }
  catch { return failedComparison(); }
}
function deriveWarnings(assets,comparison) {
  const warnings=[];
  const add=(code,assetOrdinal=null)=>warnings.push({code,assetOrdinal,detail:null});
  if(comparison.comparisonOutcome==="METHOD_FAILED")add("COMPARISON_METHOD_FAILED");
  for(const asset of assets){if(asset.utf8DecodeOutcome==="INVALID_UTF8")add("UTF8_INVALID",asset.ordinal);if(asset.utf8DecodeOutcome==="METHOD_FAILED")add("UTF8_METHOD_FAILED",asset.ordinal);if(asset.espreeParseOutcome==="METHOD_FAILED")add("ESPREE_METHOD_FAILED",asset.ordinal);if(asset.v8CompileOutcome==="METHOD_FAILED")add("V8_METHOD_FAILED",asset.ordinal);if(["ESPREE_ACCEPTED_V8_REJECTED","ESPREE_REJECTED_V8_ACCEPTED"].includes(asset.dualScriptSyntaxOutcome))add("PARSER_DISAGREEMENT",asset.ordinal);if(asset.sourceShapeOutcome==="SOURCE_SHAPE_METHOD_FAILED")add("SOURCE_SHAPE_METHOD_FAILED",asset.ordinal);if(asset.sourceShape&&asset.sourceShape.lexicalContextCounts.some((record)=>record.unclassifiedCount>0))add("LEXICAL_CONTEXT_UNCLASSIFIED",asset.ordinal);}
  return warnings;
}
function deriveEvidenceOutcome(assets,comparison) {
  if(assets.some((asset)=>["INVALID_UTF8","METHOD_FAILED"].includes(asset.utf8DecodeOutcome)||asset.dualScriptSyntaxOutcome==="METHOD_INCOMPLETE"||asset.sourceShapeOutcome==="SOURCE_SHAPE_METHOD_FAILED")||comparison.comparisonOutcome==="METHOD_FAILED")return "ECMASCRIPT_EVIDENCE_INCOMPLETE";
  if(assets.some((asset)=>["ESPREE_ACCEPTED_V8_REJECTED","ESPREE_REJECTED_V8_ACCEPTED"].includes(asset.dualScriptSyntaxOutcome)))return "PARSER_DISAGREEMENT_EVIDENCE_COMPLETE";
  if(assets.some((asset)=>asset.dualScriptSyntaxOutcome==="BOTH_REJECTED"))return "SYNTAX_ONLY_EVIDENCE_COMPLETE";
  return "SOURCE_SHAPE_EVIDENCE_COMPLETE";
}
function fatalUtf8(bytes) {
  try{return {outcome:"SUCCEEDED",source:new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes)};}
  catch(error){return {outcome:error instanceof TypeError?"INVALID_UTF8":"METHOD_FAILED",source:null};}
}
function verifyPair(original,archive,expectedCount,expectedHash,code) {
  try{
    const originalStat=fs.lstatSync(original),archiveStat=fs.lstatSync(archive);
    assert(originalStat.isFile()&&!originalStat.isSymbolicLink()&&archiveStat.isFile()&&!archiveStat.isSymbolicLink(),code);
    assert(originalStat.dev!==archiveStat.dev||originalStat.ino!==archiveStat.ino,code);
    const originalBytes=fs.readFileSync(original),archiveBytes=fs.readFileSync(archive);
    assert(originalBytes.length===expectedCount&&archiveBytes.length===expectedCount&&sha256(originalBytes)===expectedHash&&sha256(archiveBytes)===expectedHash&&originalBytes.equals(archiveBytes),code);
    return {bytes:originalBytes,verification:{originalRegularNonSymlinkFileStatus:"VERIFIED_REGULAR_NON_SYMLINK",originalDeviceIdentifier:String(originalStat.dev),originalFileIdentifier:String(originalStat.ino),archiveRegularNonSymlinkFileStatus:"VERIFIED_REGULAR_NON_SYMLINK",archiveDeviceIdentifier:String(archiveStat.dev),archiveFileIdentifier:String(archiveStat.ino),filesystemIdentityOutcome:"DISTINCT",originalObservedByteCount:originalBytes.length,originalObservedSha256:sha256(originalBytes),archiveObservedByteCount:archiveBytes.length,archiveObservedSha256:sha256(archiveBytes),originalArchiveDirectByteEquality:"EQUAL",expectedIdentityOutcome:"MATCH"}};
  }catch{fail(code);}
}
function verifyUpstreamAndReadSources() {
  const integrityName="bf3-r1-derived-evidence-package-integrity-v1-20260812T003616Z-88533a1e.json";
  const evidenceName="bf3-r1-derived-evidence-v1-20260812T003616Z-88533a1e.json";
  const integrityPath=`${BF3R1_ROOT}/${integrityName}`;
  const integrity=fileBytesIdentity(integrityPath,1423,"f5ce567de7ecfb1aa6a729c624417f1d02243f7e8258835d8880af2f65e52f1e","UPSTREAM_CUSTODY_FAILED");
  const derived=verifyPair(`${BF3R1_ROOT}/original/${evidenceName}`,`${BF3R1_ROOT}/archive/${evidenceName}`,8233,"76ae11e1e5c2de3d09ef0ac016274279f9738d825be4ebe9c38c6efe33f55a55","UPSTREAM_CUSTODY_FAILED");
  let integrityObject,evidenceObject;
  try{integrityObject=JSON.parse(integrity.toString("utf8"));evidenceObject=JSON.parse(derived.bytes.toString("utf8"));}catch{fail("UPSTREAM_CUSTODY_FAILED");}
  assert(integrityObject.packageIntegrityOutcome==="PACKAGE_VALID"&&integrityObject.packageIntegrityReason==="NONE","UPSTREAM_CUSTODY_FAILED");
  assert(Buffer.from(`${JSON.stringify(integrityObject,null,2)}\n`,"utf8").equals(integrity)&&Buffer.from(`${JSON.stringify(evidenceObject,null,2)}\n`,"utf8").equals(derived.bytes),"UPSTREAM_CUSTODY_FAILED");
  assert(evidenceObject.schema==="mira.eximbay.bf3-r1-derived-evidence"&&evidenceObject.version===1&&evidenceObject.derivedRunId==="20260812T003616Z-88533a1e"&&evidenceObject.historicalBf3RunId==="20260811T220109Z-c4779de2"&&evidenceObject.derivedEvidenceOutcome==="DERIVED_TEXT_EVIDENCE_COMPLETE"&&Array.isArray(evidenceObject.warnings)&&evidenceObject.warnings.length===0&&Array.isArray(evidenceObject.assets)&&evidenceObject.assets.length===2,"UPSTREAM_CUSTODY_FAILED");
  const expectedLiteralStatuses=["OBSERVED_IN_RETAINED_TEXT","OBSERVED_IN_RETAINED_TEXT","OBSERVED_IN_RETAINED_TEXT","NOT_OBSERVED_IN_RETAINED_TEXT","OBSERVED_IN_RETAINED_TEXT"];
  for(let index=0;index<ASSETS.length;index+=1){const expected=ASSETS[index],observed=evidenceObject.assets[index];assert(observed.ordinal===expected.ordinal&&observed.identity===expected.identity&&observed.basename===expected.basename&&observed.expectedByteCount===expected.byteCount&&observed.expectedSha256===expected.sha256&&observed.utf8DecodeOutcome==="SUCCEEDED"&&observed.literalSearchOutcome==="COMPLETED"&&observed.jsonParseOutcome==="FAILED"&&observed.jsonTopLevelKind==="NOT_APPLICABLE"&&Array.isArray(observed.literalObservations)&&observed.literalObservations.length===5&&observed.literalObservations.every((item,itemIndex)=>item.status===expectedLiteralStatuses[itemIndex]),"UPSTREAM_CUSTODY_FAILED");}
  const sources=ASSETS.map((asset)=>verifyPair(`${BF3_ROOT}/original/${asset.basename}`,`${BF3_ROOT}/archive/${asset.basename}`,asset.byteCount,asset.sha256,"UPSTREAM_CUSTODY_FAILED"));
  return {sourceBytes:sources.map((source)=>source.bytes),upstreamAuthority:{bf3r1PackageIntegrityBasename:integrityName,bf3r1PackageIntegrityByteCount:1423,bf3r1PackageIntegritySha256:"f5ce567de7ecfb1aa6a729c624417f1d02243f7e8258835d8880af2f65e52f1e",bf3r1PackageIntegrityVerification:{regularNonSymlinkFileStatus:"VERIFIED_REGULAR_NON_SYMLINK",observedByteCount:integrity.length,observedSha256:sha256(integrity),expectedIdentityOutcome:"MATCH"},bf3r1PackageIntegrityClaimsOutcome:"VERIFIED_REQUIRED_BINDINGS",bf3r1DerivedEvidenceBasename:evidenceName,bf3r1DerivedEvidenceByteCount:8233,bf3r1DerivedEvidenceSha256:"76ae11e1e5c2de3d09ef0ac016274279f9738d825be4ebe9c38c6efe33f55a55",bf3r1DerivedEvidenceVerification:derived.verification,bf3r1DerivedEvidenceCanonicalSchemaOutcome:"VERIFIED",historicalAssets:ASSETS.map((asset)=>({ordinal:asset.ordinal,identity:asset.identity,basename:asset.basename,expectedByteCount:asset.byteCount,expectedSha256:asset.sha256})),historicalAssetVerifications:sources.map((source)=>source.verification),upstreamAdmittedFactsOutcome:"VERIFIED"}};
}
function analyzeAsset(asset,bytes,espree,visitorKeys,fault=null) {
  const decode=fault==="UTF8_METHOD_FAILED"?{outcome:"METHOD_FAILED",source:null}:fatalUtf8(bytes);
  const record={ordinal:asset.ordinal,identity:asset.identity,basename:asset.basename,expectedByteCount:asset.byteCount,expectedSha256:asset.sha256,decodedSourceUtf16Length:decode.source===null?null:decode.source.length,utf8DecodeOutcome:decode.outcome,espreeParseOutcome:null,v8CompileOutcome:null,dualScriptSyntaxOutcome:"METHOD_INCOMPLETE",sourceShapeOutcome:"NOT_ADMITTED",sourceShape:null};
  if(decode.outcome!=="SUCCEEDED")return record;
  assert(isSafeNonNegative(record.decodedSourceUtf16Length),"SOURCE_SHAPE_METHOD_FAILED");
  const parsed=parseEspree(espree,decode.source);
  const v8Outcome=compileV8(decode.source,fault==="V8_METHOD_FAILED");
  record.espreeParseOutcome=parsed.outcome;
  record.v8CompileOutcome=v8Outcome;
  record.dualScriptSyntaxOutcome=deriveDual(parsed.outcome,v8Outcome);
  if(record.dualScriptSyntaxOutcome!=="BOTH_ACCEPTED")return record;
  try{if(fault==="SOURCE_SHAPE_METHOD_FAILED")fail("SOURCE_SHAPE_METHOD_FAILED");record.sourceShape=buildSourceShape(decode.source,parsed.ast,visitorKeys);record.sourceShapeOutcome="COMPLETED";}
  catch{record.sourceShape=null;record.sourceShapeOutcome="SOURCE_SHAPE_METHOD_FAILED";}
  return record;
}
function runSyntheticPreflight(espree,visitorKeys) {
  assert(parseEspree(espree,"var x = 1;").outcome==="SUCCEEDED"&&compileV8("var x = 1;")==="SUCCEEDED","TOOLCHAIN_IDENTITY_FAILED");
  assert(parseEspree(espree,"export {};").outcome==="SYNTAX_REJECTED"&&compileV8("export {};")==="SYNTAX_REJECTED","TOOLCHAIN_IDENTITY_FAILED");
  assert(parseEspree(espree,"return 1;").outcome==="SYNTAX_REJECTED"&&compileV8("return 1;")==="SYNTAX_REJECTED","TOOLCHAIN_IDENTITY_FAILED");
  globalThis[SENTINEL_KEY]=0;
  try{const parsed=parseEspree(espree,SENTINEL_SOURCE);assert(parsed.outcome==="SUCCEEDED"&&globalThis[SENTINEL_KEY]===0,"NON_EVALUATION_PREFLIGHT_FAILED");assert(compileV8(SENTINEL_SOURCE)==="SUCCEEDED"&&globalThis[SENTINEL_KEY]===0,"NON_EVALUATION_PREFLIGHT_FAILED");}
  finally{delete globalThis[SENTINEL_KEY];}
  assert(!Object.hasOwn(globalThis,SENTINEL_KEY),"NON_EVALUATION_PREFLIGHT_FAILED");
  const cases=[
    ["var EXIMBAY = { request_pay: function () {} };",[1,1,0,0,1,0,0,0]],
    ["EXIMBAY.request_pay();",[1,1,1,1,0,0,0,0]],
    ["EXIMBAY[\"request_pay\"] = () => {};",[1,0,1,0,1,0,0,0]],
    ["window.EXIMBAY = { request_pay() {} };",[1,1,0,0,1,0,0,0]],
    ["\"EXIMBAY request_pay https://api-test.eximbay.com/v1/payments\";",[0,0,0,0,0,1,0,1]],
    ["// EXIMBAY.request_pay\n",[0,0,0,0,0,0,0,0]],
    ["obj[dynamicName] = function () {};",[0,0,0,0,0,0,0,0]]
  ];
  for(const [source,expected] of cases){const parsed=parseEspree(espree,source);assert(parsed.outcome==="SUCCEEDED","TOOLCHAIN_IDENTITY_FAILED");const shape=buildSourceShape(source,parsed.ast,visitorKeys);assert(JSON.stringify(shape.boundedSourceShapeVector)===JSON.stringify(expected)&&shape.boundedSourceShapeVectorSha256===vectorHash(expected),"TOOLCHAIN_IDENTITY_FAILED");}
  const whitespace=[["  x;",[2,4]],["x;  ",[0,2]],["  x;  ",[2,4]],["",[0,0]],["   \n\t",[0,5]]];
  for(const [source,expectedRange] of whitespace){const parsed=parseEspree(espree,source);assert(parsed.outcome==="SUCCEEDED"&&JSON.stringify(parsed.ast.range)===JSON.stringify(expectedRange),"TOOLCHAIN_IDENTITY_FAILED");buildSourceShape(source,parsed.ast,visitorKeys);}
  const adjacency="EXIMBAY/*adjacent*/;";let parsed=parseEspree(espree,adjacency);let shape=buildSourceShape(adjacency,parsed.ast,visitorKeys);assert(shape.lexicalContextCounts[0].codeCount===1&&shape.lexicalContextCounts[0].unclassifiedCount===0,"TOOLCHAIN_IDENTITY_FAILED");
  const partial="https://api-test.eximbay.com\n;";parsed=parseEspree(espree,partial);shape=buildSourceShape(partial,parsed.ast,visitorKeys);assert(shape.lexicalContextCounts[2].unclassifiedCount===1,"TOOLCHAIN_IDENTITY_FAILED");
  for(const [source,id,field] of [["`EXIMBAY`;",0,"stringOrTemplateStaticTextCount"],["`${EXIMBAY}`;",0,"codeCount"],["/EXIMBAY/;",0,"codeCount"]]){parsed=parseEspree(espree,source);shape=buildSourceShape(source,parsed.ast,visitorKeys);assert(shape.lexicalContextCounts[id][field]===1,"TOOLCHAIN_IDENTITY_FAILED");}
  parsed=parseEspree(espree,"EX\\u0049MBAY;");shape=buildSourceShape("EX\\u0049MBAY;",parsed.ast,visitorKeys);assert(shape.lexicalContextCounts[0].exactOccurrenceCount===0,"TOOLCHAIN_IDENTITY_FAILED");
  parsed=parseEspree(espree,"EXIMBAY[\"request_\\u0070ay\"]; ");shape=buildSourceShape("EXIMBAY[\"request_\\u0070ay\"]; ",parsed.ast,visitorKeys);assert(shape.eximbayRequestPayMemberPatternCount===1&&shape.lexicalContextCounts[1].exactOccurrenceCount===0,"TOOLCHAIN_IDENTITY_FAILED");
  assert(contains([0,7],[0,7])&&intersects([0,7],[6,8])&&!intersects([0,7],[7,8]),"TOOLCHAIN_IDENTITY_FAILED");
  assert(isSafeNonNegative(0)&&isSafeNonNegative(7)&&isSafeNonNegative(Number.MAX_SAFE_INTEGER)&&!isSafeNonNegative(Number.MAX_SAFE_INTEGER+1),"TOOLCHAIN_IDENTITY_FAILED");
  assert(!admitProcessEnvironment(["--require","x"],EXPECTED_ENV,[fs.realpathSync(process.argv[1])],fs.realpathSync(process.argv[1]))&&!admitProcessEnvironment(["--import","x"],EXPECTED_ENV,[fs.realpathSync(process.argv[1])],fs.realpathSync(process.argv[1])),"TOOLCHAIN_IDENTITY_FAILED");
  assert(!admitProcessEnvironment([],{...EXPECTED_ENV,NODE_OPTIONS:"--require=x"},[fs.realpathSync(process.argv[1])],fs.realpathSync(process.argv[1]))&&!admitProcessEnvironment([],{...EXPECTED_ENV,NODE_PATH:"/tmp"},[fs.realpathSync(process.argv[1])],fs.realpathSync(process.argv[1])),"TOOLCHAIN_IDENTITY_FAILED");
  assert(!verifyResolutionCandidate("/tmp/alternate-espree.cjs",PACKAGE_CLOSURES[0]),"TOOLCHAIN_IDENTITY_FAILED");
  const good=parseEspree(espree,"x;");assert(good.outcome==="SUCCEEDED","TOOLCHAIN_IDENTITY_FAILED");try{buildSourceShape("x;",{...good.ast,range:[0,Number.MAX_SAFE_INTEGER+1]},visitorKeys);fail("TOOLCHAIN_IDENTITY_FAILED");}catch(error){assert(error.code==="SOURCE_SHAPE_METHOD_FAILED","TOOLCHAIN_IDENTITY_FAILED");}assert(good.outcome==="SUCCEEDED","TOOLCHAIN_IDENTITY_FAILED");
  const assetState=(ordinal,overrides={})=>({ordinal,utf8DecodeOutcome:"SUCCEEDED",espreeParseOutcome:"SUCCEEDED",v8CompileOutcome:"SUCCEEDED",dualScriptSyntaxOutcome:"BOTH_ACCEPTED",sourceShapeOutcome:"COMPLETED",sourceShape:{lexicalContextCounts:[]},...overrides});
  const completedComparison={comparisonOutcome:"COMPLETED"};
  const semanticCases=[
    [[assetState(1,{utf8DecodeOutcome:"INVALID_UTF8",espreeParseOutcome:null,v8CompileOutcome:null,dualScriptSyntaxOutcome:"METHOD_INCOMPLETE",sourceShapeOutcome:"NOT_ADMITTED",sourceShape:null}),assetState(2)],completedComparison,"ECMASCRIPT_EVIDENCE_INCOMPLETE"],
    [[assetState(1,{utf8DecodeOutcome:"METHOD_FAILED",espreeParseOutcome:null,v8CompileOutcome:null,dualScriptSyntaxOutcome:"METHOD_INCOMPLETE",sourceShapeOutcome:"NOT_ADMITTED",sourceShape:null}),assetState(2)],completedComparison,"ECMASCRIPT_EVIDENCE_INCOMPLETE"],
    [[assetState(1,{espreeParseOutcome:"METHOD_FAILED",dualScriptSyntaxOutcome:"METHOD_INCOMPLETE",sourceShapeOutcome:"NOT_ADMITTED",sourceShape:null}),assetState(2)],completedComparison,"ECMASCRIPT_EVIDENCE_INCOMPLETE"],
    [[assetState(1,{v8CompileOutcome:"METHOD_FAILED",dualScriptSyntaxOutcome:"METHOD_INCOMPLETE",sourceShapeOutcome:"NOT_ADMITTED",sourceShape:null}),assetState(2)],completedComparison,"ECMASCRIPT_EVIDENCE_INCOMPLETE"],
    [[assetState(1,{espreeParseOutcome:"SYNTAX_REJECTED",v8CompileOutcome:"SYNTAX_REJECTED",dualScriptSyntaxOutcome:"BOTH_REJECTED",sourceShapeOutcome:"NOT_ADMITTED",sourceShape:null}),assetState(2)],completedComparison,"SYNTAX_ONLY_EVIDENCE_COMPLETE"],
    [[assetState(1,{v8CompileOutcome:"SYNTAX_REJECTED",dualScriptSyntaxOutcome:"ESPREE_ACCEPTED_V8_REJECTED",sourceShapeOutcome:"NOT_ADMITTED",sourceShape:null}),assetState(2)],completedComparison,"PARSER_DISAGREEMENT_EVIDENCE_COMPLETE"],
    [[assetState(1,{sourceShapeOutcome:"SOURCE_SHAPE_METHOD_FAILED",sourceShape:null}),assetState(2)],completedComparison,"ECMASCRIPT_EVIDENCE_INCOMPLETE"],
    [[assetState(1),assetState(2)],{comparisonOutcome:"METHOD_FAILED"},"ECMASCRIPT_EVIDENCE_INCOMPLETE"],
    [[assetState(1),assetState(2)],completedComparison,"SOURCE_SHAPE_EVIDENCE_COMPLETE"]
  ];
  for(const [assets,comparison,expected] of semanticCases)assert(deriveEvidenceOutcome(assets,comparison)===expected,"TOOLCHAIN_IDENTITY_FAILED");
  const unclassifiedAsset=assetState(1,{sourceShape:{lexicalContextCounts:[{unclassifiedCount:1}]}});
  assert(deriveWarnings([unclassifiedAsset,assetState(2)],completedComparison).some((warning)=>warning.code==="LEXICAL_CONTEXT_UNCLASSIFIED"&&warning.assetOrdinal===1),"TOOLCHAIN_IDENTITY_FAILED");
}
function parseArgs(argv) {
  assert(argv.length===16||argv.length===18,"LAUNCH_AUTHORITY_FAILED");
  const expected=["--mode","--run-id","--contract-merge","--contract-sha256","--harness-sha256","--profile-sha256","--launch-token-path","--launch-parent-pid"];
  const values={};
  for(let index=0;index<expected.length;index+=1){assert(argv[index*2]===expected[index],"LAUNCH_AUTHORITY_FAILED");values[expected[index].slice(2)]=argv[index*2+1];}
  if(argv.length===18){assert(argv[16]==="--synthetic-fault","LAUNCH_AUTHORITY_FAILED");values.syntheticFault=argv[17];}
  assert(values.mode==="run"||values.mode==="synthetic-vector","LAUNCH_AUTHORITY_FAILED");
  if(values.mode==="run")assert(argv.length===16,"LAUNCH_AUTHORITY_FAILED");
  else assert(argv.length===18&&SYNTHETIC_FAULTS.includes(values.syntheticFault),"LAUNCH_AUTHORITY_FAILED");
  assert(/^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$/.test(values["run-id"]),"LAUNCH_AUTHORITY_FAILED");
  assert(/^[0-9a-f]{40}$/.test(values["contract-merge"])&&/^[0-9a-f]{64}$/.test(values["contract-sha256"])&&/^[0-9a-f]{64}$/.test(values["harness-sha256"])&&/^[0-9a-f]{64}$/.test(values["profile-sha256"]),"LAUNCH_AUTHORITY_FAILED");
  assert(/^[1-9][0-9]{0,9}$/.test(values["launch-parent-pid"]),"LAUNCH_AUTHORITY_FAILED");
  const root=expectedRunRoot(values.mode,values["run-id"]);
  assert(values["launch-token-path"]===`${root}/.launch-token-v1`,"LAUNCH_AUTHORITY_FAILED");
  return {mode:values.mode,runId:values["run-id"],contractMerge:values["contract-merge"],contractSha256:values["contract-sha256"],harnessSha256:values["harness-sha256"],profileSha256:values["profile-sha256"],launchTokenPath:values["launch-token-path"],launchParentPid:values["launch-parent-pid"],syntheticFault:values.mode==="run"?"NONE":values.syntheticFault,runRoot:root};
}
function exactKeys(value,keys,code="SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED") {
  assert(value&&typeof value==="object"&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype&&JSON.stringify(Object.keys(value))===JSON.stringify(keys),code);
}
function assertHash(value,code="SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED") { assert(typeof value==="string"&&/^[0-9a-f]{64}$/.test(value),code); }
function assertMerge(value,code="SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED") { assert(typeof value==="string"&&/^[0-9a-f]{40}$/.test(value),code); }
function assertRunId(value,code="SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED") { assert(typeof value==="string"&&/^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$/.test(value),code); }
function assertIsoTimestamp(value,code="SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED") { assert(typeof value==="string"&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString()===value,code); }
function assertEnum(value,allowed,code="SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED") { assert(allowed.includes(value),code); }
function assertNumericIdentifier(value,code="SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED") { assert(typeof value==="string"&&/^(0|[1-9][0-9]*)$/.test(value),code); }
function rejectProductionBypassKeys(value) {
  const forbidden=new Set(["syntheticFixture","skipAuthorityValidation","testModeBypass","mockAuthority"]);
  function walk(item) {
    if(Array.isArray(item)){item.forEach(walk);return;}
    if(!item||typeof item!=="object")return;
    for(const [key,nested] of Object.entries(item)){assert(!forbidden.has(key),"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");walk(nested);}
  }
  walk(value);
}
function validatePairVerification(value,expectedCount,expectedHash) {
  exactKeys(value,["originalRegularNonSymlinkFileStatus","originalDeviceIdentifier","originalFileIdentifier","archiveRegularNonSymlinkFileStatus","archiveDeviceIdentifier","archiveFileIdentifier","filesystemIdentityOutcome","originalObservedByteCount","originalObservedSha256","archiveObservedByteCount","archiveObservedSha256","originalArchiveDirectByteEquality","expectedIdentityOutcome"]);
  assert(value.originalRegularNonSymlinkFileStatus==="VERIFIED_REGULAR_NON_SYMLINK"&&value.archiveRegularNonSymlinkFileStatus==="VERIFIED_REGULAR_NON_SYMLINK"&&value.filesystemIdentityOutcome==="DISTINCT"&&value.originalArchiveDirectByteEquality==="EQUAL"&&value.expectedIdentityOutcome==="MATCH","SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  [value.originalDeviceIdentifier,value.originalFileIdentifier,value.archiveDeviceIdentifier,value.archiveFileIdentifier].forEach((item)=>assertNumericIdentifier(item));
  assert(value.originalDeviceIdentifier!==value.archiveDeviceIdentifier||value.originalFileIdentifier!==value.archiveFileIdentifier,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  assert(value.originalObservedByteCount===expectedCount&&value.archiveObservedByteCount===expectedCount&&value.originalObservedSha256===expectedHash&&value.archiveObservedSha256===expectedHash,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  assertHash(value.originalObservedSha256);assertHash(value.archiveObservedSha256);
}
function validateUpstreamAuthority(value) {
  exactKeys(value,["bf3r1PackageIntegrityBasename","bf3r1PackageIntegrityByteCount","bf3r1PackageIntegritySha256","bf3r1PackageIntegrityVerification","bf3r1PackageIntegrityClaimsOutcome","bf3r1DerivedEvidenceBasename","bf3r1DerivedEvidenceByteCount","bf3r1DerivedEvidenceSha256","bf3r1DerivedEvidenceVerification","bf3r1DerivedEvidenceCanonicalSchemaOutcome","historicalAssets","historicalAssetVerifications","upstreamAdmittedFactsOutcome"]);
  assert(value.bf3r1PackageIntegrityBasename==="bf3-r1-derived-evidence-package-integrity-v1-20260812T003616Z-88533a1e.json"&&value.bf3r1PackageIntegrityByteCount===1423&&value.bf3r1PackageIntegritySha256==="f5ce567de7ecfb1aa6a729c624417f1d02243f7e8258835d8880af2f65e52f1e","SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  exactKeys(value.bf3r1PackageIntegrityVerification,["regularNonSymlinkFileStatus","observedByteCount","observedSha256","expectedIdentityOutcome"]);
  assert(value.bf3r1PackageIntegrityVerification.regularNonSymlinkFileStatus==="VERIFIED_REGULAR_NON_SYMLINK"&&value.bf3r1PackageIntegrityVerification.observedByteCount===1423&&value.bf3r1PackageIntegrityVerification.observedSha256===value.bf3r1PackageIntegritySha256&&value.bf3r1PackageIntegrityVerification.expectedIdentityOutcome==="MATCH","SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  assert(value.bf3r1PackageIntegrityClaimsOutcome==="VERIFIED_REQUIRED_BINDINGS"&&value.bf3r1DerivedEvidenceBasename==="bf3-r1-derived-evidence-v1-20260812T003616Z-88533a1e.json"&&value.bf3r1DerivedEvidenceByteCount===8233&&value.bf3r1DerivedEvidenceSha256==="76ae11e1e5c2de3d09ef0ac016274279f9738d825be4ebe9c38c6efe33f55a55","SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  validatePairVerification(value.bf3r1DerivedEvidenceVerification,8233,value.bf3r1DerivedEvidenceSha256);
  assert(value.bf3r1DerivedEvidenceCanonicalSchemaOutcome==="VERIFIED"&&Array.isArray(value.historicalAssets)&&value.historicalAssets.length===ASSETS.length&&Array.isArray(value.historicalAssetVerifications)&&value.historicalAssetVerifications.length===ASSETS.length&&value.upstreamAdmittedFactsOutcome==="VERIFIED","SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  value.historicalAssets.forEach((item,index)=>{const expected=ASSETS[index];exactKeys(item,["ordinal","identity","basename","expectedByteCount","expectedSha256"]);assert(item.ordinal===expected.ordinal&&item.identity===expected.identity&&item.basename===expected.basename&&item.expectedByteCount===expected.byteCount&&item.expectedSha256===expected.sha256,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");});
  value.historicalAssetVerifications.forEach((item,index)=>validatePairVerification(item,ASSETS[index].byteCount,ASSETS[index].sha256));
}
function validateExecutionEnvironment(value,admittedHarnessIdentity) {
  validateHarnessIdentity(admittedHarnessIdentity);
  exactKeys(value,["nodeExecPath","nodeVersion","nodeExecutableByteCount","nodeExecutableSha256","v8Version","workingDirectory","gitInvocationPath","gitResolvedPath","gitExecutableByteCount","gitExecutableSha256","environmentEnforcementPath","environmentEnforcementByteCount","environmentEnforcementSha256","packageLockPath","packageLockByteCount","packageLockSha256","nodeOptionsState","nodePathState","processExecArgv","environment","harnessPath","harnessByteCount","harnessSha256","networkEnforcementPath","networkEnforcementByteCount","networkEnforcementSha256","networkProfilePath","networkProfileByteCount","networkProfileSha256","bootstrapBuiltinModules","packageClosures","networkCapability","packageManagerUse"]);
  assert(value.nodeExecPath===NODE_PATH&&value.nodeVersion===NODE_IDENTITY.version&&value.nodeExecutableByteCount===NODE_IDENTITY.byteCount&&value.nodeExecutableSha256===NODE_IDENTITY.sha256&&value.v8Version===NODE_IDENTITY.v8&&value.workingDirectory===REPOSITORY_ROOT,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  assert(value.gitInvocationPath===GIT_PATH&&value.gitResolvedPath===GIT_REAL_PATH&&value.gitExecutableByteCount===GIT_IDENTITY.byteCount&&value.gitExecutableSha256===GIT_IDENTITY.sha256,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  assert(value.environmentEnforcementPath===ENV_IDENTITY.path&&value.environmentEnforcementByteCount===ENV_IDENTITY.byteCount&&value.environmentEnforcementSha256===ENV_IDENTITY.sha256&&value.packageLockPath===PACKAGE_LOCK.path&&value.packageLockByteCount===PACKAGE_LOCK.byteCount&&value.packageLockSha256===PACKAGE_LOCK.sha256,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  assert(value.nodeOptionsState==="ABSENT"&&value.nodePathState==="ABSENT"&&Array.isArray(value.processExecArgv)&&value.processExecArgv.length===0,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  exactKeys(value.environment,Object.keys(EXPECTED_ENV));assert(JSON.stringify(value.environment)===JSON.stringify(EXPECTED_ENV),"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  assert(value.harnessPath===HARNESS_PATH&&isSafeNonNegative(value.harnessByteCount)&&value.harnessByteCount>0&&value.harnessByteCount===admittedHarnessIdentity.byteCount,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");assertHash(value.harnessSha256);assert(value.harnessSha256===admittedHarnessIdentity.sha256,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  assert(value.networkEnforcementPath===SANDBOX_IDENTITY.path&&value.networkEnforcementByteCount===SANDBOX_IDENTITY.byteCount&&value.networkEnforcementSha256===SANDBOX_IDENTITY.sha256&&value.networkProfilePath===PROFILE_PATH&&value.networkProfileByteCount===PROFILE_IDENTITY.byteCount&&value.networkProfileSha256===PROFILE_IDENTITY.sha256,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  const builtins=["node:crypto","node:fs","node:net","node:path","node:child_process","node:vm"];assert(JSON.stringify(value.bootstrapBuiltinModules)===JSON.stringify(builtins),"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  assert(Array.isArray(value.packageClosures)&&value.packageClosures.length===PACKAGE_CLOSURES.length,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  value.packageClosures.forEach((item,index)=>{const closure=PACKAGE_CLOSURES[index];exactKeys(item,["packageName","version","lockIntegrity","packageJsonPath","packageJsonByteCount","packageJsonSha256","runtimeEntrypointPath","runtimeEntrypointByteCount","runtimeEntrypointSha256","packageFileCount","packageDirectoryManifestSha256"]);assert(item.packageName===closure.name&&item.version===closure.version&&item.lockIntegrity===closure.lockIntegrity&&item.packageJsonPath===`${closure.root}/package.json`&&item.packageJsonByteCount===closure.packageJsonBytes&&item.packageJsonSha256===closure.packageJsonSha256&&item.runtimeEntrypointPath===closure.entry&&item.runtimeEntrypointByteCount===closure.entryBytes&&item.runtimeEntrypointSha256===closure.entrySha256&&item.packageFileCount===closure.fileCount&&item.packageDirectoryManifestSha256===closure.manifestSha256,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");});
  assert(value.networkCapability==="PROHIBITED_AND_CONTAINED"&&value.packageManagerUse==="NONE","SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
}
function validateAsset(record,index) {
  exactKeys(record,["ordinal","identity","basename","expectedByteCount","expectedSha256","decodedSourceUtf16Length","utf8DecodeOutcome","espreeParseOutcome","v8CompileOutcome","dualScriptSyntaxOutcome","sourceShapeOutcome","sourceShape"]);
  const expected=ASSETS[index];
  assert(record.ordinal===expected.ordinal&&record.identity===expected.identity&&record.basename===expected.basename&&record.expectedByteCount===expected.byteCount&&record.expectedSha256===expected.sha256,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");assertHash(record.expectedSha256);
  assertEnum(record.utf8DecodeOutcome,["SUCCEEDED","INVALID_UTF8","METHOD_FAILED"]);assertEnum(record.espreeParseOutcome,[null,"SUCCEEDED","SYNTAX_REJECTED","METHOD_FAILED"]);assertEnum(record.v8CompileOutcome,[null,"SUCCEEDED","SYNTAX_REJECTED","METHOD_FAILED"]);assertEnum(record.dualScriptSyntaxOutcome,["BOTH_ACCEPTED","BOTH_REJECTED","ESPREE_ACCEPTED_V8_REJECTED","ESPREE_REJECTED_V8_ACCEPTED","METHOD_INCOMPLETE"]);assertEnum(record.sourceShapeOutcome,["COMPLETED","NOT_ADMITTED","SOURCE_SHAPE_METHOD_FAILED"]);
  assert(record.decodedSourceUtf16Length===null||isSafeNonNegative(record.decodedSourceUtf16Length),"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  if(record.utf8DecodeOutcome!=="SUCCEEDED")assert(record.decodedSourceUtf16Length===null&&record.espreeParseOutcome===null&&record.v8CompileOutcome===null&&record.dualScriptSyntaxOutcome==="METHOD_INCOMPLETE"&&record.sourceShapeOutcome==="NOT_ADMITTED"&&record.sourceShape===null,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  else {
    assert(isSafeNonNegative(record.decodedSourceUtf16Length)&&record.espreeParseOutcome!==null&&record.v8CompileOutcome!==null&&record.dualScriptSyntaxOutcome===deriveDual(record.espreeParseOutcome,record.v8CompileOutcome),"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
    if(record.dualScriptSyntaxOutcome==="BOTH_ACCEPTED")assert(["COMPLETED","SOURCE_SHAPE_METHOD_FAILED"].includes(record.sourceShapeOutcome),"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
    else assert(record.sourceShapeOutcome==="NOT_ADMITTED"&&record.sourceShape===null,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  }
  if(record.sourceShapeOutcome==="COMPLETED"){
    exactKeys(record.sourceShape,["lexicalContextCounts","eximbayRequestPayMemberPatternCount","eximbayRequestPayCallCalleePatternCount","directRequestPayFunctionBindingPatternCount","testOriginStaticStringCarrierCount","productionOriginStaticStringCarrierCount","v1PaymentsPathStaticStringCarrierCount","boundedSourceShapeVector","boundedSourceShapeVectorSha256"]);
    assert(Array.isArray(record.sourceShape.lexicalContextCounts)&&record.sourceShape.lexicalContextCounts.length===5,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
    for(const [targetIndex,counts] of record.sourceShape.lexicalContextCounts.entries()){exactKeys(counts,["targetId","exactOccurrenceCount","commentCount","stringOrTemplateStaticTextCount","codeCount","unclassifiedCount"]);const values=[counts.exactOccurrenceCount,counts.commentCount,counts.stringOrTemplateStaticTextCount,counts.codeCount,counts.unclassifiedCount];assert(counts.targetId===TARGETS[targetIndex].id&&values.every((value)=>isSafeNonNegative(value)&&value<=record.decodedSourceUtf16Length)&&values.slice(1).reduce((sum,value)=>sum+value,0)===values[0],"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");}
    const numericFields=[record.sourceShape.eximbayRequestPayMemberPatternCount,record.sourceShape.eximbayRequestPayCallCalleePatternCount,record.sourceShape.directRequestPayFunctionBindingPatternCount,record.sourceShape.testOriginStaticStringCarrierCount,record.sourceShape.productionOriginStaticStringCarrierCount,record.sourceShape.v1PaymentsPathStaticStringCarrierCount];assert(numericFields.every((value)=>isSafeNonNegative(value)&&value<=record.decodedSourceUtf16Length),"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
    assert(record.sourceShape.testOriginStaticStringCarrierCount===record.sourceShape.lexicalContextCounts[2].stringOrTemplateStaticTextCount&&record.sourceShape.productionOriginStaticStringCarrierCount===record.sourceShape.lexicalContextCounts[3].stringOrTemplateStaticTextCount&&record.sourceShape.v1PaymentsPathStaticStringCarrierCount===record.sourceShape.lexicalContextCounts[4].stringOrTemplateStaticTextCount,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
    assert(Array.isArray(record.sourceShape.boundedSourceShapeVector)&&record.sourceShape.boundedSourceShapeVector.length===8&&record.sourceShape.boundedSourceShapeVector.every(isSafeNonNegative),"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
    const contexts=record.sourceShape.lexicalContextCounts;const expectedVector=[contexts[0].codeCount,contexts[1].codeCount,record.sourceShape.eximbayRequestPayMemberPatternCount,record.sourceShape.eximbayRequestPayCallCalleePatternCount,record.sourceShape.directRequestPayFunctionBindingPatternCount,record.sourceShape.testOriginStaticStringCarrierCount,record.sourceShape.productionOriginStaticStringCarrierCount,record.sourceShape.v1PaymentsPathStaticStringCarrierCount];assert(JSON.stringify(record.sourceShape.boundedSourceShapeVector)===JSON.stringify(expectedVector),"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
    assert(record.sourceShape.boundedSourceShapeVectorSha256===vectorHash(record.sourceShape.boundedSourceShapeVector),"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  } else assert(record.sourceShape===null,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
}
function validateEvidence(evidence,admittedHarnessIdentity) {
  rejectProductionBypassKeys(evidence);
  exactKeys(evidence,["schema","version","runId","historicalBf3RunId","bf3r1DerivedRunId","contractIdentity","launchAuthority","repositoryAuthority","upstreamAuthority","executionEnvironment","methods","globalGates","assets","comparison","warnings","evidenceOutcome","completedAt"]);
  assert(evidence.schema==="mira.eximbay.bf3-r2-ecma-source-shape-evidence"&&evidence.version===1&&evidence.historicalBf3RunId==="20260811T220109Z-c4779de2"&&evidence.bf3r1DerivedRunId==="20260812T003616Z-88533a1e"&&evidence.contractIdentity==="EXIMBAY-BF3-R2-OFFLINE-ECMASCRIPT-SOURCE-SHAPE-EVIDENCE-CONTRACT-v0.1","SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");assertRunId(evidence.runId);
  exactKeys(evidence.launchAuthority,["launcherIdentity","launchTokenFd","launchTokenPath","launchTokenByteCount","launchTokenSha256","childHandshakeOutcome","externalLaunchAuthorityRecordBasename"]);
  assert(evidence.launchAuthority.launcherIdentity===LAUNCHER_IDENTITY&&evidence.launchAuthority.launchTokenFd===3&&evidence.launchAuthority.launchTokenPath===`/Users/duckcow/mira-evidence/eximbay-bf3-r2/${evidence.runId}/.launch-token-v1`&&isSafeNonNegative(evidence.launchAuthority.launchTokenByteCount)&&evidence.launchAuthority.launchTokenByteCount>0&&evidence.launchAuthority.childHandshakeOutcome==="VERIFIED"&&evidence.launchAuthority.externalLaunchAuthorityRecordBasename===`bf3-r2-external-launch-authority-v1-${evidence.runId}.json`,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");assertHash(evidence.launchAuthority.launchTokenSha256);
  exactKeys(evidence.repositoryAuthority,["bf3r1LifecycleClosureMergeSha","bf3r1LifecycleClosurePath","bf3r1LifecycleClosureByteCount","bf3r1LifecycleClosureSha256","bf3r2ContractPath","bf3r2ContractMergeSha","bf3r2ContractFileSha256"]);
  assert(evidence.repositoryAuthority.bf3r1LifecycleClosureMergeSha===LIFECYCLE.mergeSha&&evidence.repositoryAuthority.bf3r1LifecycleClosurePath===LIFECYCLE.path&&evidence.repositoryAuthority.bf3r1LifecycleClosureByteCount===LIFECYCLE.byteCount&&evidence.repositoryAuthority.bf3r1LifecycleClosureSha256===LIFECYCLE.sha256&&evidence.repositoryAuthority.bf3r2ContractPath===CONTRACT_PATH,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");assertMerge(evidence.repositoryAuthority.bf3r2ContractMergeSha);assertHash(evidence.repositoryAuthority.bf3r2ContractFileSha256);
  validateUpstreamAuthority(evidence.upstreamAuthority);
  validateExecutionEnvironment(evidence.executionEnvironment,admittedHarnessIdentity);
  assert(JSON.stringify(evidence.methods)===JSON.stringify(METHOD_IDENTITIES),"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  exactKeys(evidence.globalGates,["preNodeLaunchHandshakeOutcome","repositoryAuthorityOutcome","toolchainIdentityOutcome","networkContainmentOutcome","upstreamCustodyOutcome"]);
  assert(Object.values(evidence.globalGates).every((value)=>value==="VERIFIED"),"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  assert(Array.isArray(evidence.assets)&&evidence.assets.length===2,"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  evidence.assets.forEach(validateAsset);
  exactKeys(evidence.comparison,["leftAssetOrdinal","leftAssetIdentity","rightAssetOrdinal","rightAssetIdentity","historicalRawByteInequalityEvidence","comparisonOutcome","dualScriptSyntaxOutcomeComparison","sourceShapeOutcomeComparison","boundedPatternCountsComparison","staticStringCarrierCountsComparison","boundedSourceShapeVectorEquality"]);
  assertEnum(evidence.comparison.comparisonOutcome,["COMPLETED","METHOD_FAILED"]);const expectedComparison=evidence.comparison.comparisonOutcome==="METHOD_FAILED"?failedComparison():compareAssets(evidence.assets);assert(JSON.stringify(evidence.comparison)===JSON.stringify(expectedComparison),"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  const warningCodes=["COMPARISON_METHOD_FAILED","UTF8_INVALID","UTF8_METHOD_FAILED","ESPREE_METHOD_FAILED","V8_METHOD_FAILED","PARSER_DISAGREEMENT","SOURCE_SHAPE_METHOD_FAILED","LEXICAL_CONTEXT_UNCLASSIFIED"];
  assert(Array.isArray(evidence.warnings)&&evidence.warnings.every((warning)=>{exactKeys(warning,["code","assetOrdinal","detail"]);assertEnum(warning.code,warningCodes);return (warning.assetOrdinal===null||warning.assetOrdinal===1||warning.assetOrdinal===2)&&warning.detail===null;}),"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  assert(JSON.stringify(evidence.warnings)===JSON.stringify(deriveWarnings(evidence.assets,evidence.comparison)),"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  assert(evidence.evidenceOutcome===deriveEvidenceOutcome(evidence.assets,evidence.comparison),"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  assertIsoTimestamp(evidence.completedAt);
}
function constructEvidence(args,launch,upstreamAuthority,assets,comparison,admittedHarnessIdentity,profileIdentity) {
  assert(args.mode==="run"&&args.syntheticFault==="NONE","SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");
  const warnings=deriveWarnings(assets,comparison),outcome=deriveEvidenceOutcome(assets,comparison);
  const evidence={schema:"mira.eximbay.bf3-r2-ecma-source-shape-evidence",version:1,runId:args.runId,historicalBf3RunId:"20260811T220109Z-c4779de2",bf3r1DerivedRunId:"20260812T003616Z-88533a1e",contractIdentity:"EXIMBAY-BF3-R2-OFFLINE-ECMASCRIPT-SOURCE-SHAPE-EVIDENCE-CONTRACT-v0.1",launchAuthority:{launcherIdentity:LAUNCHER_IDENTITY,launchTokenFd:LAUNCH_TOKEN_FD,launchTokenPath:args.launchTokenPath,launchTokenByteCount:launch.tokenByteCount,launchTokenSha256:launch.tokenSha256,childHandshakeOutcome:launch.childHandshakeOutcome,externalLaunchAuthorityRecordBasename:`bf3-r2-external-launch-authority-v1-${args.runId}.json`},repositoryAuthority:{bf3r1LifecycleClosureMergeSha:LIFECYCLE.mergeSha,bf3r1LifecycleClosurePath:LIFECYCLE.path,bf3r1LifecycleClosureByteCount:LIFECYCLE.byteCount,bf3r1LifecycleClosureSha256:LIFECYCLE.sha256,bf3r2ContractPath:CONTRACT_PATH,bf3r2ContractMergeSha:args.contractMerge,bf3r2ContractFileSha256:args.contractSha256},upstreamAuthority,executionEnvironment:{nodeExecPath:NODE_PATH,nodeVersion:NODE_IDENTITY.version,nodeExecutableByteCount:NODE_IDENTITY.byteCount,nodeExecutableSha256:NODE_IDENTITY.sha256,v8Version:NODE_IDENTITY.v8,workingDirectory:REPOSITORY_ROOT,gitInvocationPath:GIT_PATH,gitResolvedPath:GIT_REAL_PATH,gitExecutableByteCount:GIT_IDENTITY.byteCount,gitExecutableSha256:GIT_IDENTITY.sha256,environmentEnforcementPath:ENV_IDENTITY.path,environmentEnforcementByteCount:ENV_IDENTITY.byteCount,environmentEnforcementSha256:ENV_IDENTITY.sha256,packageLockPath:PACKAGE_LOCK.path,packageLockByteCount:PACKAGE_LOCK.byteCount,packageLockSha256:PACKAGE_LOCK.sha256,nodeOptionsState:"ABSENT",nodePathState:"ABSENT",processExecArgv:[],environment:EXPECTED_ENV,harnessPath:HARNESS_PATH,harnessByteCount:admittedHarnessIdentity.byteCount,harnessSha256:admittedHarnessIdentity.sha256,networkEnforcementPath:SANDBOX_IDENTITY.path,networkEnforcementByteCount:SANDBOX_IDENTITY.byteCount,networkEnforcementSha256:SANDBOX_IDENTITY.sha256,networkProfilePath:PROFILE_PATH,networkProfileByteCount:profileIdentity.length,networkProfileSha256:profileIdentity.sha256,bootstrapBuiltinModules:["node:crypto","node:fs","node:net","node:path","node:child_process","node:vm"],packageClosures:PACKAGE_CLOSURES.map((closure)=>({packageName:closure.name,version:closure.version,lockIntegrity:closure.lockIntegrity,packageJsonPath:`${closure.root}/package.json`,packageJsonByteCount:closure.packageJsonBytes,packageJsonSha256:closure.packageJsonSha256,runtimeEntrypointPath:closure.entry,runtimeEntrypointByteCount:closure.entryBytes,runtimeEntrypointSha256:closure.entrySha256,packageFileCount:closure.fileCount,packageDirectoryManifestSha256:closure.manifestSha256})),networkCapability:"PROHIBITED_AND_CONTAINED",packageManagerUse:"NONE"},methods:METHOD_IDENTITIES,globalGates:{preNodeLaunchHandshakeOutcome:"VERIFIED",repositoryAuthorityOutcome:"VERIFIED",toolchainIdentityOutcome:"VERIFIED",networkContainmentOutcome:"VERIFIED",upstreamCustodyOutcome:"VERIFIED"},assets,comparison,warnings,evidenceOutcome:outcome,completedAt:new Date().toISOString()};
  validateEvidence(evidence,admittedHarnessIdentity);
  return evidence;
}
function validatePackageIntegrity(integrity,evidenceBytes,evidence) {
  exactKeys(integrity,["schema","version","runId","contractIdentity","evidenceByteCount","evidenceSha256","originalFilename","archiveFilename","originalDeviceIdentifier","originalFileIdentifier","archiveDeviceIdentifier","archiveFileIdentifier","originalObservedByteCount","archiveObservedByteCount","originalSha256","archiveSha256","originalArchiveFilesystemIdentity","originalArchiveEquality","packageIntegrityOutcome","completedAt"],"PACKAGE_INTEGRITY_WRITE_FAILED");
  const expectedName=`bf3-r2-ecma-source-shape-evidence-v1-${evidence.runId}.json`;
  assert(integrity.schema==="mira.eximbay.bf3-r2-ecma-source-shape-evidence-package-integrity"&&integrity.version===1&&integrity.runId===evidence.runId&&integrity.contractIdentity===evidence.contractIdentity&&integrity.evidenceByteCount===evidenceBytes.length&&integrity.evidenceSha256===sha256(evidenceBytes)&&integrity.originalFilename===expectedName&&integrity.archiveFilename===expectedName,"PACKAGE_INTEGRITY_WRITE_FAILED");
  [integrity.originalDeviceIdentifier,integrity.originalFileIdentifier,integrity.archiveDeviceIdentifier,integrity.archiveFileIdentifier].forEach((item)=>assertNumericIdentifier(item,"PACKAGE_INTEGRITY_WRITE_FAILED"));
  assert(integrity.originalDeviceIdentifier!==integrity.archiveDeviceIdentifier||integrity.originalFileIdentifier!==integrity.archiveFileIdentifier,"PACKAGE_INTEGRITY_WRITE_FAILED");
  assert(integrity.originalObservedByteCount===evidenceBytes.length&&integrity.archiveObservedByteCount===evidenceBytes.length&&integrity.originalSha256===sha256(evidenceBytes)&&integrity.archiveSha256===sha256(evidenceBytes)&&integrity.originalArchiveFilesystemIdentity==="DISTINCT"&&integrity.originalArchiveEquality==="EQUAL"&&integrity.packageIntegrityOutcome==="PACKAGE_VALID","PACKAGE_INTEGRITY_WRITE_FAILED");
  assertHash(integrity.evidenceSha256,"PACKAGE_INTEGRITY_WRITE_FAILED");assertHash(integrity.originalSha256,"PACKAGE_INTEGRITY_WRITE_FAILED");assertHash(integrity.archiveSha256,"PACKAGE_INTEGRITY_WRITE_FAILED");assertIsoTimestamp(integrity.completedAt,"PACKAGE_INTEGRITY_WRITE_FAILED");
}
function packagePaths(runRoot,runId) {
  const name=`bf3-r2-ecma-source-shape-evidence-v1-${runId}.json`;
  return {name,original:`${runRoot}/original/${name}`,archive:`${runRoot}/archive/${name}`,integrity:`${runRoot}/bf3-r2-ecma-source-shape-evidence-package-integrity-v1-${runId}.json`};
}
function writeEvidencePackage(runRoot,evidence,admittedHarnessIdentity,fault=null) {
  let bytes;
  try { if(fault==="SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED")fail("SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED");validateEvidence(evidence,admittedHarnessIdentity);bytes=canonicalBytes(evidence); }
  catch { return {exitCode:TERMINAL.SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED,terminal:"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED"}; }
  const files=packagePaths(runRoot,evidence.runId);
  fs.mkdirSync(`${runRoot}/original`,{mode:0o700});fs.mkdirSync(`${runRoot}/archive`,{mode:0o700});
  try { if(fault==="ORIGINAL_WRITE_FAILED")fail("ORIGINAL_WRITE_FAILED");fs.writeFileSync(files.original,bytes,{flag:"wx",mode:0o600}); }
  catch { return {exitCode:TERMINAL.ORIGINAL_WRITE_FAILED,terminal:"ORIGINAL_WRITE_FAILED",files}; }
  try { if(fault==="ARCHIVE_WRITE_FAILED")fail("ARCHIVE_WRITE_FAILED");fs.writeFileSync(files.archive,bytes,{flag:"wx",mode:0o600}); }
  catch { return {exitCode:TERMINAL.ARCHIVE_WRITE_FAILED,terminal:"ARCHIVE_WRITE_FAILED",files}; }
  let originalStat,archiveStat,left,right;
  try {
    if(fault==="READBACK_FAILED")fail("EVIDENCE_VERIFICATION_FAILED");
    originalStat=fs.lstatSync(files.original);archiveStat=fs.lstatSync(files.archive);left=fs.readFileSync(files.original);right=fs.readFileSync(files.archive);
    if(fault==="IDENTITY_OR_EQUALITY_FAILED")fail("EVIDENCE_VERIFICATION_FAILED");
    assert(originalStat.isFile()&&archiveStat.isFile()&&!originalStat.isSymbolicLink()&&!archiveStat.isSymbolicLink()&&(originalStat.dev!==archiveStat.dev||originalStat.ino!==archiveStat.ino)&&left.equals(bytes)&&right.equals(bytes)&&left.equals(right),"EVIDENCE_VERIFICATION_FAILED");
  } catch { return {exitCode:TERMINAL.EVIDENCE_VERIFICATION_FAILED,terminal:"EVIDENCE_VERIFICATION_FAILED",files}; }
  let integrity,integrityBytes;
  try {
    if(fault==="PACKAGE_INTEGRITY_CONSTRUCTION_FAILED")fail("PACKAGE_INTEGRITY_WRITE_FAILED");
    integrity={schema:"mira.eximbay.bf3-r2-ecma-source-shape-evidence-package-integrity",version:1,runId:evidence.runId,contractIdentity:evidence.contractIdentity,evidenceByteCount:bytes.length,evidenceSha256:sha256(bytes),originalFilename:files.name,archiveFilename:files.name,originalDeviceIdentifier:String(originalStat.dev),originalFileIdentifier:String(originalStat.ino),archiveDeviceIdentifier:String(archiveStat.dev),archiveFileIdentifier:String(archiveStat.ino),originalObservedByteCount:left.length,archiveObservedByteCount:right.length,originalSha256:sha256(left),archiveSha256:sha256(right),originalArchiveFilesystemIdentity:"DISTINCT",originalArchiveEquality:"EQUAL",packageIntegrityOutcome:"PACKAGE_VALID",completedAt:new Date().toISOString()};
    validatePackageIntegrity(integrity,bytes,evidence);integrityBytes=canonicalBytes(integrity);
    if(fault==="PACKAGE_INTEGRITY_WRITE_FAILED")fail("PACKAGE_INTEGRITY_WRITE_FAILED");
    fs.writeFileSync(files.integrity,integrityBytes,{flag:"wx",mode:0o600});
  } catch { return {exitCode:TERMINAL.PACKAGE_INTEGRITY_WRITE_FAILED,terminal:"PACKAGE_INTEGRITY_WRITE_FAILED",files}; }
  try {
    if(fault==="PACKAGE_INTEGRITY_READBACK_FAILED")fail("PACKAGE_INTEGRITY_READBACK_FAILED");
    const observed=fs.readFileSync(files.integrity);assert(observed.equals(integrityBytes),"PACKAGE_INTEGRITY_READBACK_FAILED");validatePackageIntegrity(JSON.parse(observed.toString("utf8")),bytes,evidence);
  } catch { return {exitCode:TERMINAL.PACKAGE_INTEGRITY_READBACK_FAILED,terminal:"PACKAGE_INTEGRITY_READBACK_FAILED",files}; }
  return {exitCode:0,terminal:"PACKAGE_VALID",files,integrity};
}
async function executeAdmissionStages(stages) {
  const repository=await stages.repository();
  const toolchain=await stages.toolchain(repository);
  await stages.network();
  const parser=await stages.parser();
  const custody=await stages.custody();
  return {repository,toolchain,parser,custody};
}
function terminalForError(error) {
  const code=error&&error.code;
  if(code==="NON_EVALUATION_PREFLIGHT_FAILED")return {exitCode:TERMINAL.TOOLCHAIN_IDENTITY_FAILED,terminal:"TOOLCHAIN_IDENTITY_FAILED"};
  if(Object.hasOwn(TERMINAL,code))return {exitCode:TERMINAL[code],terminal:code};
  return {exitCode:TERMINAL.TOOLCHAIN_IDENTITY_FAILED,terminal:"TOOLCHAIN_IDENTITY_FAILED"};
}
function syntheticAuthorityFixture() {
  return {schema:"mira.eximbay.bf3-r2-synthetic-authority-fixture",version:1,scope:"TEST_ONLY",syntheticFixture:true,productionAuthorityOutcome:"NOT_ADMITTED"};
}
function schemaOnlyPairVerification(index) {
  const asset=ASSETS[index];return {originalRegularNonSymlinkFileStatus:"VERIFIED_REGULAR_NON_SYMLINK",originalDeviceIdentifier:"1",originalFileIdentifier:String(index+1),archiveRegularNonSymlinkFileStatus:"VERIFIED_REGULAR_NON_SYMLINK",archiveDeviceIdentifier:"1",archiveFileIdentifier:String(index+11),filesystemIdentityOutcome:"DISTINCT",originalObservedByteCount:asset.byteCount,originalObservedSha256:asset.sha256,archiveObservedByteCount:asset.byteCount,archiveObservedSha256:asset.sha256,originalArchiveDirectByteEquality:"EQUAL",expectedIdentityOutcome:"MATCH"};
}
function schemaOnlyUpstreamAuthority() {
  const derivedHash="76ae11e1e5c2de3d09ef0ac016274279f9738d825be4ebe9c38c6efe33f55a55";
  const derivedVerification={originalRegularNonSymlinkFileStatus:"VERIFIED_REGULAR_NON_SYMLINK",originalDeviceIdentifier:"1",originalFileIdentifier:"31",archiveRegularNonSymlinkFileStatus:"VERIFIED_REGULAR_NON_SYMLINK",archiveDeviceIdentifier:"1",archiveFileIdentifier:"32",filesystemIdentityOutcome:"DISTINCT",originalObservedByteCount:8233,originalObservedSha256:derivedHash,archiveObservedByteCount:8233,archiveObservedSha256:derivedHash,originalArchiveDirectByteEquality:"EQUAL",expectedIdentityOutcome:"MATCH"};
  return {bf3r1PackageIntegrityBasename:"bf3-r1-derived-evidence-package-integrity-v1-20260812T003616Z-88533a1e.json",bf3r1PackageIntegrityByteCount:1423,bf3r1PackageIntegritySha256:"f5ce567de7ecfb1aa6a729c624417f1d02243f7e8258835d8880af2f65e52f1e",bf3r1PackageIntegrityVerification:{regularNonSymlinkFileStatus:"VERIFIED_REGULAR_NON_SYMLINK",observedByteCount:1423,observedSha256:"f5ce567de7ecfb1aa6a729c624417f1d02243f7e8258835d8880af2f65e52f1e",expectedIdentityOutcome:"MATCH"},bf3r1PackageIntegrityClaimsOutcome:"VERIFIED_REQUIRED_BINDINGS",bf3r1DerivedEvidenceBasename:"bf3-r1-derived-evidence-v1-20260812T003616Z-88533a1e.json",bf3r1DerivedEvidenceByteCount:8233,bf3r1DerivedEvidenceSha256:derivedHash,bf3r1DerivedEvidenceVerification:derivedVerification,bf3r1DerivedEvidenceCanonicalSchemaOutcome:"VERIFIED",historicalAssets:ASSETS.map((asset)=>({ordinal:asset.ordinal,identity:asset.identity,basename:asset.basename,expectedByteCount:asset.byteCount,expectedSha256:asset.sha256})),historicalAssetVerifications:ASSETS.map((asset,index)=>schemaOnlyPairVerification(index)),upstreamAdmittedFactsOutcome:"VERIFIED"};
}
function syntheticAssets(espree,visitorKeys,fault=null) {
  const definitions=[Object.freeze({...ASSETS[0],byteCount:22,sha256:sha256(Buffer.from("EXIMBAY.request_pay();\n"))}),Object.freeze({...ASSETS[1],byteCount:48,sha256:sha256(Buffer.from("var EXIMBAY = { request_pay: function () {} };\n"))})];
  const bytes=[Buffer.from("EXIMBAY.request_pay();\n"),Buffer.from("var EXIMBAY = { request_pay: function () {} };\n")];
  if(fault==="UTF8_INVALID")bytes[0]=Buffer.from([0xc3,0x28]);
  const parser=fault==="ESPREE_METHOD_FAILED"?{parse(){throw new Error("synthetic suppressed");}}:espree;
  return definitions.map((asset,index)=>analyzeAsset(asset,bytes[index],index===0?parser:espree,visitorKeys,index===0?fault:null));
}
function constructSyntheticResult(args,assets,comparison,negativeSchemaVectorCount) {
  const result={schema:"mira.eximbay.bf3-r2-synthetic-validation-result",version:1,scope:"TEST_ONLY",runId:args.runId,fixtureId:"BF3R2_SYNTHETIC_ECMA_SOURCE_SHAPE_PAIR_V1",syntheticFault:args.syntheticFault,authorityFixture:syntheticAuthorityFixture(),analysis:{assetOutcomes:assets.map((asset)=>({ordinal:asset.ordinal,utf8DecodeOutcome:asset.utf8DecodeOutcome,dualScriptSyntaxOutcome:asset.dualScriptSyntaxOutcome,sourceShapeOutcome:asset.sourceShapeOutcome,boundedSourceShapeVector:asset.sourceShape===null?null:asset.sourceShape.boundedSourceShapeVector})),comparisonOutcome:comparison.comparisonOutcome,derivedSemanticOutcome:deriveEvidenceOutcome(assets,comparison)},productionNegativeSchemaVectorCount:negativeSchemaVectorCount,productionEvidenceOutcome:"NOT_CREATED",productionPackageIntegrityOutcome:"NOT_CREATED",productionPackageAdmissionOutcome:"PROHIBITED",completedAt:new Date().toISOString()};
  validateSyntheticResult(result);return result;
}
function validateSyntheticResult(result) {
  exactKeys(result,["schema","version","scope","runId","fixtureId","syntheticFault","authorityFixture","analysis","productionNegativeSchemaVectorCount","productionEvidenceOutcome","productionPackageIntegrityOutcome","productionPackageAdmissionOutcome","completedAt"],"TOOLCHAIN_IDENTITY_FAILED");
  assert(result.schema==="mira.eximbay.bf3-r2-synthetic-validation-result"&&result.version===1&&result.scope==="TEST_ONLY"&&result.fixtureId==="BF3R2_SYNTHETIC_ECMA_SOURCE_SHAPE_PAIR_V1"&&SYNTHETIC_RESULT_FAULTS.includes(result.syntheticFault),"TOOLCHAIN_IDENTITY_FAILED");assertRunId(result.runId,"TOOLCHAIN_IDENTITY_FAILED");
  exactKeys(result.authorityFixture,["schema","version","scope","syntheticFixture","productionAuthorityOutcome"],"TOOLCHAIN_IDENTITY_FAILED");assert(result.authorityFixture.schema==="mira.eximbay.bf3-r2-synthetic-authority-fixture"&&result.authorityFixture.version===1&&result.authorityFixture.scope==="TEST_ONLY"&&result.authorityFixture.syntheticFixture===true&&result.authorityFixture.productionAuthorityOutcome==="NOT_ADMITTED","TOOLCHAIN_IDENTITY_FAILED");
  exactKeys(result.analysis,["assetOutcomes","comparisonOutcome","derivedSemanticOutcome"],"TOOLCHAIN_IDENTITY_FAILED");assert(Array.isArray(result.analysis.assetOutcomes)&&result.analysis.assetOutcomes.length===2,"TOOLCHAIN_IDENTITY_FAILED");result.analysis.assetOutcomes.forEach((asset,index)=>{exactKeys(asset,["ordinal","utf8DecodeOutcome","dualScriptSyntaxOutcome","sourceShapeOutcome","boundedSourceShapeVector"],"TOOLCHAIN_IDENTITY_FAILED");assert(asset.ordinal===index+1,"TOOLCHAIN_IDENTITY_FAILED");});
  assert(isSafeNonNegative(result.productionNegativeSchemaVectorCount)&&result.productionEvidenceOutcome==="NOT_CREATED"&&result.productionPackageIntegrityOutcome==="NOT_CREATED"&&result.productionPackageAdmissionOutcome==="PROHIBITED","TOOLCHAIN_IDENTITY_FAILED");assertIsoTimestamp(result.completedAt,"TOOLCHAIN_IDENTITY_FAILED");
}
function syntheticPackagePaths(runRoot,runId) {
  const name=`bf3-r2-synthetic-validation-result-v1-${runId}.json`;
  return {name,original:`${runRoot}/synthetic-original/${name}`,archive:`${runRoot}/synthetic-archive/${name}`,integrity:`${runRoot}/bf3-r2-synthetic-package-check-v1-${runId}.json`};
}
function validateSyntheticPackageCheck(integrity,bytes,result) {
  exactKeys(integrity,["schema","version","scope","runId","resultByteCount","resultSha256","originalFilename","archiveFilename","originalDeviceIdentifier","originalFileIdentifier","archiveDeviceIdentifier","archiveFileIdentifier","originalObservedByteCount","archiveObservedByteCount","originalSha256","archiveSha256","originalArchiveFilesystemIdentity","originalArchiveEquality","testPackageCheckOutcome","productionPackageIntegrityOutcome","completedAt"],"PACKAGE_INTEGRITY_WRITE_FAILED");
  assert(integrity.schema==="mira.eximbay.bf3-r2-synthetic-package-check"&&integrity.version===1&&integrity.scope==="TEST_ONLY"&&integrity.runId===result.runId&&integrity.resultByteCount===bytes.length&&integrity.resultSha256===sha256(bytes)&&integrity.originalFilename===`bf3-r2-synthetic-validation-result-v1-${result.runId}.json`&&integrity.archiveFilename===integrity.originalFilename,"PACKAGE_INTEGRITY_WRITE_FAILED");
  [integrity.originalDeviceIdentifier,integrity.originalFileIdentifier,integrity.archiveDeviceIdentifier,integrity.archiveFileIdentifier].forEach((item)=>assertNumericIdentifier(item,"PACKAGE_INTEGRITY_WRITE_FAILED"));assert(integrity.originalDeviceIdentifier!==integrity.archiveDeviceIdentifier||integrity.originalFileIdentifier!==integrity.archiveFileIdentifier,"PACKAGE_INTEGRITY_WRITE_FAILED");
  assert(integrity.originalObservedByteCount===bytes.length&&integrity.archiveObservedByteCount===bytes.length&&integrity.originalSha256===sha256(bytes)&&integrity.archiveSha256===sha256(bytes)&&integrity.originalArchiveFilesystemIdentity==="DISTINCT"&&integrity.originalArchiveEquality==="EQUAL"&&integrity.testPackageCheckOutcome==="TEST_PACKAGE_CHECK_VALID"&&integrity.productionPackageIntegrityOutcome==="NOT_CREATED","PACKAGE_INTEGRITY_WRITE_FAILED");assertIsoTimestamp(integrity.completedAt,"PACKAGE_INTEGRITY_WRITE_FAILED");
}
function writeSyntheticPackageCheck(runRoot,result,fault=null) {
  let bytes;
  try{if(fault==="SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED")fail(fault);validateSyntheticResult(result);bytes=canonicalBytes(result);}catch{return {exitCode:TERMINAL.SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED,terminal:"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED"};}
  const files=syntheticPackagePaths(runRoot,result.runId);fs.mkdirSync(`${runRoot}/synthetic-original`,{mode:0o700});fs.mkdirSync(`${runRoot}/synthetic-archive`,{mode:0o700});
  try{if(fault==="ORIGINAL_WRITE_FAILED")fail(fault);fs.writeFileSync(files.original,bytes,{flag:"wx",mode:0o600});}catch{return {exitCode:TERMINAL.ORIGINAL_WRITE_FAILED,terminal:"ORIGINAL_WRITE_FAILED",files};}
  try{if(fault==="ARCHIVE_WRITE_FAILED")fail(fault);fs.writeFileSync(files.archive,bytes,{flag:"wx",mode:0o600});}catch{return {exitCode:TERMINAL.ARCHIVE_WRITE_FAILED,terminal:"ARCHIVE_WRITE_FAILED",files};}
  let originalStat,archiveStat,left,right;
  try{if(fault==="READBACK_FAILED")fail("EVIDENCE_VERIFICATION_FAILED");originalStat=fs.lstatSync(files.original);archiveStat=fs.lstatSync(files.archive);left=fs.readFileSync(files.original);right=fs.readFileSync(files.archive);if(fault==="IDENTITY_OR_EQUALITY_FAILED")fail("EVIDENCE_VERIFICATION_FAILED");assert(originalStat.isFile()&&archiveStat.isFile()&&!originalStat.isSymbolicLink()&&!archiveStat.isSymbolicLink()&&(originalStat.dev!==archiveStat.dev||originalStat.ino!==archiveStat.ino)&&left.equals(bytes)&&right.equals(bytes)&&left.equals(right),"EVIDENCE_VERIFICATION_FAILED");}catch{return {exitCode:TERMINAL.EVIDENCE_VERIFICATION_FAILED,terminal:"EVIDENCE_VERIFICATION_FAILED",files};}
  let integrity,integrityBytes;
  try{if(fault==="PACKAGE_INTEGRITY_CONSTRUCTION_FAILED")fail("PACKAGE_INTEGRITY_WRITE_FAILED");integrity={schema:"mira.eximbay.bf3-r2-synthetic-package-check",version:1,scope:"TEST_ONLY",runId:result.runId,resultByteCount:bytes.length,resultSha256:sha256(bytes),originalFilename:files.name,archiveFilename:files.name,originalDeviceIdentifier:String(originalStat.dev),originalFileIdentifier:String(originalStat.ino),archiveDeviceIdentifier:String(archiveStat.dev),archiveFileIdentifier:String(archiveStat.ino),originalObservedByteCount:left.length,archiveObservedByteCount:right.length,originalSha256:sha256(left),archiveSha256:sha256(right),originalArchiveFilesystemIdentity:"DISTINCT",originalArchiveEquality:"EQUAL",testPackageCheckOutcome:"TEST_PACKAGE_CHECK_VALID",productionPackageIntegrityOutcome:"NOT_CREATED",completedAt:new Date().toISOString()};validateSyntheticPackageCheck(integrity,bytes,result);integrityBytes=canonicalBytes(integrity);if(fault==="PACKAGE_INTEGRITY_WRITE_FAILED")fail(fault);fs.writeFileSync(files.integrity,integrityBytes,{flag:"wx",mode:0o600});}catch{return {exitCode:TERMINAL.PACKAGE_INTEGRITY_WRITE_FAILED,terminal:"PACKAGE_INTEGRITY_WRITE_FAILED",files};}
  try{if(fault==="PACKAGE_INTEGRITY_READBACK_FAILED")fail(fault);const observed=fs.readFileSync(files.integrity);assert(observed.equals(integrityBytes),"PACKAGE_INTEGRITY_READBACK_FAILED");validateSyntheticPackageCheck(JSON.parse(observed.toString("utf8")),bytes,result);}catch{return {exitCode:TERMINAL.PACKAGE_INTEGRITY_READBACK_FAILED,terminal:"PACKAGE_INTEGRITY_READBACK_FAILED",files};}
  return {exitCode:0,terminal:"TEST_PACKAGE_CHECK_VALID",files,integrity};
}
function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }
function assertProductionSchemaRejects(value,expectedHarnessIdentity) {
  let rejected=false;try{validateEvidence(value,expectedHarnessIdentity);}catch{rejected=true;}assert(rejected,"TOOLCHAIN_IDENTITY_FAILED");
}
function runProductionNegativeSchemaVectors(args,launch,toolchain,parser) {
  const schemaArgs={...args,mode:"run",syntheticFault:"NONE",launchTokenPath:`/Users/duckcow/mira-evidence/eximbay-bf3-r2/${args.runId}/.launch-token-v1`};
  const schemaBytes=[Buffer.from("EXIMBAY.request_pay();\n"),Buffer.from("var EXIMBAY = { request_pay: function () {} };\n")];
  const assets=ASSETS.map((asset,index)=>analyzeAsset(asset,schemaBytes[index],parser.espree,parser.visitorKeys));
  const expectedHarnessIdentity=toolchain.testOnlyExpectedHarnessIdentity;
  const exact=constructEvidence(schemaArgs,launch,schemaOnlyUpstreamAuthority(),assets,compareAssetsSafely(assets),expectedHarnessIdentity,toolchain.profileIdentity);
  validateEvidence(exact,expectedHarnessIdentity);
  assert(exact.executionEnvironment.harnessByteCount===expectedHarnessIdentity.byteCount&&exact.executionEnvironment.harnessSha256===expectedHarnessIdentity.sha256,"TOOLCHAIN_IDENTITY_FAILED");
  const vectors=[
    (value)=>{delete value.upstreamAuthority.bf3r1DerivedEvidenceVerification.expectedIdentityOutcome;},
    (value)=>{value.upstreamAuthority.bf3r1DerivedEvidenceVerification.unexpected="FORBIDDEN";},
    (value)=>{value.globalGates.networkContainmentOutcome="UNKNOWN";},
    (value)=>{value.repositoryAuthority.bf3r2ContractFileSha256="not-a-hash";},
    (value)=>{value.upstreamAuthority.bf3r1PackageIntegrityByteCount="1423";},
    (value)=>{value.upstreamAuthority.syntheticFixture=true;},
    (value)=>{value.executionEnvironment.nodeVersion="v0.0.0";},
    (value)=>{value.upstreamAuthority=syntheticAuthorityFixture();},
    (value)=>{value.executionEnvironment.harnessByteCount=expectedHarnessIdentity.byteCount===1?2:1;},
    (value)=>{value.executionEnvironment.harnessSha256=expectedHarnessIdentity.sha256==="0".repeat(64)?"1".repeat(64):"0".repeat(64);}
  ];
  for(const mutate of vectors){const candidate=cloneJson(exact);mutate(candidate);assertProductionSchemaRejects(candidate,expectedHarnessIdentity);}
  assert(!fs.readdirSync(args.runRoot).some((name)=>name.includes("ecma-source-shape-evidence")),"TOOLCHAIN_IDENTITY_FAILED");
  return vectors.length;
}
async function syntheticAdmissionMatrix(matrixRoot) {
  const vectors=[
    ["repository","UPSTREAM_LIFECYCLE_AUTHORITY_FAILED",66],
    ["toolchain","TOOLCHAIN_IDENTITY_FAILED",67],
    ["network","NETWORK_CONTAINMENT_FAILED",68],
    ["custody","UPSTREAM_CUSTODY_FAILED",69]
  ];
  for(const [injected,expected,exitCode] of vectors){
    const stages={repository:()=>{if(injected==="repository")fail(expected);},toolchain:()=>{if(injected==="toolchain")fail(expected);},network:()=>{if(injected==="network")fail(expected);},parser:()=>null,custody:()=>{if(injected==="custody")fail(expected);}};
    let terminal;try{await executeAdmissionStages(stages);fail("SYNTHETIC_EXPECTED_FAILURE");}catch(error){terminal=terminalForError(error);}
    assert(terminal.terminal===expected&&terminal.exitCode===exitCode,"TOOLCHAIN_IDENTITY_FAILED");
    assert(!fs.readdirSync(matrixRoot).some((name)=>name.includes("ecma-source-shape-evidence")),"TOOLCHAIN_IDENTITY_FAILED");
  }
}
async function runSyntheticTerminalMatrix(args,launch,toolchain,parser) {
  const matrixRoot=`${args.runRoot}/matrix`;fs.mkdirSync(matrixRoot,{mode:0o700});
  await syntheticAdmissionMatrix(matrixRoot);
  const semanticFaults=["UTF8_INVALID","UTF8_METHOD_FAILED","ESPREE_METHOD_FAILED","V8_METHOD_FAILED","SOURCE_SHAPE_METHOD_FAILED","COMPARISON_METHOD_FAILED"];
  const negativeSchemaVectorCount=runProductionNegativeSchemaVectors(args,launch,toolchain,parser);
  let baseResult;
  for(const fault of semanticFaults){
    const root=`${matrixRoot}/${fault}`;fs.mkdirSync(root,{mode:0o700});
    const assets=syntheticAssets(parser.espree,parser.visitorKeys,fault);
    const comparison=compareAssetsSafely(assets,fault==="COMPARISON_METHOD_FAILED");
    const syntheticResult=constructSyntheticResult({...args,syntheticFault:fault},assets,comparison,negativeSchemaVectorCount);
    assert(syntheticResult.analysis.derivedSemanticOutcome==="ECMASCRIPT_EVIDENCE_INCOMPLETE","TOOLCHAIN_IDENTITY_FAILED");
    const result=writeSyntheticPackageCheck(root,syntheticResult);assert(result.exitCode===0&&fs.existsSync(result.files.original)&&fs.existsSync(result.files.archive)&&fs.existsSync(result.files.integrity),"TOOLCHAIN_IDENTITY_FAILED");
    if(fault==="COMPARISON_METHOD_FAILED")assert(syntheticResult.analysis.comparisonOutcome==="METHOD_FAILED","TOOLCHAIN_IDENTITY_FAILED");
    if(!baseResult&&fault==="UTF8_INVALID"){const baseAssets=syntheticAssets(parser.espree,parser.visitorKeys);baseResult=constructSyntheticResult({...args,syntheticFault:"NONE"},baseAssets,compareAssetsSafely(baseAssets),negativeSchemaVectorCount);}
  }
  const packageFaults=[
    ["SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED",71,false,false,false],
    ["ORIGINAL_WRITE_FAILED",72,false,false,false],
    ["ARCHIVE_WRITE_FAILED",73,true,false,false],
    ["READBACK_FAILED",74,true,true,false],
    ["IDENTITY_OR_EQUALITY_FAILED",74,true,true,false],
    ["PACKAGE_INTEGRITY_CONSTRUCTION_FAILED",75,true,true,false],
    ["PACKAGE_INTEGRITY_WRITE_FAILED",75,true,true,false],
    ["PACKAGE_INTEGRITY_READBACK_FAILED",76,true,true,true]
  ];
  for(const [fault,exitCode,original,archive,integrity] of packageFaults){
    const root=`${matrixRoot}/${fault}`;fs.mkdirSync(root,{mode:0o700});const result=writeSyntheticPackageCheck(root,baseResult,fault);const files=syntheticPackagePaths(root,args.runId);
    assert(result.exitCode===exitCode&&fs.existsSync(files.original)===original&&fs.existsSync(files.archive)===archive&&fs.existsSync(files.integrity)===integrity,"TOOLCHAIN_IDENTITY_FAILED");
  }
  process.stdout.write("BF3R2_SYNTHETIC_HELPER_REGRESSION_PASS 18\n");
  return negativeSchemaVectorCount;
}
async function runSyntheticVector(args,launch) {
  let admitted;
  try{
    admitted=await executeAdmissionStages({
      repository:()=>{if(args.syntheticFault==="REPOSITORY_AUTHORITY_FAILED")fail("UPSTREAM_LIFECYCLE_AUTHORITY_FAILED");return {scope:"TEST_ONLY",productionRepositoryAuthorityOutcome:"NOT_ADMITTED"};},
      toolchain:()=>{if(args.syntheticFault==="TOOLCHAIN_IDENTITY_FAILED")fail("TOOLCHAIN_IDENTITY_FAILED");verifyProcessEnvironment(args);fileBytesIdentity(ENV_IDENTITY.path,ENV_IDENTITY.byteCount,ENV_IDENTITY.sha256);fileBytesIdentity(SANDBOX_IDENTITY.path,SANDBOX_IDENTITY.byteCount,SANDBOX_IDENTITY.sha256);const profileBytes=fileBytesIdentity(PROFILE_PATH,PROFILE_IDENTITY.byteCount,PROFILE_IDENTITY.sha256);assert(sha256(profileBytes)===args.profileSha256,"TOOLCHAIN_IDENTITY_FAILED");const harnessBytes=fileBytesIdentity(HARNESS_PATH,fs.lstatSync(HARNESS_PATH).size,args.harnessSha256);return {profileIdentity:{length:profileBytes.length,sha256:sha256(profileBytes)},testOnlyExpectedHarnessIdentity:harnessIdentityFromExtractedBytes(harnessBytes)};},
      network:()=>{if(args.syntheticFault==="NETWORK_CONTAINMENT_FAILED")fail("NETWORK_CONTAINMENT_FAILED");return networkContainmentPreflight();},
      parser:()=>{const parser=loadParserClosure();runSyntheticPreflight(parser.espree,parser.visitorKeys);return parser;},
      custody:()=>{if(args.syntheticFault==="UPSTREAM_CUSTODY_FAILED")fail("UPSTREAM_CUSTODY_FAILED");return syntheticAuthorityFixture();}
    });
  }catch(error){return terminalForError(error);}
  const negativeSchemaVectorCount=args.syntheticFault==="NONE"?await runSyntheticTerminalMatrix(args,launch,admitted.toolchain,admitted.parser):runProductionNegativeSchemaVectors(args,launch,admitted.toolchain,admitted.parser);
  const assetFault=args.syntheticFault==="UTF8_METHOD_FAILED"?"UTF8_METHOD_FAILED":null;
  const assets=syntheticAssets(admitted.parser.espree,admitted.parser.visitorKeys,assetFault);
  const comparison=compareAssetsSafely(assets,args.syntheticFault==="COMPARISON_METHOD_FAILED");
  const result=constructSyntheticResult(args,assets,comparison,negativeSchemaVectorCount);
  const packageFaults=new Set(["SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED","ORIGINAL_WRITE_FAILED","ARCHIVE_WRITE_FAILED","READBACK_FAILED","IDENTITY_OR_EQUALITY_FAILED","PACKAGE_INTEGRITY_CONSTRUCTION_FAILED","PACKAGE_INTEGRITY_WRITE_FAILED","PACKAGE_INTEGRITY_READBACK_FAILED"]);
  const packageResult=writeSyntheticPackageCheck(args.runRoot,result,packageFaults.has(args.syntheticFault)?args.syntheticFault:null);
  if(packageResult.exitCode!==0)return packageResult;
  process.stdout.write(`BF3R2_SYNTHETIC_VECTOR_PASS ${args.syntheticFault} ${result.analysis.derivedSemanticOutcome}\n`);
  return {exitCode:0,terminal:"SYNTHETIC_VECTOR_PASS"};
}
function writeChildReceipt(args,status) {
  if(args.syntheticFault==="RECEIPT_MISSING")return;
  if(args.syntheticFault==="RECEIPT_MALFORMED"){
    try{fs.writeFileSync(`${args.runRoot}/.child-launch-receipt-v1`,"BF3R2_TEST_ONLY_MALFORMED_RECEIPT\n",{flag:"wx",mode:0o600});return;}catch{fail("CHILD_RECEIPT_WRITE_FAILED");}
  }
  const receiptRunId=args.syntheticFault==="RECEIPT_MISMATCH"?"19700101T000000Z-00000000":args.runId;
  const receipt=`BF3R2_CHILD_LAUNCH_RECEIPT_V2\n${args.mode}\n${receiptRunId}\n${args.contractMerge}\n${args.contractSha256}\n${args.syntheticFault}\n${status}\n`;
  try{fs.writeFileSync(`${args.runRoot}/.child-launch-receipt-v1`,receipt,{flag:"wx",mode:0o600});}
  catch{fail("CHILD_RECEIPT_WRITE_FAILED");}
}
function writeCleanLaunchAcknowledgement(args) {
  const acknowledgement=`BF3R2_CHILD_CLEAN_LAUNCH_ACK_V1\n${args.mode}\n${args.runId}\n${args.contractMerge}\n${args.contractSha256}\n${args.syntheticFault}\n`;
  try{fs.writeFileSync(`${args.runRoot}/.child-clean-launch-ack-v1`,acknowledgement,{flag:"wx",mode:0o600});}
  catch{fail("LAUNCH_CHANNEL_UNAVAILABLE");}
}
async function main() {
  const args=parseArgs(process.argv.slice(2));
  const launch=verifyExternalLaunchAuthority(args);
  writeCleanLaunchAcknowledgement(args);
  verifyBootstrapIdentity();
  if(args.mode==="synthetic-vector"){
    if(args.syntheticFault==="CHILD_EXITS_BEFORE_RECEIPT")return TERMINAL.CHILD_STARTUP_FAILED;
    const result=await runSyntheticVector(args,launch);
    if(result.exitCode!==0){process.stderr.write(`${result.terminal}\n`);return result.exitCode;}
    writeChildReceipt(args,"SYNTHETIC_VECTOR_PASS");return 0;
  }
  let admitted;
  try{
    admitted=await executeAdmissionStages({
      repository:()=>verifyRepositoryAuthority(args.contractMerge,args.contractSha256),
      toolchain:(repositoryAuthority)=>{verifyProcessEnvironment(args);fileBytesIdentity(ENV_IDENTITY.path,ENV_IDENTITY.byteCount,ENV_IDENTITY.sha256);fileBytesIdentity(SANDBOX_IDENTITY.path,SANDBOX_IDENTITY.byteCount,SANDBOX_IDENTITY.sha256);const profileBytes=fileBytesIdentity(PROFILE_PATH,PROFILE_IDENTITY.byteCount,PROFILE_IDENTITY.sha256);assert(sha256(profileBytes)===args.profileSha256,"TOOLCHAIN_IDENTITY_FAILED");const harnessBytes=fileBytesIdentity(HARNESS_PATH,fs.lstatSync(HARNESS_PATH).size,args.harnessSha256);return {profileBytes,harnessBytes,admittedHarnessIdentity:admitHarnessIdentity(repositoryAuthority,harnessBytes,args.harnessSha256)};},
      network:()=>networkContainmentPreflight(),
      parser:()=>{const parser=loadParserClosure();runSyntheticPreflight(parser.espree,parser.visitorKeys);return parser;},
      custody:()=>verifyUpstreamAndReadSources()
    });
  }catch(error){const terminal=terminalForError(error);process.stderr.write(`${terminal.terminal}\n`);return terminal.exitCode;}
  const assets=ASSETS.map((asset,index)=>analyzeAsset(asset,admitted.custody.sourceBytes[index],admitted.parser.espree,admitted.parser.visitorKeys));
  const comparison=compareAssetsSafely(assets);
  let evidence;try{evidence=constructEvidence(args,launch,admitted.custody.upstreamAuthority,assets,comparison,admitted.toolchain.admittedHarnessIdentity,{length:admitted.toolchain.profileBytes.length,sha256:sha256(admitted.toolchain.profileBytes)});}catch(error){const terminal=terminalForError(error);process.stderr.write(`${terminal.terminal}\n`);return terminal.exitCode;}
  const packageResult=writeEvidencePackage(args.runRoot,evidence,admitted.toolchain.admittedHarnessIdentity);if(packageResult.exitCode!==0){process.stderr.write(`${packageResult.terminal}\n`);return packageResult.exitCode;}
  writeChildReceipt(args,"PACKAGE_VALID");return 0;
}
main().then((code)=>{process.exitCode=code;}).catch((error)=>{const terminal=terminalForError(error);process.stderr.write(`${terminal.terminal}\n`);process.exitCode=terminal.exitCode;});
// BF3R2_HARNESS_UTF8_END
```

The extracted result must equal `107473` bytes and SHA-256
`fbc8642fa193f8e2282898d68ab065be179c7d354b07df1c2f46408709e5a521`.
Its complete implementation identity is `BF3R2_ANALYSIS_HARNESS_V4`. This
source binds every decision-bearing operation in the corrected Sections 39–45.
No later generated implementation qualifies.

## 38. Exact host deny-network profile

The exact begin marker is `; BF3R2_NETWORK_PROFILE_UTF8_BEGIN`; the exact end
marker is `; BF3R2_NETWORK_PROFILE_UTF8_END`. Profile semantic bytes use the
same extraction, UTF-8, LF-only, no-BOM, no-CR, final-LF rules as Section 36.

```scheme
; BF3R2_NETWORK_PROFILE_UTF8_BEGIN
(version 1)
(allow default)
(deny network*)
; BF3R2_NETWORK_PROFILE_UTF8_END
```

The extracted result must equal `44` bytes and SHA-256
`5c358b8d847211333e7ba22df82d84f796b5f30a41a2682209a949d783adbd08`.
`/usr/bin/sandbox-exec` applies the profile before Node starts, and macOS
sandbox restrictions inherit into child processes. The JavaScript preflight is
only a proof probe; it is not the enforcement mechanism.

### 38.1 Exact TEST-ONLY startup-contamination regression fixture

The exact begin marker is `// BF3R2_STARTUP_FIXTURE_UTF8_BEGIN`; the exact end
marker is `// BF3R2_STARTUP_FIXTURE_UTF8_END`. Extraction and byte rules are
identical to the harness rules. The fixture is TEST-ONLY. Its sole purpose is
to reproduce the already-known condition in which mutable in-process startup
observations can be made to appear clean while reviewed external launch
authority remains absent.

```javascript
// BF3R2_STARTUP_FIXTURE_UTF8_BEGIN
"use strict";
const fs = require("node:fs");
const markerPath = process.env.BF3R2_STARTUP_FIXTURE_MARKER;
if (typeof markerPath !== "string" || !markerPath.startsWith("/private/tmp/mira-bf3r2/")) throw new Error("BF3R2_STARTUP_FIXTURE_MARKER_REJECTED");
fs.writeFileSync(markerPath,"BF3R2_STARTUP_CONTAMINATION_FIXTURE_ACTIVE\n",{flag:"wx",mode:0o600});
process.execArgv.length = 0;
delete require.cache[__filename];
// BF3R2_STARTUP_FIXTURE_UTF8_END
```

```text
FixtureIdentifier: BF3R2_SELF_ERASING_STARTUP_CONTAMINATION_REGRESSION_V1
FixturePath: /private/tmp/mira-bf3r2/startup-contamination-v1.cjs
FixtureByteCount: 417
FixtureSha256: c02bc8e0861a668b1ded6d8f8263b5fcb8190e5b00c2328d56ee20cf7d845bd5
FixturePurpose: TEST_ONLY_KNOWN_STARTUP_CONTAMINATION_REGRESSION
ProductionEvidenceAdmission: PROHIBITED
```

The marker proves fixture activation independently of `process.execArgv` and
`require.cache`. The fixture contains no SDK bytes and is never loaded by a
production `run` invocation.

### 38.2 Exact TEST-ONLY launcher process matrix source

The exact begin marker is `// BF3R2_PROCESS_MATRIX_UTF8_BEGIN`; the exact end
marker is `// BF3R2_PROCESS_MATRIX_UTF8_END`. Extraction and byte rules are
identical to the harness rules. It is invoked directly by the frozen Node
binary only during bounded authoring/review validation. It never receives or
reads a retained SDK path.

```javascript
// BF3R2_PROCESS_MATRIX_UTF8_BEGIN
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PROCESS_MATRIX_IMPLEMENTATION_IDENTITY = "BF3R2_PROCESS_TERMINAL_MATRIX_V2";
const LAUNCHER_IMPLEMENTATION_IDENTITY = "BF3R2_POSIX_PRE_NODE_LAUNCHER_V3";
const HARNESS_IMPLEMENTATION_IDENTITY = "BF3R2_ANALYSIS_HARNESS_V4";
const NODE_PATH = "/opt/homebrew/Cellar/node@24/24.18.0/bin/node";
const LAUNCHER_PATH = "/private/tmp/mira-bf3r2/launcher-v3.sh";
const HARNESS_PATH = "/private/tmp/mira-bf3r2/harness-v4.cjs";
const FIXTURE_PATH = "/private/tmp/mira-bf3r2/startup-contamination-v1.cjs";
const REPOSITORY_ROOT = "/Users/duckcow/workspace/mira";
const SYNTHETIC_ROOT = "/private/tmp/mira-bf3r2/synthetic";
const MERGE = "0000000000000000000000000000000000000000";
const CONTRACT_HASH = "0000000000000000000000000000000000000000000000000000000000000000";
const REQUIRED_IDENTITIES = Object.freeze([
  Object.freeze({implementation:LAUNCHER_IMPLEMENTATION_IDENTITY,path:LAUNCHER_PATH,byteCount:12533,sha256:"5c1128131238ea25e30fcdd62d9ff1373462ef545116d50fbda200281c63a72f"}),
  Object.freeze({implementation:HARNESS_IMPLEMENTATION_IDENTITY,path:HARNESS_PATH,byteCount:107473,sha256:"fbc8642fa193f8e2282898d68ab065be179c7d354b07df1c2f46408709e5a521"}),
  Object.freeze({path:FIXTURE_PATH,byteCount:417,sha256:"c02bc8e0861a668b1ded6d8f8263b5fcb8190e5b00c2328d56ee20cf7d845bd5"}),
  Object.freeze({path:"/private/tmp/mira-bf3r2/deny-network.sb",byteCount:44,sha256:"5c358b8d847211333e7ba22df82d84f796b5f30a41a2682209a949d783adbd08"})
]);
const PRODUCTION_FRAGMENTS = Object.freeze([
  "mira.eximbay.bf3-r2-ecma-source-shape-evidence",
  "bf3-r2-ecma-source-shape-evidence-v1-",
  "PACKAGE_VALID"
]);
let sequence = 0;

function assert(condition,message) { if(!condition) throw new Error(message); }
function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function verifyRequiredIdentity(identity) {
  const stat=fs.lstatSync(identity.path);assert(stat.isFile()&&!stat.isSymbolicLink(),`IDENTITY_PATH:${identity.implementation}:${identity.path}`);const bytes=fs.readFileSync(identity.path);assert(bytes.length===identity.byteCount&&sha256(bytes)===identity.sha256,`IDENTITY_BYTES:${identity.implementation}:${identity.path}`);
}
function nextRunId(label) {
  sequence += 1;
  const suffix=sha256(Buffer.from(`${process.pid}:${Date.now()}:${sequence}:${label}`,"utf8")).slice(0,8);
  return `20990101T000000Z-${suffix}`;
}
function runRoot(runId) { return `${SYNTHETIC_ROOT}/${runId}`; }
function walkFiles(root) {
  if(!fs.existsSync(root))return [];
  const files=[];
  function walk(directory){for(const name of fs.readdirSync(directory)){const absolute=path.join(directory,name);const stat=fs.lstatSync(absolute);assert(!stat.isSymbolicLink(),`SYMLINK:${absolute}`);if(stat.isDirectory())walk(absolute);else{assert(stat.isFile(),`NON_FILE:${absolute}`);files.push(absolute);}}}
  walk(root);return files.sort();
}
function assertSyntheticOnly(root) {
  for(const file of walkFiles(root)){
    const relative=path.relative(root,file);
    const bytes=fs.readFileSync(file);
    const text=bytes.toString("utf8");
    assert(!relative.includes("ecma-source-shape-evidence"),`PRODUCTION_FILENAME:${relative}`);
    for(const fragment of PRODUCTION_FRAGMENTS)assert(!text.includes(fragment),`PRODUCTION_FRAGMENT:${relative}:${fragment}`);
  }
}
function assertTemporaryLaunchStateAbsent(root) {
  for(const name of [".launch-token-v1",".child-clean-launch-ack-v1",".child-launch-receipt-v1",".launch-binding-decoy-v1"])assert(!fs.existsSync(`${root}/${name}`),`TEMP_RETAINED:${name}`);
}
function spawnLauncher(args,extraEnv={}) {
  return spawnSync("/bin/sh",[LAUNCHER_PATH,...args],{cwd:REPOSITORY_ROOT,encoding:"utf8",env:{...process.env,...extraEnv},maxBuffer:2_000_000});
}
function cleanup(root) {
  if(fs.existsSync(root))fs.rmSync(root,{recursive:true,force:false});
}
function runVector(name,fault,expectedStatus,expectedFiles={original:null,archive:null,integrity:null}) {
  const runId=nextRunId(name);const root=runRoot(runId);
  assert(!fs.existsSync(root),`PREEXISTING_TEST_ROOT:${root}`);
  const result=spawnLauncher(["synthetic-vector",runId,MERGE,CONTRACT_HASH,fault]);
  try{
    assert(result.status===expectedStatus,`${name}:STATUS:${result.status}:${result.stderr}`);
    if(expectedStatus===0)assert(result.stdout.includes("BF3R2_SYNTHETIC_LAUNCH_OBSERVED"),`${name}:NO_SYNTHETIC_LAUNCH_OBSERVATION`);
    else assert(result.stderr.includes(Object.entries({64:"INVALID_INVOCATION",65:"LAUNCH_AUTHORITY_FAILED",66:"UPSTREAM_LIFECYCLE_AUTHORITY_FAILED",67:"TOOLCHAIN_IDENTITY_FAILED",68:"NETWORK_CONTAINMENT_FAILED",69:"UPSTREAM_CUSTODY_FAILED",70:"RUN_ROOT_ALREADY_EXISTS",71:"SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED",72:"ORIGINAL_WRITE_FAILED",73:"ARCHIVE_WRITE_FAILED",74:"EVIDENCE_VERIFICATION_FAILED",75:"PACKAGE_INTEGRITY_WRITE_FAILED",76:"PACKAGE_INTEGRITY_READBACK_FAILED",77:"CHILD_RECEIPT_WRITE_FAILED",78:"LAUNCH_CHANNEL_UNAVAILABLE",79:"LAUNCH_TOKEN_FAILED",80:"LAUNCH_BINDING_MISMATCH",81:"LAUNCH_RECEIPT_MISSING",82:"LAUNCH_RECEIPT_MALFORMED",83:"LAUNCH_RECEIPT_MISMATCH",84:"CHILD_STARTUP_FAILED",85:"EXTERNAL_LAUNCH_AUTHORITY_WRITE_FAILED",86:"STALE_LAUNCH_METADATA",87:"LAUNCH_TEMPORARY_STATE_CLEANUP_FAILED"}).find(([code])=>Number(code)===expectedStatus)[1]),`${name}:NO_TERMINAL_REASON:${result.stderr}`);
    assertSyntheticOnly(root);
    assertTemporaryLaunchStateAbsent(root);
    const files=walkFiles(root);
    const present={original:files.some((file)=>file.includes("/synthetic-original/")),archive:files.some((file)=>file.includes("/synthetic-archive/")),integrity:files.some((file)=>path.basename(file).startsWith("bf3-r2-synthetic-package-check-v1-"))};
    for(const [key,value] of Object.entries(expectedFiles))if(value!==null)assert(present[key]===value,`${name}:${key}:${present[key]}`);
    return {name,status:result.status,stdout:result.stdout,stderr:result.stderr,fileCount:files.length};
  } finally { cleanup(root); }
}

REQUIRED_IDENTITIES.forEach(verifyRequiredIdentity);
fs.mkdirSync(SYNTHETIC_ROOT,{recursive:true,mode:0o700});
const observations=[];
observations.push(runVector("clean","NONE",0,{original:true,archive:true,integrity:true}));
observations.push(runVector("repository-authority","REPOSITORY_AUTHORITY_FAILED",66,{original:false,archive:false,integrity:false}));
observations.push(runVector("toolchain-authority","TOOLCHAIN_IDENTITY_FAILED",67,{original:false,archive:false,integrity:false}));
observations.push(runVector("network-authority","NETWORK_CONTAINMENT_FAILED",68,{original:false,archive:false,integrity:false}));
observations.push(runVector("custody-authority","UPSTREAM_CUSTODY_FAILED",69,{original:false,archive:false,integrity:false}));
observations.push(runVector("semantic-method","UTF8_METHOD_FAILED",0,{original:true,archive:true,integrity:true}));
observations.push(runVector("comparison-method","COMPARISON_METHOD_FAILED",0,{original:true,archive:true,integrity:true}));
observations.push(runVector("semantic-construction-write","SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED",71,{original:false,archive:false,integrity:false}));
observations.push(runVector("original-write","ORIGINAL_WRITE_FAILED",72,{original:false,archive:false,integrity:false}));
observations.push(runVector("archive-write","ARCHIVE_WRITE_FAILED",73,{original:true,archive:false,integrity:false}));
observations.push(runVector("readback","READBACK_FAILED",74,{original:true,archive:true,integrity:false}));
observations.push(runVector("identity-equality","IDENTITY_OR_EQUALITY_FAILED",74,{original:true,archive:true,integrity:false}));
observations.push(runVector("integrity-construction","PACKAGE_INTEGRITY_CONSTRUCTION_FAILED",75,{original:true,archive:true,integrity:false}));
observations.push(runVector("integrity-write","PACKAGE_INTEGRITY_WRITE_FAILED",75,{original:true,archive:true,integrity:false}));
observations.push(runVector("integrity-readback","PACKAGE_INTEGRITY_READBACK_FAILED",76,{original:true,archive:true,integrity:true}));
observations.push(runVector("launch-channel","LAUNCH_CHANNEL_UNAVAILABLE",78,{original:false,archive:false,integrity:false}));
observations.push(runVector("launch-token","LAUNCH_TOKEN_FAILED",79,{original:false,archive:false,integrity:false}));
observations.push(runVector("launch-binding","LAUNCH_BINDING_MISMATCH",80,{original:false,archive:false,integrity:false}));
observations.push(runVector("receipt-write","CHILD_RECEIPT_WRITE_FAILED",77,{original:true,archive:true,integrity:true}));
observations.push(runVector("receipt-missing","RECEIPT_MISSING",81,{original:true,archive:true,integrity:true}));
observations.push(runVector("receipt-malformed","RECEIPT_MALFORMED",82,{original:true,archive:true,integrity:true}));
observations.push(runVector("receipt-mismatch","RECEIPT_MISMATCH",83,{original:true,archive:true,integrity:true}));
observations.push(runVector("child-before-receipt","CHILD_EXITS_BEFORE_RECEIPT",84,{original:false,archive:false,integrity:false}));
observations.push(runVector("stale-authority-after-root-creation","STALE_AUTHORITY_METADATA",86,{original:true,archive:true,integrity:true}));
observations.push(runVector("external-authority-write","EXTERNAL_AUTHORITY_WRITE_FAILED",85,{original:true,archive:true,integrity:true}));

{
  const runId=nextRunId("temporary-cleanup-failure");const root=runRoot(runId);const result=spawnLauncher(["synthetic-vector",runId,MERGE,CONTRACT_HASH,"TEMP_CLEANUP_FAILURE"]);
  try{assert(result.status===87&&result.stderr.includes("LAUNCH_TEMPORARY_STATE_CLEANUP_FAILED"),`TEMP_CLEANUP:${result.status}:${result.stderr}`);assert(fs.existsSync(`${root}/.launch-binding-decoy-v1/blocker`),"TEMP_CLEANUP_FAILURE_NOT_REAL");assertSyntheticOnly(root);observations.push({name:"temporary-cleanup-failure",status:result.status});}finally{cleanup(root);}
}

{
  const runId=nextRunId("preexisting-root");const root=runRoot(runId);fs.mkdirSync(root,{mode:0o700});
  try{const before=fs.lstatSync(root);const result=spawnLauncher(["synthetic-vector",runId,MERGE,CONTRACT_HASH,"NONE"]);assert(result.status===70&&result.stderr.includes("RUN_ROOT_ALREADY_EXISTS"),`PREEXISTING_ROOT:${result.status}:${result.stderr}`);const after=fs.lstatSync(root);assert(before.dev===after.dev&&before.ino===after.ino,"PREEXISTING_ROOT_REPLACED");observations.push({name:"preexisting-root",status:result.status});}finally{cleanup(root);}
}
{
  const runId=nextRunId("stale-authority");const root=runRoot(runId);fs.mkdirSync(root,{mode:0o700});const stale=`${root}/bf3-r2-synthetic-launch-observation-v1-${runId}.json`;const staleBytes=Buffer.from("TEST_ONLY_PREEXISTING_STALE_AUTHORITY\n","utf8");fs.writeFileSync(stale,staleBytes,{flag:"wx",mode:0o600});
  try{const result=spawnLauncher(["synthetic-vector",runId,MERGE,CONTRACT_HASH,"NONE"]);assert(result.status===70&&result.stderr.includes("RUN_ROOT_ALREADY_EXISTS"),`STALE_AUTHORITY:${result.status}:${result.stderr}`);assert(fs.readFileSync(stale).equals(staleBytes),"STALE_AUTHORITY_OVERWRITTEN");observations.push({name:"stale-authority",status:result.status});}finally{cleanup(root);}
}
{
  const result=spawnLauncher(["synthetic-vector"]);assert(result.status===64&&result.stderr.includes("INVALID_INVOCATION"),`INVALID_INVOCATION:${result.status}:${result.stderr}`);observations.push({name:"invalid-invocation",status:result.status});
}
{
  const runId=nextRunId("direct-alternate");const marker=`/private/tmp/mira-bf3r2/startup-fixture-marker-${process.pid}-${sequence}`;const root=runRoot(runId);const args=["-r",FIXTURE_PATH,HARNESS_PATH,"--mode","synthetic-vector","--run-id",runId,"--contract-merge",MERGE,"--contract-sha256",CONTRACT_HASH,"--harness-sha256","0".repeat(64),"--profile-sha256","0".repeat(64),"--launch-token-path",`${root}/.launch-token-v1`,"--launch-parent-pid",String(process.pid),"--synthetic-fault","NONE"];
  const result=spawnSync(NODE_PATH,args,{cwd:REPOSITORY_ROOT,encoding:"utf8",env:{...process.env,BF3R2_STARTUP_FIXTURE_MARKER:marker},maxBuffer:2_000_000});
  try{assert(result.status===65&&result.stderr.includes("LAUNCH_AUTHORITY_FAILED"),`DIRECT_ALTERNATE:${result.status}:${result.stderr}`);assert(fs.readFileSync(marker,"utf8")==="BF3R2_STARTUP_CONTAMINATION_FIXTURE_ACTIVE\n","DIRECT_FIXTURE_NOT_ACTIVE");assert(!fs.existsSync(root),"DIRECT_ALTERNATE_RUN_ROOT_CREATED");observations.push({name:"direct-alternate",status:result.status});}finally{if(fs.existsSync(marker))fs.unlinkSync(marker);cleanup(root);}
}
{
  const runId=nextRunId("reviewed-startup-rejection");const marker=`/private/tmp/mira-bf3r2/startup-fixture-marker-${process.pid}-${sequence}`;const root=runRoot(runId);const result=spawnLauncher(["synthetic-vector",runId,MERGE,CONTRACT_HASH,"NONE","-r",FIXTURE_PATH],{BF3R2_STARTUP_FIXTURE_MARKER:marker});
  try{assert(result.status===64&&result.stderr.includes("INVALID_INVOCATION"),`REVIEWED_REJECTION:${result.status}:${result.stderr}`);assert(!fs.existsSync(marker),"REVIEWED_FIXTURE_EXECUTED");assert(!fs.existsSync(root),"REVIEWED_REJECTION_RUN_ROOT_CREATED");observations.push({name:"reviewed-startup-rejection",status:result.status});}finally{if(fs.existsSync(marker))fs.unlinkSync(marker);cleanup(root);}
}

assert(observations.length===31,`${PROCESS_MATRIX_IMPLEMENTATION_IDENTITY}:PROCESS_MATRIX_COUNT:${observations.length}`);
process.stdout.write(`BF3R2_PROCESS_TERMINAL_MATRIX_PASS ${observations.length}\n`);
// BF3R2_PROCESS_MATRIX_UTF8_END
```

```text
ProcessMatrixIdentifier: BF3R2_PROCESS_TERMINAL_MATRIX_V2
ProcessMatrixPath: /private/tmp/mira-bf3r2/process-matrix-v2.cjs
ProcessMatrixByteCount: 13492
ProcessMatrixSha256: a95bc37edfe2efaa111283358ff98bb770c4b6be1157cc99d28cfdcbd8658ec1
ExpectedTerminalVectorCount: 31
```

## 39. External launch authority and threat model

A Node program cannot establish solely from mutable JavaScript-visible state
that no preload executed before its main module. Therefore
`process.execArgv`, `process.env`, and `require.cache` are defense-in-depth
observations only. They are not the primary or decisive startup proof.

The launcher creates a new mode-specific run root and an exclusive mode-0600
`.launch-token-v1` containing the fixed marker, mode, run ID, contract merge,
contract hash, and launcher PID. It opens that exact file as inherited FD 3.
The child admits the launch only when all of these hold before repository or
toolchain work: the fixed FD environment marker is present; the token path is
the only path derived by the fixed mode/run grammar; `process.ppid` equals the
frozen parent PID argument; `lstat(path)` and `fstat(3)` identify the same
regular mode-0600 file; and complete FD/path bytes equal the expected record.

Immediately after the FD/path/token binding succeeds, the child exclusively
writes `.child-clean-launch-ack-v1`. The parent never trusts a nonzero child
status unless that exact run-bound acknowledgement exists and matches; a raw
`sandbox-exec`, shell, or pre-harness child failure therefore becomes exit 84
`CHILD_STARTUP_FAILED`, not a colliding semantic code. After a successful child
result, the child exclusively writes a seven-line fixed receipt. The
still-running shell parent validates the acknowledgement and receipt, removes
all temporary launch files, then and only then writes
`ExternalLaunchAuthority-v1`. The package admission
predicate requires a schema-valid semantic artifact, a read-back-verified
`PACKAGE_VALID` package-integrity artifact, and the matching external launch
authority record. A direct or contaminated Node invocation cannot make the
reviewed shell parent write that record. An unprovable Node self-declaration is
never sufficient.

The containment protects against accidental direct Node invocation,
caller-injected Node startup flags, shell/environment contamination, preloads
introduced by invocation, alternate launch paths, and alternate parser/module
paths. It does not resist a malicious user authorized to rewrite all reviewed
files and evidence, root/kernel compromise, or malicious replacement of every
bound executable together with its expected identity. It makes no stronger
local-host security claim.

The token, clean-launch acknowledgement, receipt, synthetic binding decoy, and
any TEST-ONLY launch-channel object are temporary state, not evidence. The
launcher creates them under its exclusively created mode-0700 run root with
mode 0600 for regular files. It removes each after a successful receipt and
before authority admission. On every classified terminal failure it attempts
the same deterministic cleanup. Cleanup failure preserves the failed run root,
prints the primary terminal as context, and terminates at exit 87
`LAUNCH_TEMPORARY_STATE_CLEANUP_FAILED`; no authority is admitted. A
pre-existing run root, token, acknowledgement, receipt, binding object, or
authority path is never overwritten. A pre-existing run root terminates at 70;
authority metadata discovered after exclusive root creation terminates at 86.
Neither state authorizes automatic deletion or reuse.

## 40. Bootstrap boundary and exact reachable stage order

The only top-level Node loads are the frozen built-ins `node:crypto`,
`node:fs`, `node:net`, `node:path`, `node:child_process`, and `node:vm`.
They are bootstrap capabilities required to execute the reviewed harness, not
evidence authority. Espree, Acorn, acorn-jsx, and eslint-visitor-keys do not
load at top level or before repository, host identity, and network admission.

The exact order is:

```text
L0 invocation grammar or 64 INVALID_INVOCATION
L1 run-root nonexistence + exclusive creation or 70/78
L2 exclusive token/channel creation or 78/79
L3 exact /bin/sh -> sandbox -> fixed Node -> six built-ins or 84
L4 child FD/parent/token binding + clean-launch acknowledgement or 65/79/80/84
0  repository + installed lifecycle/contract authority
1  host executable, harness, profile, environment, lock, and Node identity
2  host network-containment preflight
3  parser closure identity, load, and synthetic parser preflight
4  upstream BF3-R1 package and historical-source custody
5  UTF-8 decode
6  Espree and V8 syntax witnesses
7  source-shape
8  comparison
9  semantic outcome, warnings, exact production-schema validation, canonical-byte freeze
10 original write -> archive write -> read-back/equality/identity verification
11 PackageIntegrity construction -> write -> read-back verification
L5 child receipt -> receipt validation -> temporary cleanup -> parent authority write
```

The exact production `main()` invokes this order. No pre-admission failure
enters semantic construction. The same `executeAdmissionStages`, semantic
construct/validate functions, safe comparison boundary, package writer, and
terminal mapper are exercised by the synthetic process matrix. Every launch
edge L0–L5 is an actual launcher/harness branch; no helper-only launch state is
normative.

## 41. Corrected evidence schema and method identities

`EcmaSourceShapeEvidence-v1` adds required `launchAuthority` immediately after
`contractIdentity`. It has exactly these ordered fields:

```text
launcherIdentity: BF3R2_POSIX_PRE_NODE_LAUNCHER_V3
launchTokenFd: 3
launchTokenPath: exact mode/run-derived .launch-token-v1
launchTokenByteCount: non-negative safe integer
launchTokenSha256: 64 lowercase hexadecimal
childHandshakeOutcome: VERIFIED
externalLaunchAuthorityRecordBasename: exact run-bound basename
```

`globalGates` has exactly `preNodeLaunchHandshakeOutcome`,
`repositoryAuthorityOutcome`, `toolchainIdentityOutcome`,
`networkContainmentOutcome`, and `upstreamCustodyOutcome`; every one is
`VERIFIED`. Failed global gates do not create this semantic schema.
`executionEnvironment` additionally binds Git invocation/resolved path and
binary identity plus the six-member bootstrap-built-in list. Its environment
is the exact five-entry object (`BF3R2_LAUNCH_FD=3`, `HOME`, `LANG`, `TMPDIR`,
and the fixed CoreFoundation value).

The corrected required method additions/replacements are:

```text
launchAuthorityMethodIdentifier:
  BF3R2_EXTERNAL_FD3_PARENT_CHILD_LAUNCH_AUTHORITY_V2
bootstrapBoundaryMethodIdentifier:
  BF3R2_APPROVED_BUILTIN_BOOTSTRAP_AND_GIT_IDENTITY_V1
stagePrecedenceMethodIdentifier:
  BF3R2_REACHABLE_STAGE_PRECEDENCE_V4
processEnvironmentAdmissionMethodIdentifier:
  BF3R2_PROCESS_ENVIRONMENT_DEFENSE_IN_DEPTH_V4
moduleCacheResolutionMethodIdentifier:
  BF3R2_MODULE_CACHE_DEFENSE_IN_DEPTH_V3
comparisonMethodIdentifier:
  BF3R2_V1_V2_BOUNDED_COMPARISON_WITH_METHOD_FAILURE_V3
semanticOutcomeMethodIdentifier:
  BF3R2_TOP_LEVEL_SEMANTIC_OUTCOME_V3
analysisHarnessImplementationIdentifier:
  BF3R2_ANALYSIS_HARNESS_V4
harnessExtractionMethodIdentifier:
  BF3R2_INSTALLED_CONTRACT_EXACT_HARNESS_EXTRACTION_V1
harnessExtractionAdmissionMethodIdentifier:
  BF3R2_INSTALLED_CONTRACT_HARNESS_IDENTITY_ADMISSION_V1
evidenceSchemaConstructionMethodIdentifier:
  BF3R2_EVIDENCE_SCHEMA_CONSTRUCTION_AND_VALIDATION_V5
productionEvidenceValidatorMethodIdentifier:
  BF3R2_EXACT_RECURSIVE_CLOSED_PRODUCTION_EVIDENCE_VALIDATOR_V2
upstreamAuthorityValidatorMethodIdentifier:
  BF3R2_EXACT_UPSTREAM_AUTHORITY_VALIDATOR_V1
executionEnvironmentValidatorMethodIdentifier:
  BF3R2_EXACT_EXECUTION_ENVIRONMENT_VALIDATOR_V2
productionNegativeSchemaVectorMethodIdentifier:
  BF3R2_PRODUCTION_SCHEMA_NEGATIVE_VECTORS_V2
syntheticValidationMethodIdentifier:
  BF3R2_SEPARATE_TEST_ONLY_SYNTHETIC_VALIDATION_V2
packageWriteMethodIdentifier:
  BF3R2_SEMANTIC_ORIGINAL_ARCHIVE_WRITE_VERIFY_V5
packageIntegrityMethodIdentifier:
  BF3R2_NONRECURSIVE_VALID_PACKAGE_INTEGRITY_V3
terminalStateMethodIdentifier:
  BF3R2_EXECUTION_TERMINAL_STATE_V2
launchTerminalMapperMethodIdentifier:
  BF3R2_EXACT_LAUNCH_TERMINAL_MAPPER_V1
launchTemporaryStateCleanupMethodIdentifier:
  BF3R2_LAUNCH_TEMPORARY_STATE_CLEANUP_V1
processMatrixMethodIdentifier:
  BF3R2_ACTUAL_LAUNCHER_PROCESS_MATRIX_V2
```

All other Section 25.4 method identities remain in their exact prior order and
are present in the V4 harness. `validateEvidence` is the single production
validator. It recursively applies exact ordered-key validation to every object,
including launch, repository, BF3-R1 integrity verification, BF3-R1 derived
evidence pair verification, both historical-asset pair verifications, exact
execution environment, each package closure, method identities, global gates,
assets, every lexical-context record, comparison, warnings, and timestamps.
It freezes types, enums, nullability, array order, non-negative safe-integer
bounds, hash/merge/run-ID formats, and all implemented cross-field derivations.
Unexpected keys are rejected at every nested level. A recursive precheck also
rejects `syntheticFixture`, `skipAuthorityValidation`, `testModeBypass`, and
`mockAuthority` anywhere in production evidence. No generic record or test
branch exists in the production validator.

`admittedHarnessIdentity` is derived only by
`BF3R2_INSTALLED_CONTRACT_EXACT_HARNESS_EXTRACTION_V1` from the exact Harness
V4 bytes extracted from the reviewed installed contract into the fixed harness
path. The caller-supplied harness hash is only an equality check against that
derived identity; it cannot define the identity. TEST-ONLY synthetic fixture
fields and synthetic authority cannot become the production
`admittedHarnessIdentity`.

`validateUpstreamAuthority` is the decision-bearing exact BF3-R1/BF3-R2
authority validator. `validateExecutionEnvironment` binds every executable,
hash, path, environment entry, built-in order, package closure identity,
network state, and package-manager state constructed by production. It
requires both
`executionEnvironment.harnessByteCount === admittedHarnessIdentity.byteCount`
and
`executionEnvironment.harnessSha256 === admittedHarnessIdentity.sha256`.
Ten
negative schema vectors remove a required nested authority field, add a nested
field, alter an enum, corrupt a hash, change a byte count type, add
`syntheticFixture`, change the Node identity, and substitute the complete
TEST-ONLY authority fixture, then separately supply a wrong positive safe
harness byte count and a syntactically valid alternate 64-hex harness SHA-256.
All ten reject before serialization or package admission. The exact positive
identity passes this equality portion of production validation.

Production construction is callable only for `mode: run` and
`syntheticFault: NONE`. `writeEvidencePackage` re-runs the complete production
validator before canonical-byte freeze. Production PackageIntegrity validation
is exact and cross-binds its run ID, contract identity, filenames, byte counts,
hashes, filesystem identities, equality, outcome, and timestamp to those
validated immutable semantic bytes. Thus normative schema, constructor,
validator, canonical serializer, and package-admission boundary use the same
closed production implementation.

Synthetic analysis instead creates only
`BF3R2SyntheticValidationResult-v1` (schema
`mira.eximbay.bf3-r2-synthetic-validation-result`) and, when write behavior is
under test, `BF3R2SyntheticPackageCheck-v1`. Both have `scope: TEST_ONLY`, an
explicit synthetic authority fixture, `productionEvidenceOutcome: NOT_CREATED`,
`productionPackageIntegrityOutcome: NOT_CREATED`, and production admission
`PROHIBITED`. Their only success word is `TEST_PACKAGE_CHECK_VALID`; neither
schema, filename, nor serialized bytes contain the production schema name or
`PACKAGE_VALID`. They reuse the actual stage controller, semantic analyzers,
comparison, outcome derivation, validators, terminal mapper, canonical helper,
and package write/read-back mechanics without calling the production evidence
constructor or production package writer.

## 42. Execution terminal state and semantic failure artifacts

Execution terminal state is distinct from semantic evidence and package
integrity. The exact process codes are:

| Code | Terminal state | Semantic artifact |
| ---: | --- | --- |
| 64 | `INVALID_INVOCATION` | absent |
| 65 | `LAUNCH_AUTHORITY_FAILED` | absent |
| 66 | `UPSTREAM_LIFECYCLE_AUTHORITY_FAILED` | absent |
| 67 | `TOOLCHAIN_IDENTITY_FAILED` | absent |
| 68 | `NETWORK_CONTAINMENT_FAILED` | absent |
| 69 | `UPSTREAM_CUSTODY_FAILED` | absent |
| 70 | `RUN_ROOT_ALREADY_EXISTS` | absent |
| 71 | `SEMANTIC_EVIDENCE_CONSTRUCTION_FAILED` | absent |
| 72 | `ORIGINAL_WRITE_FAILED` | no trusted package |
| 73 | `ARCHIVE_WRITE_FAILED` | no trusted package |
| 74 | `EVIDENCE_VERIFICATION_FAILED` | no trusted package |
| 75 | `PACKAGE_INTEGRITY_WRITE_FAILED` | semantic pair may be verified; package not admitted |
| 76 | `PACKAGE_INTEGRITY_READBACK_FAILED` | semantic pair may be verified; package not admitted |
| 77 | `CHILD_RECEIPT_WRITE_FAILED` | package not launch-admitted |
| 78 | `LAUNCH_CHANNEL_UNAVAILABLE` | absent unless a later synthetic receipt-path injection; never admitted |
| 79 | `LAUNCH_TOKEN_FAILED` | absent |
| 80 | `LAUNCH_BINDING_MISMATCH` | absent |
| 81 | `LAUNCH_RECEIPT_MISSING` | child files may exist; never launch-admitted |
| 82 | `LAUNCH_RECEIPT_MALFORMED` | child files may exist; never launch-admitted |
| 83 | `LAUNCH_RECEIPT_MISMATCH` | child files may exist; never launch-admitted |
| 84 | `CHILD_STARTUP_FAILED` | absent; no clean-launch acknowledgement |
| 85 | `EXTERNAL_LAUNCH_AUTHORITY_WRITE_FAILED` | child files may exist; never launch-admitted |
| 86 | `STALE_LAUNCH_METADATA` | never overwritten; never launch-admitted |
| 87 | `LAUNCH_TEMPORARY_STATE_CLEANUP_FAILED` | failed root retained; never launch-admitted |
| 0 | `PACKAGE_VALID` plus external launch admission | admitted candidate package |

No `EcmaSourceShapeEvidence-v1` is created for launch, repository, toolchain,
network, or upstream-custody failure. No semantic evidence is fabricated with
an unadmitted method. Once all authority stages pass, UTF-8 invalidity or
method failure, Espree/V8 operational failure, parser disagreement,
source-shape failure, and comparison failure create schema-valid semantic
evidence. Earlier completed per-asset facts remain unchanged.

No shell builtin, `mkdir`, redirection, `sandbox-exec`, Node, receipt read, or
authority write can leak a raw status outside this vocabulary. Before the clean
launch acknowledgement, every unknown/nonzero child result becomes 84. After
the acknowledgement, only the enumerated harness codes are accepted; any
other child result also becomes 84. Parent receipt states are distinct 81–83.

The comparison call is inside `compareAssetsSafely`. Any operational throw
constructs exactly `comparisonOutcome: METHOD_FAILED` and makes all five
statuses `NOT_COMPARABLE`; it emits `COMPARISON_METHOD_FAILED` and deterministically
derives `ECMASCRIPT_EVIDENCE_INCOMPLETE`. The injected comparison vector proves
the retained per-asset facts serialize and validate.

## 43. Package write and integrity reality

Semantic bytes are validated, canonicalized, and frozen once. The exact write
algorithm is original exclusive write, archive exclusive write, complete
read-back of both, regular/non-symlink and distinct-device/inode checks, direct
comparison of each to immutable bytes and to each other, construction of one
non-recursive integrity object, exclusive integrity write, then complete
integrity read-back, direct byte comparison, parse, and schema validation.

`EcmaSourceShapeEvidencePackageIntegrity-v1` contains only facts available
after both semantic copies verify. It has exactly:

```text
schema, version, runId, contractIdentity,
evidenceByteCount, evidenceSha256,
originalFilename, archiveFilename,
originalDeviceIdentifier, originalFileIdentifier,
archiveDeviceIdentifier, archiveFileIdentifier,
originalObservedByteCount, archiveObservedByteCount,
originalSha256, archiveSha256,
originalArchiveFilesystemIdentity: DISTINCT,
originalArchiveEquality: EQUAL,
packageIntegrityOutcome: PACKAGE_VALID,
completedAt
```

No durable PackageIntegrity enum claims that semantic construction, original
write, archive write, verification, or its own construction/write/read-back
failed. Those are terminal states and observable allowed file sets. A failed
original write leaves neither semantic file; failed archive write may leave
only original; verification failure may leave both untrusted semantic files;
integrity construction/write failure leaves the verified semantic pair but no
trusted integrity; integrity read-back failure may leave all three files but
the package is untrusted. No automatic deletion or rerun is authorized. A
later reviewed operator may quarantine the failed root; rerun requires separate
authority and a new run ID.

These rules apply to production only after the complete production validator
admits the semantic object. TEST-ONLY synthetic package mechanics write the
separately named synthetic result and synthetic package-check schemas. A
synthetic authority object presented to `validateEvidence` terminates before
canonicalization, creates no production semantic file, creates no production
PackageIntegrity, and cannot reach `PACKAGE_VALID`. This is mechanically fixed
by the ten negative schema vectors and by the process matrix's recursive
filename/content scan of every synthetic run root.

## 44. Synthetic process-terminal and regression matrix

The exact `BF3R2_PROCESS_TERMINAL_MATRIX_V2` ran 31 TEST-ONLY vectors by
spawning `/bin/sh` with the exact launcher or, for the single alternate-launch
regression, the exact Node binary with the exact startup fixture. It observed
actual exit status, bounded stdout/stderr, recursive file presence, temporary
launch state, authority or synthetic-observation record, and production
schema/filename/`PACKAGE_VALID` absence. It covered clean synthetic launch,
invalid invocation, direct alternate launch, reviewed-launch startup-control
rejection, pre-existing root, pre-existing authority metadata, stale authority
after exclusive root creation, launch channel/token/binding, receipt
write/missing/malformed/mismatch, child exit before receipt, external authority
write, cleanup failure, repository/toolchain/network/custody admission,
UTF-8/comparison semantic methods, semantic construction, original/archive
write, read-back, identity/equality, synthetic integrity construction/write,
and synthetic integrity read-back. It printed
`BF3R2_PROCESS_TERMINAL_MATRIX_PASS 31`.

The H4 AUD-002 clean TEST-ONLY launch exited `0` and printed exactly:

```text
BF3R2_SYNTHETIC_HELPER_REGRESSION_PASS 18
BF3R2_SYNTHETIC_VECTOR_PASS NONE SOURCE_SHAPE_EVIDENCE_COMPLETE
BF3R2_SYNTHETIC_LAUNCH_OBSERVED
```

Its exact TEST-ONLY result recorded:

```text
productionNegativeSchemaVectorCount: 10
productionEvidenceOutcome: NOT_CREATED
productionPackageIntegrityOutcome: NOT_CREATED
productionPackageAdmissionOutcome: PROHIBITED
```

`BF3R2_PRODUCTION_SCHEMA_NEGATIVE_VECTORS_V2` first validates the exact
positive Harness V4 identity, then requires rejection of all ten ordered
mutations. Its final two mutations are the wrong positive safe byte count and
the syntactically valid alternate 64-hex SHA-256. Exit `0` with count `10`
therefore proves both negatives rejected and the exact positive equality
passed, without constructing production evidence or PackageIntegrity.

The internal 18-case helper regression remains and prints
`BF3R2_SYNTHETIC_HELPER_REGRESSION_PASS 18`, but it is not the closure claim.
It uses only `BF3R2SyntheticValidationResult-v1` and
`BF3R2SyntheticPackageCheck-v1`. The process matrix is the launch-layer
mechanical authority for AUD-003.

Passing `-r <fixture>` as extra launcher arguments returned exit 64 before Node
started; the marker was absent and no run root existed. The direct alternate
Node launch executed the exact 417-byte fixture, produced its independent
marker, then returned exit 65 `LAUNCH_AUTHORITY_FAILED`; no run root,
production evidence, PackageIntegrity, receipt, or external authority existed.
This proves mutable in-process observations can appear clean while reviewed
external launch authority remains absent. Caller `NODE_OPTIONS` and `NODE_PATH`
remain cleared by `/usr/bin/env -i`; the child environment validator fixes the
exact five-entry environment.

Closed-finding regression was mechanical, not a broad review: lifecycle merge
and file identity; contained/uncontained/misconfigured loopback vectors;
parse/shape isolation; five Program.range vectors; UTF-16 adjacency/boundary,
template, regex, and escape vectors; full ordered method set; host-visible
non-evaluation sentinel; and safe-integer boundaries all passed unchanged.
Package write regression also proved that failed durable writes are terminal
state plus actual file set, never a self-testifying failure PackageIntegrity.

## 45. BF3R2-AUD closure matrix and verdict

```text
AUD-002 HARNESS BYTE-COUNT NEGATIVE:
  REJECTED AS REQUIRED

AUD-002 HARNESS SHA NEGATIVE:
  REJECTED AS REQUIRED

AUD-002 EXACT HARNESS IDENTITY:
  ACCEPTED AS REQUIRED

BF3R2-AUD-001:
  CLOSED / REGRESSION PASS

BF3R2-AUD-002:
  CORRECTED / READY FOR FOCUSED CLOSURE

BF3R2-AUD-003:
  CLOSED / REGRESSION PASS

BF3R2-AUD-004:
  CLOSED / REGRESSION PASS

BF3R2-AUD-005:
  CLOSED / REGRESSION PASS

BF3R2-AUD-006:
  CLOSED / REGRESSION PASS

BF3R2-AUD-007:
  CLOSED / REGRESSION PASS

BF3R2-AUD-008:
  CLOSED / REGRESSION PASS

BF3R2-AUD-009:
  CLOSED / REGRESSION PASS

BF3R2-AUD-010:
  CLOSED / REGRESSION PASS

PRODUCTION SYNTHETIC-AUTHORITY ADMISSION:
  PROHIBITED / VERIFIED

PRODUCTION EVIDENCE VALIDATOR:
  EXACT / RECURSIVE / CLOSED SCHEMA

LAUNCH FAILURE TERMINAL MODEL:
  COMPLETE / PROCESS-LEVEL VERIFIED

BF3-R2 CONTRACT:
  FINAL CORRECTED CANDIDATE

BF3-R2 EXECUTION:
  NOT AUTHORIZED

RETAINED SDK PARSING:
  NONE

RETAINED SDK COMPILE-ONLY CHECK:
  NONE

RETAINED SDK JAVASCRIPT EVALUATION:
  NONE

PROVIDER CONTACT:
  NOT AUTHORIZED

EXIMBAY SDK CANONICAL VERSION:
  UNRESOLVED

EX2B2:
  BLOCKED

NEXT:
  ONE BF3R2-AUD-002 FOCUSED CLOSURE REVIEW ONLY
```

This correction does not establish browser compatibility, runtime execution
success, provider recommendation, canonical SDK version, current response
identity, or EX2B2 readiness. `BOTH_ACCEPTED` retains its prior narrow ceiling.

No Eximbay SDK asset endpoint was contacted.

No retained Eximbay SDK body was parsed or source-inspected.

No retained Eximbay SDK body was passed to `vm.Script`.

No retained SDK JavaScript was evaluated.

`EXIMBAY.request_pay()` was not invoked.

No browser request was made.

No Eximbay payment/API request was made.

No external network request was made.

No parser package was installed, updated, or downloaded.

No historical evidence artifact was modified.

The original BF3-R2 candidate worktree remained untouched.

No file was staged, committed, pushed, or merged.

EX2B2 remains blocked.
