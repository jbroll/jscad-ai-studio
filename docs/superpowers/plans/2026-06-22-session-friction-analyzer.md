# Session Friction Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only CLI that reconstructs OpenCode + Claude Code session transcripts, flags friction, and reports it grouped by which prompt to improve.

**Architecture:** Two readers normalize each agent's local transcripts into one shape; `friction.js` runs deterministic heuristics; an optional `--llm` Ollama pass adds qualitative findings; a report groups everything by prompt. All in `scripts/`, reusing the catalog's Ollama client.

**Tech Stack:** Node 22 ESM; `node:fs`/`node:os`/`node:path`; the existing `scripts/lib/ollama-client.js`; vitest.

## Global Constraints

- **ESM**, Node built-ins only (plus the existing `ollama-client.js`). No new deps.
- **Read-only** over transcripts; never write to or delete agent storage.
- **Normalized `Transcript` shape** (the reader↔analysis contract):
  `{ agent: "opencode"|"claude", sessionId, cwd: string|null, model: string|null, startedAt: number|null, turns: [{ role: "user"|"assistant", text, toolCalls: [{ tool, status: "ok"|"error", error?, input? }] }], events: { compactions: number } }`.
- **OpenCode storage** `~/.local/share/opencode/storage/`: session file has `{ id, directory, time, model? }` (`directory` IS the cwd); messages `message/<sessionId>/*.json` (`{ id, role, time, model }`); parts `part/<messageId>/*.json` (`text`/`reasoning`→`.text`; `tool`→`{tool, state:{status,error,input}}`, `state.status==="error"` = failed; `compaction`).
- **Claude storage** `~/.claude/projects/<encoded-cwd>/<uuid>.jsonl`: dir name decodes to cwd (leading `-`→`/`, `-`→`/`); records `type:"user"|"assistant"` with `message.content` blocks (`text`; `tool_use {id,name,input}`; `tool_result {tool_use_id, is_error, content}`); summaries → compaction.
- **`--llm` uses the catalog's Ollama client** (`makeOllamaClient`, `messages.create({messages})→{content:[{text}]}`); selected when `OLLAMA_HOST` is set; on failure, warn and fall back to heuristics-only (never crash the run).
- **knip:** add `scripts/analyze-sessions.js` to `knip.json` `entry` (it is a CLI imported by nothing). Lib modules are reached via it + their tests.
- Hygiene: every commit passes Lefthook + `npm run knip` clean (run knip explicitly — the TS-glob hook doesn't gate this JS repo). `npm test` = `vitest run`.

## File Structure

| File | Responsibility |
|---|---|
| `scripts/lib/transcript.js` | `isJscadWorkSession(t)`, `ts(x)` time helper. |
| `scripts/lib/transcript-opencode.js` | `readOpencodeSessions(opts) → Transcript[]`. |
| `scripts/lib/transcript-claude.js` | `readClaudeSessions(opts) → Transcript[]`. |
| `scripts/lib/friction.js` | `analyzeFriction(t) → FrictionResult`. |
| `scripts/lib/friction-llm.js` | `llmFriction(client, t) → { summary, promptFixes }`. |
| `scripts/lib/session-report.js` | `renderReport(results) → markdown`. |
| `scripts/analyze-sessions.js` | CLI orchestrator. |
| `test/*.test.js` | one per lib module. |
| `knip.json` | add the CLI to `entry`. |

---

### Task 1: OpenCode reader + shared helpers

**Files:**
- Create: `scripts/lib/transcript.js`, `scripts/lib/transcript-opencode.js`, `test/transcript-opencode.test.js`

**Interfaces:**
- Produces: `isJscadWorkSession(t)→bool`, `ts(x)→number` (transcript.js); `readOpencodeSessions({storageDir?})→Transcript[]`.

- [ ] **Step 1: Write the failing test `test/transcript-opencode.test.js`**

```js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { readOpencodeSessions } from "../scripts/lib/transcript-opencode.js";

const dirs = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const build = () => {
  const root = mkdtempSync(join(tmpdir(), "oc-")); dirs.push(root);
  const w = (p, o) => { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), JSON.stringify(o)); };
  w("session/proj1/ses_A.json", { id: "ses_A", directory: "/work/widget", time: { created: 100 }, model: "qwen" });
  w("message/ses_A/msg_1.json", { id: "msg_1", role: "user", time: { created: 101 } });
  w("message/ses_A/msg_2.json", { id: "msg_2", role: "assistant", time: { created: 102 }, model: "qwen" });
  w("part/msg_1/p1.json", { type: "text", text: "make a cube", time: { created: 101 } });
  w("part/msg_2/p1.json", { type: "text", text: "running eval", time: { created: 102 } });
  w("part/msg_2/p2.json", { type: "tool", tool: "eval", state: { status: "error", error: "boom", input: { modelPath: "m.js" } }, time: { created: 103 } });
  w("part/msg_2/p3.json", { type: "compaction", time: { created: 104 } });
  return root;
};

test("reconstructs sessions: cwd, model, turns, tool error, compactions", () => {
  const [t] = readOpencodeSessions({ storageDir: build() });
  expect(t.agent).toBe("opencode");
  expect(t.sessionId).toBe("ses_A");
  expect(t.cwd).toBe("/work/widget");
  expect(t.model).toBe("qwen");
  expect(t.turns).toHaveLength(2);
  expect(t.turns[0]).toMatchObject({ role: "user", text: "make a cube" });
  const call = t.turns[1].toolCalls[0];
  expect(call).toMatchObject({ tool: "eval", status: "error", error: "boom" });
  expect(t.events.compactions).toBe(1);
});

test("missing storage dir → []", () => {
  expect(readOpencodeSessions({ storageDir: "/no/such/dir" })).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/transcript-opencode.test.js` → FAIL (module not found).

- [ ] **Step 3: Create `scripts/lib/transcript.js`**

```js
import { existsSync } from "node:fs";
import { join } from "node:path";

// Normalize a time field that may be a number or { created }.
export const ts = (x) => (typeof x === "number" ? x : (x?.created ?? 0));

// A jscad-work session: cwd holds JSCAD.md/AGENTS.md, or a jscad tool was used.
export const isJscadWorkSession = (t) => {
  if (t.cwd && (existsSync(join(t.cwd, "JSCAD.md")) || existsSync(join(t.cwd, "AGENTS.md")))) return true;
  return t.turns.some((turn) => turn.toolCalls.some((c) => /jscad/i.test(c.tool || "")));
};
```

- [ ] **Step 4: Create `scripts/lib/transcript-opencode.js`**

```js
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ts } from "./transcript.js";

const DEFAULT_STORAGE = join(homedir(), ".local/share/opencode/storage");
const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const listJson = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : []);

export const readOpencodeSessions = ({ storageDir = DEFAULT_STORAGE } = {}) => {
  const sessRoot = join(storageDir, "session");
  if (!existsSync(sessRoot)) return [];
  const out = [];
  for (const projDir of readdirSync(sessRoot)) {
    for (const sf of listJson(join(sessRoot, projDir))) {
      const session = readJson(join(sessRoot, projDir, sf));
      if (!session?.id) continue;
      const sessionId = session.id;
      const msgDir = join(storageDir, "message", sessionId);
      const messages = listJson(msgDir)
        .map((m) => readJson(join(msgDir, m)))
        .filter(Boolean)
        .sort((a, b) => ts(a.time) - ts(b.time));
      const turns = [];
      let compactions = 0;
      let model = session.model ?? null;
      for (const msg of messages) {
        model = model || msg.model || null;
        const partDir = join(storageDir, "part", msg.id);
        const parts = listJson(partDir)
          .map((p) => readJson(join(partDir, p)))
          .filter(Boolean)
          .sort((a, b) => ts(a.time) - ts(b.time));
        let text = "";
        const toolCalls = [];
        for (const part of parts) {
          if (part.type === "text" || part.type === "reasoning") text += `${part.text || ""}\n`;
          else if (part.type === "tool")
            toolCalls.push({
              tool: part.tool,
              status: part.state?.status === "error" ? "error" : "ok",
              error: part.state?.error,
              input: part.state?.input,
            });
          else if (part.type === "compaction") compactions++;
        }
        turns.push({ role: msg.role, text: text.trim(), toolCalls });
      }
      out.push({
        agent: "opencode",
        sessionId,
        cwd: session.directory ?? null,
        model,
        startedAt: ts(session.time) || null,
        turns,
        events: { compactions },
      });
    }
  }
  return out;
};
```

- [ ] **Step 5: Run + commit**

Run: `npx vitest run test/transcript-opencode.test.js` → PASS (2). Run: `npm test` → green; `npm run knip` → clean (consumed by the test; `isJscadWorkSession` consumed in Task 5 — it is also exercised in Task 3's friction test indirectly; if knip flags it now, it is genuinely used by the CLI in Task 5, so leave it and re-check at Task 5).
```bash
git add scripts/lib/transcript.js scripts/lib/transcript-opencode.js test/transcript-opencode.test.js
git commit -m "feat(analyzer): OpenCode transcript reader + shared helpers"
```
Note: if `npm run knip` flags `isJscadWorkSession` as unused at this task (no consumer yet), add a direct unit test for it in this test file (assert a transcript whose `toolCalls` include a `jscad-studio_eval` is jscad-work) so it has real coverage now.

---

### Task 2: Claude reader

**Files:**
- Create: `scripts/lib/transcript-claude.js`, `test/transcript-claude.test.js`

**Interfaces:**
- Produces: `readClaudeSessions({projectsDir?})→Transcript[]` (same normalized shape).

- [ ] **Step 1: Write the failing test `test/transcript-claude.test.js`**

```js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { readClaudeSessions } from "../scripts/lib/transcript-claude.js";

const dirs = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

test("reconstructs a session with a failed tool_result and decoded cwd", () => {
  const root = mkdtempSync(join(tmpdir(), "cc-")); dirs.push(root);
  const proj = join(root, "-work-widget"); mkdirSync(proj, { recursive: true });
  const lines = [
    { type: "permission-mode", permissionMode: "default" },
    { type: "user", timestamp: "2026-06-22T00:00:00Z", message: { role: "user", content: "make a cube" } },
    { type: "assistant", message: { role: "assistant", model: "claude-x", content: [
      { type: "text", text: "running eval" },
      { type: "tool_use", id: "tu_1", name: "eval", input: { modelPath: "m.js" } },
    ] } },
    { type: "user", message: { role: "user", content: [
      { type: "tool_result", tool_use_id: "tu_1", is_error: true, content: "boom" },
    ] } },
  ];
  writeFileSync(join(proj, "sess1.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n"));

  const [t] = readClaudeSessions({ projectsDir: root });
  expect(t.agent).toBe("claude");
  expect(t.sessionId).toBe("sess1");
  expect(t.cwd).toBe("/work/widget");
  expect(t.model).toBe("claude-x");
  const call = t.turns.flatMap((x) => x.toolCalls).find((c) => c.tool === "eval");
  expect(call).toMatchObject({ status: "error", error: "boom" });
});

test("missing projects dir → []", () => {
  expect(readClaudeSessions({ projectsDir: "/no/such/dir" })).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run test/transcript-claude.test.js` → FAIL.

- [ ] **Step 3: Create `scripts/lib/transcript-claude.js`**

```js
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_PROJECTS = join(homedir(), ".claude/projects");

// "-home-john-src-foo" -> "/home/john/src/foo" (best-effort; used only for filtering/labeling)
const decodeCwd = (name) => `/${name.replace(/^-/, "").replace(/-/g, "/")}`;

export const readClaudeSessions = ({ projectsDir = DEFAULT_PROJECTS } = {}) => {
  if (!existsSync(projectsDir)) return [];
  const out = [];
  for (const proj of readdirSync(projectsDir)) {
    const dir = join(projectsDir, proj);
    let files;
    try { files = readdirSync(dir).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
    for (const file of files) {
      const turns = [];
      const pending = new Map();
      let model = null;
      let compactions = 0;
      let startedAt = null;
      for (const line of readFileSync(join(dir, file), "utf8").split("\n")) {
        if (!line.trim()) continue;
        let rec;
        try { rec = JSON.parse(line); } catch { continue; }
        if (rec.isCompactSummary || rec.type === "summary") { compactions++; continue; }
        if (rec.type !== "user" && rec.type !== "assistant") continue;
        if (startedAt === null && rec.timestamp) startedAt = Date.parse(rec.timestamp) || null;
        const msg = rec.message || {};
        model = model || msg.model || null;
        let text = "";
        const toolCalls = [];
        const content = msg.content;
        if (typeof content === "string") text = content;
        else if (Array.isArray(content)) {
          for (const b of content) {
            if (b.type === "text") text += `${b.text}\n`;
            else if (b.type === "tool_use") {
              const c = { tool: b.name, status: "ok", input: b.input };
              pending.set(b.id, c);
              toolCalls.push(c);
            } else if (b.type === "tool_result") {
              const c = pending.get(b.tool_use_id);
              if (c && b.is_error) {
                c.status = "error";
                c.error = typeof b.content === "string" ? b.content : JSON.stringify(b.content);
              }
            }
          }
        }
        if (text.trim() || toolCalls.length) turns.push({ role: rec.type, text: text.trim(), toolCalls });
      }
      out.push({
        agent: "claude",
        sessionId: file.replace(/\.jsonl$/, ""),
        cwd: decodeCwd(proj),
        model,
        startedAt,
        turns,
        events: { compactions },
      });
    }
  }
  return out;
};
```
Note: the `tool_result` arrives in a later `user` record than the `tool_use`; `pending` persists across the session and we mutate the call object by reference, so the assistant turn's `toolCalls` entry reflects the error.

- [ ] **Step 4: Run + commit** — `npx vitest run test/transcript-claude.test.js` → PASS (2); `npm test` green; `npm run knip` clean.
```bash
git add scripts/lib/transcript-claude.js test/transcript-claude.test.js
git commit -m "feat(analyzer): Claude Code transcript reader"
```

---

### Task 3: Friction heuristics

**Files:**
- Create: `scripts/lib/friction.js`, `test/friction.test.js`

**Interfaces:**
- Produces: `analyzeFriction(t) → { sessionId, agent, cwd, signals: { toolErrors, evalErrors, retries, compactions, bootstrapMiss, constraintHits }, score }`. `toolErrors`/`evalErrors` are `{ count, samples:[{tool,error}] }`; `retries`/`compactions` numbers; `bootstrapMiss` boolean; `constraintHits` `[{ kind, snippet }]`.

- [ ] **Step 1: Write the failing test `test/friction.test.js`**

```js
import { expect, test } from "vitest";
import { analyzeFriction } from "../scripts/lib/friction.js";

const mk = (over) => ({ agent: "opencode", sessionId: "s", cwd: "/w", turns: [], events: { compactions: 0 }, ...over });

test("flags eval errors, retries, compactions, and scores > 0", () => {
  const t = mk({
    events: { compactions: 2 },
    turns: [
      { role: "assistant", text: "", toolCalls: [
        { tool: "eval", status: "error", error: "X is not defined", input: { modelPath: "m.js" } },
        { tool: "eval", status: "error", error: "still broken", input: { modelPath: "m.js" } },
      ] },
    ],
  });
  const r = analyzeFriction(t);
  expect(r.signals.toolErrors.count).toBe(2);
  expect(r.signals.evalErrors.count).toBe(2);
  expect(r.signals.retries).toBeGreaterThanOrEqual(1); // same tool+target repeated
  expect(r.signals.compactions).toBe(2);
  expect(r.score).toBeGreaterThan(0);
});

test("flags a degrees-not-radians constraint hit", () => {
  const t = mk({ turns: [{ role: "assistant", text: "geom.rotate([0,0,90])", toolCalls: [] }] });
  const r = analyzeFriction(t);
  expect(r.signals.constraintHits.some((h) => h.kind === "degrees")).toBe(true);
});

test("clean session scores 0 with no signals", () => {
  const r = analyzeFriction(mk({ turns: [{ role: "assistant", text: "looks good", toolCalls: [{ tool: "measure", status: "ok" }] }] }));
  expect(r.score).toBe(0);
  expect(r.signals.toolErrors.count).toBe(0);
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run test/friction.test.js` → FAIL.

- [ ] **Step 3: Create `scripts/lib/friction.js`**

```js
const targetOf = (input) => {
  if (!input || typeof input !== "object") return "";
  return input.modelPath || input.filePath || input.path || input.file || Object.values(input)[0] || "";
};

const countRetries = (calls) => {
  let retries = 0;
  for (let i = 1; i < calls.length; i++) {
    if (calls[i].tool === calls[i - 1].tool && targetOf(calls[i].input) === targetOf(calls[i - 1].input)) retries++;
  }
  return retries;
};

const CONSTRAINTS = [
  { kind: "degrees", re: /\brotate\w*\s*\(\s*\[?[^)]*\b(45|90|135|180|270|360)\b/i },
  { kind: "color255", re: /\bcolor\w*\s*\(\s*\[?[^)]*\b(1\d\d|2[0-4]\d|25[0-5])\b/i },
];

export const analyzeFriction = (t) => {
  const calls = t.turns.flatMap((turn) => turn.toolCalls || []);
  const errors = calls.filter((c) => c.status === "error");
  const evalErrors = errors.filter((c) => /(^|[_.])eval$/i.test(c.tool || ""));
  const sample = (arr) => arr.slice(0, 5).map((c) => ({ tool: c.tool, error: String(c.error ?? "").slice(0, 200) }));

  const text = t.turns.map((turn) => turn.text || "").join("\n");
  const usedJscadWork = calls.some((c) => /jscad/i.test(c.tool || "")) || /jscad-work/.test(text);
  const startConfusion = /how (do|to)\b.*\b(start|run|launch)/i.test(text) || /which (file|model)/i.test(text);
  const bootstrapMiss = !!t.cwd && !usedJscadWork && startConfusion;

  const constraintHits = [];
  for (const turn of t.turns) {
    const hay = `${turn.text || ""} ${JSON.stringify(turn.toolCalls?.map((c) => c.input) ?? "")}`;
    for (const { kind, re } of CONSTRAINTS) {
      const m = hay.match(re);
      if (m) constraintHits.push({ kind, snippet: m[0].slice(0, 80) });
    }
  }

  const signals = {
    toolErrors: { count: errors.length, samples: sample(errors) },
    evalErrors: { count: evalErrors.length, samples: sample(evalErrors) },
    retries: countRetries(calls),
    compactions: t.events?.compactions ?? 0,
    bootstrapMiss,
    constraintHits,
  };
  const score =
    signals.evalErrors.count * 5 +
    (signals.toolErrors.count - signals.evalErrors.count) * 2 +
    signals.retries * 3 +
    signals.compactions * 1 +
    (signals.bootstrapMiss ? 4 : 0) +
    signals.constraintHits.length * 2;
  return { sessionId: t.sessionId, agent: t.agent, cwd: t.cwd, signals, score };
};
```

- [ ] **Step 4: Run + commit** — `npx vitest run test/friction.test.js` → PASS (3); `npm test` green; `npm run knip` clean.
```bash
git add scripts/lib/friction.js test/friction.test.js
git commit -m "feat(analyzer): deterministic friction heuristics"
```

---

### Task 4: LLM pass + report renderer

**Files:**
- Create: `scripts/lib/friction-llm.js`, `scripts/lib/session-report.js`, `test/friction-llm.test.js`, `test/session-report.test.js`

**Interfaces:**
- Produces: `llmFriction(client, t) → { summary, promptFixes: [{ prompt, issue, suggestion }] }`; `renderReport(results) → string` (markdown). `results` are `analyzeFriction` outputs, each optionally with `.llm` attached.

- [ ] **Step 1: Write failing tests**

`test/friction-llm.test.js`:
```js
import { expect, test } from "vitest";
import { llmFriction } from "../scripts/lib/friction-llm.js";

const stub = (text) => ({ messages: { create: async () => ({ content: [{ text }] }) } });
const t = { agent: "opencode", sessionId: "s", cwd: "/w", turns: [{ role: "assistant", text: "eval failed", toolCalls: [{ tool: "eval", status: "error", error: "X is not defined" }] }], events: { compactions: 0 } };

test("parses the model's JSON into summary + promptFixes", async () => {
  const json = JSON.stringify({ summary: "agent fought the API", promptFixes: [{ prompt: "llm.txt", issue: "unclear import", suggestion: "show require line" }] });
  const r = await llmFriction(stub(json), t);
  expect(r.summary).toMatch(/API/);
  expect(r.promptFixes[0]).toMatchObject({ prompt: "llm.txt" });
});

test("returns an empty result on unparseable output (no throw)", async () => {
  const r = await llmFriction(stub("not json"), t);
  expect(r).toEqual({ summary: "", promptFixes: [] });
});
```

`test/session-report.test.js`:
```js
import { expect, test } from "vitest";
import { renderReport } from "../scripts/lib/session-report.js";

test("renders summary, by-prompt section, and per-session rows", () => {
  const results = [
    { sessionId: "s1", agent: "opencode", cwd: "/w", score: 12,
      signals: { toolErrors: { count: 2, samples: [] }, evalErrors: { count: 2, samples: [{ tool: "eval", error: "X is not defined" }] }, retries: 1, compactions: 0, bootstrapMiss: true, constraintHits: [] },
      llm: { summary: "fought the API", promptFixes: [{ prompt: "JSCAD.md", issue: "bootstrap", suggestion: "say run jscad-work" }] } },
    { sessionId: "s2", agent: "claude", cwd: "/x", score: 0,
      signals: { toolErrors: { count: 0, samples: [] }, evalErrors: { count: 0, samples: [] }, retries: 0, compactions: 0, bootstrapMiss: false, constraintHits: [] } },
  ];
  const md = renderReport(results);
  expect(md).toMatch(/## Summary/);
  expect(md).toMatch(/## By prompt/);
  expect(md).toMatch(/JSCAD\.md/);
  expect(md).toMatch(/s1/);
  expect(md).toMatch(/2 sessions/);
});
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run test/friction-llm.test.js test/session-report.test.js` → FAIL.

- [ ] **Step 3: Create `scripts/lib/friction-llm.js`**

```js
const MAX_TEXT = 6000;

const condense = (t) => {
  const lines = [];
  for (const turn of t.turns) {
    if (turn.text) lines.push(`${turn.role}: ${turn.text}`);
    for (const c of turn.toolCalls || []) {
      lines.push(`  tool ${c.tool} -> ${c.status}${c.status === "error" ? `: ${String(c.error ?? "").slice(0, 200)}` : ""}`);
    }
  }
  return lines.join("\n").slice(0, MAX_TEXT);
};

const buildPrompt = (t) =>
  `You are improving the prompts that guide an AI through a jscad-fluent CAD modeling session ` +
  `(prompts: AGENTS.md = startup/bootstrap, JSCAD.md = session context, llm.txt = jscad-fluent API, skill = library search). ` +
  `Read this ${t.agent} session transcript and reply with ONLY JSON (no prose, no fences): ` +
  `{"summary": one sentence on where the agent struggled, ` +
  `"promptFixes": [{"prompt": one of "AGENTS.md"|"JSCAD.md"|"llm.txt"|"skill", "issue": short, "suggestion": concrete edit}]}. ` +
  `Empty promptFixes if the session was smooth.\n\nTRANSCRIPT:\n${condense(t)}`;

const tryParse = (text) => {
  try {
    const m = String(text).match(/\{[\s\S]*\}/);
    const o = JSON.parse(m ? m[0] : text);
    return { summary: String(o.summary ?? ""), promptFixes: Array.isArray(o.promptFixes) ? o.promptFixes : [] };
  } catch {
    return null;
  }
};

export const llmFriction = async (client, t) => {
  const ask = async () => {
    const res = await client.messages.create({ model: undefined, max_tokens: 500, messages: [{ role: "user", content: buildPrompt(t) }] });
    const text = res.content?.map((b) => b.text ?? "").join("") ?? "";
    return tryParse(text);
  };
  return (await ask()) ?? (await ask()) ?? { summary: "", promptFixes: [] };
};
```

- [ ] **Step 4: Create `scripts/lib/session-report.js`**

```js
const PROMPTS = ["AGENTS.md", "JSCAD.md", "llm.txt", "skill"];

export const renderReport = (results) => {
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const total = sorted.length;
  const withErrors = sorted.filter((r) => r.signals.toolErrors.count > 0).length;
  const evalErrs = sorted.reduce((n, r) => n + r.signals.evalErrors.count, 0);

  const lines = [];
  lines.push("# Session Friction Report", "");
  lines.push("## Summary", "");
  lines.push(`- ${total} sessions analyzed`);
  lines.push(`- ${withErrors} with tool errors; ${evalErrs} eval failures total`);
  lines.push(`- ${sorted.filter((r) => r.signals.bootstrapMiss).length} bootstrap misses`);
  lines.push("");

  // By prompt: collect LLM promptFixes + deterministic mappings
  lines.push("## By prompt", "");
  const byPrompt = Object.fromEntries(PROMPTS.map((p) => [p, []]));
  for (const r of sorted) {
    if (r.signals.bootstrapMiss) byPrompt["AGENTS.md"].push(`${r.sessionId}: started without running jscad-work`);
    for (const h of r.signals.constraintHits) byPrompt["llm.txt"].push(`${r.sessionId}: possible ${h.kind} — \`${h.snippet}\``);
    for (const fix of r.llm?.promptFixes ?? []) {
      const key = PROMPTS.includes(fix.prompt) ? fix.prompt : "JSCAD.md";
      byPrompt[key].push(`${r.sessionId}: ${fix.issue} → ${fix.suggestion}`);
    }
  }
  for (const p of PROMPTS) {
    if (!byPrompt[p].length) continue;
    lines.push(`### ${p}`, "");
    for (const item of byPrompt[p]) lines.push(`- ${item}`);
    lines.push("");
  }

  lines.push("## Sessions (by score)", "");
  lines.push("| score | agent | session | eval err | tool err | retries | compactions | bootstrap | cwd |");
  lines.push("|--:|---|---|--:|--:|--:|--:|:-:|---|");
  for (const r of sorted) {
    const s = r.signals;
    lines.push(`| ${r.score} | ${r.agent} | ${r.sessionId} | ${s.evalErrors.count} | ${s.toolErrors.count} | ${s.retries} | ${s.compactions} | ${s.bootstrapMiss ? "✗" : ""} | ${r.cwd ?? ""} |`);
  }
  lines.push("");
  return lines.join("\n");
};
```

- [ ] **Step 5: Run + commit** — `npx vitest run test/friction-llm.test.js test/session-report.test.js` → PASS (4); `npm test` green; `npm run knip` clean.
```bash
git add scripts/lib/friction-llm.js scripts/lib/session-report.js test/friction-llm.test.js test/session-report.test.js
git commit -m "feat(analyzer): Ollama friction pass + report renderer"
```

---

### Task 5: CLI orchestrator

**Files:**
- Create: `scripts/analyze-sessions.js`
- Modify: `knip.json` (add the CLI to `entry`)

**Interfaces:**
- Consumes: all Task 1–4 exports + `makeOllamaClient` from `scripts/lib/ollama-client.js`.

- [ ] **Step 1: Add the CLI to `knip.json` `entry`**

Add `"scripts/analyze-sessions.js"` to the `entry` array (alongside `scripts/build-catalog.js`).

- [ ] **Step 2: Create `scripts/analyze-sessions.js`**

```js
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeFriction } from "./lib/friction.js";
import { llmFriction } from "./lib/friction-llm.js";
import { renderReport } from "./lib/session-report.js";
import { isJscadWorkSession } from "./lib/transcript.js";
import { readClaudeSessions } from "./lib/transcript-claude.js";
import { readOpencodeSessions } from "./lib/transcript-opencode.js";

