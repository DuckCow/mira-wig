# Live Media-Adjacent Security and Catalog Defect Register v0.3

## Status

```text
DISPOSITION:
  CURRENT-STATE RECONCILIATION

BASELINE:
  main 52e97898e79ee57ba9aae35758bc22b47b1a23e0
  tree  8c94386a5d13e9aa2c5a4e1b0d4ec726077c0d89

HISTORICAL REGISTER:
  v0.2 is the audited-baseline register and is preserved unchanged

RISK ACCEPTANCE:
  NONE

PRODUCT MEDIA SEMANTIC SOURCE AUTHORITY:
  NOT GRANTED
```

This v0.3 record reconciles the current installed source, focused tests, and
governing documentation at the exact baseline above. It does not claim that
the historical defects never existed. It replaces v0.2 as the current status
record without rewriting v0.2 or changing Product Media authority.

## Current status

| ID | Current disposition | Current owner / boundary | Current status basis or next bounded task |
|---|---|---|---|
| LBD-01 | `CLOSED_BY_INSTALLED_SOURCE` | Catalog admin and catalog storage admission | New admin-mediated cover assignment is namespace-, shape-, and existence-admitted before persistence. Historical/legacy values are not retroactively migrated. |
| LBD-02 | `CLOSED_BY_INSTALLED_SOURCE` | Fitting source-key validation | The authenticated user ID is bound to the exact `user-upload/{owner}/{filename}` key before variant lookup, DB creation, or provider request. |
| LBD-03 | `OPEN_INSTALLED_DEFECT` | `src/app/api/mock-storage/route.ts` and mock storage boundary | Non-production `PUT`/`GET` accepts arbitrary query keys without authentication or key-purpose authorization. The smallest next task is a bounded mock-route contract for authentication, namespace, and upload-limit behavior with route-level negative tests. |
| LBD-04 | `OPEN_INSTALLED_DEFECT` | Catalog upload/presign and storage provider boundary | Presign MIME admission and `Content-Type` are not actual uploaded-byte, size, or decode verification. The smallest next task is a server-owned catalog upload verification/finalization boundary. |
| LBD-05 | `INVESTIGATE_NOT_YET_PROVEN` | Catalog admin revalidation and public storefront runtime | The admin action revalidates `/admin/styles` only, while public pages generate cover URLs in listing, PDP, related cards, and cart. Those pages read request context and declare no application cache/tag policy, but the deployed Next/runtime/proxy cache behavior is not established by the installed source or tests. The smallest next task is a read-only local/deployment cache-behavior probe and path map. |
| LBD-06 | `CLOSED_BY_INSTALLED_SOURCE` | Commerce integrity, cart, checkout session, payment initiation, and completion | The canonical variant parent is checked before cart/session writes and reasserted before order/manufacturing-request writes; malformed existing cart rows remain unavailable rather than being repaired. |
| LBD-07 | `CLOSED_BY_INSTALLED_SOURCE` | Canonical publication and purchasability predicates | Listing and direct PDP use the same market-publication predicate; active related-card reads add active market-priced-variant admission, while cart, checkout, and payment initiation use the canonical purchasability predicate. The historical direct-PDP bypass is no longer present. |

## Exact evidence for closed dispositions

### LBD-01 — catalog cover-key admission

Current responsibility is split between the storage namespace and the admin
write boundary:

- `src/lib/storage/mock.ts` `buildMockKey` and `src/lib/storage/s3.ts`
  `buildKey` generate `wig-style/{uuid}.{ext}` for catalog uploads.
- `src/app/actions/admin/catalog.ts`
  `getCoverImageUploadUrlAction` requires the admin guard and allows only the
  three catalog image MIME types. `updateStyleAction` passes the selected
  `catalogStorage` to the domain owner.
- `src/lib/catalog-admin/index.ts` `CATALOG_COVER_KEY_RE` and
  `admitCoverImageMutation` require the exact `wig-style/` namespace, bounded
  filename shape, supported extension, and `storage.exists` before
  `db.wigStyle.update`.

Focused evidence is in
`src/lib/catalog-admin/__tests__/catalog-admin.test.ts` (valid/invalid,
missing-object, existing-key, and non-string admission cases) and
`src/app/actions/__tests__/admin-catalog.test.ts` (admin/MIME boundary). The
mock provider's existence behavior is covered by
`src/app/api/mock-storage/route.test.ts`.

This closes the current admin-mediated arbitrary-key persistence path. It does
not retroactively clean historical database rows or promote legacy
`coverImageKey` values into Product Media semantic authority.

### LBD-02 — fitting source-key owner binding

`src/lib/fitting/validation.ts` `validateSourceKey` rejects URLs, requires the
three-segment `user-upload/{ownerId}/{filename}` shape, and requires the path
owner to equal the expected authenticated owner. In
`src/lib/fitting/db.ts`, `startFitting` calls it before variant lookup,
`Fitting` creation, or provider request. The action boundary in
`src/app/actions/fitting.ts` supplies `session.user.id`.

`src/lib/fitting/__tests__/fitting.test.ts` proves a foreign-owner key returns
`SOURCE_KEY_INVALID` before variant/provider and DB effects. This is the
current boundary that prevents the historical cross-owner source-key failure.

### LBD-06 — cart/variant parent integrity

`src/lib/commerce-integrity.ts`
`variantPurchasableInMarketFailure` rejects a selected style whose ID differs
from the variant's canonical `wigStyleId`.

- `src/lib/cart.ts` checks the requested pair before the cart upsert and checks
  the aggregate row after the upsert.
