# pi-zazz Custom Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a declarative, grid-based custom editor extension for pi with pill-style status bar, editor+pi-lens split pane, prompt bar, and completion popup overlay.

**Architecture:** A `GridComponent extends CustomEditor` renders a configurable JSON grid layout. Each cell hosts a `Widget` implementing `WidgetInstance { render(), invalidate(), handleInput?() }`. Built-in widgets: status-bar (Nerd Font pills reusing powerline segments), editor (wrapping pi's built-in editor), pi-lens (subscribing to `pi.events`), prompt-bar (read-only). A completion engine intercepts autocomplete and renders results as a floating overlay popup.

**Tech Stack:** TypeScript, `@earendil-works/pi-coding-agent` (ExtensionAPI, CustomEditor), `@earendil-works/pi-tui` (Component, matchesKey, truncateToWidth, visibleWidth). Nerd Font glyphs via Unicode code points.

**Verification:** After each task, run `npm run typecheck` to verify no TypeScript errors.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/grid/types.ts` | GridConfig, RowConfig, ColumnConfig, HeightConstraint, WidthConstraint, WidgetConfig, GridCellInfo |
| `src/widgets/types.ts` | WidgetInstance, WidgetFactory, WidgetDeps |
| `src/icons.ts` | Nerd Font icon map (all icons as Unicode escapes) |
| `src/default-config.ts` | Default GridConfig |
| `src/grid/grid-engine.ts` | Pure layout solver: computeLayout(config, termWidth, termHeight) → LayoutPlan |
| `src/grid/grid-component.ts` | GridComponent extends CustomEditor; delegates to grid-engine, manages widget instances |
| `src/widgets/registry.ts` | WidgetFactory Map, registerWidget(), createFromConfig() |
| `src/status-bar/pill-renderer.ts` | Renders a single pill badge with icon, text, color |
| `src/status-bar/segments.ts` | All 19 powerline segment render functions |
| `src/widgets/editor-widget.ts` | EditorWidget wrapping pi's built-in editor |
| `src/widgets/status-bar-widget.ts` | StatusBarWidget composing pills from segments |
| `src/widgets/lens-widget.ts` | LensWidget subscribing to pi-lens events |
| `src/widgets/prompt-bar-widget.ts` | PromptBarWidget showing last user prompt |
| `src/completion/completion-popup.ts` | CompletionPopup TUI overlay component |
| `src/completion/completion-engine.ts` | CompletionEngine managing popup lifecycle |
| `src/index.ts` | Extension entry: event wiring, grid initialization, API registration |

---

### Task 1: Grid Types

**Files:**
- Create: `src/grid/types.ts`

- [ ] **Step 1: Write grid type definitions**

```typescript
// src/grid/types.ts

/** A cell position within the rendered grid */
export interface GridCellInfo {
  row: number;
  col: number;
  rowId: string;
  colId: string;
  /** Absolute terminal row where this cell starts (0-indexed) */
  terminalRow: number;
  /** Absolute terminal column where this cell starts (0-indexed) */
  terminalCol: number;
}

/** Height constraint for a row */
export interface HeightConstraint {
  /** Minimum rows (characters) this row occupies */
  min: number;
  /** Maximum rows; undefined = unbounded */
  max?: number;
  /** When true, this row consumes remaining space after fixed rows are allocated */
  grow?: boolean;
}

/** Responsive behavior when terminal width < breakpoint */
export interface ResponsiveConfig {
  /** Terminal width threshold in columns */
  breakpoint: number;
  /** Layout mode when below breakpoint: stacked = columns stack vertically, hidden = row hidden */
  narrowLayout: "stacked" | "hidden";
}

/** Width constraint for a column */
export interface WidthConstraint {
  /** Proportional weight (e.g. 2 = 2/3 of row) */
  fraction?: number;
  /** Minimum characters before collapse; defaults to 1 */
  min?: number;
  /** Maximum characters; undefined = unbounded */
  max?: number;
}

/** Optional border between columns */
export interface BorderConfig {
  /** Border character (default "│") */
  char?: string;
  /** Apply theme color to border; default "border" */
  color?: string;
}

/** Widget reference within a column cell */
export interface WidgetConfig {
  /** Registered widget type name */
  type: string;
  /** Widget-specific configuration object */
  config?: Record<string, unknown>;
}

/** A single column within a row */
export interface ColumnConfig {
  id: string;
  width: WidthConstraint;
  /** When true, content scrolls within allocated height */
  scrollable?: boolean;
  /** Optional border drawn between this and the previous column */
  border?: BorderConfig;
  widget: WidgetConfig;
}

/** A single row in the grid */
export interface RowConfig {
  id: string;
  height: HeightConstraint;
  responsive?: ResponsiveConfig;
  /** Whether this row is visible; default true */
  visible?: boolean;
  columns: ColumnConfig[];
}

/** Top-level grid configuration */
export interface GridConfig {
  /** Min terminal width before fallback to default editor; default 40 */
  minWidth?: number;
  /** Min terminal height before fallback to default editor; default 8 */
  minHeight?: number;
  rows: RowConfig[];
}

/** Width allocation for one column after layout solving */
export interface ColumnLayout {
  id: string;
  width: number;
  scrollable: boolean;
  borderLeft?: BorderConfig;
  widget: WidgetConfig;
}

/** Height allocation for one row after layout solving */
export interface RowLayout {
  id: string;
  height: number;
  stacked: boolean;
  columns: ColumnLayout[];
}

/** The complete solved layout plan */
export interface LayoutPlan {
  rows: RowLayout[];
  /** true if the terminal is below minWidth/minHeight */
  fallback: boolean;
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/grid/types.ts
git commit -m "feat: add grid type definitions"
```

---

### Task 2: Widget Types

**Files:**
- Create: `src/widgets/types.ts`

- [ ] **Step 1: Write widget type definitions**

```typescript
// src/widgets/types.ts

import type { ExtensionAPI, KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import type { GridCellInfo } from "../grid/types.ts";

/** Dependencies injected into every widget factory */
export interface WidgetDeps {
  /** The pi extension API instance */
  pi: ExtensionAPI;
  /** The TUI instance (for requestRender, screen dimensions) */
  tui: TUI;
  /** Current theme foreground color helper */
  theme: {
    fg: (color: string, text: string) => string;
  };
  /** Keybinding manager for shortcut detection */
  keybindings: KeybindingsManager;
}

/** Interface every widget must implement */
export interface WidgetInstance {
  /**
   * Render the widget's content.
   * @param width - Available character columns
   * @param height - Available character rows
   * @returns Array of lines, each ≤ width. Can return fewer lines than height.
   */
  render(width: number, height: number): string[];

  /**
   * Handle keyboard input when this widget has focus.
   * Return true if the input was consumed (prevents bubbling).
   */
  handleInput?(data: string): boolean;

  /** Clear cached render state. Called on theme changes or data updates. */
  invalidate(): void;

  /** Optional height negotiation. Defaults to { min: 1 }. */
  heightConstraint?(): { min: number; max?: number };

  /** Called after construction with the widget's config from JSON. */
  configure?(config: Record<string, unknown>): void;

  /** Whether this widget wants key release events (Kitty protocol). */
  wantsKeyRelease?: boolean;
}

/** Factory function that creates a widget instance */
export type WidgetFactory = (
  deps: WidgetDeps,
  config: unknown,
  cell: GridCellInfo,
) => WidgetInstance;
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/widgets/types.ts
git commit -m "feat: add widget type definitions"
```

---

### Task 3: Icons

**Files:**
- Create: `src/icons.ts`

- [ ] **Step 1: Write Nerd Font icon map**

```typescript
// src/icons.ts

/**
 * Nerd Font icon map for pi-zazz.
 * Every icon is a Nerd Font glyph using Unicode code points from the Nerd Fonts v3+ standard.
 * If the user's terminal does not support Nerd Fonts, these render as fallback glyphs.
 *
 * Icon names follow the nf-<set>-<name> convention:
 * - nf-md-*  = Material Design Icons (most common, broad support)
 * - nf-fa-*  = Font Awesome
 * - nf-dev-* = Devicons
 * - nf-oct-* = Octicons
 */

export const ICONS = {
  // Model / AI
  model: "\u{DB80}\u{DE1A}",   // nf-md-brain 󰘚

  // Shell
  shell: "\u{ED48}",            // nf-fa-terminal 

  // Path / folder
  folder: "\u{F07B}",            // nf-fa-folder 

  // Git
  branch: "\u{E725}",            // nf-dev-git_branch 
  git: "\u{F1D3}",               // nf-fa-git 
  staged: "\u{F457}",            // nf-oct-diff_added 
  unstaged: "\u{F459}",          // nf-oct-diff_modified 
  untracked: "\u{F128}",         // nf-fa-question 

  // Thinking / cognition
  thinking: "\u{F192}",          // nf-fa-circle 

  // Context / memory
  context: "\u{DB80}\u{DCDF}",  // nf-md-chart_donut 󰃟

  // Diagnostics
  error: "\u{F057}",             // nf-fa-times_circle 
  warning: "\u{F071}",           // nf-fa-warning 
  success: "\u{F058}",           // nf-fa-check_circle 
  info: "\u{F05A}",              // nf-fa-info_circle 

  // Time
  clock: "\u{F017}",             // nf-fa-clock 

  // Tokens
  tokensIn: "\u{DB80}\u{DC55}", // nf-md-arrow_down 󰁕
  tokensOut: "\u{DB80}\u{DC54}",// nf-md-arrow_up 󰁔

  // Cost / money
  cost: "\u{F155}",              // nf-fa-money 

  // Session
  session: "\u{DB80}\u{DF06}",  // nf-md-identifier 󰌆

  // Host
  host: "\u{DB80}\u{DE4B}",     // nf-md-server 󰒋

  // Cache
  cache: "\u{DB80}\u{DC56}",    // nf-md-database 󰏗
  cacheRead: "\u{DB80}\u{DC55}",// same as tokensIn
  cacheWrite: "\u{DB80}\u{DC54}",// same as tokensOut

  // Navigation
  prevPrompt: "\u{F053}",        // nf-fa-chevron_left 

  // LSP / language
  lsp: "\u{DB80}\u{DE1E}",      // nf-md-language_c 󰨞

  // Formatter
  formatter: "\u{F040}",         // nf-fa-pencil 

  // Separator dot
  sepDot: "\u{F111}",            // nf-fa-circle  used as inter-segment separator

  // Spinner frames (braille)
  spinner: ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"],

  // Auto-compact indicator
  autoCompact: "\u{F021}",       // nf-fa-refresh 
} as const;

export type IconName = keyof typeof ICONS;

/** Get an icon by name, returning empty string if not found */
export function icon(name: IconName): string {
  const value = ICONS[name];
  return Array.isArray(value) ? value[0]! : value;
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/icons.ts
git commit -m "feat: add Nerd Font icon map"
```

---

### Task 4: Default Config

**Files:**
- Create: `src/default-config.ts`

- [ ] **Step 1: Write default grid config**

```typescript
// src/default-config.ts

import type { GridConfig } from "./grid/types.ts";

export const DEFAULT_GRID: GridConfig = {
  minWidth: 40,
  minHeight: 8,
  rows: [
    {
      id: "status-bar",
      height: { min: 1, max: 1 },
      columns: [
        {
          id: "status",
          width: {},
          widget: {
            type: "status-bar",
            config: {
              separator: "powerline-thin",
              leftSegments: [
                "model",
                "thinking",
                "path",
                "git",
                "context_pct",
                "cost",
              ],
              rightSegments: [
                "token_total",
                "time",
                "extension_statuses",
              ],
              segmentOptions: {
                model: { showThinkingLevel: false },
                path: { mode: "basename" },
                git: {
                  showBranch: true,
                  showStaged: true,
                  showUnstaged: true,
                  showUntracked: true,
                },
              },
            },
          },
        },
      ],
    },
    {
      id: "main",
      height: { min: 2, max: 12, grow: true },
      responsive: { breakpoint: 80, narrowLayout: "stacked" },
      columns: [
        {
          id: "editor",
          width: { fraction: 2, min: 20 },
          widget: { type: "editor", config: {} },
        },
        {
          id: "lens",
          width: { fraction: 1, min: 20 },
          scrollable: true,
          widget: { type: "pi-lens", config: { maxDiagnostics: 20 } },
        },
      ],
    },
    {
      id: "prompt-bar",
      height: { min: 1, max: 1 },
      columns: [
        {
          id: "prompt",
          width: {},
          widget: {
            type: "prompt-bar",
            config: { maxLength: 120 },
          },
        },
      ],
    },
  ],
};
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/default-config.ts
git commit -m "feat: add default grid config"
```

---

### Task 5: Grid Layout Solver

**Files:**
- Create: `src/grid/grid-engine.ts`

- [ ] **Step 1: Write the layout solver**

```typescript
// src/grid/grid-engine.ts

import type {
  BorderConfig,
  ColumnConfig,
  ColumnLayout,
  GridConfig,
  HeightConstraint,
  LayoutPlan,
  ResponsiveConfig,
  RowConfig,
  RowLayout,
  WidthConstraint,
} from "./types.ts";

/**
 * Pure function: given a grid config and terminal dimensions,
 * produce a LayoutPlan with exact row heights and column widths.
 * Does NOT depend on any widget or rendering code.
 */
export function computeLayout(
  config: GridConfig,
  termWidth: number,
  termHeight: number,
): LayoutPlan {
  // --- Fallback check ---
  const minWidth = config.minWidth ?? 40;
  const minHeight = config.minHeight ?? 8;
  if (termWidth < minWidth || termHeight < minHeight) {
    return { rows: [], fallback: true };
  }

  const visibleRows = config.rows.filter((r) => r.visible !== false);
  if (visibleRows.length === 0) {
    return { rows: [], fallback: false };
  }

  // --- Pass 1: Height allocation ---
  const rowHeights = allocateHeights(visibleRows, termHeight);

  // --- Pass 2: Width allocation (per row) ---
  const rows: RowLayout[] = [];
  for (let i = 0; i < visibleRows.length; i++) {
    const rowConfig = visibleRows[i]!;
    const height = rowHeights[i]!;
    const { stacked, columns } = allocateWidths(
      rowConfig,
      termWidth,
    );
    rows.push({ id: rowConfig.id, height, stacked, columns });
  }

  return { rows, fallback: false };
}

function allocateHeights(
  rowConfigs: readonly RowConfig[],
  termHeight: number,
): number[] {
  const heights = new Array<number>(rowConfigs.length).fill(0);

  // First pass: assign fixed rows (max === min) and mins
  for (let i = 0; i < rowConfigs.length; i++) {
    const h = rowConfigs[i]!.height;
    if (h.max !== undefined && h.max === h.min) {
      heights[i] = h.min;
    } else {
      heights[i] = h.min;
    }
  }

  // Calculate remaining space
  let used = heights.reduce((sum, h) => sum + h, 0);
  let remaining = termHeight - used;

  // Second pass: distribute remaining to grow rows
  if (remaining > 0) {
    const growRows = rowConfigs
      .map((r, i) => ({ height: r.height, index: i }))
      .filter((r) => r.height.grow === true && r.height.max !== r.height.min);

    if (growRows.length > 0) {
      // Distribute evenly among grow rows
      let perRow = Math.floor(remaining / growRows.length);

      for (const { height, index } of growRows) {
        const capped = clampExtra(perRow, heights[index]!, height);
        heights[index] = heights[index]! + capped;
        remaining -= capped;
      }

      // Distribute any remainder to the first grow row
      if (remaining > 0 && growRows.length > 0) {
        const first = growRows[0]!;
        const capped = clampExtra(
          remaining,
          heights[first.index]!,
          first.height,
        );
        heights[first.index] = heights[first.index]! + capped;
      }
    }
  }

  // Third pass: if we exceeded term height, shrink from bottom up
  if (used > termHeight) {
    for (let i = rowConfigs.length - 1; i >= 0; i--) {
      const h = rowConfigs[i]!.height;
      const excess = used - termHeight;
      if (excess <= 0) break;
      const shrink = Math.min(heights[i]! - h.min, excess);
      heights[i] = heights[i]! - shrink;
      used -= shrink;
    }
  }

  return heights;
}

function clampExtra(
  extra: number,
  current: number,
  constraint: HeightConstraint,
): number {
  const max = constraint.max ?? Number.POSITIVE_INFINITY;
  const capped = Math.min(extra, max - current);
  return Math.max(0, capped);
}

function allocateWidths(
  rowConfig: RowConfig,
  termWidth: number,
): { stacked: boolean; columns: ColumnLayout[] } {
  const responsive = rowConfig.responsive;
  const columns = rowConfig.columns;

  const useStacked =
    responsive !== undefined && termWidth < responsive.breakpoint;

  if (useStacked) {
    // Stacked: each column gets full width, height budget split among them
    return {
      stacked: true,
      columns: columns.map((col) => ({
        id: col.id,
        width: termWidth,
        scrollable: col.scrollable ?? false,
        borderLeft: undefined,
        widget: col.widget,
      })),
    };
  }

  // Horizontal mode: distribute by fractions
  return {
    stacked: false,
    columns: distributeWidths(columns, termWidth),
  };
}

function distributeWidths(
  columns: readonly ColumnConfig[],
  totalWidth: number,
): ColumnLayout[] {
  if (columns.length === 0) return [];

  // Count how many columns use fraction-based sizing
  const totalFractions = columns.reduce(
    (sum, c) => sum + (c.width.fraction ?? 0),
    0,
  );

  // If no fractions specified, split evenly
  const effectiveTotal =
    totalFractions > 0 ? totalFractions : columns.length;

  // Deduct minimums first
  const mins = columns.map((c) => c.width.min ?? 1);
  const totalMins = mins.reduce((s, m) => s + m, 0);
  const distributable = Math.max(0, totalWidth - totalMins);

  const widths: number[] = [];
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]!;
    const fraction = col.width.fraction ?? 1;
    const extra = Math.floor(
      (distributable * fraction) / effectiveTotal,
    );
    let w = mins[i]! + extra;
    if (col.width.max !== undefined) {
      w = Math.min(w, col.width.max);
    }
    widths.push(w);
  }

  // Distribute remainder to first non-maxed column
  let used = widths.reduce((s, w) => s + w, 0);
  if (used < totalWidth) {
    for (let i = 0; i < widths.length && used < totalWidth; i++) {
      const col = columns[i]!;
      const max = col.width.max ?? Number.POSITIVE_INFINITY;
      const add = Math.min(totalWidth - used, max - widths[i]!);
      widths[i] = widths[i]! + add;
      used += add;
    }
  }

  return columns.map((col, i) => ({
    id: col.id,
    width: widths[i]!,
    scrollable: col.scrollable ?? false,
    borderLeft: col.border,
    widget: col.widget,
  }));
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/grid/grid-engine.ts
git commit -m "feat: add grid layout solver"
```

---

### Task 6: Grid Component (CustomEditor)

**Files:**
- Create: `src/grid/grid-component.ts`

- [ ] **Step 1: Write GridComponent**

```typescript
// src/grid/grid-component.ts

import {
  CustomEditor,
  type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { WidgetDeps, WidgetInstance } from "../widgets/types.ts";
import { createFromConfig } from "../widgets/registry.ts";
import { computeLayout } from "./grid-engine.ts";
import type { GridConfig, GridCellInfo } from "./types.ts";

/**
 * GridComponent extends pi's CustomEditor. It replaces the default editor
 * via ctx.ui.setEditorComponent(). The grid engine allocates space, then
 * each widget renders into its allocated cell.
 */
export class GridComponent extends CustomEditor {
  private config: GridConfig;
  private deps: WidgetDeps;
  private widgets: Map<string, WidgetInstance> = new Map();
  private cachedPlan: { rows: string[][]; width: number } | null = null;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    deps: WidgetDeps,
    config: GridConfig,
  ) {
    super(tui, theme, keybindings);
    this.config = config;
    this.deps = deps;
  }

  override render(width: number): string[] {
    const termHeight = this.deps.tui.termHeight ?? 24;
    const plan = computeLayout(this.config, width, termHeight);

    if (plan.fallback) {
      // Fallback: delegate to default editor rendering
      return super.render(width);
    }

    // Build widget instances for each cell (lazy, cached by cell id)
    let terminalRow = 0;
    const allLines: string[] = [];

    for (const row of plan.rows) {
      if (row.stacked) {
        // Stacked mode: divide row height among columns, full width each
        const perColHeight = Math.max(
          1,
          Math.floor(row.height / row.columns.length),
        );
        for (let ci = 0; ci < row.columns.length; ci++) {
          const col = row.columns[ci]!;
          const widget = this.getWidget(col.id, row.id, ci, terminalRow, 0);
          const lines = widget.render(width, perColHeight);
          for (const line of lines) {
            allLines.push(this.clampLine(line, width));
          }
          terminalRow += perColHeight;
        }
      } else {
        // Horizontal mode: columns side by side
        let maxCellHeight = 0;
        const cellLines: string[][] = [];

        for (let ci = 0; ci < row.columns.length; ci++) {
          const col = row.columns[ci]!;
          const widget = this.getWidget(col.id, row.id, ci, terminalRow, col.borderLeft ? 1 : 0);
          const lines = widget.render(col.width, row.height);
          cellLines.push(lines);
          maxCellHeight = Math.max(maxCellHeight, lines.length);
        }

        // Compose row: pad short cells, join side by side
        for (let lineIdx = 0; lineIdx < Math.max(maxCellHeight, row.height); lineIdx++) {
          let composed = "";
          for (let ci = 0; ci < row.columns.length; ci++) {
            const col = row.columns[ci]!;
            if (col.borderLeft) {
              const borderColor = this.theme.fg?.("border", "│") ?? "│";
              composed += borderColor;
            }
            const cellLine = cellLines[ci]![lineIdx] ?? "";
            composed += this.clampLine(cellLine, col.width);
          }
          allLines.push(this.clampLine(composed, width));
        }
        terminalRow += maxCellHeight;
      }
    }

    this.cachedPlan = { rows: [allLines], width };
    return allLines;
  }

  override invalidate(): void {
    this.cachedPlan = null;
    for (const widget of this.widgets.values()) {
      widget.invalidate();
    }
    super.invalidate();
  }

  override handleInput(data: string): void {
    // Forward input to the editor widget first, then fallback to super
    const editorWidget = this.widgets.get("main:editor");
    if (editorWidget?.handleInput?.(data)) return;
    super.handleInput(data);
  }

  /** Reconfigure the grid at runtime */
  setConfig(config: GridConfig): void {
    this.config = config;
    this.widgets.clear();
    this.invalidate();
  }

  private getWidget(
    colId: string,
    rowId: string,
    colIndex: number,
    terminalRow: number,
    terminalCol: number,
  ): WidgetInstance {
    const key = `${rowId}:${colId}`;
    let widget = this.widgets.get(key);
    if (!widget) {
      const colConfig = this.config.rows.find((r) => r.id === rowId)?.columns[colIndex];
      if (!colConfig) throw new Error(`Column ${colId} not found in row ${rowId}`);
      const cellInfo: GridCellInfo = {
        row: this.config.rows.findIndex((r) => r.id === rowId),
        col: colIndex,
        rowId,
        colId,
        terminalRow,
        terminalCol,
      };
      widget = createFromConfig(colConfig, this.deps, cellInfo);
      this.widgets.set(key, widget);
    }
    return widget;
  }

  private clampLine(line: string, width: number): string {
    const vw = visibleWidth(line);
    if (vw <= width) {
      return line + " ".repeat(width - vw);
    }
    // Truncate: slice to width, handling ANSI codes approximately
    let result = "";
    let pos = 0;
    let inEscape = false;
    for (const ch of line) {
      if (inEscape) {
        result += ch;
        if (ch === "m") inEscape = false;
        continue;
      }
      if (ch === "\x1b") {
        inEscape = true;
        result += ch;
        continue;
      }
      if (pos >= width) break;
      result += ch;
      pos++;
    }
    return result;
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/grid/grid-component.ts
git commit -m "feat: add GridComponent CustomEditor"
```

---

### Task 7: Widget Registry

**Files:**
- Create: `src/widgets/registry.ts`

- [ ] **Step 1: Write widget registry**

```typescript
// src/widgets/registry.ts

import type { ColumnConfig, GridCellInfo } from "../grid/types.ts";
import type {
  WidgetDeps,
  WidgetFactory,
  WidgetInstance,
} from "./types.ts";

/** Global registry of widget factories by type name */
const factories = new Map<string, WidgetFactory>();

/**
 * Register a widget factory under a type name.
 * Built-in widgets call this at module load time.
 * Users can call this via the extension API.
 */
export function registerWidget(name: string, factory: WidgetFactory): void {
  factories.set(name, factory);
}

/**
 * Create a widget instance from a column config.
 * Looks up the factory by `widget.type`, calls it with deps and config.
 */
export function createFromConfig(
  column: ColumnConfig,
  deps: WidgetDeps,
  cell: GridCellInfo,
): WidgetInstance {
  const factory = factories.get(column.widget.type);
  if (!factory) {
    // Fallback: render an error widget
    return createErrorWidget(
      `Unknown widget type: ${column.widget.type}`,
      deps,
    );
  }
  try {
    const instance = factory(deps, column.widget.config ?? {}, cell);
    if (column.widget.config && instance.configure) {
      instance.configure(column.widget.config);
    }
    return instance;
  } catch (err) {
    return createErrorWidget(
      `Widget error (${column.widget.type}): ${(err as Error).message}`,
      deps,
    );
  }
}

/** Check if a widget type is registered */
export function hasWidget(name: string): boolean {
  return factories.has(name);
}

function createErrorWidget(message: string, deps: WidgetDeps): WidgetInstance {
  const errorText = deps.theme.fg("error", message);
  return {
    render(_width: number, height: number): string[] {
      const lines = [errorText];
      // Fill remaining rows with dimmed dots
      for (let i = 1; i < height; i++) {
        lines.push(deps.theme.fg("dim", "·"));
      }
      return lines;
    },
    invalidate(): void {},
  };
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/widgets/registry.ts
git commit -m "feat: add widget registry"
```

---

### Task 8: Status Bar Segments

**Files:**
- Create: `src/status-bar/segments.ts`

- [ ] **Step 1: Write segment render functions**

This file reuses the segment logic from the pi-powerline-footer extension, adapted for our pill rendering system. Each segment is a function that returns `{ text: string; visible: boolean }`.

```typescript
// src/status-bar/segments.ts

import { basename } from "node:path";
import { hostname as osHostname } from "node:os";
import { icon, ICONS } from "../icons.ts";

// ---- Types ----

export interface SegmentContext {
  model: { id: string; name?: string; reasoning?: boolean } | undefined;
  thinkingLevel: string;
  cwd: string;
  sessionId: string | undefined;
  contextPercent: number;
  contextWindow: number;
  autoCompactEnabled: boolean;
  customCompactionEnabled: boolean;
  tokenIn: number;
  tokenOut: number;
  tokenTotal: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  usingSubscription: boolean;
  sessionStartTime: number;
  shellModeActive: boolean;
  shellRunning: boolean;
  shellName: string | null;
  shellCwd: string | null;
  git: { branch: string | null; staged: number; unstaged: number; untracked: number };
  extensionStatuses: ReadonlyMap<string, string>;
  options: SegmentOptions;
}

export interface SegmentOptions {
  model?: { showThinkingLevel?: boolean };
  path?: { mode?: "basename" | "abbreviated" | "full"; maxLength?: number };
  git?: { showBranch?: boolean; showStaged?: boolean; showUnstaged?: boolean; showUntracked?: boolean };
  time?: { format?: "12h" | "24h"; showSeconds?: boolean };
}

export type SegmentId =
  | "model" | "shell_mode" | "path" | "git" | "thinking"
  | "subagents" | "token_in" | "token_out" | "token_total"
  | "cost" | "context_pct" | "context_total"
  | "time_spent" | "time" | "session" | "hostname"
  | "cache_read" | "cache_write" | "extension_statuses";

export interface RenderedSegment {
  text: string;
  visible: boolean;
}

// ---- Formatting helpers ----

function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
  return `${Math.round(n / 1000000)}M`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m${seconds % 60}s`;
  return `${seconds}s`;
}

function withIcon(iconStr: string, text: string): string {
  return iconStr ? `${iconStr} ${text}` : text;
}

// ---- Segment implementations ----

export const SEGMENTS: Record<SegmentId, (ctx: SegmentContext) => RenderedSegment> = {
  model(ctx): RenderedSegment {
    let name = ctx.model?.name ?? ctx.model?.id ?? "no-model";
    if (name.startsWith("Claude ")) name = name.slice(7);
    let content = withIcon(icon("model"), name);
    const opts = ctx.options.model ?? {};
    if (opts.showThinkingLevel !== false && ctx.model?.reasoning && ctx.thinkingLevel !== "off") {
      content += ` ${icon("thinking")} ${ctx.thinkingLevel}`;
    }
    return { text: content, visible: true };
  },

  shell_mode(ctx): RenderedSegment {
    if (!ctx.shellModeActive) return { text: "", visible: false };
    const name = ctx.shellName ?? "shell";
    const state = ctx.shellRunning ? "run" : "idle";
    const parts = [name, state];
    if (ctx.shellCwd) parts.push(basename(ctx.shellCwd));
    return { text: withIcon(icon("shell"), parts.join(" · ")), visible: true };
  },

  path(ctx): RenderedSegment {
    const opts = ctx.options.path ?? {};
    const mode = opts.mode ?? "basename";
    let pwd = ctx.shellModeActive && ctx.shellCwd ? ctx.shellCwd : ctx.cwd;
    const home = process.env.HOME;
    if (mode === "basename") {
      pwd = basename(pwd) || pwd;
    } else {
      if (home && pwd.startsWith(home)) pwd = `~${pwd.slice(home.length)}`;
      if (mode === "abbreviated" && pwd.length > (opts.maxLength ?? 40)) {
        pwd = `…${pwd.slice(-(opts.maxLength ?? 40) + 1)}`;
      }
    }
    return { text: withIcon(icon("folder"), pwd), visible: true };
  },

  git(ctx): RenderedSegment {
    const opts = ctx.options.git ?? {};
    const { branch, staged, unstaged, untracked } = ctx.git;
    if (!branch && staged === 0 && unstaged === 0 && untracked === 0) {
      return { text: "", visible: false };
    }
    const parts: string[] = [];
    if (opts.showBranch !== false && branch) {
      parts.push(withIcon(icon("branch"), branch));
    }
    const indicators: string[] = [];
    if (opts.showUnstaged !== false && unstaged > 0) indicators.push(`${icon("unstaged")}${unstaged}`);
    if (opts.showStaged !== false && staged > 0) indicators.push(`${icon("staged")}${staged}`);
    if (opts.showUntracked !== false && untracked > 0) indicators.push(`${icon("untracked")}${untracked}`);
    if (indicators.length > 0) parts.push(indicators.join(" "));
    return { text: parts.join(" "), visible: true };
  },

  thinking(ctx): RenderedSegment {
    const labels: Record<string, string> = {
      off: "off", minimal: "min", low: "low", medium: "med", high: "high", xhigh: "xhigh",
    };
    return { text: withIcon(icon("thinking"), labels[ctx.thinkingLevel] ?? ctx.thinkingLevel), visible: true };
  },

  subagents(_ctx): RenderedSegment {
    return { text: "", visible: false }; // placeholder
  },

  token_in(ctx): RenderedSegment {
    if (!ctx.tokenIn) return { text: "", visible: false };
    return { text: withIcon(icon("tokensIn"), formatTokens(ctx.tokenIn)), visible: true };
  },

  token_out(ctx): RenderedSegment {
    if (!ctx.tokenOut) return { text: "", visible: false };
    return { text: withIcon(icon("tokensOut"), formatTokens(ctx.tokenOut)), visible: true };
  },

  token_total(ctx): RenderedSegment {
    if (!ctx.tokenTotal) return { text: "", visible: false };
    return { text: withIcon(icon("cache"), formatTokens(ctx.tokenTotal)), visible: true };
  },

  cost(ctx): RenderedSegment {
    if (!ctx.cost && !ctx.usingSubscription) return { text: "", visible: false };
    const display = ctx.usingSubscription ? "(sub)" : `$${ctx.cost.toFixed(2)}`;
    return { text: withIcon(icon("cost"), display), visible: true };
  },

  context_pct(ctx): RenderedSegment {
    if (ctx.customCompactionEnabled) return { text: "", visible: false };
    const pct = ctx.contextPercent;
    const text = `${pct.toFixed(1)}%/${formatTokens(ctx.contextWindow)}${ctx.autoCompactEnabled ? ` ${icon("autoCompact")}` : ""}`;
    return { text: withIcon(icon("context"), text), visible: true };
  },

  context_total(ctx): RenderedSegment {
    if (ctx.customCompactionEnabled || !ctx.contextWindow) return { text: "", visible: false };
    return { text: withIcon(icon("context"), formatTokens(ctx.contextWindow)), visible: true };
  },

  time_spent(ctx): RenderedSegment {
    const elapsed = Date.now() - ctx.sessionStartTime;
    if (elapsed < 1000) return { text: "", visible: false };
    return { text: withIcon(icon("clock"), formatDuration(elapsed)), visible: true };
  },

  time(ctx): RenderedSegment {
    const opts = ctx.options.time ?? {};
    const now = new Date();
    let hours = now.getHours();
    let suffix = "";
    if (opts.format === "12h") { suffix = hours >= 12 ? "pm" : "am"; hours = hours % 12 || 12; }
    const mins = now.getMinutes().toString().padStart(2, "0");
    let timeStr = `${hours}:${mins}`;
    if (opts.showSeconds) timeStr += `:${now.getSeconds().toString().padStart(2, "0")}`;
    timeStr += suffix;
    return { text: withIcon(icon("clock"), timeStr), visible: true };
  },

  session(ctx): RenderedSegment {
    const display = ctx.sessionId?.slice(0, 8) ?? "new";
    return { text: withIcon(icon("session"), display), visible: true };
  },

  hostname(_ctx): RenderedSegment {
    const name = osHostname().split(".")[0]!;
    return { text: withIcon(icon("host"), name), visible: true };
  },

  cache_read(ctx): RenderedSegment {
    if (!ctx.cacheRead) return { text: "", visible: false };
    return { text: `${icon("cache")} ${icon("tokensIn")} ${formatTokens(ctx.cacheRead)}`, visible: true };
  },

  cache_write(ctx): RenderedSegment {
    if (!ctx.cacheWrite) return { text: "", visible: false };
    return { text: `${icon("cache")} ${icon("tokensOut")} ${formatTokens(ctx.cacheWrite)}`, visible: true };
  },

  extension_statuses(ctx): RenderedSegment {
    if (!ctx.extensionStatuses || ctx.extensionStatuses.size === 0) return { text: "", visible: false };
    const parts: string[] = [];
    for (const [, value] of ctx.extensionStatuses) {
      if (value && value.trim()) parts.push(value.trim());
    }
    if (parts.length === 0) return { text: "", visible: false };
    return { text: parts.join(` ${icon("sepDot")} `), visible: true };
  },
};
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/status-bar/segments.ts
git commit -m "feat: add status bar segments (all 19 powerline segments)"
```

---

### Task 9: Pill Renderer

**Files:**
- Create: `src/status-bar/pill-renderer.ts`

- [ ] **Step 1: Write pill renderer**

```typescript
// src/status-bar/pill-renderer.ts

import { visibleWidth } from "@earendil-works/pi-tui";

/** A rendered pill */
export interface Pill {
  /** Full text including ANSI styling */
  text: string;
  /** Visible character width */
  width: number;
}

/** Color function: takes text, returns styled text */
export type ColorFn = (text: string) => string;

/** Separator definition */
export interface PillSeparator {
  /** Glpyh between pills */
  char: string;
  /** Visible width of the separator */
  width: number;
}

/** Predefined separator styles */
export const SEPARATORS: Record<string, PillSeparator> = {
  "powerline":    { char: "\u{E0B0}", width: 1 },    // 
  "powerline-thin": { char: "\u{E0B1}", width: 1 },  // 
  "slash":        { char: " / ", width: 3 },
  "pipe":         { char: " | ", width: 3 },
  "block":        { char: "\u{2588}", width: 1 },    // █
  "dot":          { char: " · ", width: 3 },
  "chevron":      { char: " > ", width: 3 },
  "star":         { char: ` ${icon("sepDot")} `, width: 3 },
  "none":         { char: " ", width: 1 },
  "ascii":        { char: " | ", width: 3 },
};

/**
 * Pack pills horizontally into available width.
 * 
 * Strategy:
 * 1. Try to fit all pills
 * 2. If overflow, remove pills from the middle inward (keep first few left, first few right)
 * 3. Center-fill remaining space
 */
export function packPills(
  leftPills: readonly Pill[],
  rightPills: readonly Pill[],
  separator: PillSeparator,
  totalWidth: number,
): string {
  const left = [...leftPills];
  const right = [...rightPills];

  // Calculate total width needed
  let totalNeeded = 0;
  for (const p of [...left, ...right]) totalNeeded += p.width;
  totalNeeded += Math.max(0, (left.length + right.length - 1)) * separator.width;

  // Shrink from middle until fits
  while (totalNeeded > totalWidth && (left.length > 0 || right.length > 0)) {
    // Remove from the group with more pills, preferring right
    if (right.length >= left.length && right.length > 0) {
      const removed = right.shift()!;
      totalNeeded -= removed.width + separator.width;
    } else if (left.length > 0) {
      const removed = left.pop()!;
      totalNeeded -= removed.width + separator.width;
    } else {
      break;
    }
  }

  // Build the line: left group [sep] right group, right-justified
  const leftStr = left.map((p) => p.text).join(separator.char);
  const rightStr = right.map((p) => p.text).join(separator.char);

  const leftWidth = left.reduce((s, p) => s + p.width, 0) +
    Math.max(0, (left.length - 1)) * separator.width;
  const rightWidth = right.reduce((s, p) => s + p.width, 0) +
    Math.max(0, (right.length - 1)) * separator.width;

  const gap = totalWidth - leftWidth - rightWidth;
  const gapStr = gap > 0 ? " ".repeat(gap) : "";

  return leftStr + gapStr + rightStr;
}

/**
 * Build a single pill with icon, text, and semantic coloring.
 */
export function makePill(
  iconStr: string,
  text: string,
  color: ColorFn,
): Pill {
  const content = iconStr ? `${iconStr} ${text}` : text;
  const styled = color(content);
  return { text: styled, width: visibleWidth(content) };
}

function icon(name: string): string {
  const { ICONS } = require("../icons.ts");
  return ICONS[name as keyof typeof ICONS] ?? "";
}
```

Wait — I used `require` which won't work with ESM. Let me fix that.

```typescript
// src/status-bar/pill-renderer.ts

import { visibleWidth } from "@earendil-works/pi-tui";
import { ICONS } from "../icons.ts";

/** A rendered pill */
export interface Pill {
  text: string;
  width: number;
}

export type ColorFn = (text: string) => string;

export interface PillSeparator {
  char: string;
  width: number;
}

export const SEPARATORS: Record<string, PillSeparator> = {
  "powerline":        { char: "\u{E0B0}", width: 1 },
  "powerline-thin":   { char: "\u{E0B1}", width: 1 },
  "slash":            { char: " / ", width: 3 },
  "pipe":             { char: " | ", width: 3 },
  "block":            { char: "\u{2588}", width: 1 },
  "dot":              { char: " · ", width: 3 },
  "chevron":          { char: " > ", width: 3 },
  "star":             { char: ` ${ICONS.sepDot} `, width: 3 },
  "none":             { char: " ", width: 1 },
  "ascii":            { char: " | ", width: 3 },
};

export function packPills(
  leftPills: readonly Pill[],
  rightPills: readonly Pill[],
  separator: PillSeparator,
  totalWidth: number,
): string {
  const left = [...leftPills];
  const right = [...rightPills];

  let totalNeeded = 0;
  for (const p of [...left, ...right]) totalNeeded += p.width;
  totalNeeded += Math.max(0, (left.length + right.length - 1)) * separator.width;

  while (totalNeeded > totalWidth && (left.length > 0 || right.length > 0)) {
    if (right.length >= left.length && right.length > 0) {
      const removed = right.shift()!;
      totalNeeded -= removed.width + separator.width;
    } else if (left.length > 0) {
      const removed = left.pop()!;
      totalNeeded -= removed.width + separator.width;
    } else {
      break;
    }
  }

  const leftStr = left.map((p) => p.text).join(separator.char);
  const rightStr = right.map((p) => p.text).join(separator.char);

  const leftWidth = left.reduce((s, p) => s + p.width, 0) +
    Math.max(0, (left.length - 1)) * separator.width;
  const rightWidth = right.reduce((s, p) => s + p.width, 0) +
    Math.max(0, (right.length - 1)) * separator.width;

  const gap = totalWidth - leftWidth - rightWidth;
  const gapStr = gap > 0 ? " ".repeat(gap) : "";

  return leftStr + gapStr + rightStr;
}

export function makePill(
  iconStr: string,
  text: string,
  color: ColorFn,
): Pill {
  const content = iconStr ? `${iconStr} ${text}` : text;
  const styled = color(content);
  return { text: styled, width: visibleWidth(content) };
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/status-bar/pill-renderer.ts
git commit -m "feat: add pill renderer with packPills algorithm"
```

---

### Task 10: Editor Widget

**Files:**
- Create: `src/widgets/editor-widget.ts`

- [ ] **Step 1: Write editor widget**

```typescript
// src/widgets/editor-widget.ts

import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetInstance } from "./types.ts";

/**
 * EditorWidget wraps pi's built-in editor (or any previously-set custom editor).
 * It delegates render() and handleInput() to the underlying editor component.
 * If a completion popup is active, it leaves space above for the popup.
 */
export function createEditorWidget(
  deps: WidgetDeps,
  _config: unknown,
  _cell: unknown,
): WidgetInstance {
  let completionPopupHeight = 0;
  let baseEditor: CustomEditor | undefined;

  // Try to get the current editor component (preserve other extensions)
  const currentFactory = deps.pi.getEditorComponent?.();
  if (currentFactory) {
    const comp = currentFactory(deps.tui, deps.theme as never, deps.keybindings);
    if (comp instanceof CustomEditor) {
      baseEditor = comp;
    }
  }

  const instance: WidgetInstance = {
    render(width: number, height: number): string[] {
      const effectiveHeight = height - completionPopupHeight;
      if (baseEditor) {
        const lines = baseEditor.render(width);
        // Return at most effectiveHeight lines
        return lines.slice(0, effectiveHeight);
      }
      // Fallback: no editor available yet
      return [deps.theme.fg("dim", "editor loading...")];
    },

    handleInput(data: string): boolean {
      if (baseEditor) {
        baseEditor.handleInput(data);
        return true;
      }
      return false;
    },

    invalidate(): void {
      baseEditor?.invalidate();
    },

    setCompletionPopupHeight(h: number): void {
      completionPopupHeight = h;
    },
  };

  return instance;
}

// Register built-in
registerWidget("editor", () => {
  throw new Error("editor widget must be created with full deps; use createEditorWidget directly");
});

// Override: we register with a factory that handles proper deps
registerWidget("editor", createEditorWidget as never);
```

Wait — the register call is problematic. Let me simplify. The registry lookup in `GridComponent` calls `createFromConfig`, which uses the registry. So the factory should be a proper `WidgetFactory`. Let me rewrite:

```typescript
// src/widgets/editor-widget.ts

import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetFactory, WidgetInstance } from "./types.ts";

export const editorWidgetFactory: WidgetFactory = (
  deps: WidgetDeps,
  _config: unknown,
) => {
  let baseEditor: CustomEditor | undefined;

  // Try to get the current editor component
  try {
    const currentFactory = (deps.pi as Record<string, unknown>).getEditorComponent as
      | ((...args: never[]) => CustomEditor | undefined)
      | undefined;
    if (currentFactory) {
      const comp = currentFactory(deps.tui, deps.theme as never, deps.keybindings);
      if (comp instanceof CustomEditor) baseEditor = comp;
    }
  } catch {
    // Will use fallback rendering
  }

  return {
    render(width: number, height: number): string[] {
      if (baseEditor) {
        const lines = baseEditor.render(width);
        if (lines.length === 0) return [deps.theme.fg("dim", "…")];
        return lines.slice(0, height);
      }
      return [deps.theme.fg("dim", "editor loading…")];
    },

    handleInput(data: string): boolean {
      if (baseEditor) {
        baseEditor.handleInput(data);
        return true;
      }
      return false;
    },

    invalidate(): void {
      baseEditor?.invalidate();
    },
  };
};

registerWidget("editor", editorWidgetFactory);
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/widgets/editor-widget.ts
git commit -m "feat: add editor widget wrapping built-in editor"
```

---

### Task 11: Prompt Bar Widget

**Files:**
- Create: `src/widgets/prompt-bar-widget.ts`

- [ ] **Step 1: Write prompt bar widget**

```typescript
// src/widgets/prompt-bar-widget.ts

import { visibleWidth } from "@earendil-works/pi-tui";
import { icon } from "../icons.ts";
import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetFactory, WidgetInstance } from "./types.ts";

export const promptBarWidgetFactory: WidgetFactory = (
  deps: WidgetDeps,
  config: unknown,
) => {
  const opts = (config as { maxLength?: number } | undefined) ?? {};
  const maxLength = opts.maxLength ?? 120;

  let lastPrompt = "";

  // Update on every agent_end and input event
  deps.pi.on("agent_end", async (event: unknown) => {
    const e = event as { messages?: Array<{ role: string; content: Array<{ type: string; text: string }> }> };
    const lastUser = [...(e.messages ?? [])].reverse().find((m) => m.role === "user");
    if (lastUser) {
      const text = lastUser.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join(" ");
      lastPrompt = text;
    }
  });

  return {
    render(width: number, _height: number): string[] {
      if (!lastPrompt) {
        return [deps.theme.fg("dim", `${icon("prevPrompt")}  no previous prompt`)];
      }
      const prefix = `${icon("prevPrompt")}  `;
      const prefixWidth = visibleWidth(prefix);
      const available = width - prefixWidth;
      let display = lastPrompt.replace(/\n/g, " ").trim();
      if (display.length > maxLength) display = display.slice(0, maxLength) + "…";
      if (visibleWidth(display) > available) display = display.slice(0, Math.max(0, available - 1)) + "…";
      return [prefix + deps.theme.fg("muted", display)];
    },

    invalidate(): void {
      // no cache to clear
    },
  };
};

registerWidget("prompt-bar", promptBarWidgetFactory);
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/widgets/prompt-bar-widget.ts
git commit -m "feat: add prompt bar widget"
```

---

### Task 12: Status Bar Widget

**Files:**
- Create: `src/widgets/status-bar-widget.ts`

- [ ] **Step 1: Write status bar widget**

```typescript
// src/widgets/status-bar-widget.ts

import { hostname as osHostname } from "node:os";
import { basename } from "node:path";
import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetFactory, WidgetInstance } from "./types.ts";
import { makePill, packPills, SEPARATORS } from "../status-bar/pill-renderer.ts";
import {
  SEGMENTS,
  type SegmentContext,
  type SegmentId,
  type SegmentOptions,
} from "../status-bar/segments.ts";

// Semantic colors for pill backgrounds
const SEGMENT_COLORS: Record<string, (t: string) => string> = {
  model: (t) => `\x1b[48;5;39m\x1b[38;5;16m ${t} \x1b[0m`,       // blue bg
  thinking: (t) => `\x1b[48;5;99m\x1b[38;5;16m ${t} \x1b[0m`,     // purple bg
  shell_mode: (t) => `\x1b[48;5;33m\x1b[38;5;16m ${t} \x1b[0m`,   // dark blue bg
  path: (t) => `\x1b[48;5;71m\x1b[38;5;16m ${t} \x1b[0m`,         // green bg
  git: (t) => `\x1b[48;5;178m\x1b[38;5;16m ${t} \x1b[0m`,         // yellow bg
  context_pct: (t) => `\x1b[48;5;238m\x1b[38;5;252m ${t} \x1b[0m`,// grey bg
  context_total: (t) => `\x1b[48;5;238m\x1b[38;5;252m ${t} \x1b[0m`,
  cost: (t) => `\x1b[48;5;130m\x1b[38;5;16m ${t} \x1b[0m`,       // orange bg
  token_in: (t) => `\x1b[48;5;238m\x1b[38;5;252m ${t} \x1b[0m`,
  token_out: (t) => `\x1b[48;5;238m\x1b[38;5;252m ${t} \x1b[0m`,
  token_total: (t) => `\x1b[48;5;238m\x1b[38;5;252m ${t} \x1b[0m`,
  cache_read: (t) => `\x1b[48;5;238m\x1b[38;5;252m ${t} \x1b[0m`,
  cache_write: (t) => `\x1b[48;5;238m\x1b[38;5;252m ${t} \x1b[0m`,
  time: (t) => `\x1b[48;5;238m\x1b[38;5;252m ${t} \x1b[0m`,
  time_spent: (t) => `\x1b[48;5;238m\x1b[38;5;252m ${t} \x1b[0m`,
  session: (t) => `\x1b[48;5;238m\x1b[38;5;252m ${t} \x1b[0m`,
  hostname: (t) => `\x1b[48;5;238m\x1b[38;5;252m ${t} \x1b[0m`,
  extension_statuses: (t) => `\x1b[48;5;238m\x1b[38;5;252m ${t} \x1b[0m`,
};

function defaultColor(t: string): string {
  return `\x1b[48;5;238m\x1b[38;5;252m ${t} \x1b[0m`;
}

export const statusBarWidgetFactory: WidgetFactory = (
  deps: WidgetDeps,
  config: unknown,
) => {
  const opts = (config ?? {}) as {
    separator?: string;
    leftSegments?: SegmentId[];
    rightSegments?: SegmentId[];
    segmentOptions?: SegmentOptions;
  };

  const separator = SEPARATORS[opts.separator ?? "powerline-thin"] ?? SEPARATORS["powerline-thin"]!;
  const leftSegments: SegmentId[] = opts.leftSegments ?? [];
  const rightSegments: SegmentId[] = opts.rightSegments ?? [];
  const segmentOptions: SegmentOptions = opts.segmentOptions ?? {};

  // Cached state populated by event callbacks (ExtensionAPI is not sync-accessible)
  let cachedModel: SegmentContext["model"] = undefined;
  let cachedThinkingLevel = "off";
  let cachedCwd = process.cwd();
  let cachedSessionId: string | undefined = undefined;
  let cachedContextPercent = 0;
  let cachedContextWindow = 0;
  let cachedTokensIn = 0;
  let cachedTokensOut = 0;
  let cachedTokensTotal = 0;
  let cachedCacheRead = 0;
  let cachedCacheWrite = 0;
  let cachedCost = 0;
  let cachedUsingSubscription = false;
  let cachedSessionStartTime = Date.now();
  let cachedGit = { branch: null as string | null, staged: 0, unstaged: 0, untracked: 0 };
  let cachedExtensionStatuses = new Map<string, string>();

  // Populate from events
  deps.pi.on("session_start", (_event, ctx) => {
    cachedSessionStartTime = Date.now();
    cachedCwd = ctx.cwd ?? process.cwd();
  });
  deps.pi.on("model_select", (event) => {
    const m = (event as { model?: { id: string; name?: string; reasoning?: boolean } }).model;
    cachedModel = m ?? undefined;
  });
  deps.pi.on("thinking_level_select", (event) => {
    cachedThinkingLevel = (event as { level?: string }).level ?? "off";
  });
  deps.pi.on("turn_end", (event, ctx) => {
    const usage = ctx.getContextUsage?.() ?? { tokens: 0, contextWindow: 0, percent: null };
    cachedContextPercent = usage.percent ?? 0;
    cachedContextWindow = usage.contextWindow ?? 0;
    cachedSessionId = ctx.sessionManager?.getEntries?.()?.[0]?.sessionId ?? cachedSessionId;
  });

  function buildContext(): SegmentContext {
    return {
      model: cachedModel,
      thinkingLevel: cachedThinkingLevel,
      cwd: cachedCwd,
      sessionId: cachedSessionId,
      contextPercent: cachedContextPercent,
      contextWindow: cachedContextWindow,
      autoCompactEnabled: false,
      customCompactionEnabled: false,
      tokenIn: cachedTokensIn,
      tokenOut: cachedTokensOut,
      tokenTotal: cachedTokensTotal,
      cacheRead: cachedCacheRead,
      cacheWrite: cachedCacheWrite,
      cost: cachedCost,
      usingSubscription: cachedUsingSubscription,
      sessionStartTime: cachedSessionStartTime,
      shellModeActive: false,
      shellRunning: false,
      shellName: null,
      shellCwd: null,
      git: cachedGit,
      extensionStatuses: cachedExtensionStatuses,
      options: segmentOptions,
    };
  }

  return {
    render(width: number, _height: number): string[] {
      const ctx = buildContext();

      const leftPills = leftSegments
        .map((segId) => {
          const segFn = SEGMENTS[segId];
          if (!segFn) return null;
          const result = segFn(ctx);
          if (!result.visible) return null;
          const colorFn = SEGMENT_COLORS[segId] ?? defaultColor;
          return makePill("", result.text, colorFn);
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);

      const rightPills = rightSegments
        .map((segId) => {
          const segFn = SEGMENTS[segId];
          if (!segFn) return null;
          const result = segFn(ctx);
          if (!result.visible) return null;
          const colorFn = SEGMENT_COLORS[segId] ?? defaultColor;
          return makePill("", result.text, colorFn);
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);

      const line = packPills(leftPills, rightPills, separator, width);
      return [line];
    },

    invalidate(): void {},
  };
};

registerWidget("status-bar", statusBarWidgetFactory);
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/widgets/status-bar-widget.ts
git commit -m "feat: add status bar widget with pill rendering"
```

---

### Task 13: pi-lens Widget

**Files:**
- Create: `src/widgets/lens-widget.ts`

- [ ] **Step 1: Write pi-lens widget**

```typescript
// src/widgets/lens-widget.ts

import { basename } from "node:path";
import { visibleWidth } from "@earendil-works/pi-tui";
import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetFactory, WidgetInstance } from "./types.ts";

interface Diagnostic {
  severity: string;
  semantic?: string;
  message: string;
  line?: number;
  col?: number;
  rule?: string;
  tool?: string;
  filePath: string;
}

interface FileRecord {
  filePath: string;
  diagnostics: Diagnostic[];
  touchedAt: number;
}

interface LspServer {
  serverId: string;
  root: string;
  status: "spawning" | "ready" | "failed";
}

/** Per-file diagnostic data from pi-lens events */
const files = new Map<string, FileRecord>();
const lspServers = new Map<string, LspServer>();
let totalErrors = 0;
let totalWarnings = 0;
let totalBlocking = 0;
let requestRender: (() => void) | null = null;

function isBlocking(d: Diagnostic): boolean {
  if (d.semantic === "blocking") return true;
  if (d.severity === "error") return true;
  return false;
}

export const lensWidgetFactory: WidgetFactory = (
  deps: WidgetDeps,
  _config: unknown,
) => {
  // Subscribe to pi-lens events
  const events = (deps.pi as { events?: { on: (evt: string, handler: (payload: unknown) => void) => void } }).events;
  if (events) {
    events.on("pi-lens/analysis-complete", (payload: unknown) => {
      const p = payload as {
        filePath?: string;
        diagnostics?: Diagnostic[];
        blockers?: Diagnostic[];
        warnings?: Diagnostic[];
        fixed?: Diagnostic[];
      };
      if (p.filePath && p.diagnostics) {
        const rec: FileRecord = {
          filePath: p.filePath,
          diagnostics: [
            ...(p.blockers ?? []).map((d) => ({ ...d, filePath: p.filePath!, semantic: "blocking" })),
            ...(p.warnings ?? []).map((d) => ({ ...d, filePath: p.filePath! })),
            ...p.diagnostics.map((d) => ({ ...d, filePath: p.filePath! })),
          ],
          touchedAt: Date.now(),
        };
        files.set(p.filePath, rec);
        recalcCounts();
        requestRender?.();
      }
    });
  }

  function recalcCounts(): void {
    let e = 0; let w = 0; let b = 0;
    for (const rec of files.values()) {
      for (const d of rec.diagnostics) {
        if (isBlocking(d)) b++;
        if (d.severity === "error") e++;
        if (d.severity === "warning") w++;
      }
    }
    totalBlocking = b;
    totalErrors = e;
    totalWarnings = w;
  }

  return {
    render(width: number, height: number): string[] {
      requestRender = () => deps.tui.requestRender?.();
      const lines: string[] = [];

      // Header line
      const dim = (s: string) => deps.theme.fg("dim", s);
      const red = (s: string) => deps.theme.fg("error", s);
      const yellow = (s: string) => deps.theme.fg("warning", s);
      const green = (s: string) => deps.theme.fg("success", s);

      if (totalBlocking > 0) {
        lines.push(` ${red(`● ${totalErrors}E`)} ${totalWarnings > 0 ? yellow(`${totalWarnings}W`) : ""}`);
      } else if (totalErrors > 0 || totalWarnings > 0) {
        lines.push(` ${yellow(`! ${totalErrors}E`)} ${totalWarnings > 0 ? yellow(`${totalWarnings}W`) : ""}`);
      } else if (files.size > 0) {
        lines.push(` ${green("✓ clean")}`);
      } else {
        lines.push(` ${dim("pi-lens waiting…")}`);
      }

      // File rows (most recent with diagnostics)
      const sorted = [...files.values()]
        .filter((r) => r.diagnostics.length > 0)
        .sort((a, b) => b.touchedAt - a.touchedAt)
        .slice(0, height - 1);

      for (const rec of sorted) {
        const name = basename(rec.filePath);
        const bCount = rec.diagnostics.filter(isBlocking).length;
        const eCount = rec.diagnostics.filter((d) => d.severity === "error").length;
        const wCount = rec.diagnostics.filter((d) => d.severity === "warning").length;
        const dot = bCount > 0 ? red("●") : (eCount > 0 || wCount > 0) ? yellow("!") : green("✓");
        lines.push(` ${dot} ${dim(name)}`);
      }

      return lines.slice(0, height);
    },

    invalidate(): void {
      // Event-driven, no cache to clear
    },
  };
};

registerWidget("pi-lens", lensWidgetFactory);
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/widgets/lens-widget.ts
git commit -m "feat: add pi-lens widget (subscribes to pi.events)"
```

---

### Task 14: Completion Popup

**Files:**
- Create: `src/completion/completion-popup.ts`

- [ ] **Step 1: Write completion popup overlay component**

```typescript
// src/completion/completion-popup.ts

import type { Component } from "@earendil-works/pi-tui";
import { matchesKey, Key, visibleWidth } from "@earendil-works/pi-tui";

export interface CompletionItem {
  value: string;
  label: string;
  description?: string;
}

export interface CompletionPopupOptions {
  items: CompletionItem[];
  /** Width in characters */
  width: number;
  /** Max visible items */
  maxHeight: number;
  /** Called when user selects an item */
  onSelect: (item: CompletionItem) => void;
  /** Called when user cancels (Escape) */
  onCancel: () => void;
  theme: {
    fg: (color: string, text: string) => string;
    bg: (color: string, text: string) => string;
  };
}

export class CompletionPopup implements Component {
  private items: CompletionItem[];
  private selected = 0;
  private width: number;
  private maxHeight: number;
  private onSelect: (item: CompletionItem) => void;
  private onCancel: () => void;
  private theme: CompletionPopupOptions["theme"];

  constructor(opts: CompletionPopupOptions) {
    this.items = opts.items;
    this.width = opts.width;
    this.maxHeight = opts.maxHeight;
    this.onSelect = opts.onSelect;
    this.onCancel = opts.onCancel;
    this.theme = opts.theme;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up)) {
      this.selected = Math.max(0, this.selected - 1);
    } else if (matchesKey(data, Key.down)) {
      this.selected = Math.min(this.items.length - 1, this.selected + 1);
    } else if (matchesKey(data, Key.enter)) {
      if (this.items[this.selected]) {
        this.onSelect(this.items[this.selected]!);
      }
    } else if (matchesKey(data, Key.escape)) {
      this.onCancel();
    }
  }

  render(_width: number): string[] {
    const items = this.items.slice(0, this.maxHeight);
    const dim = (s: string) => this.theme.fg("dim", s);
    const accent = (s: string) => this.theme.fg("accent", s);
    const highlight = (s: string) => this.theme.bg("selectedBg", s);

    const lines: string[] = [];

    // Top border
    lines.push(dim("╔" + "═".repeat(Math.max(0, this.width - 2)) + "╗"));

    // Items
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const isSel = i === this.selected;
      const prefix = isSel ? accent("▶ ") : "  ";
      let content = prefix + item.label;
      if (item.description) {
        content += "  " + dim(item.description);
      }
      const padded = this.padLine(content, this.width - 2);
      lines.push(dim("║") + (isSel ? highlight(padded) : padded) + dim("║"));
    }

    // Fill remaining rows
    for (let i = items.length; i < this.maxHeight; i++) {
      lines.push(dim("║") + " ".repeat(this.width - 2) + dim("║"));
    }

    // Bottom border
    lines.push(dim("╚" + "═".repeat(Math.max(0, this.width - 2)) + "╝"));

    return lines;
  }

  invalidate(): void {}

  private padLine(text: string, targetWidth: number): string {
    const vw = visibleWidth(text);
    if (vw >= targetWidth) {
      let result = "";
      let pos = 0;
      let inEscape = false;
      for (const ch of text) {
        if (inEscape) { result += ch; if (ch === "m") inEscape = false; continue; }
        if (ch === "\x1b") { inEscape = true; result += ch; continue; }
        if (pos >= targetWidth - 1) { result += "…"; break; }
        result += ch;
        pos++;
      }
      return result;
    }
    return text + " ".repeat(targetWidth - vw);
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/completion/completion-popup.ts
git commit -m "feat: add completion popup overlay component"
```

---

### Task 15: Completion Engine

**Files:**
- Create: `src/completion/completion-engine.ts`

- [ ] **Step 1: Write completion engine**

```typescript
// src/completion/completion-engine.ts

import type { CompletionItem, CompletionPopup } from "./completion-popup.ts";

/**
 * Manages the completion popup lifecycle.
 * Intercepts autocomplete results from the editor widget and
 * renders them as a floating overlay above the cursor.
 */
export class CompletionEngine {
  private activePopup: CompletionPopup | null = null;
  private popupHandle: { close: () => void } | null = null;
  private open: (component: CompletionPopup, opts: { overlay: boolean }) => { close: () => void };

  constructor(
    openOverlay: (component: CompletionPopup, opts: { overlay: boolean }) => { close: () => void },
  ) {
    this.open = openOverlay;
  }

  /**
   * Show completion popup with the given items.
   * Calculates position above/below cursor.
   */
  show(
    items: CompletionItem[],
    cursorRow: number,
    cursorCol: number,
    editorWidth: number,
    termHeight: number,
    theme: { fg: (c: string, t: string) => string; bg: (c: string, t: string) => string },
  ): void {
    if (items.length === 0) return;
    this.dismiss();

    const maxHeight = Math.min(items.length, 8);
    const width = Math.max(20, Math.min(editorWidth, 60));

    // Determine position: above cursor if room, else below
    const above = cursorRow >= maxHeight + 2; // +2 for top/bottom borders
    const anchorRow = above ? cursorRow - maxHeight - 2 : cursorRow + 1;

    const onSelect = (item: CompletionItem) => {
      this.applyCompletion(item);
      this.dismiss();
    };

    const onCancel = () => {
      this.dismiss();
    };

    const popup = new this._PopupClass({
      items,
      width,
      maxHeight,
      onSelect,
      onCancel,
      theme,
    });

    this.activePopup = popup;
    this.popupHandle = this.open(popup, { overlay: true });
  }

  dismiss(): void {
    this.popupHandle?.close();
    this.activePopup = null;
    this.popupHandle = null;
  }

  get isActive(): boolean {
    return this.activePopup !== null;
  }

  handleInput(data: string): boolean {
    if (this.activePopup) {
      this.activePopup.handleInput(data);
      return true;
    }
    return false;
  }

  private applyCompletion(item: CompletionItem): void {
    // The actual text insertion is handled by the editor widget
    // This will be wired in index.ts via pi events
  }

  // Lazy import to avoid circular dependency
  private get _PopupClass() {
    const { CompletionPopup } = require("./completion-popup.ts") as typeof import("./completion-popup.ts");
    return CompletionPopup;
  }
}
```

Wait — `require` won't work with ESM `type: "module"`. Let me use a constructor injection pattern instead.

```typescript
// src/completion/completion-engine.ts

import type { CompletionPopup } from "./completion-popup.ts";
import type { CompletionItem } from "./completion-popup.ts";

export type { CompletionItem } from "./completion-popup.ts";

/**
 * Manages the completion popup lifecycle.
 * Intercepts autocomplete results from the editor widget and
 * renders them as a floating overlay above the cursor.
 */
export class CompletionEngine {
  private popupHandle: { close: () => void } | null = null;
  private readonly openOverlay: (
    component: CompletionPopup,
    opts: { overlay: boolean },
  ) => { close: () => void };
  private readonly popupFactory: typeof CompletionPopup;
  private _onApply: ((value: string) => void) | null = null;

  constructor(
    openOverlay: (
      component: CompletionPopup,
      opts: { overlay: boolean },
    ) => { close: () => void },
    popupFactory: typeof CompletionPopup,
  ) {
    this.openOverlay = openOverlay;
    this.popupFactory = popupFactory;
  }

  show(
    items: CompletionItem[],
    cursorRow: number,
    _cursorCol: number,
    editorWidth: number,
    termHeight: number,
    theme: { fg: (c: string, t: string) => string; bg: (c: string, t: string) => string },
  ): void {
    if (items.length === 0) return;
    this.dismiss();

    const maxHeight = Math.min(items.length, 8);
    const width = Math.max(20, Math.min(editorWidth, 60));
    const above = cursorRow >= maxHeight + 2;
    // Note: anchor is handled by overlayOptions in the actual open call

    const popup = new this.popupFactory({
      items,
      width,
      maxHeight,
      onSelect: (item) => {
        this._onApply?.(item.value);
        this.dismiss();
      },
      onCancel: () => this.dismiss(),
      theme,
    });

    this.popupHandle = this.openOverlay(popup, { overlay: true });
  }

  dismiss(): void {
    this.popupHandle?.close();
    this.popupHandle = null;
  }

  get isActive(): boolean {
    return this.popupHandle !== null;
  }

  set onApply(fn: (value: string) => void) {
    this._onApply = fn;
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/completion/completion-engine.ts
git commit -m "feat: add completion engine"
```

---

### Task 16: Extension Entry (index.ts)

**Files:**
- Create/modify: `src/index.ts`

- [ ] **Step 1: Write extension entry point**

```typescript
// src/index.ts

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { GridComponent } from "./grid/grid-component.ts";
import { DEFAULT_GRID } from "./default-config.ts";
import type { GridConfig } from "./grid/types.ts";

// Side-effect imports: register built-in widgets
import "./widgets/editor-widget.ts";
import "./widgets/status-bar-widget.ts";
import "./widgets/lens-widget.ts";
import "./widgets/prompt-bar-widget.ts";

import { CompletionEngine } from "./completion/completion-engine.ts";
import { CompletionPopup } from "./completion/completion-popup.ts";

export default function (pi: ExtensionAPI) {
  let grid: GridComponent | null = null;
  let completionEngine: CompletionEngine | null = null;
  let activeGridConfig: GridConfig = DEFAULT_GRID;

  // --- Grid config API ---
  (pi as Record<string, unknown>).setGridConfig = (config: GridConfig) => {
    activeGridConfig = config;
    grid?.setConfig(config);
  };
  (pi as Record<string, unknown>).getGridConfig = (): GridConfig => {
    return activeGridConfig;
  };

  // Load user config from settings (if any)
  const settings = (pi as Record<string, unknown>).getSettings?.() as Record<string, unknown> | undefined;
  if (settings?.["pi-zazz"]?.["grid"]) {
    activeGridConfig = { ...DEFAULT_GRID, ...(settings["pi-zazz"]["grid"] as Partial<GridConfig>) };
  }

  // --- Session lifecycle ---
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    // Hide built-in working indicator (our grid handles it)
    ctx.ui.setWorkingVisible?.(false);
    ctx.ui.setFooter?.(() => ({ render: () => [], invalidate: () => {} } as never));

    // Build widget deps
    const deps = {
      pi,
      tui: ctx.ui as never,
      theme: ctx.ui.theme as { fg: (c: string, t: string) => string },
      keybindings: (ctx as { keybindings?: unknown }).keybindings as never,
    };

    // Create grid component
    grid = new GridComponent(
      deps.tui,
      ctx.ui.theme as never,
      deps.keybindings,
      deps,
      activeGridConfig,
    );

    // Create completion engine
    completionEngine = new CompletionEngine(
      (component, opts) => (ctx.ui.custom as (comp: unknown, o: unknown) => { close: () => void })(component, opts),
      CompletionPopup,
    );

    // Set grid as the editor
    ctx.ui.setEditorComponent?.(() => grid!);

    ctx.ui.notify("pi-zazz loaded ✨", "info");
  });

  // --- Event wiring for reactive updates ---
  pi.on("model_select", () => grid?.invalidate());
  pi.on("thinking_level_select", () => grid?.invalidate());
  pi.on("turn_start", () => {
    // Optional: spinner state in status bar
    grid?.invalidate();
  });
  pi.on("turn_end", () => grid?.invalidate());
  pi.on("agent_start", () => grid?.invalidate());
  pi.on("agent_end", () => grid?.invalidate());

  pi.on("session_shutdown", () => {
    completionEngine?.dismiss();
    grid = null;
    completionEngine = null;
  });
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire extension entry point with grid, widgets, and events"
```

---

### Task 17: Final Integration & Cleanup

**Files:**
- Verify: all files typecheck
- Verify: `.gitignore` includes `.superpowers/`

- [ ] **Step 1: Run full typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 2: Ensure .gitignore**

```bash
echo ".superpowers/" >> .gitignore
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: add .superpowers/ to .gitignore and final typecheck"
```
