# D5 v0.2 Source Freeze Evidence

## Snapshot scope

```text
EVIDENCE ID:          WIG-COM-DSC-R22-COD-D5-V0.2-FREEZE-v0.1
OBSERVED DATE:        2026-07-30
OBSERVED BASELINE:    20ccceb0e8e98d2c8de3e7f87a867ce115a2792a
REPOSITORY SCOPE:     committed source, tests, documentation, and GitHub CI
DATABASE SCOPE:       none
PRODUCTION AUTHORITY: none
```

The command results below were captured or normalized from the clean baseline
before the documentation-freeze changes.

## Baseline identity

Command:

```bash
git rev-parse HEAD
```

Result:

```text
20ccceb0e8e98d2c8de3e7f87a867ce115a2792a
```

Command:

```bash
git rev-parse origin/main
```

Result:

```text
20ccceb0e8e98d2c8de3e7f87a867ce115a2792a
```

## Freeze-preparation merge topology

Command:

```bash
git show -s --format='%H%n%P%n%s' 20ccceb0e8e98d2c8de3e7f87a867ce115a2792a
```

Result:

```text
20ccceb0e8e98d2c8de3e7f87a867ce115a2792a
ad45704cc769951c645c97837b6922f5c4f2437d a7c3522d14443c45b98c916d037c4ae0bea780c6
Merge pull request #12 from DuckCow/chore/discovery-d5-v0.2-source-freeze-prep
```

Command:

```bash
git merge-base --is-ancestor a7c3522d14443c45b98c916d037c4ae0bea780c6 20ccceb0e8e98d2c8de3e7f87a867ce115a2792a
```

Normalized result:

```text
exit 0 — a7c3522d14443c45b98c916d037c4ae0bea780c6 is an ancestor
```

Command:

```bash
git merge-base --is-ancestor 85c1069212e41f2104b590d9df11e51a037770bf 20ccceb0e8e98d2c8de3e7f87a867ce115a2792a
```

Normalized result:

```text
exit 0 — 85c1069212e41f2104b590d9df11e51a037770bf is an ancestor
```

## Reviewed freeze-preparation source/test boundary

Command:

```bash
git diff --name-status ad45704cc769951c645c97837b6922f5c4f2437d..a7c3522d14443c45b98c916d037c4ae0bea780c6
```

Result:

```text
M	src/lib/discovery/__tests__/categorical-policy.test.ts
M	src/lib/discovery/__tests__/types.test.ts
M	src/lib/discovery/decide-constraint.ts
M	src/lib/discovery/retrieval/__tests__/landing-event.test.ts
M	src/lib/discovery/types.ts
M	src/lib/discovery/versions.ts
```

Production source changes in that reviewed delta were limited to:

- replacing the stylistic model reason with
  `MODEL_INFERRED_STYLISTIC_HAS_NO_ASSERTION_AUTHORITY` in `types.ts` and the
  existing model-inferred stylistic decision branch in
  `decide-constraint.ts`;
- promoting only `constraintRules` to
  `d5-constraint-decisions/v0.2` in `versions.ts`.

The remaining changes were source-vocabulary, behavioral, compatibility, and
D6-A attribution tests. No parser, normalizer, or retrieval production source
changed.

## Clean baseline

Command:

```bash
git status --short --untracked-files=all
```

Result:

```text
(empty)
```

## Validation evidence

| Validation | Result |
| --- | --- |
| PR #11 CI #227 | run `30523302302`; success at `85c1069212e41f2104b590d9df11e51a037770bf` |
| PR #12 CI #229 | run `30528158837`; success at `a7c3522d14443c45b98c916d037c4ae0bea780c6` |
| Post-merge PR #12 CI #230 | run `30529105674`; push `verify` success at `20ccceb0e8e98d2c8de3e7f87a867ce115a2792a` |
| PR #12 targeted tests | 3 files / 53 tests passed |
| PR #12 discovery suite | 13 files / 178 tests passed |
| PR #12 full verification | typecheck passed; lint passed; 189 files / 4,881 tests passed |

## Final D5 registry at baseline

Observed in `src/lib/discovery/versions.ts`:

```text
requestSchema:   d5-source-only-request/v0.2-provisional
normalizer:      d5-conservative-normalizer/v0.1
parser:          d5-injected-span-parser/v0.1
constraintRules: d5-constraint-decisions/v0.2
fixtureSnapshot: d5-golden-cases/v0.2-provisional
```

Only the constraint-rules v0.2 value is newly promoted. The request schema and
golden fixture remain provisional.

## Promoted stylistic model reason at baseline

Observed in `src/lib/discovery/types.ts` and
`src/lib/discovery/decide-constraint.ts`:

```text
MODEL_INFERRED_STYLISTIC_HAS_NO_ASSERTION_AUTHORITY
```

The reviewed behavior denies assertion authority for a required product match.
It does not prohibit a future separately governed bounded,
non-authoritative stylistic ranking signal. The broad prior string
`MODEL_INFERRED_STYLISTIC_HAS_NO_AUTHORITY` is removed from active source
vocabulary.

## Evidence limitations

This snapshot does not assert database population, product evidence, catalog
truth, customer-visible output, production policy transport, or activation.
It does not authorize D5-S2, D6-B1 source, ranking, adapters, events, commerce,
or production behavior.
