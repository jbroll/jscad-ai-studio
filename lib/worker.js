import { parentPort, workerData } from "node:worker_threads";
import { initOpenscad, registerScadRequire } from "./openscad.js";
import { runModelSync } from "./run-model.js";

const run = async () => {
  await initOpenscad();
  registerScadRequire();
  return runModelSync(workerData.modelPath, workerData.opts);
};

run()
  .then((result) => parentPort.postMessage(result))
  .catch((err) =>
    parentPort.postMessage({ ok: false, error: String(err.message || err), geomType: "unknown" }),
  );
