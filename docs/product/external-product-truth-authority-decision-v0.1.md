# External Product Truth Authority Decision v0.1

## Decision

```text
DECISION OWNER:
  PROJECT OWNER

DECISION:
  NO KNOWN EXTERNAL PRODUCT-TRUTH AUTHORITY

CONFIDENCE:
  HIGH based on project history and owner recollection

DATE:
  2026-07-31

REVIEW STATE:
  CLOSED, REOPEN ON NEW EVIDENCE
```

## Finding

The project has developed the application backend directly. No separate system
or governed process is currently known to own, approve, and version product
truth, including:

```text
PIM
supplier master feed
governed manufacturing specification master
ERP product-spec authority
separate operations database
formal approval/versioning process outside the application
```

Existing `WigStyle` and `WigVariant` fields are application catalog data, not a
sufficient Product Truth Authority.

## Decision effect

```text
INTEGRATION CONTRACT:
  NOT APPLICABLE AT PRESENT

BOUNDED INTERNAL CATALOG PRODUCT SPECIFICATION AUTHORITY:
  REQUIRED

START CONDITION:
  after Product Media Contract v0.2 completes documentation conformance and
  reviewed install

SOURCE / SCHEMA / MIGRATION AUTHORITY:
  NOT GRANTED BY THIS DECISION
```

## Reopen conditions

Reopen this decision when evidence identifies an external authority that:

```text
has real approval authority;
owns governed product facts;
has durable version/change semantics;
can identify approved-and-effective truth;
can distinguish correction from physical product change;
can supply subject and market scope.
```

If reopened, compare integration, gap-closure, and replacement options rather
than silently creating a second source of truth.
