import { runRefundWorkerContainerSupervisor } from
  "../../src/lib/payment/refund/refund-worker-container-supervisor";

process.exitCode = await runRefundWorkerContainerSupervisor(
  process.argv.slice(2),
  process.env,
  Object.freeze({ stdout: process.stdout, stderr: process.stderr }),
);
