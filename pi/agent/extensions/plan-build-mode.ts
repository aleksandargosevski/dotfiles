/**
 * Plan/Build Mode + Powerline Footer + TODO Sidebar
 *
 * All-in-one extension for the coding workflow:
 * - Tab or Ctrl+Alt+P to switch Plan/Build modes
 * - Plan mode: read-only, research & analyze (grill-me planning)
 * - Build mode: full tool access + TODO checklist
 * - Single-line powerline footer: MODE  path (branch)  tokens    model  thinking
 * - TODO sidebar: auto-generated checklist from prompts (build mode only, Ctrl+Q toggle)
 */

import { complete, type Model, type Api, type UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, ModelRegistry, ReadonlyFooterDataProvider } from "@earendil-works/pi-coding-agent";
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { Key, matchesKey, visibleWidth, type KeybindingsManager, type Theme } from "@earendil-works/pi-tui";

// ═══════════════════════════════════════════════════════════════
// MODE STATE
// ═══════════════════════════════════════════════════════════════

export type Mode = "build" | "plan";

let _currentMode: Mode = "plan";
const _modeChangeListeners: Array<(mode: Mode) => void> = [];

export function getMode(): Mode {
  return _currentMode;
}

export function onModeChange(listener: (mode: Mode) => void): () => void {
  _modeChangeListeners.push(listener);
  return () => {
    const idx = _modeChangeListeners.indexOf(listener);
    if (idx !== -1) _modeChangeListeners.splice(idx, 1);
  };
}

// ═══════════════════════════════════════════════════════════════
// BASH SAFETY
// ═══════════════════════════════════════════════════════════════

const BUILD_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"];
const PLAN_TOOLS = ["read", "bash", "grep", "find", "ls"];

const DESTRUCTIVE_PATTERNS = [
  /\brm\b/i, /\brmdir\b/i, /\bmv\b/i, /\bcp\b/i, /\bmkdir\b/i, /\btouch\b/i,
  /\bchmod\b/i, /\bchown\b/i, /\bln\b/i, /\btee\b/i, /\btruncate\b/i, /\bdd\b/i,
  /(^|[^<])>(?!>)/, />>/,
  /\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
  /\byarn\s+(add|remove|install|publish)/i,
  /\bpnpm\s+(add|remove|install|publish)/i,
  /\bpip\s+(install|uninstall)/i,
  /\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
  /\bsudo\b/i, /\bkill\b/i, /\bpkill\b/i, /\bkillall\b/i,
  /\b(vim?|nano|emacs|code|subl)\b/i,
];

const SAFE_PATTERNS = [
  /^\s*cat\b/, /^\s*head\b/, /^\s*tail\b/, /^\s*less\b/, /^\s*more\b/,
  /^\s*grep\b/, /^\s*find\b/, /^\s*ls\b/, /^\s*pwd\b/, /^\s*echo\b/,
  /^\s*wc\b/, /^\s*sort\b/, /^\s*uniq\b/, /^\s*diff\b/, /^\s*file\b/,
  /^\s*stat\b/, /^\s*du\b/, /^\s*df\b/, /^\s*tree\b/, /^\s*which\b/,
  /^\s*type\b/, /^\s*env\b/, /^\s*uname\b/, /^\s*whoami\b/, /^\s*date\b/,
  /^\s*uptime\b/, /^\s*ps\b/,
  /^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)/i,
  /^\s*git\s+ls-/i,
  /^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
  /^\s*yarn\s+(list|info|why|audit)/i,
  /^\s*node\s+--version/i, /^\s*python\s+--version/i,
  /^\s*curl\s/i, /^\s*jq\b/, /^\s*sed\s+-n/i, /^\s*awk\b/,
  /^\s*rg\b/, /^\s*fd\b/, /^\s*bat\b/, /^\s*eza\b/,
];

function isSafeCommand(command: string): boolean {
  return !DESTRUCTIVE_PATTERNS.some((p) => p.test(command)) && SAFE_PATTERNS.some((p) => p.test(command));
}

// ═══════════════════════════════════════════════════════════════
// POWERLINE FOOTER
// ═══════════════════════════════════════════════════════════════

