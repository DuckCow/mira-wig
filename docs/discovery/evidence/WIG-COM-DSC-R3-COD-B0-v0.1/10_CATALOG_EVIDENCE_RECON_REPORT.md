# WIG-COM-DSC-R3 Catalog Evidence Reconnaissance

## 1. Repository authority

- Repository: `/Users/duckcow/workspace/mira`
- Branch: `main`
- HEAD: `a963af6aea6c01c1ac4d2041d6140e664418f78b`
- `origin/main`: `a963af6aea6c01c1ac4d2041d6140e664418f78b`
- Latest commit: `a963af6 fix(payment): harden public webhook ingress`
- Initial worktree, index, and untracked inventory: clean.
- Governing sources read: `AGENTS.md`, `CLAUDE.md`, `docs/collaboration-protocol.md`, `package.json`, `prisma.config.ts`, `prisma/schema.prisma`, relevant migrations, environment configuration without credential disclosure, seed, catalog owners, admin owners, market/price owners, fitting, cart, checkout-session, completion/order snapshot owners, tests, and fixtures.
- Every attached package file was read. All six workbook sheets were inspected in memory. The bundled spreadsheet renderer could not load because macOS rejected its signed native dependency, so workbook cell content and table definitions were read directly from OOXML without modifying or exporting the workbook.

Current schema and production source were treated as authoritative over prose history.

## 2. Data-source inventory

The active catalog truth path is:

1. `WigStyle` owns style-level identity, one unlocalized title/description, category, tags, activity, and style image keys.
2. `WigVariant` owns variant identity and parent FK, free-form color/length/curl, unique SKU, stock, activity, and fulfillment class.
3. `WigStyleMarket` owns style-level market publication.
4. `VariantMarketPrice` owns variant × market price.
5. `src/lib/catalog.ts` creates customer listing/detail projections.
6. Catalog-admin modules mutate the same rows but do not record evidence or provenance.
7. Cart, checkout, and order layers consume catalog identity and snapshot selected display/financial facts.

No catalog importer, vendor feed, catalog CSV loader, provenance register, evidence owner, or claim evidence relation was found.

The complete source classification is in `01_CATALOG_SOURCE_INVENTORY.csv`.

## 3. Database safety and source representativeness

Two database configurations were found without printing credentials:

| Database | Host | Port | Classification | Access |
| --- | --- | ---: | --- | --- |
| `wig_platform` | loopback (`::1`) | 5432 | local development | aggregate catalog reads in a transaction verified `read_only=on` |
| `wig_platform_test` | loopback (`::1`) | 5432 | test | aggregate catalog reads in a transaction verified `read_only=on` |

The development classification was not inferred from hostname alone. Repository evidence uses `wig_platform` as the default development database and explicitly labels it “development database,” while acceptance is separately named `wig_platform_acceptance`.

The local development population exactly fingerprints the committed demo seed:

- 10 of 10 style names match the seed.
- 108 of 108 variants match seed SKU prefixes.
- 10 of 10 cover keys use `demo-catalog/`.
- Aggregate market, publication, price, fulfillment, stock, and category counts match the seed.

Therefore `wig_platform` is `SEED_OR_DEMO`, not representative planning data. `wig_platform_test` contained three active markets and zero catalog products.

No acceptance, remote, cloud, shared, or production database was accessed.

## 4. Catalog schema capability

Represented and used:

- style→variant identity;
- style-level market publication;
- variant-market price and currency through Market;
- SKU;
- stock;
- fulfillment class;
- free-form variant color, length, and curl;
- style-level cover/gallery key slots;
- checkout/order snapshots.

Partially represented or overloaded:

- length is a string such as `short|medium|long`, not a measurement with units/method/tolerance;
- texture is a free-form `curl` string;
- color is a free-form display value plus optional hex, not a governed color family or vendor namespace;
- `MEDICAL` is a structured category used in filtering and display, but cannot represent certification;
- cover versus gallery position exists, but required evidence image roles do not.

Not represented:

- audience namespace;
- localized product title/description;
- hair material, Remy/virgin/authenticity grade;
- length measurement method;
- vendor color code;
- bangs/fringe, silhouette ontology, parting, hairline features;
- cap construction, lace dimensions, attachment method, cap size, fit range;
- lead time;
- claim evidence and per-attribute provenance;
- image evidence;
- consultation/measurement requirements;
- offer/specification version.

See `02_SCHEMA_CAPABILITY_MATRIX.csv`.

## 5. Catalog population census

Development demo population:

- 3 active markets.
- 10 active styles.
- 108 active variants.
- 30 active style-market publication rows.
- 324 variant-market prices: 108 for each market.
- 0 active published variants missing a price in any configured market.
- 108 MTO variants; 0 STOCKED variants.
- Every variant has stock 50.
- Product families: HAIR_LOSS 2 styles/24 variants; FASHION 2/24; COSPLAY 2/24; TOPPER 2/12; MEDICAL 2/24.
- 10 styles have a cover key; 0 have gallery keys.
- Localized title/description coverage is blank, not zero, because localized product text is not representable.

