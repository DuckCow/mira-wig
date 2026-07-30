# Schema, seed, and structured-attribute inventory

## Schema representation

`WigStyle` owns style identity, name, description, enum `category`, free-form
`tags`, images, sort order, active state, variants, and style-market
publication (`prisma/schema.prisma:134-165`). `WigVariant` owns the canonical
style FK, free-form `color`, optional `colorHex`, free-form `length` and
`curl`, legacy KRW `price`, stock, unique SKU, active state, enum
`fulfillmentType`, and market prices (`prisma/schema.prisma:167-187`).

Schema-enforced sets:

- `WigCategory`: `HAIR_LOSS`, `FASHION`, `COSPLAY`, `TOPPER`, `MEDICAL`
  (`prisma/schema.prisma:134-140`);
- `FulfillmentType`: `MTO`, `STOCKED`
  (`prisma/schema.prisma:142-145`);
- canonical SKU uniqueness (`prisma/schema.prisma:177`);
- one market price per variant/market and one publication row per
  style/market (`prisma/schema.prisma:107-128`).

Unconstrained attribute text:

- `WigVariant.color`, `length`, `curl`;
- `WigStyle.tags[]`, `name`, and `description`;
- optional `colorHex` is a string, not schema-validated color evidence.

There is no default-variant field or relation. Variant order on detail is SKU
ascending, but the client begins with no selected color, length, or curl
(`src/lib/catalog.ts:103-127`;
`src/app/(shop)/styles/[id]/VariantSelector.tsx:209-225`). SKU order therefore
does not silently establish a default.

## Complete committed seed value sets

Seed construction writes:

- colors: `블랙`, `다크브라운`, `자연갈색`, `애쉬브라운`, `허니블론드`,
  `버건디`, `로즈핑크`, `애쉬그레이`, `화이트`;
- lengths: `short`, `medium`, `long`;
- curls: `straight`, `wavy`, `curly`;
- categories: all five `WigCategory` literals;
- tags (distinct): `생머리`, `탈모`, `자연스러움`, `미디`, `데일리`,
  `볼륨`, `웨이브`, `패션`, `여름`, `레이어드`, `글램`, `고급`, `컬`,
  `코스프레`, `개성`, `쇼트`, `토퍼`, `정수리`, `커버`, `의료용`,
  `항암`, `저자극`, `편안함`, `착용감`.

The color/length/curl constants are at `prisma/seed.ts:57-75`; all style
definitions and tags are at `prisma/seed.ts:91-197`. `makeVariants` copies
their string values without a database constraint (`prisma/seed.ts:35-54`).
They are controlled-looking demo values, not a governed ontology.

The seed declares all variants with stock `50`; the schema default
fulfillment is `MTO`, and the seed does not override it
(`prisma/seed.ts:29-54`; `prisma/schema.prisma:176-179`).

## Claim and use-context language

Committed descriptions/tags include hair-loss cover, naturalness, medical,
chemotherapy, low-irritation, scalp fit, comfort, and wearability language.
Examples appear at `prisma/seed.ts:93-107` and `176-195`. The seed contains no
linked substantiation, vendor attestation, evidence reference, market-specific
claim approval, or provenance per attribute. `MEDICAL` and `HAIR_LOSS` are
therefore display/use-context classifications, not certification or claim
authority.

## Missing structured authority

Current schema and seed do not represent governed material, authenticity
(Remy/virgin/origin), medical certification, bangs, part, silhouette,
cap/base/lace, attachment, fit/size, numeric length measurement method/unit,
lead time, comfort/naturalness/breathability evidence, or per-attribute
provenance/conflict state.
