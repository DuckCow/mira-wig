# WIG-COM-DSC-R4 — Catalog Evidence Status v0.2

## Status

```text
EVIDENCE TYPE:          DESCRIPTIVE SNAPSHOT
SNAPSHOT ID:            WIG-COM-DSC-R3-COD-B0-v0.1
OBSERVED COMMIT:        a963af6aea6c01c1ac4d2041d6140e664418f78b
OBSERVED DATE:          2026-07-29
DATABASE SCOPE:         local development and local test, read-only
CURRENTNESS:            VALID ONLY UNDER §2
CHANGE CONTROL:         supersedes: summary draft v0.1 | superseded-by: none
```

This document is descriptive evidence, not normative authority.

## Scope

Summarizes the dated B0 reconnaissance. Raw evidence is preserved under:

[`evidence/WIG-COM-DSC-R3-COD-B0-v0.1/`](./evidence/WIG-COM-DSC-R3-COD-B0-v0.1/)

Use raw files when asserting exact current schema, counts, coverage, or source behavior.

## 1. Readiness verdict at the observed snapshot

```text
NOT READY — NO REPRESENTATIVE CATALOG
```

The local development population matched the committed seed/demo population:

- 10 active styles;
- 108 active variants;
- 3 active markets;
- 324 variant-market prices;
- 10 demo cover images;
- no gallery or variant-specific catalog images;
- 108 MTO and zero stocked seed variants.

The local test catalog was empty.

## 2. Invalidation and supersession

This snapshot becomes stale when any of the following occurs:

- relevant catalog, schema, seed, media, fitting, cart, checkout, or offer source changes after the observed commit;
- the observed database is reseeded, replaced, or materially changed;
- a newer snapshot exists for the same scope.

Snapshots are immutable. Create a new dated directory and summary; do not edit raw B0 files.

The README must point to exactly one current evidence-status summary.

If repository HEAD differs from the observed commit, an integration or work task must inspect relevant changed paths before using this document as a current-state claim. Unrelated changes do not erase the historical evidence, but they may invalidate currentness.

## 3. Represented current capabilities at B0

- style and variant identity;
- variant-to-style FK;
- style-level market publication;
- variant-market price;
- SKU and stock field;
- fulfillment class;
- free-form color, length, and curl;
- style cover/gallery key slots;
- checkout/order display and financial snapshots.

## 4. Missing or inadequate evidence capabilities at B0

- audience namespace in catalog schema;
- localized catalog text;
- structured hair material and authenticity grade;
- measurement method/tolerance;
- normalized color code/family;
- bangs, silhouette, parting, hairline ontology;
- cap/base, lace, attachment, fit;
- lead time;
- per-attribute provenance and evidence references;
- claim substantiation;
- image roles, rights, and variant ownership;
- consultation/measurement requirements;
- offer/specification versions.

## 5. Critical findings at B0

### Blockers

- no representative catalog;
- no claim/product-attribute evidence;
- cart may hold incoherent style and variant identities;
- market-language claim disclosure is not ready.

### Important

- `MEDICAL` is overloaded and is not certification evidence;
- demo medical/chemotherapy/low-irritation/comfort/hair-loss/naturalness language lacks linked evidence;
- exact option-specific landing is absent;
- color, length, and curl are free-form and authority-unknown;
- all demo cover images have `UNKNOWN_ROLE`;
- publication-with-missing-price discovery eligibility is unresolved.

## 6. Interpretation

A populated field or visible phrase is evidence of current software/data behavior. It is not automatically verified truth, approved vendor attestation, a launch ontology, a production recommendation signal, or an allowed claim.

Raw evidence includes local paths as observed provenance. Preserve its bytes and checksums; do not treat those paths as normative repository locations.

## 7. Highest-information next evidence

1. immutable representative active catalog export;
2. material truth sample by vendor/product scope/missingness;
3. market-specific product/legal claim review;
4. variant landing/cart identity cases;
5. governed image-role and rights inventory.
