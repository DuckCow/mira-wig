import { EXIMBAY_CANARY_ATTENDED_ATTESTATION_VERSION, EXIMBAY_CANARY_EXACT_MID,
  EXIMBAY_CANARY_EXACT_SECRET_RESOURCE, EXIMBAY_CANARY_EXACT_SECRET_VERSION } from "../eximbay-refund-canary-producer-contract";
export const prospectiveAttestation = Object.freeze({
  formatVersion: EXIMBAY_CANARY_ATTENDED_ATTESTATION_VERSION, provider: "EXIMBAY" as const,
  mode: "SANDBOX" as const, mid: EXIMBAY_CANARY_EXACT_MID,
  secretResource: EXIMBAY_CANARY_EXACT_SECRET_RESOURCE, secretVersion: EXIMBAY_CANARY_EXACT_SECRET_VERSION,
  officialTestCredentialMaterialized: true as const, syntheticIdentityAttested: true as const,
  controlledNonCustomerContactAttested: true as const, noCustomerPiiAttested: true as const,
});
