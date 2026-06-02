# pi-zazz Custom Editor — Design Spec

**Date:** 2026-06-02  
**Status:** Approved → Implementation

---

## Overview

pi-zazz replaces pi's built-in editor with a declarative, grid-based custom editor that renders a multi-row layout with composable widgets. It supports JSON configuration, responsive layout, a floating completion popup, and Nerd Font iconography throughout.

## Architecture

```
src/
├── index.ts                # Extension entry point, event wiring, default config
├── grid/
│   ├── types.ts            # GridConfig, RowConfig, ColConfig, WidgetConfig types
│   ├── grid-engine.ts      # Layout solver: row heights, col widths, constraints
│   └── grid-component.ts   # CustomEditor subclass that delegates to grid
├── widgets/
│   ├── types.ts            # WidgetInstance interface, WidgetFactory, WidgetDeps
│   ├── registry.ts         # Map<string, WidgetFactory>, register/createFromConfig
│   ├── editor-widget.ts    # Wraps pi's built-in editor (CustomEditor)
│   ├── status-bar-widget.ts# Pill bar rendering powerline segments
│   ├── lens-widget.ts      # pi-lens diagnostics (subscribes to pi.events)
│   └── prompt-bar-widget.ts# Read-only previous prompt display
├── completion/
│   ├── completion-engine.ts# Delegates to pi's autocomplete, manages popup
│   └── completion-popup.ts # Floating overlay component above cursor
├── status-bar/
│   ├── pill-renderer.ts    # Renders individual pill badges with Nerd Font icons
│   └── segments.ts         # Reuses powerline segment definitions (model, git, etc.)
├── icons.ts                # Nerd Font icon map (all icons)
└── default-config.ts       # Default GridConfig in JSON
```

### Key Design Decisions

- **Grid Engine + Widget System** — not a monolithic render(). The grid knows layout, widgets know rendering.
- **Single CustomEditor subclass** — `GridComponent extends CustomEditor` is the sole `setEditorComponent()` call, preserving app keybindings (escape, ctrl+d, model cycling).
- **pi-lens via pi.events** — subscribes to `pi-lens/analysis-complete`, `pi-lens/findings`, and `pi-lens/turn-findings` events published by the pi-lens extension.
- **Completion popup as overlay** — uses `ctx.ui.custom({ overlay: true })` with anchor at cursor position, independent of grid re-renders.

---

## 1. Grid Configuration (JSON)

Users define their layout via a single JSON `GridConfig` object.

### Types

```typescript
interface GridConfig {
  rows: RowConfig[];
}

interface RowConfig {
  id: string;
  height: HeightConstraint;
  responsive?: ResponsiveConfig;
  visible?: boolean;              // default true; set false to hide row
  columns: ColumnConfig[];
}

interface HeightConstraint {
  min: number;                    // <= 1 asks render for at most 1 line
  max?: number;                   // undefined = unbounded
  grow?: boolean;                 // expands to consume remaining space
}

interface ResponsiveConfig {
  breakpoint: number;             // terminal width threshold
  narrowLayout: "stacked" | "hidden";  // stack columns or hide row
}

interface ColumnConfig {
  id: string;
  width: WidthConstraint;
  scrollable?: boolean;           // content scrolls vertical within allocated height
  border?: BorderConfig;          // optional border between columns
  widget: WidgetConfig;
}

interface WidthConstraint {
  fraction?: number;              // proportional weight (e.g. 2 = 2/3)
  min?: number;                   // minimum characters
  max?: number;                   // maximum characters
}

interface WidgetConfig {
  type: string;                   // registered widget name
  config?: Record<string, unknown>;
}
```

### Default Layout

```json
{
  "rows": [
    {
      "id": "status-bar",
      "height": { "min": 1, "max": 1 },
      "columns": [{
        "id": "status",
        "widget": {
          "type": "status-bar",
          "config": {
            "separator": "powerline-thin",
            "leftSegments": ["model", "thinking", "path", "git", "context_pct", "cost"],
            "rightSegments": ["token_total", "time", "extension_statuses"]
          }
        }
      }]
    },
    {
      "id": "main",
      "height": { "min": 2, "max": 12, "grow": true },
      "responsive": { "breakpoint": 80, "narrowLayout": "stacked" },
      "columns": [
        {
          "id": "editor",
          "width": { "fraction": 2, "min": 20 },
          "widget": { "type": "editor", "config": {} }
        },
        {
          "id": "lens",
          "width": { "fraction": 1, "min": 20 },
          "scrollable": true,
          "widget": { "type": "pi-lens", "config": { "maxDiagnostics": 20 } }
        }
      ]
    },
    {
      "id": "prompt-bar",
      "height": { "min": 1, "max": 1 },
      "columns": [{
        "id": "prompt",
        "widget": { "type": "prompt-bar", "config": { "maxLength": 120 } }
      }]
    }
  ]
}
```