const SEP_RIGHT = "\uE0B0";
const SEP_LEFT = "\uE0B2";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function fgRgb(r: number, g: number, b: number): string { return `\x1b[38;2;${r};${g};${b}m`; }
function bgRgb(r: number, g: number, b: number): string { return `\x1b[48;2;${r};${g};${b}m`; }

const COLORS = {
  plan:     { bg: [180, 142, 58],  fg: [22, 19, 10]   },
  build:    { bg: [76, 175, 80],   fg: [14, 36, 15]    },
  path:     { bg: [55, 71, 105],   fg: [189, 203, 230] },
  tokens:   { bg: [40, 44, 52],    fg: [152, 160, 176] },
  model:    { bg: [88, 56, 126],   fg: [210, 186, 232] },
  thinking: { bg: [36, 95, 107],   fg: [158, 218, 230] },
} as const;

type SegmentName = keyof typeof COLORS;
interface Segment { text: string; name: SegmentName; }

function segBg(n: SegmentName): string { const [r, g, b] = COLORS[n].bg; return bgRgb(r, g, b); }
function segFg(n: SegmentName): string { const [r, g, b] = COLORS[n].fg; return fgRgb(r, g, b); }
function segBgAsFg(n: SegmentName): string { const [r, g, b] = COLORS[n].bg; return fgRgb(r, g, b); }

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

function renderLeftSegments(segments: Segment[]): string {
  let result = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    result += segBg(seg.name) + segFg(seg.name) + BOLD + " " + seg.text + " " + RESET;
    result += (i < segments.length - 1 ? segBg(segments[i + 1].name) : "") + segBgAsFg(seg.name) + SEP_RIGHT + RESET;
  }
  return result;
}

function renderRightSegments(segments: Segment[]): string {
  let result = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    result += (i > 0 ? segBg(segments[i - 1].name) : "") + segBgAsFg(seg.name) + SEP_LEFT + RESET;
    result += segBg(seg.name) + segFg(seg.name) + BOLD + " " + seg.text + " " + RESET;
  }
  return result;
}

function buildPowerline(left: Segment[], right: Segment[], width: number): string {
  const leftRendered = renderLeftSegments(left);
  const rightRendered = renderRightSegments(right);
  const leftWidth = left.reduce((w, s) => w + visibleWidth(s.text) + 2, 0) + left.length;
  const rightWidth = right.reduce((w, s) => w + visibleWidth(s.text) + 2, 0) + right.length;
  const gap = width - leftWidth - rightWidth;
  if (gap < 0) return leftRendered + RESET + rightRendered + RESET;
  return leftRendered + RESET + " ".repeat(gap) + rightRendered + RESET;
}

class PowerlineFooter implements Component {
  constructor(
    private ctx: ExtensionContext,
    private footerData: ReadonlyFooterDataProvider,
    private getThinkingLevel: () => string,
  ) {}

  invalidate(): void {}
  dispose(): void {}

  render(width: number): string[] {
    return [buildPowerline(this.buildLeft(), this.buildRight(), width)];
  }

  private buildLeft(): Segment[] {
    const segments: Segment[] = [];
    segments.push({
      text: _currentMode === "plan" ? "⏸ PLAN" : "▶ BUILD",
      name: _currentMode === "plan" ? "plan" : "build",
    });
    let pwd = this.ctx.cwd;
    const home = process.env.HOME || process.env.USERPROFILE;
    if (home && pwd.startsWith(home)) pwd = `~${pwd.slice(home.length)}`;
    const branch = this.footerData.getGitBranch();
    segments.push({ text: branch ? `${pwd}  ${branch}` : pwd, name: "path" });
    const tokens = this.buildTokenString();
    if (tokens) segments.push({ text: tokens, name: "tokens" });
    return segments;
  }

  private buildRight(): Segment[] {
    const segments: Segment[] = [];
    segments.push({ text: this.ctx.model?.id || "no model", name: "model" });
    if (this.ctx.model?.reasoning) {
      segments.push({ text: `💭 ${this.getThinkingLevel()}`, name: "thinking" });
    }
    return segments;
  }

