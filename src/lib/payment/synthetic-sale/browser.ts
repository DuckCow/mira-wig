import { createEximbayRequestPayController } from "@/lib/payment/eximbay/sdk-invocation";

const button = document.querySelector<HTMLButtonElement>("[data-synthetic-sale-start]");
const output = document.querySelector<HTMLElement>("[data-synthetic-sale-state]");

if (button && output) {
  let invoked = false;
  button.addEventListener("click", () => {
    if (invoked) return;
    invoked = true;
    button.disabled = true;
    output.textContent = "CONTACTING";
    void start(button.dataset.startUrl ?? "", output);
  }, { once: true });
}

async function start(url: string, output: HTMLElement): Promise<void> {
  try {
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error("START_REJECTED");
    const admitted = createEximbayRequestPayController(await response.json());
    if (!admitted.ok) throw new Error("HANDOFF_REJECTED");
    const result = await admitted.controller.invoke();
    output.textContent = result.kind === "BROWSER_HANDOFF_ATTEMPTED"
      ? "CONTACTED"
      : "AMBIGUOUS";
  } catch {
    output.textContent = "AMBIGUOUS";
  }
}
