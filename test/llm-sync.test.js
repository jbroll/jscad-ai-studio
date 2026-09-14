import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { llmInSync, SYNC_HINT, syncLlm } from "../scripts/lib/llm-sync.js";

test("the vendored jscad-fluent llm.txt matches ../jscad-fluent/llm.txt", () => {
  expect(llmInSync(), SYNC_HINT).toBe(true);
});

test("syncLlm copies the upstream file and reports a missing one", () => {
  const dir = mkdtempSync(join(tmpdir(), "llm-sync-"));
  try {
    const from = join(dir, "upstream.txt");
    const to = join(dir, "vendored.txt");
    writeFileSync(from, "new\n");
    writeFileSync(to, "old\n");
    expect(llmInSync(from, to)).toBe(false);
    expect(syncLlm(from, to)).toBe(true);
    expect(llmInSync(from, to)).toBe(true);
    expect(syncLlm(join(dir, "missing.txt"), to)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
