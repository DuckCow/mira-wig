import type { DiscoveryComponentVersions } from "./types";

export const DISCOVERY_COMPONENT_VERSIONS: DiscoveryComponentVersions = {
  requestSchema: "d5-source-only-request/v0.2-provisional",
  normalizer: "d5-conservative-normalizer/v0.1",
  parser: "d5-injected-span-parser/v0.1",
  constraintRules: "d5-constraint-decisions/v0.2",
  fixtureSnapshot: "d5-golden-cases/v0.2-provisional",
};