---

## 2. Grid Engine (Layout Solver)

**File:** `grid/grid-engine.ts`

Two-pass solver:

### Pass 1: Height Allocation
1. Sum terminal rows. Subtract fixed rows (`max === min`). Remainder goes to `grow: true` rows.
2. If total exceeds terminal, reduce from bottom up — each row to its min.

### Pass 2: Width Allocation
1. Check `responsive.breakpoint`. If terminal width < breakpoint, apply `narrowLayout`:
   - `"stacked"`: columns render vertically (one above the other) within the row's height budget
   - `"hidden"`: row is collapsed entirely
2. For each row in horizontal mode: distribute width by `fraction` ratios.
3. If a column can't meet `min`, try collapsing others. If still can't, fall back to stacked.

### GridComponent (CustomEditor)

**File:** `grid/grid-component.ts`

Extends `CustomEditor`. On `session_start`, replaces the editor via `ctx.ui.setEditorComponent()`.

- `render(width)`: runs the layout solver, calls `widget.render(cellWidth, cellHeight)` for each cell, composes with borders and separators.
- Caches layout plan; invalidates on terminal resize, widget invalidation, or config change.
- Delegates keyboard input to the focused widget (typically the editor widget).

---

## 3. Widget System

### WidgetInstance Interface

```typescript
interface WidgetInstance {
  render(width: number, height: number): string[];
  handleInput?(data: string): void;
  invalidate(): void;
  heightConstraint?(): { min: number; max?: number };
  configure?(config: Record<string, unknown>): void;
}
```

### Widget Factory

```typescript
type WidgetDeps = {
  pi: ExtensionAPI;
  tui: TUI;
  theme: { fg: (color: string, s: string) => string; bg: ... };
  keybindings: KeybindingsManager;
};

type WidgetFactory = (deps: WidgetDeps, config: unknown, cell: GridCellInfo) => WidgetInstance;
```

### Registry

- `registerWidget(name: string, factory: WidgetFactory)` — called at extension load and exposed via `pi.registerWidget()`.
- `createFromConfig(cell: ColumnConfig, deps: WidgetDeps): WidgetInstance` — looks up factory by `type`, calls it with config and cell info.
- Built-in widgets are auto-registered in `widgets/registry.ts`.

### Built-in Widgets

| Widget | Config | Data Source |
|--------|--------|-------------|
| **status-bar** | `separator`, `leftSegments`, `rightSegments`, `segmentOptions` | pi.getModel(), pi.getThinkingLevel(), ctx.sessionManager, ctx.getContextUsage(), git branch, system clock |
| **editor** | `placeholder`, `borderColor` | Wraps current editor component (via `ctx.ui.getEditorComponent()`) |
| **pi-lens** | `maxDiagnostics`, `showRunners`, `showFormatters` | `pi.events`: `pi-lens/analysis-complete`, `pi-lens/findings`, `pi-lens/turn-findings` |
| **prompt-bar** | `maxLength` | `ctx.sessionManager.getEntries()` — last user message |

---

## 4. Status Bar Widget

**Files:** `status-bar/pill-renderer.ts`, `status-bar/segments.ts`

Reuses the segment definitions from the pi-powerline-footer extension:

### Available Segments (all 19 from powerline)

`model`, `shell_mode`, `path`, `git`, `thinking`, `subagents`, `token_in`, `token_out`, `token_total`, `cost`, `context_pct`, `context_total`, `time_spent`, `time`, `session`, `hostname`, `cache_read`, `cache_write`, `extension_statuses`

### Pill Rendering

Each pill is a rounded badge with:
- Nerd Font icon prefix (e.g., `` for model, `` for git branch, `` for path, `` for time)
- Semantic background color (model=blue, thinking=purple, path=green, git=yellow/warning, context=dim, cost=accent)
- Text content
- Configurable separator between pills (powerline angle, pipe, slash, etc.)

Pills render horizontally, left-aligned and right-aligned groups. Overflow hides from the center outward (inner pills collapse first).

### All Nerd Font Icons

