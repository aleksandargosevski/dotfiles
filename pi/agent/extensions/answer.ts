/**
 * Q&A extraction hook - extracts questions from assistant responses
 *
 * Auto-presents questions when the LLM asks them, with predefined
 * answer choices and a "type your own" option.
 *
 * Features:
 * 1. Auto-triggers after each assistant response containing questions
 * 2. Extracts questions + suggested answers as structured JSON
 * 3. Presents selectable choices per question
 * 4. Always includes "Type your own answer" as the last option
 * 5. Falls back to /answer command and Ctrl+. shortcut for manual use
 */

import { complete, type Model, type Api, type UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { BorderedLoader } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  truncateToWidth,
  type TUI,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

// ── Types ──────────────────────────────────────────────────────

interface ExtractedQuestion {
  question: string;
  context?: string;
  suggestions: string[];
}

interface ExtractionResult {
  questions: ExtractedQuestion[];
}

// ── Constants ──────────────────────────────────────────────────

const TYPE_YOUR_OWN = "Type your own answer…";

const SYSTEM_PROMPT = `You are a question extractor. Given text from a conversation, extract any questions that need answering.

Output a JSON object with this structure:
{
  "questions": [
    {
      "question": "The question text",
      "context": "Optional context that helps answer the question",
      "suggestions": ["Option A", "Option B", "Option C"]
    }
  ]
}

Rules:
- Extract all questions that require user input
- Keep questions in the order they appeared
- Be concise with question text
- Include context only when it provides essential information for answering
- Provide 2-4 short, practical suggested answers per question
- Suggestions should cover the most likely answers the user would give
- If the question is yes/no, suggestions should be ["Yes", "No"]
- If the question offers specific choices, use those as suggestions
- If no questions are found, return {"questions": []}

Example output:
{
  "questions": [
    {
      "question": "What is your preferred database?",
      "context": "We can only configure MySQL and PostgreSQL because of what is implemented.",
      "suggestions": ["PostgreSQL", "MySQL"]
    },
    {
      "question": "Should we use TypeScript or JavaScript?",
      "suggestions": ["TypeScript", "JavaScript"]
    },
    {
      "question": "What port should the server run on?",
      "suggestions": ["3000", "8080", "4000"]
    }
  ]
}`;

const CODEX_MODEL_ID = "gpt-5.3";
const HAIKU_MODEL_ID = "claude-haiku-4-5";

// ── Model Selection ────────────────────────────────────────────

async function selectExtractionModel(
  currentModel: Model<Api>,
  modelRegistry: ModelRegistry,
): Promise<Model<Api>> {
  const codexModel = modelRegistry.find("openai-codex", CODEX_MODEL_ID);
  if (codexModel) {
    const auth = await modelRegistry.getApiKeyAndHeaders(codexModel);
    if (auth.ok) return codexModel;
  }

  const haikuModel = modelRegistry.find("anthropic", HAIKU_MODEL_ID);
  if (!haikuModel) return currentModel;

  const auth = await modelRegistry.getApiKeyAndHeaders(haikuModel);
  return auth.ok === false ? currentModel : haikuModel;
}

// ── Parsing ────────────────────────────────────────────────────

function parseExtractionResult(text: string): ExtractionResult | null {
  try {
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr);
    if (parsed && Array.isArray(parsed.questions)) {
      // Ensure suggestions array exists on each question
      for (const q of parsed.questions) {
        if (!Array.isArray(q.suggestions)) q.suggestions = [];
      }
      return parsed as ExtractionResult;
    }
    return null;
  } catch {
    return null;
  }
}

function messageContainsQuestions(text: string): boolean {
  return text.includes("?");
}

// ── Last Assistant Message ─────────────────────────────────────

function getLastAssistantText(ctx: ExtensionContext): string | null {
  const branch = ctx.sessionManager.getBranch();
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry.type === "message") {
      const msg = entry.message;
      if ("role" in msg && msg.role === "assistant") {
        if (msg.stopReason !== "stop") return null;
        const textParts = msg.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text);
        if (textParts.length > 0) return textParts.join("\n");
      }
    }
  }
  return null;
}

