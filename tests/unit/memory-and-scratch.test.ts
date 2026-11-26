import assert from "node:assert/strict";
import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const { DATA_ROOT, SCRATCH_DIRECTORY, makeScratchDirectory, cleanStaleScratch } = await import("../../src/core/db/paths");
const { getMemorySnapshot } = await import("../../src/core/memory-monitor");
const { GET } = await import("../../src/app/api/health/route");

test("large temporary files go to disk-backed scratch inside the data directory", () => {
  const directory = makeScratchDirectory("unit-");
  assert.equal(path.dirname(directory), SCRATCH_DIRECTORY);
  assert.ok(directory.startsWith(DATA_ROOT + path.sep), "scratch must live on the data volume, not the RAM-backed /tmp");
  assert.ok(existsSync(directory));
});

test("stale scratch left by a crash is removed at startup; recent entries are kept", () => {
  const stale = path.join(SCRATCH_DIRECTORY, "stale-entry");
  const fresh = path.join(SCRATCH_DIRECTORY, "fresh-entry");
  mkdirSync(stale, { recursive: true });
  mkdirSync(fresh, { recursive: true });
  writeFileSync(path.join(stale, "upload.sqlite"), "x");
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  utimesSync(stale, twoHoursAgo, twoHoursAgo);
  cleanStaleScratch();
  assert.equal(existsSync(stale), false);
  assert.equal(existsSync(fresh), true);
});

test("memory snapshot reports process usage in MB", () => {
  const snapshot = getMemorySnapshot();
  assert.ok(snapshot.rssMb > 0 && snapshot.heapUsedMb > 0);
  if (snapshot.limitMb === null) assert.equal(snapshot.rssRatio, null);
  else assert.ok(snapshot.rssRatio !== null && snapshot.rssRatio > 0);
});

test("health shows memory only to direct (in-container) callers, never through the proxy", async () => {
  const direct = await (await GET(new Request("http://127.0.0.1:3000/api/health"))).json();
  assert.equal(direct.status, "ok");
  assert.ok(direct.memory && typeof direct.memory.rssMb === "number");

  const proxied = await (await GET(new Request("http://127.0.0.1:3000/api/health", {
    headers: { "x-forwarded-for": "203.0.113.7" },
  }))).json();
  assert.equal(proxied.status, "ok");
  assert.equal(proxied.memory, undefined);
});
