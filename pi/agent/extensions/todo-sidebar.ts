/**
 * TODO Sidebar Extension
 *
 * Shows a toggleable sidebar with a TODO checklist generated from each user prompt.
 * A cheap LLM breaks down the request into actionable steps, then re-evaluates
 * completion after each agent turn.
 *
 * Toggle: Ctrl+T
 */

import { complete, type Model, type Api, type UserMessage } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  ModelRegistry,
  WidgetPlacement,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

// ── Types ──────────────────────────────────────────────────────

interface TodoItem {
  text: string;
  done: boolean;
}

// ── Constants ──────────────────────────────────────────────────

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

// ── Model Selection ────────────────────────────────────────────

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

// ── LLM Helpers ────────────────────────────────────────────────

async function llmCall(
  model: Model<Api>,
  modelRegistry: ModelRegistry,
  systemPrompt: string,
  userText: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const auth = await modelRegistry.getApiKeyAndHeaders(model);
  if (auth.ok === false) return null;

  const userMessage: UserMessage = {
    role: "user",
    content: [{ type: "text", text: userText }],
    timestamp: Date.now(),
  };

  try {
    const response = await complete(
      model,
      { systemPrompt, messages: [userMessage] },
      { apiKey: auth.apiKey, headers: auth.headers, signal },
    );

    if (response.stopReason === "aborted") return null;

    return response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");
  } catch {
    return null;
  }
}