These counts are useful only to describe the demo. They are not representative demand, vendor, evidence, coverage, or launch-catalog measurements.

See `03_CATALOG_POPULATION_CENSUS.csv`.

## 6. Attribute-evidence census

No product attribute has an explicit provenance state or evidence reference.

- Hair material, Remy/virgin, certification, heat tolerance, hypoallergenic, cap/attachment/fit, bangs, parting, hairline, and claim evidence are not representable.
- All 108 demo variants carry length, curl, and color values, but their authority is unknown. Their population does not make them verified.
- All 108 variants inherit active publication in each market and carry an operational fulfillment value, but no source record explains who authorized those values.
- The 24 variants under MEDICAL styles are not counted as medically certified.
- Free-text mentions are not promoted to structured facts.

No current claim-bearing attribute is safe for evidence-qualified hard filtering.

See `04_ATTRIBUTE_EVIDENCE_CENSUS.csv`.

## 7. Claim-bearing phrase findings

Current source contains no repository catalog matches for human hair, Remy, virgin, hypoallergenic, heat resistance/tolerance, undetectable hairline, or equivalent Japanese product claims.

The committed demo seed does contain customer-facing Korean phrases for:

- `의료용`;
- `항암`;
- `저자극`;
- `편안함`;
- `착용감`;
- `탈모`;
- naturalness/optimization wording.

These phrases are marketing or merchandising copy with no evidence reference. Exact name or tag queries can affect inclusion, and `MEDICAL` category affects filtering and customer-visible labels. The current local development database contains the same demo rows.

All attached Claim_Authority rows remain `UNRESOLVED` and `NOT_REVIEWED`.

See `05_CLAIM_PHRASE_AND_USE_REGISTER.csv`.

## 8. Variant-resolution findings

- `WigVariant.wigStyleId` structurally guarantees a canonical parent.
- Listing unit and URL are style-level; no variant is encoded in `/styles/{styleId}`.
- Detail selection begins empty and remains client-local, so a length/color/SKU-specific result cannot land on the exact option.
- Cards show the minimum variant price, not an option-specific result price.
- `CartItem` stores separate style and variant FKs. Neither schema nor `addToCart` proves that the supplied style owns the supplied variant.
- Cart display reads the stored style relation, while checkout snapshots the variant’s canonical style. A mismatched cart row can therefore change displayed product identity between cart and checkout while keeping the variant-derived amount.
- Checkout and order preserve variant ID, unit amount, fulfillment, and display snapshot. SKU and style ID are not in snapshot data.
- Variant family grouping exists only within one WigStyle.

See `06_VARIANT_RESOLUTION_GAP_REGISTER.csv`.

## 9. Localization and ontology gaps

- Markets are KR/US/JP with default locales ko/en/ja.
- Language has no independent runtime axis.
- Product titles/descriptions are one shared field and are Korean in the demo across all markets.
- Most storefront and option labels are Korean in all markets.
- Fitting alone has ko/en/ja static strings selected from market default locale; unknown locale falls back to Korean.
- Search uses a case-insensitive name substring or exact tag membership. There is no alias type, synonym graph, transliteration, misspelling handling, locale scope, market overlay, or canonical concept ID.
- Query text and market selection are mechanically separate, but one shared Korean catalog corpus prevents real multilingual retrieval.
- Bangs/fringe, parting, hairline, base construction, and vendor color code are not structurally representable.

See `07_LOCALIZATION_AND_ONTOLOGY_GAPS.csv`.

## 10. Image-role readiness

The demo has 10 style cover keys and no gallery keys. Schema cannot assign any required role:

`FRONT`, `SIDE`, `BACK`, `TOP_OR_PART`, `HAIRLINE_CLOSEUP`, `BASE_INTERIOR`, `PRODUCT_ONLY`, `MODEL_WORN`, or `COLOUR_REFERENCE`.

All 10 covers are therefore recorded as `UNKNOWN_ROLE`. No role was inferred from filename or image content. Variant-level media ownership and image evidence do not exist. The catalog is not visual-search ready.

No private customer image was opened.

See `08_IMAGE_ROLE_COVERAGE.csv`.

## 11. Findings

### Blocker

1. **No representative catalog exists in the safe sources.** The development catalog is the committed demo seed and the test catalog is empty.
2. **No claim evidence or attribute provenance exists.** Claim-bearing filtering cannot distinguish verified, vendor-declared, curated, missing, or conflicting product facts.
3. **Cart style/variant coherence is not guaranteed.** Cart presentation and checkout snapshot can disagree on product style identity.
4. **Required market-language claim disclosures are not ready.** Product copy is Korean across markets and claim authority remains unresolved.

### Important