  private buildTokenString(): string | null {
    let totalInput = 0, totalOutput = 0, totalCost = 0;
    for (const entry of this.ctx.sessionManager.getEntries()) {
      if (entry.type === "message" && entry.message.role === "assistant") {
        totalInput += entry.message.usage.input;
        totalOutput += entry.message.usage.output;
        totalCost += entry.message.usage.cost.total;
      }
    }
    if (!totalInput && !totalOutput) return null;
    const parts: string[] = [];
    if (totalInput) parts.push(`↑${formatTokens(totalInput)}`);
    if (totalOutput) parts.push(`↓${formatTokens(totalOutput)}`);
    const usage = this.ctx.getContextUsage?.();
    if (usage?.percent !== null && usage?.percent !== undefined) parts.push(`ctx ${usage.percent.toFixed(0)}%`);
    if (totalCost) parts.push(`$${totalCost.toFixed(2)}`);
    return parts.join(" · ");
  }
}

// ═══════════════════════════════════════════════════════════════
// TODO SIDEBAR
// ═══════════════════════════════════════════════════════════════

interface TodoItem { text: string; done: boolean; }

interface TodoState {
  todos: TodoItem[];
  visible: boolean;
  generating: boolean;
  currentPrompt: string;
  abortController: AbortController | null;
}

const HAIKU_MODEL_ID = "claude-haiku-4-5";
const CODEX_MODEL_ID = "gpt-5.3";

const GENERATE_SYSTEM_PROMPT = `You break down a user's coding request into a short TODO checklist.

Output a JSON array of short, actionable steps. 3-7 items max. Each item is a string.
Keep items concise (under 60 chars). Focus on the key steps, not every micro-detail.

Example output:
["Explore project structure", "Create new component file", "Implement core logic", "Add error handling", "Wire up to existing code"]

If the request is a simple question or trivial task, output 1-2 items.
Output ONLY the JSON array, nothing else.`;

const EVALUATE_SYSTEM_PROMPT = `You evaluate which TODO items from a checklist are complete based on a conversation.

You receive:
1. The original user request
2. A JSON array of TODO items
3. A summary of what the agent did (tool calls and responses)

Output a JSON array of booleans, one per TODO item. true = done, false = not done.
Output ONLY the JSON array, nothing else.

Example: [true, true, false, false]`;

async function selectCheapModel(
  currentModel: Model<Api> | undefined,
  modelRegistry: ModelRegistry,
): Promise<Model<Api> | null> {
  const codexModel = modelRegistry.find("openai-codex", CODEX_MODEL_ID);
  if (codexModel) {
    const auth = await modelRegistry.getApiKeyAndHeaders(codexModel);
    if (auth.ok) return codexModel;
  }
  const haikuModel = modelRegistry.find("anthropic", HAIKU_MODEL_ID);
  if (haikuModel) {
    const auth = await modelRegistry.getApiKeyAndHeaders(haikuModel);
    if (auth.ok) return haikuModel;
  }
  return currentModel ?? null;
}

async function llmCall(
  model: Model<Api>,
  modelRegistry: ModelRegistry,
  systemPrompt: string,
  userText: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const auth = await modelRegistry.getApiKeyAndHeaders(model);
  if (auth.ok === false) return null;
  const userMessage: UserMessage = { role: "user", content: [{ type: "text", text: userText }], timestamp: Date.now() };
  try {
    const response = await complete(model, { systemPrompt, messages: [userMessage] }, { apiKey: auth.apiKey, headers: auth.headers, signal });
    if (response.stopReason === "aborted") return null;
    return response.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n");
  } catch { return null; }
}

