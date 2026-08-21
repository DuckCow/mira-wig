import type { EximbaySdkModeV1 } from "./sdk-handoff-contract";

export const EXIMBAY_SDK_ORIGINS: Readonly<Record<EximbaySdkModeV1, string>> = Object.freeze({
  SANDBOX: "https://api-test.eximbay.com",
  LIVE: "https://api.eximbay.com",
});

export const EXIMBAY_SDK_SOURCES: Readonly<Record<EximbaySdkModeV1, string>> = Object.freeze({
  SANDBOX: `${EXIMBAY_SDK_ORIGINS.SANDBOX}/v2/javascriptSDK.js`,
  LIVE: `${EXIMBAY_SDK_ORIGINS.LIVE}/v2/javascriptSDK.js`,
});
