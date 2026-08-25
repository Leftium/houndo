import { gg } from "@houndo/gg";

import { verifyDocument } from "../verifier/browser.js";

const marker = "HOUNDO_VERIFY ";
const title = document.querySelector("#lab-title");
const status = document.querySelector("#lab-status");
const detail = document.querySelector("#lab-detail");
const preview = document.querySelector("#preview");
const runtimeErrors = [];

function setStatus(value, message) {
  status.value = value;
  status.dataset.status = value;
  detail.textContent = message;
}

async function start() {
  try {
    const response = await fetch("/__houndo/state", { cache: "no-store" });
    if (!response.ok) {
      setStatus("waiting", "No prepared issue is selected yet.");
      return;
    }

    const { state, assertions } = await response.json();
    title.textContent = `Issue ${state.issueId}: ${state.query}`;
    setStatus("loading", `Loading ${state.captureId} (${state.renderer})...`);

    preview.addEventListener("error", () => {
      runtimeErrors.push("Preview iframe failed to load.");
    });
    preview.addEventListener(
      "load",
      () => {
        try {
          const record = verifyDocument({
            document: preview.contentDocument,
            assertions,
            state,
            runtimeErrors,
          });
          setStatus(
            record.status,
            record.status === "pass"
              ? "All deterministic assertions passed. Human visual review is still required."
              : [...record.failures, ...record.inconclusive].join(" "),
          );
          gg(marker + JSON.stringify(record)).ns("houndo-verifier");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setStatus("inconclusive", message);
          gg(marker + JSON.stringify({
            schemaVersion: 1,
            type: "houndo.verify.complete",
            complete: true,
            status: "inconclusive",
            issueId: state.issueId,
            captureId: state.captureId,
            hashes: state.hashes,
            verifiedAt: new Date().toISOString(),
            failures: [],
            inconclusive: [message],
            runtimeErrors,
          })).ns("houndo-verifier").error();
        }
      },
      { once: true },
    );
    preview.src = `/__houndo/preview?candidate=${state.hashes.candidate}`;
  } catch (error) {
    setStatus(
      "inconclusive",
      error instanceof Error ? error.message : String(error),
    );
  }
}

start();