// ── Q&A Component ──────────────────────────────────────────────

type QuestionMode = "select" | "editor";

class QnAComponent implements Component {
  private questions: ExtractedQuestion[];
  private answers: string[];
  private modes: QuestionMode[];
  private selectedOptionIndex: number[];
  private currentIndex: number = 0;
  private editor: Editor;
  private tui: TUI;
  private onDone: (result: string | null) => void;
  private showingConfirmation: boolean = false;

  private cachedWidth?: number;
  private cachedLines?: string[];

  private dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  private bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  private cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
  private green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  private yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
  private gray = (s: string) => `\x1b[90m${s}\x1b[0m`;
  private bgCyan = (s: string) => `\x1b[46m\x1b[30m${s}\x1b[0m`;

  constructor(
    questions: ExtractedQuestion[],
    tui: TUI,
    onDone: (result: string | null) => void,
  ) {
    this.questions = questions;
    this.answers = questions.map(() => "");
    this.modes = questions.map(() => "select");
    // Start with first suggestion selected (index 0)
    this.selectedOptionIndex = questions.map(() => 0);
    this.tui = tui;
    this.onDone = onDone;

    const editorTheme: EditorTheme = {
      borderColor: this.dim,
      selectList: {
        selectedPrefix: this.cyan,
        selectedText: (s: string) => `\x1b[44m${s}\x1b[0m`,
        description: this.gray,
        scrollInfo: this.dim,
        noMatch: this.yellow,
      },
    };

    this.editor = new Editor(tui, editorTheme);
    this.editor.disableSubmit = true;
    this.editor.onChange = () => {
      this.invalidate();
      this.tui.requestRender();
    };
  }

  /** All options for the current question: suggestions + "Type your own" */
  private getOptions(index: number): string[] {
    return [...this.questions[index].suggestions, TYPE_YOUR_OWN];
  }

  private isTypeYourOwn(questionIndex: number, optionIndex: number): boolean {
    const options = this.getOptions(questionIndex);
    return optionIndex === options.length - 1;
  }

  private saveCurrentAnswer(): void {
    const mode = this.modes[this.currentIndex];
    if (mode === "editor") {
      this.answers[this.currentIndex] = this.editor.getText();
    } else {
      const optIdx = this.selectedOptionIndex[this.currentIndex];
      if (!this.isTypeYourOwn(this.currentIndex, optIdx)) {
        this.answers[this.currentIndex] = this.getOptions(this.currentIndex)[optIdx];
      }
    }
  }

  private navigateTo(index: number): void {
    if (index < 0 || index >= this.questions.length) return;
    this.saveCurrentAnswer();
    this.currentIndex = index;

    // Restore editor text if this question is in editor mode
    if (this.modes[index] === "editor") {
      this.editor.setText(this.answers[index] || "");
    }
    this.invalidate();
  }

  private switchToEditor(): void {
    this.modes[this.currentIndex] = "editor";
    this.editor.setText(this.answers[this.currentIndex] || "");
    this.invalidate();
  }

  private switchToSelect(): void {
    this.answers[this.currentIndex] = this.editor.getText();
    this.modes[this.currentIndex] = "select";
    this.invalidate();
  }

  private confirmSelection(): void {
    this.saveCurrentAnswer();
    if (this.currentIndex < this.questions.length - 1) {
      this.navigateTo(this.currentIndex + 1);
    } else {
      this.showingConfirmation = true;
    }
    this.invalidate();
  }

