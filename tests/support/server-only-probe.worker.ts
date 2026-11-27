// Probe for worker-offload.test.ts: a worker module graph that imports the
// `server-only` marker (as src/core/db/*.ts may) must still load.
import "server-only";
import { parentPort } from "node:worker_threads";
import { SYSTEM_DB_PATH } from "../../src/core/db/paths";

parentPort?.postMessage(typeof SYSTEM_DB_PATH === "string" ? "ok" : "missing");