const PLUGIN_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));

const main = async () => {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const useLlm = args.includes("--llm");
  const toStdout = args.includes("--stdout");

  const sessions = [...readOpencodeSessions(), ...readClaudeSessions()];
  const filtered = all ? sessions : sessions.filter(isJscadWorkSession);
  console.error(`analyzing ${filtered.length}/${sessions.length} sessions${all ? "" : " (jscad-work; --all for all)"}`);

  let client = null;
  if (useLlm && process.env.OLLAMA_HOST) {
    const { makeOllamaClient } = await import("./lib/ollama-client.js");
    client = makeOllamaClient({ host: process.env.OLLAMA_HOST, model: process.env.OLLAMA_MODEL });
  } else if (useLlm) {
    console.error("--llm set but OLLAMA_HOST is not — falling back to heuristics-only");
  }

  const results = [];
  for (const t of filtered) {
    const r = analyzeFriction(t);
    if (client) {
      try { r.llm = await llmFriction(client, t); } catch (e) { console.error(`llm failed for ${t.sessionId}: ${e.message}`); }
    }
    results.push(r);
  }

  const md = renderReport(results);
  if (toStdout) { process.stdout.write(`${md}\n`); return; }
  const date = new Date().toISOString().slice(0, 10);
  const outDir = resolve(PLUGIN_ROOT, "docs/session-analysis");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${date}-friction.md`);
  writeFileSync(outPath, `${md}\n`);
  console.error(`wrote ${outPath}`);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```
(`new Date()` is fine here — this is a normal Node script, not a Workflow script.)

- [ ] **Step 3: Smoke-run the CLI + verify**

Run: `node scripts/analyze-sessions.js --stdout` → prints a report over local jscad-work sessions (or "0 sessions" cleanly if none match) without error.
Run (heuristics over everything): `node scripts/analyze-sessions.js --all --stdout | head -40`.
Run: `npm test` (green), `npm run knip` (clean — the CLI is now an `entry`, so all lib modules are reachable), `lefthook run pre-commit` (clean).

- [ ] **Step 4: Commit**

```bash
git add scripts/analyze-sessions.js knip.json
git commit -m "feat(analyzer): analyze-sessions CLI (OpenCode + Claude friction report)"
```

---

## Self-Review

**Spec coverage:**
- Two readers, normalized shape → Tasks 1 (OpenCode, `directory`=cwd) + 2 (Claude, decoded cwd, tool_use/result pairing). ✓
- Deterministic friction (eval/tool errors, retries, compactions, bootstrapMiss, constraint hits, score) → Task 3. ✓
- `--llm` Ollama pass (reuse client, two-try parse, no-crash fallback) → Task 4 `friction-llm.js` + Task 5 wiring (`OLLAMA_HOST` gate + warn-and-continue). ✓
- Report grouped **by prompt** + per-session table → Task 4 `session-report.js`. ✓
- jscad-work filter default + `--all`; `--stdout`; date-stamped report under `docs/session-analysis/` → Task 5. ✓
- Read-only; missing-agent/malformed tolerance (`readJson`/try-catch/`[]`) → Tasks 1, 2, 5. ✓
- knip: CLI added to `entry` → Task 5 Step 1. ✓

**Placeholder scan:** none. Every module has complete code.

**Type consistency:** `Transcript` shape identical across both readers and consumed by `analyzeFriction`/`llmFriction`/`isJscadWorkSession`. `analyzeFriction → { sessionId, agent, cwd, signals, score }` consumed verbatim by `renderReport` (which also reads optional `.llm`). `llmFriction → { summary, promptFixes }` attached as `r.llm` in the CLI and read by `renderReport`. `makeOllamaClient` `messages.create({messages})→{content:[{text}]}` matches `llmFriction`'s usage. Consistent.
