import type {
  ExactIdentityRecognition,
  ExactIdentityRecognizer,
} from "../../types";

function recognizeFixtureSku(comparisonText: string): ExactIdentityRecognition[] {
  const recognitions: ExactIdentityRecognition[] = [];
  const pattern = /\bsku-[a-z]+-\d{3}\b/gu;

  for (const match of comparisonText.matchAll(pattern)) {
    recognitions.push({
      normalizedRange: {
        startInclusive: match.index,
        endExclusive: match.index + match[0].length,
      },
      namespace: "SKU",
      canonicalValue: match[0].toUpperCase(),
    });
  }

  return recognitions;
}

export const TEST_IDENTITY_RECOGNIZERS: readonly ExactIdentityRecognizer[] = [
  {
    recognizerId: "fixture:identity-recognizer:sku",
    version: "fixture:identity-recognizer:sku/v0.2",
    recognize: recognizeFixtureSku,
  },
];
