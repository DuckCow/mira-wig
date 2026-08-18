# Checkout Cart Provenance Design Contract v0.1

## Scope and failure mode

Cart-backed checkout freezes an immutable commercial commitment while `CartItem` remains
mutable customer intent. Previously completion deleted by user plus purchased variant. An old
session could therefore delete quantity added after checkout, or a newly deleted-and-re-added
cart generation for the same variant.

This contract governs only successful-completion cart cleanup. `CheckoutSessionLine` remains
the authority for frozen identity, quantity, price, fulfilment, snapshot, payment, and Order
creation. `CartItem` is never commercial, payment, stock, or Order authority.

## Provenance

`CheckoutSessionLine.sourceCartItemId String?` records the exact mutable `CartItem.id` read
when a cart-backed line is frozen. It is cleanup provenance only and is not customer-visible or
stored in `snapshotData`.

The field has no foreign key. Customers may legitimately delete the source row: `Restrict`
would make that illegal, while `SetNull` would destroy the identity needed to distinguish a
later cart generation. Existing and direct/non-cart lines may remain `NULL`; completion treats
null provenance as a cleanup no-op and never falls back to variant-based deletion.

## Successful-completion cleanup

Cleanup runs inside the existing atomic completion transaction, after Order creation and stock
effects. It cannot decide whether the frozen payment commitment may create its Order.

Non-null lines use a cleanup-only copy ordered by `sourceCartItemId` ascending. For each line:

1. Lock `CartItem` with the exact predicate `id = sourceCartItemId`,
   `userId = CheckoutSession.userId`, `variantId = line.variantId`, and
   `wigStyleId = line.wigStyleId`, using `SELECT ... FOR UPDATE`.
2. Only after that lock, calculate `P`, the maximum frozen quantity among other lines with the
   same source ID, variant ID, style ID, and session user whose session has a committed `Order`.
   With no qualifying committed sibling, `P = 0`.
3. For the current frozen quantity `F`, calculate `D = max(0, F - P)`. If `D = 0`, cleanup is a
   no-op. Otherwise delete the exact source row when locked current quantity `C <= D`, or
   decrement it by `D` when `C > D`.

The row lock serializes competing completions under PostgreSQL `READ COMMITTED`. Order creation
and cleanup share one transaction, so committed sibling Orders are durable witnesses for the
successful-completion cleanup watermark. Payment status alone is not a witness. A rolled-back
transaction advances neither cart mutation nor the committed watermark.

Successful completions therefore advance an order-independent maximum frozen-quantity cleanup
watermark for one exact `CartItem` generation. Total cleanup across qualifying successful
sessions is bounded by their maximum frozen quantity, not the sum of their checkout quantities.
Equal or smaller later completions consume nothing; a later larger completion consumes only the
positive increase above the prior maximum. Quantity added after the largest completed snapshot
survives regardless of completion order.

Missing rows and identity mismatches are cleanup no-ops, not Order failures. If source `C1` was
deleted and the same variant was re-added as `C2`, lookup of `C1` finds nothing and `C2` is
untouched. Another user, variant, style, or cart generation is never searched or canonicalized.
Likewise, a committed sibling line contributes to the watermark only when source ID, session
user, variant ID, and style ID all match the current cleanup identity.

## Migration

The additive migration adds one nullable text column and one non-unique reverse-lookup index:

```sql
ALTER TABLE "CheckoutSessionLine" ADD COLUMN "sourceCartItemId" TEXT;
CREATE INDEX "CheckoutSessionLine_sourceCartItemId_idx"
ON "CheckoutSessionLine"("sourceCartItemId");
```

There is no backfill, default, foreign key, unique constraint, new table, enum, or `CartItem`
change.

## Non-goals and remaining limitations

This design adds no cart/checkout reservation, cart generation model, mutation ledger, cleanup
ledger, stock reservation, abandoned-checkout restoration, one-session enforcement, provider
change, or customer UI. It does not infer mutation history: a later absolute quantity decrease
is not a new future-intent generation. Supporting that distinction would require a separately
designed cart generation or mutation ledger. Legacy/null lines intentionally may leave stale cart
intent because conservative non-deletion is safer than deleting unproven newer intent.
