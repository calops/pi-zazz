# pi-zazz

A pi coding agent extension that replaces pi's standard TUI with a custom grid-based overlay layout and rich status bar.

## Architecture

### Entry point
`src/index.ts` — extension default export. Registers event handlers on `session_start`, replaces the built-in editor with a `StubEditor`, and creates a persistent full-window overlay via `ctx.ui.custom()`.

### Overlay + Grid
The overlay covers the bottom portion of the terminal. Inside it, a `GridComponent` (rows + columns) lays out widgets:

```
┌──────────────────────────────────────┐
│ model-bar (1 line)                   │ ← status-bar row with pills
├──────────────────────────────────────┤
│ editor         │ lens (scrollable)   │ ← main row (responsive)
├──────────────────────────────────────┤
│ prompt-bar (1 line)                  │
└──────────────────────────────────────┘
```

Grid layout is computed by `grid-engine.ts` — a pure function that allocates row heights and column widths from a `GridConfig`. Rows start at `min` height and grow based on actual widget content (not pre-allocated space). No `grow` flag; height is content-driven.

### Key Components

**StubEditor** (`src/index.ts`): extends pi's `CustomEditor`, renders blank lines to reserve vertical space for the overlay. All keyboard input routes through it (overlay is non-capturing). It forwards text operations to the grid's editor widget via `editorBridge` and dispatches app-level keybindings (C-c, C-p, C-o, escape, Ctrl+D) using the same logic as `CustomEditor.handleInput`.

**OverlayEditor** (`src/widgets/custom-editor-widget.ts`): extends pi-tui's `Editor`. Monkey-patches three private methods:
- `createAutocompleteList` — creates a stub `SelectList` + shows a `CompletionOverlayComponent` via `tui.showOverlay()` instead of the default inline SelectList
- `clearAutocompleteUi` — hides the completion overlay
- `isShowingAutocomplete` — delegates to overlay handle state

Overrides `render()` to strip the top/bottom horizontal bars from the base Editor output.

**CompletionOverlayComponent**: a custom overlay rendered above the cursor with rounded borders (`╭─╮`/`╰─╯`) and truncated content via `truncateToWidth`.

**Status bar** (`src/widgets/status-bar-widget.ts`): renders pills with `/` separators. Each pill is self-contained (opening ``, colored content, closing ``). Pills can have a right extension sub-pill that blends under the main pill's closing `` — no separate left opening separator. Extension backgrounds use true color (`\x1b[48;2;R;G;Bm`) via `blendTowardBg()` (snacks.nvim linear RGB interpolation). 256-color cube for main pills, true color for extensions to avoid quantization artifacts.

Pill rendering lives in `src/status-bar/pill-renderer.ts`:
- `makePill(content, colorFn)` → `Pill` with extracted bg/fg color indices
- `packPills(left[], right[], separator, width)` → full status bar string
- `makeExtension(text, baseBg)` → `PillExtension` with true color blended dark bg
- `darkenColor(baseColor, alpha)` → falls back to `Math.round(baseColor * alpha)` (callers use `blendTowardBg` for precision)

### Input Flow
```
Terminal input → TUI → StubEditor.handleInput
  ├──→ editorBridge.handleInput → GridComponent → widget → OverlayEditor.handleInput (text editing)
  └──→ app keybinding dispatch (same logic as CustomEditor)
```

Overlay is `nonCapturing: true`, so input flows to the StubEditor (pi's focused component).

### Key Design Decisions

1. **Overlay is non-capturing**: the grid overlay renders visually but doesn't capture keyboard focus. Input reaches the StubEditor which acts as pi's editor, forwarding to the widget and dispatching app actions.

2. **Content-driven row heights**: grid rows start at their configured `min` and grow/shrink based on actual widget output, clamped to `[min, max]`. No `grow` distribution in the layout engine.

3. **True color for extension backgrounds**: the 6×6×6 256-color cube is too coarse for proper color blending (green jumps from 0 to 95). Extensions use `\x1b[48;2;R;G;Bm` (24-bit) for correct darkening.

4. **StubEditor as a bridge**: replaces pi's CustomEditor but delegates text operations to the grid widget via `editorBridge`. `getText()`/`setText()` proxy through the bridge, so app actions like `/model` clear the right buffer.

5. **Submit routes through StubEditor.onSubmit**: `submitFn` in deps calls `stubEditorRef?.onSubmit` which is pi's `defaultEditor.onSubmit` with full slash command processing.

### Cached Data

Model, thinking level, git status, and context usage are cached from pi events (or fetched via git commands) in the status bar widget. `ctx` from `session_start` and `pi.getThinkingLevel()` initialize the cached values.

### Grid Config
`src/default-config.ts` defines the default layout. Currently: status bar (model/path/git/context pills), editor+lens main row, and prompt bar. Configurable via pi settings under `pi-zazz.grid`.