1. MEDICAL category is used as structured filtering/display but is overloaded with use context and possible certification meaning.
2. Claim-bearing demo copy can affect retrieval or customer display without evidence.
3. Exact variant landing does not exist; option-specific discovery would lose selected identity.
4. Length, texture, and color values are free-form and have no provenance.
5. Required image roles and product/variant media ownership are absent.
6. Style publication can be activated despite missing variant prices; current purchase paths fail closed, but discovery eligibility remains undefined.

### Minor

1. Order snapshots omit SKU and style ID while retaining variant ID and display fields.
2. General catalog localization is absent, while fitting has a small market-derived localization seam.

### No issue

1. Repository baseline and final authority checks are clean and aligned with origin/main.
2. Variant→style FK is structurally present.
3. Market price is variant-specific and checkout/order amounts are snapshotted rather than re-read.
4. Both inspected local databases were queried only in verified read-only transactions.

### Unresolved

1. Vendor attestation acceptance and QC standing by market/attribute.
2. Medical/certification authority by market.
3. Whether any current MEDICAL copy should remain filterable or customer-visible.
4. Representative catalog source and sampling owner.
5. Image role/content ownership source.

## 12. Discovery Evidence Pack readiness

**NOT READY — NO REPRESENTATIVE CATALOG**

The registers can be populated with schema gaps and demo observations, but no truthful launch-catalog evidence distribution, missing-value estimate, vendor mismatch rate, or image-role coverage can be derived from the current safe sources.

## 13. Highest-information next samples

1. An authority-approved immutable export of a representative active catalog, including product/variant IDs, market publication, vendor/source system, and any existing provenance/evidence references.
2. A physical/QC material-category truth sample stratified by market, vendor, product family, and current missingness.
3. Product/legal review of all current MEDICAL/항암/저자극/편안함 wording and every market claim-authority row.
4. Representative variant-landing and CartItem style/variant coherence cases.
5. A Content Ops inventory that explicitly maps each image to product/variant and one governed image role.

## 14. Product/legal decisions required

- Whether any vendor attestation is acceptable for customer-facing material or grade assertions.
- Vendor QC-standing criteria.
- Meaning and allowed customer use of MEDICAL category by market.
- Whether medical, Remy/virgin, safety, heat, hypoallergenic, comfort, or naturalness language is filterable, educational, consultative, or unsupported.
- Required attribution/disclosure for approved evidence.
- Handling of conflicting evidence and unknown products.
- Whether current demo claim copy is acceptable even as nonrepresentative development data.

No decision was resolved by this reconnaissance.

## 15. Explicit exclusions

- No search, ranking, recommendation, visual-search, catalog correction, schema design, or implementation.
- No migration proposal.
- No product/legal conclusion.
- No external terminology research or web browsing.
- No external API, storage, payment, or AI provider call.
- No customer, order, payment, address, private upload, or complete sensitive payload export.
- No test suite, migration, seed, formatter, or modifying database command.

## 16. Final repository and database safety state

### Required self-audit

| Falsification attempt | Result |
| --- | --- |
| 1. Populated field mistaken for verified truth | No issue — populated demo values remain UNKNOWN_AUTHORITY. |
| 2. Test/seed data mistaken for representative catalog | No issue — development is SEED_OR_DEMO; test is EMPTY. |
| 3. Free text promoted to structured attribute | No issue — all free-text claims remain marketing/display text. |
| 4. Missing count recorded as zero | No issue — unsupported/unobserved counts are blank or NOT_REPRESENTABLE; exact zeros are explicitly justified. |
| 5. Vendor declaration called approved without owner | No issue — no vendor declaration was identified or approved. |
| 6. Market and locale collapsed | No issue — gaps are reported separately. |
| 7. Product/style and variant facts mixed | No issue — item levels and inherited publication are stated explicitly. |
| 8. Current behavior mistaken for frozen desired contract | No issue — current behaviors are observations/gaps only. |
| 9. Customer image data accessed | No issue — none accessed. |
| 10. Read-only command mutated data | No issue — both database sessions verified `transaction_read_only=on`; no modifying statement ran. |
| 11. Claim-authority row resolved without product/legal authority | No issue — every row remains UNRESOLVED. |
| 12. Inferred image role presented as explicit | No issue — all demo covers are UNKNOWN_ROLE. |
| 13. Local DB assumed non-production only from hostname | No issue — repository naming/conventions, explicit development classification, loopback identity, and seed fingerprint were combined. |
| 14. Catalog metric unnecessarily included order/customer/payment rows | No issue — census queries touched catalog/market tables only. |
| 15. Output written inside repository | No issue — all outputs are under the required `/tmp` directory. |

Final repository checks confirm:

- worktree, index, and untracked inventory remain clean;
- HEAD remains `a963af6aea6c01c1ac4d2041d6140e664418f78b`;
- HEAD remains equal to `origin/main`;
- all task-created outputs are under `/tmp/wig_com_dsc_r3_catalog_evidence_recon_v0_1/`.