  private submit(): void {
    this.saveCurrentAnswer();
    const parts: string[] = [];
    for (let i = 0; i < this.questions.length; i++) {
      const q = this.questions[i];
      const a = this.answers[i]?.trim() || "(no answer)";
      parts.push(`Q: ${q.question}`);
      if (q.context) parts.push(`> ${q.context}`);
      parts.push(`A: ${a}`);
      parts.push("");
    }
    this.onDone(parts.join("\n").trim());
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  handleInput(data: string): void {
    // Confirmation dialog
    if (this.showingConfirmation) {
      if (matchesKey(data, Key.enter) || data.toLowerCase() === "y") {
        this.submit();
        return;
      }
      if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || data.toLowerCase() === "n") {
        this.showingConfirmation = false;
        this.invalidate();
        this.tui.requestRender();
        return;
      }
      return;
    }

    // Cancel
    if (matchesKey(data, Key.ctrl("c"))) {
      this.onDone(null);
      return;
    }

    // Escape in editor mode → back to select
    if (matchesKey(data, Key.escape)) {
      if (this.modes[this.currentIndex] === "editor") {
        this.switchToSelect();
        this.tui.requestRender();
        return;
      }
      this.onDone(null);
      return;
    }

    const mode = this.modes[this.currentIndex];

    if (mode === "select") {
      this.handleSelectInput(data);
    } else {
      this.handleEditorInput(data);
    }

    this.tui.requestRender();
  }

  private handleSelectInput(data: string): void {
    const options = this.getOptions(this.currentIndex);
    const optIdx = this.selectedOptionIndex[this.currentIndex];

    if (matchesKey(data, Key.up)) {
      if (optIdx > 0) {
        this.selectedOptionIndex[this.currentIndex]--;
        this.invalidate();
      }
      return;
    }

    if (matchesKey(data, Key.down)) {
      if (optIdx < options.length - 1) {
        this.selectedOptionIndex[this.currentIndex]++;
        this.invalidate();
      }
      return;
    }

    // Tab / Shift+Tab for question navigation
    if (matchesKey(data, Key.tab)) {
      if (this.currentIndex < this.questions.length - 1) {
        this.navigateTo(this.currentIndex + 1);
      }
      return;
    }
    if (matchesKey(data, Key.shift("tab"))) {
      if (this.currentIndex > 0) {
        this.navigateTo(this.currentIndex - 1);
      }
      return;
    }

    // Number keys for quick selection (1-9)
    const num = parseInt(data, 10);
    if (num >= 1 && num <= options.length) {
      this.selectedOptionIndex[this.currentIndex] = num - 1;
      this.invalidate();
      // If it's "Type your own", switch to editor
      if (this.isTypeYourOwn(this.currentIndex, num - 1)) {
        this.switchToEditor();
        return;
      }
      // Auto-confirm the selection
      this.confirmSelection();
      return;
    }

    // Enter confirms current selection
    if (matchesKey(data, Key.enter)) {
      if (this.isTypeYourOwn(this.currentIndex, optIdx)) {
        this.switchToEditor();
        return;
      }
      this.confirmSelection();
      return;
    }
  }