function parseJsonArray<T>(text: string): T[] | null {
  try {
    let jsonStr = text.trim();
    const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1].trim();
    const start = jsonStr.indexOf("[");
    const end = jsonStr.lastIndexOf("]");
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(jsonStr.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

class TodoWidget implements Component {
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(private tui: TUI, private theme: Theme, private state: TodoState) {}

  invalidate(): void { this.cachedWidth = undefined; this.cachedLines = undefined; }

  render(width: number): string[] {
    const isTodoActive = _currentMode === "build" && this.state.visible;
    if (!isTodoActive || (!this.state.todos.length && !this.state.generating)) return [];
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const { todos, generating } = this.state;
    const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
    const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
    const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
    const strikethrough = (s: string) => `\x1b[9m${s}\x1b[0m`;
    const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

    const lines: string[] = [];
    const boxWidth = Math.min(width, 80);
    const contentWidth = boxWidth - 6;
    const hr = "─".repeat(boxWidth - 2);

    const padLine = (content: string): string => {
      const vis = visibleWidth(content);
      const pad = Math.max(0, boxWidth - vis - 4);
      return dim("│") + "  " + content + " ".repeat(pad) + dim("│");
    };

    const doneCount = todos.filter((t) => t.done).length;
    const total = todos.length;

    let title: string;
    if (generating) title = `${bold(cyan("TODO"))} ${dim("generating...")}`;
    else if (total === 0) title = bold(cyan("TODO"));
    else title = `${bold(cyan("TODO"))} ${dim(`${doneCount}/${total}`)}`;

    lines.push(dim("╭" + hr + "╮"));
    lines.push(padLine(title));

    if (total > 0) {
      const barWidth = Math.min(contentWidth - 2, 30);
      const filled = Math.round((doneCount / total) * barWidth);
      lines.push(padLine(green("█".repeat(filled)) + dim("░".repeat(barWidth - filled))));
    }

    lines.push(dim("├" + hr + "┤"));

    if (generating && total === 0) {
      lines.push(padLine(dim("  Analyzing request...")));
    } else if (total === 0) {
      lines.push(padLine(dim("  No tasks")));
    } else {
      for (const todo of todos) {
        const checkbox = todo.done ? green("✓") : dim("○");
        const text = todo.done ? dim(strikethrough(todo.text)) : todo.text;
        const line = ` ${checkbox} ${text}`;
        if (visibleWidth(line) > contentWidth) {
          const truncated = todo.text.slice(0, contentWidth - 5) + "…";
          lines.push(padLine(` ${checkbox} ${todo.done ? dim(strikethrough(truncated)) : truncated}`));
        } else {
          lines.push(padLine(line));
        }
      }
    }

    if (doneCount === total && total > 0) {
      lines.push(dim("├" + hr + "┤"));
      lines.push(padLine(green("  ✨ All done!")));
    }

    lines.push(dim("╰" + hr + "╯"));
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }
}

function summarizeTurns(ctx: ExtensionContext): string {
  const branch = ctx.sessionManager.getBranch();
  const parts: string[] = [];
  for (const entry of branch.slice(-30)) {
    if (entry.type !== "message") continue;
    const msg = entry.message;
    if (!("role" in msg)) continue;
    if (msg.role === "assistant") {
      for (const c of msg.content) {
        if (c.type === "text" && c.text.length > 0) parts.push(`Assistant: ${c.text.slice(0, 500)}`);
        if (c.type === "tool_use") parts.push(`Tool call: ${c.name}(${JSON.stringify(c.input).slice(0, 200)})`);
      }
    }
    if (msg.role === "tool_result") {
      for (const c of msg.content) {
        if (c.type === "text") parts.push(`Tool result: ${c.text.slice(0, 200)}`);
      }
    }
  }
  return parts.join("\n").slice(0, 4000);
}

// ═══════════════════════════════════════════════════════════════
// MODE TOGGLE EDITOR
// ═══════════════════════════════════════════════════════════════

class ModeToggleEditor extends CustomEditor {
  private onToggle: () => void;
  constructor(tui: TUI, theme: Theme, keybindings: KeybindingsManager, onToggle: () => void) {
    super(tui, theme, keybindings);
    this.onToggle = onToggle;
  }
  handleInput(data: string): void {
    if (matchesKey(data, Key.tab)) { this.onToggle(); return; }
    super.handleInput(data);
  }
}

// ═══════════════════════════════════════════════════════════════
// EXTENSION ENTRY POINT
// ═══════════════════════════════════════════════════════════════

export default function planBuildMode(pi: ExtensionAPI): void {
  let ctx: ExtensionContext | null = null;
  let footerTui: TUI | null = null;

  // ── TODO state ───────────────────────────────────────────────
  const todoState: TodoState = {
    todos: [], visible: true, generating: false, currentPrompt: "", abortController: null,
  };
  let todoWidget: TodoWidget | null = null;

  // ── Flags ────────────────────────────────────────────────────
  pi.registerFlag("build", { description: "Start in build mode (full access)", type: "boolean", default: false });

  // ── Footer ───────────────────────────────────────────────────
  function refreshFooter(): void {
    if (!ctx?.hasUI) return;
    ctx.ui.setFooter((tui, _theme, footerData) => {
      footerTui = tui;
      return new PowerlineFooter(ctx!, footerData, () => pi.getThinkingLevel());
    });
    footerTui?.requestRender();
  }

  // ── TODO widget ──────────────────────────────────────────────
  function abortTodoGeneration(): void {
    if (todoState.abortController) { todoState.abortController.abort(); todoState.abortController = null; }
    todoState.generating = false;
  }

  function refreshTodoWidget(): void {
    if (!ctx?.hasUI) return;
    todoWidget?.invalidate();
    ctx.ui.setWidget("todo-sidebar", (tui, theme) => {
      todoWidget = new TodoWidget(tui, theme, todoState);
      return todoWidget;
    }, { placement: "aboveEditor" });
  }

  // ── Mode switching ───────────────────────────────────────────
  function applyMode(): void {
    if (!ctx) return;
    pi.setActiveTools(_currentMode === "plan" ? PLAN_TOOLS : BUILD_TOOLS);
    if (_currentMode === "plan") abortTodoGeneration();
    refreshFooter();
    refreshTodoWidget();
  }

  function setMode(mode: Mode): void {
    if (_currentMode === mode) return;
    _currentMode = mode;
    applyMode();
    _modeChangeListeners.forEach((fn) => fn(_currentMode));
  }

  function toggleMode(): void {
    _currentMode = _currentMode === "build" ? "plan" : "build";
    applyMode();
    _modeChangeListeners.forEach((fn) => fn(_currentMode));
    ctx?.ui.notify(`${_currentMode === "plan" ? "Plan" : "Build"} mode activated`, "info");
  }

  // ── Editor ───────────────────────────────────────────────────
  function installEditor(): void {
    if (!ctx) return;
    ctx.ui.setEditorComponent((tui, theme, keybindings) => new ModeToggleEditor(tui, theme, keybindings, toggleMode));
  }

  // ── Shortcuts & Commands ─────────────────────────────────────
  pi.registerShortcut(Key.ctrlAlt("p"), { description: "Toggle plan/build mode", handler: async () => toggleMode() });

  pi.registerShortcut("ctrl+q", {
    description: "Toggle TODO sidebar",
    handler: (c) => { ctx = c; todoState.visible = !todoState.visible; refreshTodoWidget(); },
  });

  pi.registerCommand("plan", { description: "Switch to plan mode", handler: async () => { setMode("plan"); ctx?.ui.notify("Plan mode activated", "info"); } });
  pi.registerCommand("build", { description: "Switch to build mode", handler: async () => { setMode("build"); ctx?.ui.notify("Build mode activated", "info"); } });

  // ── Tool blocking (plan mode) ────────────────────────────────
  pi.on("tool_call", async (event) => {
    if (_currentMode !== "plan") return;
    if (event.toolName === "bash") {
      const command = event.input.command as string;
      if (!isSafeCommand(command)) {
        return { block: true, reason: `🔍 Plan mode active — this command is blocked.\nSwitch to Build mode (Tab or Ctrl+Alt+P) and say "Go" to proceed.\nBlocked: ${command}` };
      }
    }
    if (event.toolName === "edit" || event.toolName === "write") {
      return { block: true, reason: `🔍 Plan mode active — file modifications are disabled.\nSwitch to Build mode (Tab or Ctrl+Alt+P) and say "Go" to proceed.` };
    }
  });

  // ── LLM context injection ────────────────────────────────────
  pi.on("before_agent_start", async (event, c) => {
    ctx = c;

    // TODO generation (build mode only)
    if (ctx.hasUI && _currentMode === "build") {
      abortTodoGeneration();
      todoState.todos = [];
      todoState.generating = true;
      todoState.currentPrompt = event.prompt;
      refreshTodoWidget();

      const controller = new AbortController();
      todoState.abortController = controller;
      const model = await selectCheapModel(ctx.model, ctx.modelRegistry);
      if (model) {
        const result = await llmCall(model, ctx.modelRegistry, GENERATE_SYSTEM_PROMPT, event.prompt, controller.signal);
        if (!controller.signal.aborted && _currentMode === "build" && result) {
          const items = parseJsonArray<string>(result);
          if (items) todoState.todos = items.map((text) => ({ text, done: false }));
        }
      }
      todoState.generating = false;
      refreshTodoWidget();
    } else if (ctx.hasUI && _currentMode === "plan") {
      abortTodoGeneration();
      todoState.todos = [];
      refreshTodoWidget();
    }

    // Plan mode system prompt
    if (_currentMode === "plan") {
      return {
        message: {
          customType: "plan-build-context",
          content: `[PLAN MODE - READ ONLY]
You are in Plan mode. You MUST NOT modify any files.
Available tools: ${PLAN_TOOLS.join(", ")}
You CANNOT use: edit, write

Your role: read, research, analyze, and explain. Create plans, review code, suggest changes — but do NOT execute them.

If the user asks you to make changes, modify files, or implement something, respond with:
"I'm in Plan mode right now — I can only read and research. Switch to Build mode (press Tab or Ctrl+Alt+P) and say **Go** to execute."

Focus on thorough analysis and clear planning.

IMPORTANT: Use grill-me skills to plan.`,
          display: false,
        },
      };
    }
  });

  // ── Context filtering ────────────────────────────────────────
  pi.on("context", async (event) => {
    if (_currentMode === "plan") return;
    return {
      messages: event.messages.filter((m) => {
        const msg = m as any;
        if (msg.customType === "plan-build-context") return false;
        if (msg.role !== "user") return true;
        const content = msg.content;
        if (typeof content === "string") return !content.includes("[PLAN MODE - READ ONLY]");
        if (Array.isArray(content)) return !content.some((c: any) => c.type === "text" && c.text?.includes("[PLAN MODE - READ ONLY]"));
        return true;
      }),
    };
  });

  // ── Session lifecycle ────────────────────────────────────────
  pi.on("session_start", async (_event, context) => {
    ctx = context;
    if (pi.getFlag("build") === true) _currentMode = "build";
    const entries = ctx.sessionManager.getEntries();
    const stateEntry = entries.filter((e: any) => e.type === "custom" && e.customType === "plan-build-state").pop() as any;
    if (stateEntry?.data?.mode) _currentMode = stateEntry.data.mode;
    installEditor();
    applyMode();
  });

  pi.on("turn_end", async (_event, context) => {
    ctx = context;
    pi.appendEntry("plan-build-state", { mode: _currentMode });
    refreshFooter();

    // TODO evaluation (build mode only)
    if (!ctx.hasUI || !todoState.todos.length || _currentMode !== "build" || todoState.todos.every((t) => t.done)) return;
    const model = await selectCheapModel(ctx.model, ctx.modelRegistry);
    if (!model) return;
    const summary = summarizeTurns(ctx);
    const evalPrompt = `Original request: ${todoState.currentPrompt}\n\nTODO items: ${JSON.stringify(todoState.todos.map((t) => t.text))}\n\nWhat the agent did so far:\n${summary}`;
    const result = await llmCall(model, ctx.modelRegistry, EVALUATE_SYSTEM_PROMPT, evalPrompt);
    if (!result || _currentMode !== "build") return;
    const statuses = parseJsonArray<boolean>(result);
    if (statuses && statuses.length === todoState.todos.length) {
      for (let i = 0; i < todoState.todos.length; i++) { if (statuses[i]) todoState.todos[i].done = true; }
      refreshTodoWidget();
    }
  });

  pi.on("model_select", async (_event, c) => { ctx = c; if (ctx.hasUI) refreshFooter(); });
  pi.on("thinking_level_select", async (_event, c) => { ctx = c; if (ctx.hasUI) refreshFooter(); });

  pi.on("session_shutdown", () => {
    abortTodoGeneration();
    todoState.todos = [];
    todoWidget = null;
    ctx = null;
    footerTui = null;
  });
}
