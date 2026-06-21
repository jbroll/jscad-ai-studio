import { Worker } from "node:worker_threads";

const WORKER = new URL("./worker.js", import.meta.url);

export const runModel = (modelPath, opts = {}) => {
  const { timeoutMs = 10000, ...rest } = opts;
  return new Promise((resolve) => {
    const worker = new Worker(WORKER, { workerData: { modelPath, opts: rest } });
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(value);
    };
    const timer = setTimeout(
      () => finish({ ok: false, error: "timeout", geomType: "unknown" }),
      timeoutMs,
    );
    worker.on("message", finish);
    worker.on("error", (err) =>
      finish({ ok: false, error: String(err.message || err), geomType: "unknown" }),
    );
  });
};
