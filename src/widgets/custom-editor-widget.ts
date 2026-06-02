import { visibleWidth } from "@earendil-works/pi-tui";
import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetFactory, WidgetInstance } from "./types.ts";
import { CompletionEngine } from "../completion/completion-engine.ts";

// ── Types ──────────────────────────────────────────────────────────

interface EditorState {
  lines: string[];
  cursorLine: number;
  cursorCol: number;
  /** First visible line index (scroll offset) */
  scrollOffset: number;
}

// ── Key matching (inline, avoids pi-tui dependency for simple cases) ─

enum Arrow {
  Up = "\x1b[A",
  Down = "\x1b[B",
  Right = "\x1b[C",
  Left = "\x1b[D",
}

function isArrow(data: string, dir: string): boolean {
  return data === dir;
}

function isPrintable(data: string): boolean {
  if (data.length === 0) return false;
  const code = data.codePointAt(0);
  if (code === undefined) return false;
  // Printable range excluding control chars but including newline
  return code >= 0x20 || code === 0x0d || code === 0x0a;
}

// ── Editor Widget ───────────────────────────────────────────────────

export const customEditorWidgetFactory: WidgetFactory = (
  deps: WidgetDeps,
  _config: unknown,
) => {
  const state: EditorState = {
    lines: [""],
    cursorLine: 0,
    cursorCol: 0,
    scrollOffset: 0,
  };

  /** Completion engine from deps (injected by GridComponent) */
  let completionEngine: CompletionEngine | null = deps.completionEngine ?? null;
  let onSubmit: ((text: string) => void) | null = null;
  let autocompleteProvider: {
    getSuggestions: (
      lines: string[],
      cursorLine: number,
      cursorCol: number,
      options: { signal?: AbortSignal },
    ) => Promise<{ prefix: string; items: Array<{ value: string; label: string; description?: string }> } | null>;
    applyCompletion: (
      lines: string[],
      cursorLine: number,
      cursorCol: number,
      item: { value: string; label: string },
      prefix: string,
    ) => { lines: string[]; cursorLine: number; cursorCol: number };
  } | null = null;

  /** Try to wire up the autocomplete provider chain from pi */
  function wireAutocomplete(): void {
    try {
      const ctx = (deps.pi as { ctx?: { ui?: { addAutocompleteProvider?: (fn: (current: unknown) => unknown) => void } } }).ctx;
      const ui = (deps.pi as { ui?: { addAutocompleteProvider?: (fn: (current: unknown) => unknown) => void } }).ui;
      const addProviderFn = ctx?.ui?.addAutocompleteProvider ?? ui?.addAutocompleteProvider;
      if (addProviderFn) {
        let capturedProvider: typeof autocompleteProvider = null;
        addProviderFn((current: unknown) => {
          capturedProvider = current as typeof autocompleteProvider;
          return {
            ...(current as object),
          };
        });
        autocompleteProvider = capturedProvider;
      }
    } catch {
      // Autocomplete not available; editor works without it
    }
  }

  function clampCursor(): void {
    const line = state.lines[state.cursorLine] ?? "";
    if (state.cursorCol > line.length) state.cursorCol = line.length;
    if (state.cursorCol < 0) state.cursorCol = 0;
  }

  function insertChar(ch: string): void {
    const line = state.lines[state.cursorLine] ?? "";
    state.lines[state.cursorLine] = line.slice(0, state.cursorCol) + ch + line.slice(state.cursorCol);
    state.cursorCol += ch.length;
  }

  function insertNewline(): void {
    const line = state.lines[state.cursorLine] ?? "";
    const before = line.slice(0, state.cursorCol);
    const after = line.slice(state.cursorCol);
    state.lines[state.cursorLine] = before;
    state.lines.splice(state.cursorLine + 1, 0, after);
    state.cursorLine++;
    state.cursorCol = 0;
  }

  function deleteBefore(): void {
    if (state.cursorCol > 0) {
      const line = state.lines[state.cursorLine] ?? "";
      state.lines[state.cursorLine] = line.slice(0, state.cursorCol - 1) + line.slice(state.cursorCol);
      state.cursorCol--;
    } else if (state.cursorLine > 0) {
      const prevLine = state.lines[state.cursorLine - 1] ?? "";
      const currentLine = state.lines[state.cursorLine] ?? "";
      state.cursorCol = prevLine.length;
      state.lines[state.cursorLine - 1] = prevLine + currentLine;
      state.lines.splice(state.cursorLine, 1);
      state.cursorLine--;
    }
  }

  function deleteForward(): void {
    const line = state.lines[state.cursorLine] ?? "";
    if (state.cursorCol < line.length) {
      state.lines[state.cursorLine] = line.slice(0, state.cursorCol) + line.slice(state.cursorCol + 1);
    } else if (state.cursorLine < state.lines.length - 1) {
      const nextLine = state.lines[state.cursorLine + 1] ?? "";
      state.lines[state.cursorLine] = line + nextLine;
      state.lines.splice(state.cursorLine + 1, 1);
    }
  }

  function moveToLineStart(): void {
    state.cursorCol = 0;
  }

  function moveToLineEnd(): void {
    const line = state.lines[state.cursorLine] ?? "";
    state.cursorCol = line.length;
  }

  function deleteWordBefore(): void {
    if (state.cursorCol === 0) {
      deleteBefore();
      return;
    }
    const line = state.lines[state.cursorLine] ?? "";
    let pos = state.cursorCol;
    // Skip trailing whitespace
    while (pos > 0 && line[pos - 1] === " ") pos--;
    // Skip word chars
    while (pos > 0 && line[pos - 1] !== " ") pos--;
    state.lines[state.cursorLine] = line.slice(0, pos) + line.slice(state.cursorCol);
    state.cursorCol = pos;
  }

  function getFullText(): string {
    return state.lines.join("\n");
  }

  async function triggerAutocomplete(width: number, termHeight: number): Promise<void> {
    if (!autocompleteProvider || completionEngine?.isActive) return;

    const result = await autocompleteProvider.getSuggestions(
      state.lines,
      state.cursorLine,
      state.cursorCol,
      {},
    );

    if (result && result.items.length > 0 && completionEngine) {
      completionEngine.show(
        result.items,
        termHeight,
        width,
        {
          fg: deps.theme.fg,
          bg: (c: string, t: string) => deps.theme.fg(c, t),
        },
        state.cursorLine + 2,
      );

      const prefix = result.prefix;
      const provider = autocompleteProvider;
      const engine = completionEngine;
      engine.onApply = (selectedValue: string) => {
        const selected = result.items.find((i) => i.value === selectedValue) ?? result.items[0];
        if (selected && provider) {
          const newState = provider.applyCompletion(
            state.lines,
            state.cursorLine,
            state.cursorCol,
            selected,
            prefix,
          );
          state.lines = newState.lines;
          state.cursorLine = newState.cursorLine;
          state.cursorCol = newState.cursorCol;
          clampCursor();
        }
      };
    }
  }

  // ── Widget instance ──────────────────────────────────────────────

  const instance: WidgetInstance = {
    render(width: number, height: number): string[] {
      clampCursor();
      const lines: string[] = [];

      // Calculate visible range (scroll)
      if (state.cursorLine < state.scrollOffset) {
        state.scrollOffset = state.cursorLine;
      }
      const maxVisible = height;
      if (state.cursorLine >= state.scrollOffset + maxVisible) {
        state.scrollOffset = state.cursorLine - maxVisible + 1;
      }
      if (state.scrollOffset < 0) state.scrollOffset = 0;

      const visibleLines = state.lines.slice(
        state.scrollOffset,
        state.scrollOffset + maxVisible,
      );

      for (let i = 0; i < visibleLines.length; i++) {
        const lineIdx = state.scrollOffset + i;
        const text = visibleLines[i] ?? "";

        if (lineIdx === state.cursorLine) {
          // Render with cursor
          const before = text.slice(0, state.cursorCol);
          const at = text[state.cursorCol] ?? " ";
          const after = text.slice(state.cursorCol + 1);
          const cursor = deps.theme.fg("accent", `\x1b[7m${at}\x1b[27m`);
          const line = `> ${before}${cursor}${after}`;
          lines.push(padLine(line, width));
        } else {
          const line = `  ${text}`;
          lines.push(padLine(line, width));
        }
      }

      // Fill remaining height
      for (let i = lines.length; i < height; i++) {
        lines.push(deps.theme.fg("dim", "~") + " ".repeat(Math.max(0, width - 1)));
      }

      return lines;
    },

    handleInput(data: string): boolean {
      // If completion popup is active, let it handle input
      if (completionEngine?.isActive) {
        // CompletionPopup handles its own input via the overlay
        return true;
      }

      if (data === "\x1b") {
        // Escape: clear editor or close completion
        state.lines = [""];
        state.cursorLine = 0;
        state.cursorCol = 0;
        return true;
      }

      if (data === "\x7f" || data === "\x08") {
        deleteBefore();
        return true;
      }

      if (data === "\x1b[3~") {
        deleteForward();
        return true;
      }

      if (data === "\x17" || data === "\x1b\x7f") {
        // Ctrl+W or Alt+Backspace: delete word
        deleteWordBefore();
        return true;
      }

      if (data === "\r" || data === "\n") {
        // Enter: submit if single line, else newline
        if (state.lines.length === 1 && !state.lines[0]?.includes("\n")) {
          // Shift+Enter would be multi-line; plain Enter submits
          onSubmit?.(getFullText());
          return true;
        }
        insertNewline();
        return true;
      }

      if (isArrow(data, Arrow.Left)) {
        if (state.cursorCol > 0) state.cursorCol--;
        else if (state.cursorLine > 0) {
          state.cursorLine--;
          state.cursorCol = (state.lines[state.cursorLine] ?? "").length;
        }
        return true;
      }

      if (isArrow(data, Arrow.Right)) {
        const line = state.lines[state.cursorLine] ?? "";
        if (state.cursorCol < line.length) state.cursorCol++;
        else if (state.cursorLine < state.lines.length - 1) {
          state.cursorLine++;
          state.cursorCol = 0;
        }
        return true;
      }

      if (isArrow(data, Arrow.Up)) {
        if (state.cursorLine > 0) state.cursorLine--;
        return true;
      }

      if (isArrow(data, Arrow.Down)) {
        if (state.cursorLine < state.lines.length - 1) state.cursorLine++;
        return true;
      }

      if (data === "\x01") {
        // Ctrl+A: line start
        moveToLineStart();
        return true;
      }

      if (data === "\x05") {
        // Ctrl+E: line end
        moveToLineEnd();
        return true;
      }

      if (data === "\x0b") {
        // Ctrl+K: kill to end of line
        const line = state.lines[state.cursorLine] ?? "";
        state.lines[state.cursorLine] = line.slice(0, state.cursorCol);
        return true;
      }

      if (data === "\x15") {
        // Ctrl+U: kill to start of line
        const line = state.lines[state.cursorLine] ?? "";
        state.lines[state.cursorLine] = line.slice(state.cursorCol);
        state.cursorCol = 0;
        return true;
      }

      if (data === "\t") {
        // Tab: trigger autocomplete
        const termHeight = deps.tui.termHeight ?? 24;
        void triggerAutocomplete(80, termHeight); // width will be refined
        return true;
      }

      if (isPrintable(data)) {
        insertChar(data);
        return true;
      }

      return false;
    },

    invalidate(): void {
      // No cache
    },

    configure(cfg: Record<string, unknown>): void {
      if (typeof cfg.onSubmit === "function") {
        onSubmit = cfg.onSubmit as (text: string) => void;
      }
      // Allow injecting completion engine after construction
      if (cfg.completionEngine instanceof CompletionEngine) {
        completionEngine = cfg.completionEngine;
      }
    },
  };

  // Wire up autocomplete
  wireAutocomplete();

  return instance;
};

/** Pad a line to the target width, handling ANSI escape codes */
function padLine(line: string, width: number): string {
  const vw = visibleWidth(line);
  if (vw >= width) return line.slice(0, width);
  return line + " ".repeat(width - vw);
}

// Register the custom editor as the "editor" widget (replaces the placeholder)
registerWidget("editor", customEditorWidgetFactory);