Every icon in the extension uses Nerd Font glyphs:

| Semantic | Nerd Font | Code | Usage |
|----------|-----------|------|-------|
| Model | `󰘚` | nf-md-brain | AI model |
| Shell | `` | nf-dev-terminal | Shell mode |
| Folder | `` | nf-fa-folder / `󰉋` nf-md-folder | Path |
| Git branch | `` | nf-dev-git_branch | Git |
| Git staged | `` | nf-oct-diff_added | Staged changes |
| Git unstaged | `` | nf-oct-diff_modified | Unstaged |
| Thinking | `` | nf-fa-circle | Thinking level |
| Context | `󰍛` | nf-md-chart_donut | Context usage |
| Warning | `` | nf-fa-warning | Warnings |
| Error | `` | nf-fa-times_circle | Errors |
| Success | `` | nf-fa-check_circle | Clean |
| Clock | `` | nf-fa-clock | Time |
| Tokens in | `󰁕` | nf-md-arrow_down | Input tokens |
| Tokens out | `󰁔` | nf-md-arrow_up | Output tokens |
| Coins/cost | `` | nf-fa-money | Cost |
| Session | `󰌆` | nf-md-identifier | Session ID |
| Host | `󰒋` | nf-md-server | Hostname |
| Cache | `󰏗` | nf-md-database | Cache |
| Previous | `` | nf-fa-chevron_left | Previous prompt |
| LSP | `󰨞` | nf-md-language_c | LSP status |
| Formatter | `` | nf-fa-pencil | Formatter |

---

## 5. pi-lens Widget

**File:** `widgets/lens-widget.ts`

### Data Source

Subscribes to `pi.events` on these channels (published by pi-lens extension):

| Event | Payload | Rendering |
|-------|---------|-----------|
| `pi-lens/analysis-complete` | `LensAnalysisPayload` (diagnostics[], blockers[], warnings[], fixed[], fileModified, changedFiles, durationMs) | Update per-file diagnostic cache |
| `pi-lens/findings` | Same as analysis-complete (emitted only when findings exist) | Trigger re-render if new blockers/warnings |
| `pi-lens/turn-findings` | `LensTurnFindingsPayload` (blockerSections, advisorySections, content) | Show turn-level summary |

### Rendering

- **Wide mode (≥80 cols):** Full vertical list: file rows with status dots (● red / ! yellow / ✓ green), blocker diagnostics with rule IDs below their file, LSP status line at bottom.
- **Narrow mode (<80 cols):** Compact: single line showing total error/warning counts, worst file name, truncated worst diagnostic. Scrollable to expand.
- Supports `scrollable` on the column — if diagnostics exceed allocated height, last N lines are shown with a "… and N more" indicator.
- Clickable file paths (OSC 8 hyperlinks).
- Config options: `maxDiagnostics` (default 20), `showRunners` (default true), `showFormatters` (default true).

---

## 6. Completion Engine

**Files:** `completion/completion-engine.ts`, `completion/completion-popup.ts`

### Behavior

- Uses the **same completion providers** as pi's default editor (path completion, @file references, slash commands, custom autocomplete providers).
- Instead of inline rendering, opens a **floating popup overlay** above the cursor.
- Popup does NOT shift grid layout — it's an overlay component.
- **Positioning:** Primary = above cursor (bottom-aligned to cursor line). Fallback = below cursor if no room above.
- **Max height:** 8 lines (configurable). **Width:** matches editor column width.
- Keyboard: ↑/↓ to navigate, Enter to select, Escape to dismiss.
- On selection, text is applied to the editor and popup closes.

### Integration with Editor Widget

The editor widget wraps pi's built-in editor. When the built-in editor's autocomplete triggers, the completion engine intercepts the completion list, calculates cursor position relative to the terminal, and opens the overlay via `ctx.ui.custom({ overlay: true, overlayOptions: { anchor: ... } })`.

### Cursor Position Calculation

The grid component knows exactly where each cell renders (row offset, column offset). The editor widget reports cursor position relative to its own content. The completion engine combines these to compute the absolute terminal position for the overlay anchor.

---

## 7. Prompt Bar Widget

**File:** `widgets/prompt-bar-widget.ts`

- Read-only display (not interactive in v1).
- Shows the most recent user prompt from `ctx.sessionManager.getEntries()`.
- Truncated to `maxLength` characters with "…" if longer.
- Prefixed with Nerd Font `` (chevron-left) icon.
- Updates on `agent_end` and `input` events.

---