  private handleEditorInput(data: string): void {
    // Tab / Shift+Tab for question navigation
    if (matchesKey(data, Key.tab)) {
      if (this.currentIndex < this.questions.length - 1) {
        this.saveCurrentAnswer();
        this.navigateTo(this.currentIndex + 1);
      }
      return;
    }
    if (matchesKey(data, Key.shift("tab"))) {
      if (this.currentIndex > 0) {
        this.saveCurrentAnswer();
        this.navigateTo(this.currentIndex - 1);
      }
      return;
    }

    // Enter submits the typed answer and moves on
    if (matchesKey(data, Key.enter) && !matchesKey(data, Key.shift("enter"))) {
      this.confirmSelection();
      return;
    }

    // Pass everything else to editor
    this.editor.handleInput(data);
    this.invalidate();
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines: string[] = [];
    const boxWidth = Math.min(width - 4, 120);
    const contentWidth = boxWidth - 4;

    const horizontalLine = (count: number) => "─".repeat(count);

    const boxLine = (content: string, leftPad: number = 2): string => {
      const paddedContent = " ".repeat(leftPad) + content;
      const contentLen = visibleWidth(paddedContent);
      const rightPad = Math.max(0, boxWidth - contentLen - 2);
      return this.dim("│") + paddedContent + " ".repeat(rightPad) + this.dim("│");
    };

    const emptyBoxLine = (): string => {
      return this.dim("│") + " ".repeat(boxWidth - 2) + this.dim("│");
    };

    const padToWidth = (line: string): string => {
      const len = visibleWidth(line);
      return line + " ".repeat(Math.max(0, width - len));
    };

    // Title
    lines.push(padToWidth(this.dim("╭" + horizontalLine(boxWidth - 2) + "╮")));
    const title = `${this.bold(this.cyan("Questions"))} ${this.dim(`(${this.currentIndex + 1}/${this.questions.length})`)}`;
    lines.push(padToWidth(boxLine(title)));
    lines.push(padToWidth(this.dim("├" + horizontalLine(boxWidth - 2) + "┤")));

    // Progress dots
    const progressParts: string[] = [];
    for (let i = 0; i < this.questions.length; i++) {
      const answered = (this.answers[i]?.trim() || "").length > 0;
      const current = i === this.currentIndex;
      if (current) progressParts.push(this.cyan("●"));
      else if (answered) progressParts.push(this.green("●"));
      else progressParts.push(this.dim("○"));
    }
    lines.push(padToWidth(boxLine(progressParts.join(" "))));
    lines.push(padToWidth(emptyBoxLine()));

    // Current question
    const q = this.questions[this.currentIndex];
    const questionText = `${this.bold("Q:")} ${q.question}`;
    for (const line of wrapTextWithAnsi(questionText, contentWidth)) {
      lines.push(padToWidth(boxLine(line)));
    }

    // Context
    if (q.context) {
      lines.push(padToWidth(emptyBoxLine()));
      for (const line of wrapTextWithAnsi(this.gray(`> ${q.context}`), contentWidth - 2)) {
        lines.push(padToWidth(boxLine(line)));
      }
    }

    lines.push(padToWidth(emptyBoxLine()));

    const mode = this.modes[this.currentIndex];

    if (mode === "select") {
      // Render selectable options
      const options = this.getOptions(this.currentIndex);
      const optIdx = this.selectedOptionIndex[this.currentIndex];

      for (let i = 0; i < options.length; i++) {
        const isSelected = i === optIdx;
        const isLast = i === options.length - 1; // "Type your own"
        const number = `${i + 1}`;
        const label = options[i];

        let line: string;
        if (isSelected) {
          const prefix = this.cyan("❯ ");
          const numLabel = this.cyan(number + ".");
          const text = isLast ? this.dim(this.cyan(label)) : this.bold(label);
          line = `${prefix}${numLabel} ${text}`;
        } else {
          const prefix = "  ";
          const numLabel = this.dim(number + ".");
          const text = isLast ? this.dim(label) : label;
          line = `${prefix}${numLabel} ${text}`;
        }
        lines.push(padToWidth(boxLine(line)));
      }
    } else {
      // Render editor for "Type your own"
      const answerPrefix = this.bold("A: ");
      const editorWidth = contentWidth - 4 - 3;
      const editorLines = this.editor.render(editorWidth);
      for (let i = 1; i < editorLines.length - 1; i++) {
        if (i === 1) {
          lines.push(padToWidth(boxLine(answerPrefix + editorLines[i])));
        } else {
          lines.push(padToWidth(boxLine("   " + editorLines[i])));
        }
      }
    }

    lines.push(padToWidth(emptyBoxLine()));

    // Footer
    if (this.showingConfirmation) {
      lines.push(padToWidth(this.dim("├" + horizontalLine(boxWidth - 2) + "┤")));
      const confirmMsg = `${this.yellow("Submit all answers?")} ${this.dim("(Enter/y to confirm, Esc/n to cancel)")}`;
      lines.push(padToWidth(boxLine(truncateToWidth(confirmMsg, contentWidth))));
    } else {
      lines.push(padToWidth(this.dim("├" + horizontalLine(boxWidth - 2) + "┤")));
      let controls: string;
      if (mode === "select") {
        controls = `${this.dim("↑↓")} navigate · ${this.dim("1-9")} quick pick · ${this.dim("Enter")} select · ${this.dim("Tab")} next · ${this.dim("Esc")} cancel`;
      } else {
        controls = `${this.dim("Enter")} confirm · ${this.dim("Tab")} next · ${this.dim("Esc")} back to choices`;
      }
      lines.push(padToWidth(boxLine(truncateToWidth(controls, contentWidth))));
    }
    lines.push(padToWidth(this.dim("╰" + horizontalLine(boxWidth - 2) + "╯")));

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }
}