- `src/lib/payment/session/create.ts` applies the same predicate before
  creating checkout-session lines.
- `src/lib/payment/attempt/initiate.ts` revalidates frozen commerce lines at
  contact authorization.
- `src/lib/payment/complete/transaction.ts` `guardCommerceIntegrity` checks
  every frozen line before order creation, stock decrement, cart-provenance
  consumption, or manufacturing-request creation.

Focused evidence includes the forged-pair and malformed-cart cases in
`src/lib/__tests__/cart.integration.test.ts` and the completion rejection case
in `src/lib/payment/complete/__tests__/complete.integration.test.ts`.
The governing C0 contract requires the same-parent invariant and independent
session/finalization reassertion in
`docs/discovery/configuration-to-order-bounded-contract-v0.1.md` §§4.3 and
13.1.

### LBD-07 — publication-predicate parity

`src/lib/commerce-integrity.ts` owns
`stylePublishedInMarketWhere` and
`variantPurchasableInMarketFailure`.

- `src/lib/catalog.ts` uses `stylePublishedInMarketWhere` for both listing and
  direct style detail.
- `src/lib/manual-item-relations/public.ts` uses the same publication
  predicate for source and target styles and additionally requires an active
  market-priced variant for a related card.
- `src/lib/cart.ts`, `src/lib/payment/session/create.ts`, and
  `src/lib/payment/attempt/initiate.ts` use the canonical purchasability
  predicate at cart/read, session, and payment-contact boundaries. Related
  cards use the shared publication predicate plus their stage-specific active
  market-priced-variant requirement.
- `src/lib/payment/complete/transaction.ts` preserves the separately frozen
  checkout commitment while still reasserting parent identity; this
  stage-specific behavior is not a direct-PDP publication bypass.

`src/lib/__tests__/catalog.integration.test.ts` proves that an unpublished
market excludes a style from both listing and direct detail. Cart publication,
market-switch, and fail-closed cases are covered in
`src/lib/__tests__/cart.integration.test.ts`. Active related-card publication
and market-priced-variant filtering are covered in
`src/lib/manual-item-relations/__tests__/public.integration.test.ts`.
The canonical meanings and parity acceptance criteria are recorded in
`docs/discovery/configuration-to-order-bounded-contract-v0.1.md` §§4.1–4.4 and
13.2.

## Remaining open and investigative boundaries

### LBD-03 — unauthenticated arbitrary-key mock route

`src/app/api/mock-storage/route.ts` has a production-only 404 guard, but in
non-production `PUT` accepts any non-empty `key` query value and stores the
request body, while `GET` serves an uploaded object, canned demo object, or
fallback for any query key. There is no session/authentication check and no
purpose/namespace check at this route boundary.

`src/app/api/mock-storage/route.test.ts` intentionally demonstrates successful
arbitrary-byte PUT/GET state and fallback behavior. The installed WRR-03A
catalog-key admission does not close this independent route authorization
defect.

Next bounded task: define and implement, under separate source authority, the
mock route's authentication, key-purpose/namespace, and size behavior, with
negative tests for arbitrary-key reads and writes. This v0.3 document grants no
such implementation authority.

### LBD-04 — missing uploaded-byte verification

`src/app/actions/admin/catalog.ts` checks the requested upload MIME type before
presign. `src/lib/storage/s3.ts` signs a `PutObject` with `ContentType`, but no
server-owned byte count, maximum-size, checksum, or image-decode verification
is present. The mock route in
`src/app/api/mock-storage/route.ts` stores `req.arrayBuffer()` without those
checks. Its focused test accepts four arbitrary bytes while labeling them
`image/png`.

Next bounded task: define a catalog-specific upload finalize/verification
boundary that checks server-observed bytes, size, and decode before a key can be
admitted to catalog metadata. This v0.3 document grants no implementation
authority.

### LBD-05 — public cover cache/revalidation fact not established

`src/app/actions/admin/catalog.ts` revalidates only `/admin/styles` after a
style update. Public listing and PDP call `catalogStorage.getViewUrl` for the
persisted cover key; related cards and cart do so through their own public
presentation paths. The public pages also call
`src/lib/market/resolve.ts` `getStorefrontContext`, which reads request cookies
and headers, and the repository declares no explicit public `revalidate`,
`unstable_cache`, cache tags, or cover-change revalidation map.

That is insufficient to call the finding closed. It is also insufficient to
call it an installed runtime defect without the deployed rendering/cache
behavior: request-time rendering may mean no application page cache exists,
while a deployment or proxy cache could still affect freshness. The next task
is therefore read-only investigation of built-route behavior, response cache
headers, deployment cache policy, and the complete public path set. No source
implementation, provider contact, or risk acceptance follows from this status.

## Product Media non-authority guardrail

```text
No task may use this register to add Product Media schema, assignment semantics,
rights models, readiness, migration, or enforcement without a separate contract.

Any source fix must preserve existing customer/commerce behavior except for the
specific defect and must include rollback and regression evidence.
```

The current status record does not authorize Product Media source, schema,
migration, storage-provider, deployment, customer-publication, checkout, or
machine-use changes. It also does not grant risk acceptance for any non-closed
item.

## History and current-next-task discipline

`docs/discovery/product-media-live-boundary-defect-register-v0.2.md` remains
the byte-preserved historical audited-baseline register. Its historical exact
next planning task is not carried forward here because LBD-01, LBD-02, LBD-06,
and LBD-07 have current installed closure evidence. Future work should use only
the bounded next tasks stated for LBD-03, LBD-04, and LBD-05 above.
