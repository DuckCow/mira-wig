BEGIN;

CREATE TYPE "PaymentAdapterExecutionKind" AS ENUM ('MOCK', 'EXTERNAL');

ALTER TABLE "Payment"
ADD COLUMN "adapterExecutionKind" "PaymentAdapterExecutionKind";

COMMIT;
