import { visibleWidth } from "@earendil-works/pi-tui";
import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetFactory, WidgetInstance } from "./types.ts";

// ── Types ──────────────────────────────────────────────────────────

interface CompletionItem {
  value: string;
  label: string;
  description?: string;
}

interface AutocompleteProvider {
  getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal?: AbortSignal },
  ): Promise<{ prefix: string; items: CompletionItem[] } | null>;
  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: CompletionItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number };
}

interface EditorState {
  lines: string[];
  cursorLine: number;
  cursorCol: number;
  scrollOffset: number;
  /** Active completion state */
  completions: CompletionItem[] | null;
  completionIdx: number;
  completionPrefix: string;
}

// ── Key helpers ────────────────────────────────────────────────────

function isPrintable(data: string): boolean {
  const code = data.codePointAt(0);
  return code !== undefined && (code >= 0x20 || code === 0x0d || code === 0x0a);
}

function isAutocompleteTrigger(data: string, col: number): boolean {
  if (data === "\t") return true;
  if (data === "/" && col === 0) return true;
  if (data === "@") return true;
  return false;
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
    completions: null,
    completionIdx: 0,
    completionPrefix: "",
  };

  const autocompleteProvider: AutocompleteProvider | null =
    (deps as { autocompleteProvider?: AutocompleteProvider }).autocompleteProvider ?? null;
  const submitFn: ((text: string) => void) | null =
    (deps as { submitFn?: (text: string) => void }).submitFn ?? null;

  // ── Buffer helpers ────────────────────────────────────────────────

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

  function deleteBefore(): void {
    if (state.cursorCol > 0) {
      const line = state.lines[state.cursorLine] ?? "";
      state.lines[state.cursorLine] = line.slice(0, state.cursorCol - 1) + line.slice(state.cursorCol);
      state.cursorCol--;
    } else if (state.cursorLine > 0) {
      const prev = state.lines[state.cursorLine - 1] ?? "";
      const curr = state.lines[state.cursorLine] ?? "";
      state.cursorCol = prev.length;
      state.lines[state.cursorLine - 1] = prev + curr;
      state.lines.splice(state.cursorLine, 1);
      state.cursorLine--;
    }
  }

  function deleteForward(): void {
    const line = state.lines[state.cursorLine] ?? "";
    if (state.cursorCol < line.length) {
      state.lines[state.cursorLine] = line.slice(0, state.cursorCol) + line.slice(state.cursorCol + 1);
    } else if (state.cursorLine < state.lines.length - 1) {
      const next = state.lines[state.cursorLine + 1] ?? "";
      state.lines[state.cursorLine] = line + next;
      state.lines.splice(state.cursorLine + 1, 1);
    }
  }

  function deleteWordBefore(): void {
    if (state.cursorCol === 0) { deleteBefore(); return; }
    const line = state.lines[state.cursorLine] ?? "";
    let pos = state.cursorCol;
    while (pos > 0 && line[pos - 1] === " ") pos--;
    while (pos > 0 && line[pos - 1] !== " ") pos--;
    state.lines[state.cursorLine] = line.slice(0, pos) + line.slice(state.cursorCol);
    state.cursorCol = pos;
  }

  function getFullText(): string { return state.lines.join("\n"); }

  function submitText(): void {
    const text = getFullText();
    state.lines = [""];
    state.cursorLine = 0;
    state.cursorCol = 0;
    if (submitFn) submitFn(text);
  }

  // ── Completions ───────────────────────────────────────────────────

  function dismissCompletions(): void {
    state.completions = null;
    state.completionIdx = 0;
    state.completionPrefix = "";
  }

  async function triggerAutocomplete(): Promise<void> {
    if (!autocompleteProvider) return;
    const abort = new AbortController();
    const result = await autocompleteProvider.getSuggestions(
      state.lines, state.cursorLine, state.cursorCol,
      { signal: abort.signal },
    );
    if (result && result.items.length > 0) {
      state.completions = result.items;
      state.completionIdx = 0;
      state.completionPrefix = result.prefix;
    } else {
      dismissCompletions();
    }
  }

  function applySelectedCompletion(): void {
    if (!state.completions || !autocompleteProvider) return;
    const item = state.completions[state.completionIdx];
    if (!item) return;
    const newState = autocompleteProvider.applyCompletion(
      state.lines, state.cursorLine, state.cursorCol,
      item, state.completionPrefix,
    );
    state.lines = newState.lines;
    state.cursorLine = newState.cursorLine;
    state.cursorCol = newState.cursorCol;
    dismissCompletions();
    clampCursor();
  }

  // ── Rendering ─────────────────────────────────────────────────────

  function renderCompletionPopup(width: number): string[] {
    if (!state.completions || state.completions.length === 0) return [];

    const dim = (s: string) => deps.theme.fg("dim", s);
    const accent = (s: string) => deps.theme.fg("accent", s);
    const muted = (s: string) => deps.theme.fg("muted", s);
    const maxH = Math.min(state.completions.length, 6);
    const items = state.completions.slice(0, maxH);
    const w = Math.max(30, Math.min(width - 4, 70));

    const lines: string[] = [];
    const hz = (c: string) => dim(c.repeat(w));
    lines.push(dim("╭") + hz("─") + dim("╮"));

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const sel = i === state.completionIdx ? accent("▶") : " ";
      let row = ` ${sel} ${item.label}`;
      if (item.description) row += muted(`  ${item.description}`);
      lines.push(dim("│") + padLine(row, w) + dim("│"));
    }

    lines.push(dim("╰") + hz("─") + dim("╯"));
    return lines;
  }

  function renderEditorText(width: number, height: number): string[] {
    clampCursor();
    const lines: string[] = [];

    const popupLines = renderCompletionPopup(width);
    const popupH = popupLines.length;
    const editH = height - popupH;

    // Popup goes above the editor area
    for (const pl of popupLines) lines.push(pl);

    // Scroll to keep cursor in the remaining editor area
    if (state.cursorLine < state.scrollOffset) state.scrollOffset = state.cursorLine;
    if (state.cursorLine >= state.scrollOffset + editH) {
      state.scrollOffset = state.cursorLine - editH + 1;
    }
    if (state.scrollOffset < 0) state.scrollOffset = 0;

    const visible = state.lines.slice(state.scrollOffset, state.scrollOffset + editH);

    for (let i = 0; i < visible.length; i++) {
      const li = state.scrollOffset + i;
      const text = visible[i] ?? "";
      if (li === state.cursorLine) {
        const before = text.slice(0, state.cursorCol);
        const at = text[state.cursorCol] ?? " ";
        const after = text.slice(state.cursorCol + 1);
        const cursor = deps.theme.fg("accent", `\x1b[7m${at}\x1b[27m`);
        lines.push(padLine(`> ${before}${cursor}${after}`, width));
      } else {
        lines.push(padLine(`  ${text}`, width));
      }
    }

    for (let i = lines.length; i < height; i++) {
      lines.push(deps.theme.fg("dim", "~") + " ".repeat(Math.max(0, width - 1)));
    }

    return lines;
  }

  // ── Widget instance ──────────────────────────────────────────────

  const instance: WidgetInstance = {
    render(width: number, height: number): string[] {
      return renderEditorText(width, height);
    },

    handleInput(data: string): boolean {
      // ── Arrow keys with completions active ──
      if (state.completions) {
        if (data === "\x1b[A" || data === "\x1bOA") {
          state.completionIdx = Math.max(0, state.completionIdx - 1);
          return true;
        }
        if (data === "\x1b[B" || data === "\x1bOB") {
          state.completionIdx = Math.min(state.completions.length - 1, state.completionIdx + 1);
          return true;
        }
        if (data === "\r" || data === "\n" || data === "\t") {
          applySelectedCompletion();
          return true;
        }
        if (data === "\x1b") {
          dismissCompletions();
          return true;
        }
      }

      // ── Enter: submit ──
      if (data === "\r" || data === "\n") {
        if (state.lines.length > 1) {
          // Multi-line: insert newline
          const line = state.lines[state.cursorLine] ?? "";
          const before = line.slice(0, state.cursorCol);
          const after = line.slice(state.cursorCol);
          state.lines[state.cursorLine] = before;
          state.lines.splice(state.cursorLine + 1, 0, after);
          state.cursorLine++;
          state.cursorCol = 0;
          return true;
        }
        submitText();
        return false; // let GridComponent → super handle submit
      }

      // ── Autocomplete triggers ──
      if (isAutocompleteTrigger(data, state.cursorCol)) {
        insertChar(data);
        dismissCompletions();
        void triggerAutocomplete();
        return true;
      }

      // ── Escape ──
      if (data === "\x1b") {
        state.lines = [""]; state.cursorLine = 0; state.cursorCol = 0;
        dismissCompletions();
        return true;
      }

      // ── Deletion ──
      if (data === "\x7f" || data === "\x08") { deleteBefore(); return true; }
      if (data === "\x1b[3~") { deleteForward(); return true; }
      if (data === "\x17" || data === "\x1b\x7f") { deleteWordBefore(); return true; }

      // ── Navigation (no completions active) ──
      if (data === "\x1b[D") {
        if (state.cursorCol > 0) state.cursorCol--;
        else if (state.cursorLine > 0) { state.cursorLine--; state.cursorCol = (state.lines[state.cursorLine] ?? "").length; }
        return true;
      }
      if (data === "\x1b[C") {
        const ln = state.lines[state.cursorLine] ?? "";
        if (state.cursorCol < ln.length) state.cursorCol++;
        else if (state.cursorLine < state.lines.length - 1) { state.cursorLine++; state.cursorCol = 0; }
        return true;
      }
      if (data === "\x1b[A") { if (state.cursorLine > 0) state.cursorLine--; return true; }
      if (data === "\x1b[B") { if (state.cursorLine < state.lines.length - 1) state.cursorLine++; return true; }

      if (data === "\x01") { state.cursorCol = 0; return true; }
      if (data === "\x05") { const le = state.lines[state.cursorLine] ?? ""; state.cursorCol = le.length; return true; }

      // ── Kill line ──
      if (data === "\x0b") { state.lines[state.cursorLine] = (state.lines[state.cursorLine] ?? "").slice(0, state.cursorCol); return true; }
      if (data === "\x15") { state.lines[state.cursorLine] = (state.lines[state.cursorLine] ?? "").slice(state.cursorCol); state.cursorCol = 0; return true; }

      // ── Printable ──
      if (isPrintable(data) && data !== "\r" && data !== "\n") {
        insertChar(data);
        // Re-trigger completions if they were active (live filtering via provider)
        if (state.completions) {
          dismissCompletions();
          void triggerAutocomplete();
        }
        return true;
      }

      return false;
    },

    invalidate(): void {},
    configure(_cfg: Record<string, unknown>): void {},
  };

  return instance;
};

function padLine(line: string, width: number): string {
  const vw = visibleWidth(line);
  if (vw >= width) return line.slice(0, width);
  return line + " ".repeat(width - vw);
}

registerWidget("editor", customEditorWidgetFactory);