// ── Extraction Logic ───────────────────────────────────────────

async function extractQuestions(
  text: string,
  ctx: ExtensionContext,
): Promise<ExtractionResult | null> {
  if (!ctx.model) return null;

  const extractionModel = await selectExtractionModel(ctx.model, ctx.modelRegistry);

  return ctx.ui.custom<ExtractionResult | null>((tui, theme, _kb, done) => {
    const loader = new BorderedLoader(tui, theme, `Extracting questions using ${extractionModel.id}...`);
    loader.onAbort = () => done(null);

    const doExtract = async () => {
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(extractionModel);
      if (auth.ok === false) throw new Error(auth.error);

      const userMessage: UserMessage = {
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.now(),
      };

      const response = await complete(
        extractionModel,
        { systemPrompt: SYSTEM_PROMPT, messages: [userMessage] },
        { apiKey: auth.apiKey, headers: auth.headers, signal: loader.signal },
      );

      if (response.stopReason === "aborted") return null;

      const responseText = response.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n");

      return parseExtractionResult(responseText);
    };

    doExtract()
      .then(done)
      .catch(() => done(null));

    return loader;
  });
}

async function showQnA(
  questions: ExtractedQuestion[],
  ctx: ExtensionContext,
): Promise<string | null> {
  return ctx.ui.custom<string | null>((tui, _theme, _kb, done) => {
    return new QnAComponent(questions, tui, done);
  });
}

async function runAnswerFlow(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  assistantText: string,
): Promise<void> {
  const extractionResult = await extractQuestions(assistantText, ctx);

  if (extractionResult === null) {
    ctx.ui.notify("Cancelled", "info");
    return;
  }

  if (extractionResult.questions.length === 0) {
    ctx.ui.notify("No questions found in the last message", "info");
    return;
  }

  const answersResult = await showQnA(extractionResult.questions, ctx);

  if (answersResult === null) {
    ctx.ui.notify("Cancelled", "info");
    return;
  }

  pi.sendMessage(
    {
      customType: "answers",
      content: "I answered your questions in the following way:\n\n" + answersResult,
      display: true,
    },
    { triggerTurn: true },
  );
}

// ── Extension Entry Point ──────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Manual handler for /answer command and Ctrl+.
  const manualHandler = async (ctx: ExtensionContext) => {
    if (!ctx.hasUI) {
      ctx.ui.notify("answer requires interactive mode", "error");
      return;
    }

    if (!ctx.model) {
      ctx.ui.notify("No model selected", "error");
      return;
    }

    const text = getLastAssistantText(ctx);
    if (!text) {
      ctx.ui.notify("No assistant messages found", "error");
      return;
    }

    await runAnswerFlow(pi, ctx, text);
  };

  // Auto-trigger after agent responses
  pi.on("agent_end", async (_event, ctx) => {
    try {
      if (!ctx.hasUI || !ctx.model) return;

      const text = getLastAssistantText(ctx);
      if (!text || !messageContainsQuestions(text)) return;

      await runAnswerFlow(pi, ctx, text);
    } catch {
      // Silently fail — user can always use /answer manually
    }
  });

  pi.registerCommand("answer", {
    description: "Extract questions from last assistant message into interactive Q&A",
    handler: (_args, ctx) => manualHandler(ctx),
  });

  pi.registerShortcut("ctrl+.", {
    description: "Extract and answer questions",
    handler: manualHandler,
  });
}
