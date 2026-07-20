# Dormant manual Toss SANDBOX acceptance harness

This standalone local CLI prepares and records one bounded Toss SANDBOX acceptance scenario at a
time. It is not registered in the application, a package script, a worker, or a scheduler.

```bash
npx tsx scripts/refund-sandbox-acceptance/cli.ts plan
npx tsx scripts/refund-sandbox-acceptance/cli.ts populate-fixtures \
  --run <targetRunId> \
  --source-run <retiredPrimaryRunId> \
  --witness-run <retiredWitnessRunId> \
  --scenario S3
npx tsx scripts/refund-sandbox-acceptance/cli.ts validate-db --run <runId>
npx tsx scripts/refund-sandbox-acceptance/cli.ts validate-fixtures --run <runId>
```

Real provider execution is not authorized by this source change. A later audited act must prepare
the database and authorize each command.

## Separate operator acts and authority

The lifecycle has distinct `plan`, `populate-fixtures`, read-only post-population inspection,
`execute`, `seal`, evidence review, `cleanup-db`, and `purge-raw` acts. Planning creates the
protected immutable `fixtures.json` template. Population never replaces that template: it creates
the separate append-only `fixture-population.json` authority exactly once after a retired primary
source and independent retired witness pass full semantic validation. Population is rooted in the
typed committed registry in `fixture-population-approval.ts`. That registry currently contains one
intentionally bounded approval for the first S3 run; it is not a generic auto-approval mechanism.
The CLI target, source, witness, and scenario are operator confirmations only and must exactly match
the committed approval. A target absent from the registry cannot acquire populated authority.

The population envelope contains the complete retargeted manifest but durably authorizes only S3.
It is not self-authenticating. Every effective-authority read starts with the requested target ID,
looks up the committed approval, revalidates the immutable P3-A template and both retired runs,
compares their protected bindings and S3 contact semantics, and reconstructs the expected envelope
from those external facts. The stored envelope must be canonically identical across every field and
the complete nested manifest. Stored source/witness IDs, scenario, fingerprint, or a stored digest
never select or replace committed authority.

Population performs no database or provider contact and does not authorize or automatically start
execution. It accepts only `--scenario S3` and requires an exact operation-specific confirmation:

```bash
MIRA_TOSS_SANDBOX_ACCEPTANCE_POPULATE_CONFIRM=<targetRunId> \
  npx tsx scripts/refund-sandbox-acceptance/cli.ts populate-fixtures \
  --run <targetRunId> \
  --source-run <retiredPrimaryRunId> \
  --witness-run <retiredWitnessRunId> \
  --scenario S3
```

The execution, cleanup, and purge confirmations must be absent during population. Database URLs,
Toss secrets, live-market configuration, provider-enablement flags, and refund-execution
capabilities must also be absent. Population fails rather than repairing a non-template run,
permissions, evidence, or an active mutation lock. Do not manually edit `fixtures.json` or
`fixture-population.json`. Population does not confer execution, sealing, cleanup, or purge
authorization; each remains a separate confirmation and command.

Tests use an injected test-only approval registry with synthetic run IDs and temporary roots. The
test registry fails closed if its root resolves to the real acceptance evidence root or a symlink
alias of it.

After population, inspect the template, population artifact metadata, authorized scenario, empty
ledger/evidence directories, and lock state read-only before considering execution. A publication
failure explicitly reported as ambiguous means the final artifact may already be committed. Do
not rerun population in that state, even if a temporary alias remains or durability is uncertain.
Do not rename, unlink, normalize, or repair either file. Preserve the directory and obtain human
read-only inspection of the final entry, temporary aliases, link counts, permissions, and content
contract.

A hard-link or run-lock integrity failure is also fail-closed. The canonical entry is deliberately
left observable and must not be removed automatically because it may no longer be owned by the
failing process. Human read-only inspection is required before any recovery decision. An
unexplained stale lock is never automatically recovered.

An advisory unlock response that is false or cannot be verified as exactly one successful release
is a command failure. Durable intent or completion evidence written before that failure remains the
authority for inspection and resume decisions. Inspect that history before recovery; do not simply
rerun a command if doing so could repeat provider contact.

`seal` creates the sealed and sanitized evidence for the authorized scenario. Evidence review is
read-only. `cleanup-db` removes only proven local database ownership after sealing; `purge-raw`
requires completed cleanup and removes raw artifacts under its own confirmation. Cleanup and purge
are never combined and neither is implied by population, execution, sealing, or review.

## Human database preparation

Create `wig_platform_acceptance` separately, configure `DATABASE_URL` through the operator's
environment, and apply the repository migrations as an explicit human operation. The harness
never creates, drops, resets, pushes, or migrates a database. `validate-db` verifies the configured
name, in-band identity, migration rows/checksums, Prisma schema validity, and drift.

The acceptance bootstrap does not assert or manufacture a provider cancellation. It constructs
only synthetic local preconditions inside a dedicated acceptance database. Provider eligibility
and cancellation truth remain owned by the committed Toss GET and POST ports. Refund transitions
remain owned by committed application operations.

The bootstrap writes only Market (when the exact KR reference is absent), User, completed
CheckoutSession, succeeded TOSS/SANDBOX Payment, and PAID Order. The committed refund request,
claim, lease, authorization, contact, and recovery operations exclusively own refund-domain state.

S2 simulates a provider response received by the process but lost before durable application. It
is not a TCP-level response-loss simulation.

S5 proves the application ordinal-2 recontact path. The provider observes only one cancellation
POST in S5. Provider duplicate-POST behavior is tested by S3.

Artifacts live only under `~/.mira/refund-sandbox-acceptance/<runId>/` with directory mode 0700
and file mode 0600. Raw artifacts are never placed in Git and never contain Authorization.
