/**
 * Desktop Notification Extension
 *
 * Sends a native notification via `noti` when:
 *   1. The agent finishes a task (`agent_end`)     → shows your prompt as the message
 *   2. Pi needs your input to continue             → "Pi needs your attention"
 *      (select / confirm / input / editor)
 *
 * Skips notifications for short turns (< 3s) and suppresses the "done"
 * notification if an "attention" notification just fired or if another
 * extension explicitly suppresses it.
 *
 * Interactive mode only — silent in print/RPC modes.
 */

import type { ExtensionAPI, ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import { basename } from "path";
import { execFile } from "child_process";

const MIN_TURN_DURATION_MS = 3_000;
const ATTENTION_TO_DONE_SUPPRESS_MS = 1_500;
const MAX_MESSAGE_LENGTH = 80;
const NOTI_PATH = "/opt/homebrew/bin/noti";

// Only wrap methods that represent Pi's own blocking prompts.
// `custom` is excluded — it's used by extensions (like answer) that auto-trigger
// and handle their own UX flow.
const BLOCKING_UI_METHODS = ["select", "confirm", "input", "editor"] as const;

interface NotiRegistry {
  uiWrapped: boolean;
  onAttention: () => void;
  suppressDoneUntil: number;
}

const REGISTRY_KEY = "__pi_noti_registry__";
const globalAny = globalThis as unknown as Record<string, NotiRegistry | undefined>;
const REG: NotiRegistry = (globalAny[REGISTRY_KEY] ??= {
  uiWrapped: false,
  onAttention: () => {},
  suppressDoneUntil: 0,
});

/**
 * Call this from other extensions to suppress the next "done" notification.
 * Useful when the user just interacted and doesn't need a ping.
 */
export function suppressDoneNotification(durationMs: number = 5_000): void {
  REG.suppressDoneUntil = Date.now() + durationMs;
}

function wrapUiOnce(ui: ExtensionUIContext): void {
  if (REG.uiWrapped) return;
  REG.uiWrapped = true;

  for (const method of BLOCKING_UI_METHODS) {
    const original = (ui as unknown as Record<string, unknown>)[method];
    if (typeof original !== "function") continue;

    const fn = original as (...args: unknown[]) => unknown;
    (ui as unknown as Record<string, unknown>)[method] = function (this: unknown, ...args: unknown[]) {
      try { REG.onAttention(); } catch { /* ignore */ }
      return fn.apply(this, args);
    };
  }
}

export default function (pi: ExtensionAPI) {
  let turnStartTime = 0;
  let currentTask = "";
  let lastAttentionAt = 0;
  let projectName = "";

  REG.onAttention = () => {
    lastAttentionAt = Date.now();
    notify(projectName, "⏳ Pi needs your attention");
  };

  pi.on("session_start", async (_event, ctx) => {
    projectName = basename(ctx.cwd);
    if (ctx.hasUI) wrapUiOnce(ctx.ui);
  });

  pi.on("before_agent_start", (event, ctx) => {
    turnStartTime = Date.now();
    currentTask = truncate(event.prompt.trim());
    projectName = basename(ctx.cwd);
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    if (Date.now() - lastAttentionAt < ATTENTION_TO_DONE_SUPPRESS_MS) return;
    if (Date.now() - turnStartTime < MIN_TURN_DURATION_MS) return;
    if (Date.now() < REG.suppressDoneUntil) return;

    const project = basename(ctx.cwd);
    const message = currentTask ? `✅ ${currentTask}` : "✅ Task complete";
    notify(project, message);
  });

  function notify(title: string, message: string) {
    execFile(NOTI_PATH, ["-t", title, "-m", message], (err) => {
      if (err) console.error(`[noti] failed: ${err.message}`);
    });
  }

  function truncate(text: string) {
    const firstLine = text.split("\n")[0];
    if (firstLine.length <= MAX_MESSAGE_LENGTH) return firstLine;
    return firstLine.slice(0, MAX_MESSAGE_LENGTH - 1) + "…";
  }
}