function parseJsonArray<T>(text: string): T[] | null {
  try {
    let jsonStr = text.trim();
    const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1].trim();

    // Find first [ and last ]
    const start = jsonStr.indexOf("[");
    const end = jsonStr.lastIndexOf("]");
    if (start === -1 || end === -1) return null;

    const parsed = JSON.parse(jsonStr.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ── Widget Component ───────────────────────────────────────────

class TodoWidget implements Component {
  private todos: TodoItem[];
  private tui: TUI;
  private theme: Theme;
  private cachedWidth?: number;
  private cachedLines?: string[];
  private generating: boolean;

  constructor(tui: TUI, theme: Theme, todos: TodoItem[], generating: boolean) {
    this.tui = tui;
    this.theme = theme;
    this.todos = todos;
    this.generating = generating;
  }

  update(todos: TodoItem[], generating: boolean) {
    this.todos = todos;
    this.generating = generating;
    this.invalidate();
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
    const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
    const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
    const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
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

    const emptyLine = (): string => {
      return dim("│") + " ".repeat(boxWidth - 2) + dim("│");
    };

    // Header
    const doneCount = this.todos.filter((t) => t.done).length;
    const total = this.todos.length;

    let title: string;
    if (this.generating) {
      title = `${bold(cyan("TODO"))} ${dim("generating...")}`;
    } else if (total === 0) {
      title = bold(cyan("TODO"));
    } else {
      title = `${bold(cyan("TODO"))} ${dim(`${doneCount}/${total}`)}`;
    }

    lines.push(dim("╭" + hr + "╮"));
    lines.push(padLine(title));

    if (total > 0) {
      // Progress bar
      const barWidth = Math.min(contentWidth - 2, 30);
      const filled = total > 0 ? Math.round((doneCount / total) * barWidth) : 0;
      const empty = barWidth - filled;
      const progressBar = green("█".repeat(filled)) + dim("░".repeat(empty));
      lines.push(padLine(progressBar));
    }

    lines.push(dim("├" + hr + "┤"));

    if (this.generating && total === 0) {
      lines.push(padLine(dim("  Analyzing request...")));
    } else if (total === 0) {
      lines.push(padLine(dim("  No tasks")));
    } else {
      for (const todo of this.todos) {
        const checkbox = todo.done ? green("✓") : dim("○");
        const text = todo.done
          ? dim(strikethrough(todo.text))
          : todo.text;
        const line = ` ${checkbox} ${text}`;

        // Truncate if too long
        if (visibleWidth(line) > contentWidth) {
          const maxText = contentWidth - 5;
          const truncated = todo.text.slice(0, maxText) + "…";
          const truncLine = ` ${checkbox} ${todo.done ? dim(strikethrough(truncated)) : truncated}`;
          lines.push(padLine(truncLine));
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

// ── Conversation Summary ───────────────────────────────────────

function summarizeTurns(ctx: ExtensionContext): string {
  const branch = ctx.sessionManager.getBranch();
  const parts: string[] = [];

  // Collect recent tool calls and assistant messages
  for (const entry of branch.slice(-30)) {
    if (entry.type !== "message") continue;
    const msg = entry.message;
    if (!("role" in msg)) continue;

    if (msg.role === "assistant") {
      for (const c of msg.content) {
        if (c.type === "text" && c.text.length > 0) {
          parts.push(`Assistant: ${c.text.slice(0, 500)}`);
        }
        if (c.type === "tool_use") {
          parts.push(`Tool call: ${c.name}(${JSON.stringify(c.input).slice(0, 200)})`);
        }
      }
    }
    if (msg.role === "tool_result") {
      for (const c of msg.content) {
        if (c.type === "text") {
          parts.push(`Tool result: ${c.text.slice(0, 200)}`);
        }
      }
    }
  }

  return parts.join("\n").slice(0, 4000);
}

// ── Extension Entry Point ──────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let todos: TodoItem[] = [];
  let visible = true;
  let generating = false;
  let currentWidget: TodoWidget | null = null;
  let abortController: AbortController | null = null;
  let currentPrompt = "";

  function updateWidget(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;

    if (!visible || (todos.length === 0 && !generating)) {
      ctx.ui.setWidget("todo-sidebar", undefined);
      currentWidget = null;
      return;
    }

    if (currentWidget) {
      currentWidget.update(todos, generating);
      currentWidget.invalidate();
      // Re-set to trigger re-render
      ctx.ui.setWidget("todo-sidebar", (tui, theme) => {
        currentWidget = new TodoWidget(tui, theme, todos, generating);
        return currentWidget;
      }, { placement: "aboveEditor" });
    } else {
      ctx.ui.setWidget("todo-sidebar", (tui, theme) => {
        currentWidget = new TodoWidget(tui, theme, todos, generating);
        return currentWidget;
      }, { placement: "aboveEditor" });
    }
  }

  // Toggle visibility
  pi.registerShortcut("ctrl+q", {
    description: "Toggle TODO sidebar",
    handler: (ctx) => {
      visible = !visible;
      updateWidget(ctx);
      ctx.ui.setStatus("todo", visible ? undefined : undefined);
    },
  });

  // Generate TODOs when a new request comes in
  pi.on("before_agent_start", async (event, ctx) => {
    if (!ctx.hasUI) return;

    // Cancel any in-flight evaluation
    if (abortController) {
      abortController.abort();
      abortController = null;
    }

    // Clear old TODOs
    todos = [];
    generating = true;
    currentPrompt = event.prompt;
    updateWidget(ctx);

    // Generate new TODOs in background
    abortController = new AbortController();
    const signal = abortController.signal;

    const model = await selectCheapModel(ctx.model, ctx.modelRegistry);
    if (!model) {
      generating = false;
      updateWidget(ctx);
      return;
    }

    const result = await llmCall(
      model,
      ctx.modelRegistry,
      GENERATE_SYSTEM_PROMPT,
      event.prompt,
      signal,
    );

    if (signal.aborted) return;

    generating = false;

    if (result) {
      const items = parseJsonArray<string>(result);
      if (items) {
        todos = items.map((text) => ({ text, done: false }));
      }
    }

    updateWidget(ctx);
  });

  // Evaluate completion after each turn
  pi.on("turn_end", async (_event, ctx) => {
    if (!ctx.hasUI || todos.length === 0) return;

    // Skip if all already done
    if (todos.every((t) => t.done)) return;

    const model = await selectCheapModel(ctx.model, ctx.modelRegistry);
    if (!model) return;

    const summary = summarizeTurns(ctx);
    const todoTexts = todos.map((t) => t.text);

    const evalPrompt = [
      `Original request: ${currentPrompt}`,
      ``,
      `TODO items: ${JSON.stringify(todoTexts)}`,
      ``,
      `What the agent did so far:`,
      summary,
    ].join("\n");

    const evalAbort = new AbortController();
    const result = await llmCall(
      model,
      ctx.modelRegistry,
      EVALUATE_SYSTEM_PROMPT,
      evalPrompt,
      evalAbort.signal,
    );

    if (!result) return;

    const statuses = parseJsonArray<boolean>(result);
    if (statuses && statuses.length === todos.length) {
      for (let i = 0; i < todos.length; i++) {
        // Only mark as done, never unmark
        if (statuses[i]) todos[i].done = true;
      }
      updateWidget(ctx);
    }
  });

  // Clean up on session shutdown
  pi.on("session_shutdown", () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    todos = [];
    generating = false;
    currentWidget = null;
  });
}
