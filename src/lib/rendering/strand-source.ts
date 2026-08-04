import type { StrandAsset } from "./strand-asset";

/** Produces validated, renderer-neutral data without owning browser or GPU resources. */
export interface StrandSource {
  createAsset(): StrandAsset;
}
