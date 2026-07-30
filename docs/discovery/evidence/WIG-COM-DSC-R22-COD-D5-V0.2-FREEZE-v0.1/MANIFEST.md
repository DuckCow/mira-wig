# D5 v0.2 Source-Vocabulary Freeze Evidence Manifest

## Identity

```text
EVIDENCE ID:              WIG-COM-DSC-R22-COD-D5-V0.2-FREEZE-v0.1
REPOSITORY:               DuckCow/mira-wig
GENERATION DATE:          2026-07-30
BASELINE MERGE SHA:       20ccceb0e8e98d2c8de3e7f87a867ce115a2792a
REVIEWED SOURCE HEAD:     85c1069212e41f2104b590d9df11e51a037770bf
REVIEWED SOURCE MERGE:    ad45704cc769951c645c97837b6922f5c4f2437d
FREEZE-PREP HEAD:         a7c3522d14443c45b98c916d037c4ae0bea780c6
FREEZE-PREP MERGE:        20ccceb0e8e98d2c8de3e7f87a867ce115a2792a
```

## Pull requests and CI

| Evidence | Result |
| --- | --- |
| PR #11 | merged D5-S1 source; reviewed head `85c1069212e41f2104b590d9df11e51a037770bf` |
| PR #11 CI #227 | run `30523302302`; `verify` success |
| PR #12 | merged D5 v0.2 source freeze-preparation; reviewed head `a7c3522d14443c45b98c916d037c4ae0bea780c6` |
| PR #12 CI #229 | run `30528158837`; `verify` success |
| PR #12 post-merge CI #230 | run `30529105674`; push `verify` success at `20ccceb0e8e98d2c8de3e7f87a867ce115a2792a` |

## Evidence files

- `MANIFEST.md` — snapshot identity, bound commits, CI, file inventory, and
  limitations;
- `SOURCE_FREEZE_EVIDENCE.md` — normalized repository, ancestry, source-boundary,
  registry, reason, and validation evidence;
- `SHA256SUMS.txt` — SHA-256 checksums for the normative documentation and
  bound source/test files.

## Authority limitations

This immutable snapshot proves the repository and source boundary reviewed for
the D5 v0.2 source-vocabulary freeze. It records commit ancestry, the reviewed
source/test delta, validation results, and the final registry and reason
spelling observed at the baseline.

It does not prove:

- production catalog truth or evidence;
- database population or database-row state;
- customer-visible behavior;
- production policy persistence or transport;
- ranking, retrieval activation, recommendation, events, commerce, or
  production activation.

The snapshot is descriptive evidence. Normative authority is installed by
`docs/discovery/d5-source-vocabulary-contract-v0.2.md`, the discovery README
pointer, and the decision-log freeze record.