## 8. Reactivity & Data Flow

### Three Update Paths

1. **Event-driven (non-blocking):** Widgets subscribe to pi events, update internal state, call `invalidate()` + `requestRender()`. Used by status-bar (model_select, turn_end), pi-lens (analysis-complete), prompt-bar (agent_end, input).

2. **Poll-on-reify (lazy):** Widgets compute derived values directly in `render()` from pi APIs. Used for rapidly-changing values where event overhead isn't worth it (context percentage, current time).

3. **External provider (pull-based):** Widgets with external data sources (git status) cache results and refresh on lightweight intervals or specific events. Stale data renders immediately.

### Event Wiring

```
pi.on("session_start")     → create GridComponent, replace editor, mount widgets
pi.on("model_select")      → status-bar.invalidate() + requestRender()
pi.on("thinking_level_select") → status-bar.invalidate() + requestRender()
pi.on("turn_start")        → status-bar.invalidate() (spinner)
pi.on("turn_end")          → status-bar.invalidate(), lens-widget.invalidate()
pi.on("agent_end")         → prompt-bar.invalidate()
pi.on("input")             → prompt-bar.invalidate()
pi.events.on("pi-lens/analysis-complete") → lens-widget.update(diagnostics)
pi.events.on("pi-lens/findings")          → lens-widget.update() + requestRender()
pi.events.on("pi-lens/turn-findings")     → lens-widget.update() + requestRender()
pi.on("session_shutdown")  → cleanup, stop timers
```

### Non-blocking Guarantee

All event handlers are async but fire-and-forget. They never block the agent loop. The grid never blocks on widget rendering — widgets must render synchronously from cached state. If a widget's data source is stale, it renders stale data (no spinner, no wait).

---

## 9. Extension API Surface

Exposed via `pi` (ExtensionAPI):

```typescript
// Grid config
pi.setGridConfig(config: GridConfig): void;
pi.getGridConfig(): GridConfig;

// Widget registration
pi.registerWidget(name: string, factory: WidgetFactory): void;
```

Exposed in the pi package's `pi` key (for pi package manifest):

```json
{
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

User configuration (settings.json or `~/.pi/agent/settings.json`):

```json
{
  "pi-zazz": {
    "grid": { /* GridConfig overrides */ },
    "theme": "dark"
  }
}
```

---

## 10. Constraints & Edge Cases

- **Minimum terminal size:** If terminal < 40 cols or < 8 rows, fall back to default pi editor (no grid).
- **No pi-lens installed:** pi-lens widget renders "pi-lens not installed" message, column collapses to hidden if scrollable.
- **Custom editor already replaced:** `GridComponent` wraps whatever `ctx.ui.getEditorComponent()` returns, so other extensions' custom editors are preserved.
- **Widget render errors:** Caught per-widget; error message rendered in the cell instead of crashing the grid.
- **Overlay interaction with resize:** Completion popup recalculates position on terminal resize.
- **Config validation:** Invalid config falls back to DEFAULT_GRID with a notification.
- **Nerd Font availability:** If Nerd Font glyphs are not available in the terminal font, they render as fallback Unicode or plain text (no crashes). We use common Nerd Font glyphs that are widely supported.

---

## 11. File List

| File | Purpose |
|------|---------|
| `src/index.ts` | Extension entry, event wiring, default config initialization |
| `src/default-config.ts` | Default GridConfig JSON |
| `src/icons.ts` | Nerd Font icon map |
| `src/grid/types.ts` | GridConfig, RowConfig, ColumnConfig, etc. |
| `src/grid/grid-engine.ts` | Layout solver (2-pass) |
| `src/grid/grid-component.ts` | CustomEditor subclass delegating to grid |
| `src/widgets/types.ts` | WidgetInstance, WidgetFactory, WidgetDeps |
| `src/widgets/registry.ts` | Widget registry + createFromConfig |
| `src/widgets/editor-widget.ts` | Editor widget wrapping built-in editor |
| `src/widgets/status-bar-widget.ts` | Pill bar widget |
| `src/widgets/lens-widget.ts` | pi-lens diagnostics widget |
| `src/widgets/prompt-bar-widget.ts` | Previous prompt widget |
| `src/status-bar/pill-renderer.ts` | Pill badge renderer |
| `src/status-bar/segments.ts` | Powerline segment definitions (reused) |
| `src/completion/completion-engine.ts` | Completion delegation + popup management |
| `src/completion/completion-popup.ts` | Floating overlay TUI component |
