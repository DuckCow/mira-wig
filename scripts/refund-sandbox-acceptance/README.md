# Dormant manual Toss SANDBOX acceptance harness

This standalone local CLI prepares and records one bounded Toss SANDBOX acceptance scenario at a
time. It is not registered in the application, a package script, a worker, or a scheduler.

```bash
npx tsx scripts/refund-sandbox-acceptance/cli.ts plan
npx tsx scripts/refund-sandbox-acceptance/cli.ts validate-db --run <runId>
npx tsx scripts/refund-sandbox-acceptance/cli.ts validate-fixtures --run <runId>
```

Real provider execution is not authorized by this source change. A later audited act must prepare
the database and authorize each command.

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
