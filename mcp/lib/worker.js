import { parentPort, workerData } from "node:worker_threads";
import { runModelSync } from "./run-model.js";

try {
  const result = runModelSync(workerData.modelPath, workerData.opts);
  parentPort.postMessage(result);
} catch (err) {
  parentPort.postMessage({ ok: false, error: String(err.message || err), geomType: "unknown" });
}
