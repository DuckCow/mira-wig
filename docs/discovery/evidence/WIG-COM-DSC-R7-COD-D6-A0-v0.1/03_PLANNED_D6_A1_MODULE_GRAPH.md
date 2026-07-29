# Planned D6-A1 Module Graph

```text
OBSERVED MAIN: 2cbdfe3af7e333c28da66ebb588984a4428089ec
STATUS:        PROVISIONAL PLAN; NOT SOURCE AUTHORIZATION
```

## Planned ownership

```text
src/lib/discovery/
├── types.ts                         frozen D5 vocabulary owner
├── versions.ts                      frozen D5 registry owner
├── normalize-query.ts               frozen D5 normalization owner
├── parse-query.ts                   frozen D5 parsing owner
├── decide-constraint.ts             frozen D5 decision owner
└── retrieval/                       additive D6 subtree; names provisional
    ├── types.ts                     D6 fixture/request/result vocabulary
    ├── versions.ts                  provisional D6 component versions
    ├── exact-fixture-retriever.ts   exact injected fixture lookup
    ├── candidate-admission.ts       single mandatory choke point
    ├── landing.ts                   pure exact landing intent/proof
    ├── event-seam.ts                injected disabled-by-default seam
    └── __tests__/
        ├── fixtures/**              synthetic retrieval-only fixtures
        └── **                       D6-A1 behavior and boundary tests
```

No `index.ts` barrel is planned or authorized.

## Dependency direction

```text
frozen D5 output/types
        ↓
exact request applicability
        ↓
injected exact fixture source
        ↓
injected catalog identity proof
        ↓
single candidate-admission choke point
        ↓
exact result + pure landing intent/proof
        ↓
default-off injected event seam
```

Allowed dependencies:

- frozen D5 discovery types/functions;
- other pure D6 retrieval modules;
- type-only market types when genuinely required.

Prohibited dependencies:

- Prisma or `@/lib/db`;
- `next/**`, `src/app/**`, cookies, headers, routes, or current time;
- production catalog, cart, payment, fitting, storage, network, provider, or
  analytics modules;
- test fixtures imported by production modules.

## Boundary-test refinement

At observed main, `src/lib/discovery/__tests__/boundary.test.ts` intentionally
asserts the five reviewed D5 production files. A future explicit D6-A1 task may
update that test to permit the additive subtree while continuing to assert:

- the five D5 responsibilities and dependency direction are unchanged;
- all D6 production modules remain pure;
- prohibited runtime imports are absent;
- retrieval fixtures remain test-only.

Exact module names, type names, result fields, status labels, and provisional
version identifiers are reviewed after A1 tests and are not frozen by this
graph.
