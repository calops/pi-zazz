# pi-zazz — Handoff

**Project:** Custom editor UI extension for pi coding agent  
**Directory:** `/home/calops/projects/pi-zazz`  
**Last commit:** `50a7656` — `feat: overhaul to full-window overlay architecture`

---

## Architecture Summary

pi-zazz replaces pi's built-in editor area with a declarative grid layout rendered inside a **persistent overlay anchored at the bottom of the terminal**. The overlay covers only the grid area — messages above are pi's normal TUI output, untouched by overlay compositing.

A `StubEditor` (via `ctx.ui.setEditorComponent`) replaces the built-in editor, rendering blank lines equal to the grid height. This reserves vertical space in pi's layout so messages naturally stop above where the grid begins — no cropping, no gap.

```
┌─────────────────────────────────┐
│  Message area                   │  ← pi's normal TUI output
│  (pi manages, no overlay)       │     (no overlay compositing here)
├─────────────────────────────────┤
│  Status bar (pills)             │  ← overlay covers this area
│  ┌────────────┬───────────┐     │     (gridHeight rows,
│  │  Editor    │  pi-lens  │     │      anchor: bottom-left)
│  │  (custom)  │  diagnostics│    │
│  │  2/3       │  1/3      │     │
│  └────────────┴───────────┘     │
│  ◀ previous prompt              │
└─────────────────────────────────┘
```

### Key design decisions

1. **Overlay returns only grid lines** — no "transparent prefix." The overlay naturally covers exactly `gridHeight` rows at the bottom. Empty strings (`""`) in overlay output are **not transparent** — `compositeLineAt` pads them with spaces, making them opaque. So the overlay must not produce lines for the message area.

2. **StubEditor reserves space** — `setEditorComponent` replaces pi's built-in editor with a `StubEditor` that renders `reservedEditorHeight` blank lines. `reservedEditorHeight` is updated by the overlay on every render to match the current grid height. This pushes messages up so they stop above the overlay's grid.

3. **Input routing** — the overlay's `handleInput` captures all keyboard input and delegates to the grid, which forwards to the editor widget.

---

## Key files

| File | Purpose |
|------|---------|
| `src/index.ts` | Extension entry: wire session lifecycle, create overlay + stub editor, share `reservedEditorHeight`, event → `requestRender` |
| `src/grid/types.ts` | `GridConfig`, `RowConfig`, `ColumnConfig`, `LayoutPlan` |
| `src/grid/grid-engine.ts` | Pure layout solver: `computeLayout(config, termWidth, termHeight)` → `LayoutPlan` |
| `src/grid/grid-component.ts` | `GridComponent` — renderer class. Allocates cells, calls `widget.render()`, composes borders. `getText()`/`setText()` delegate to the editor widget. |
| `src/widgets/types.ts` | `WidgetInstance` (with optional `getText`/`setText`), `WidgetDeps` (has `submitFn`, `autocompleteProvider`), `WidgetFactory` |
| `src/widgets/registry.ts` | `Map<string, WidgetFactory>`, `registerWidget()`, `createFromConfig()` |
| `src/widgets/custom-editor-widget.ts` | Custom text editor widget. Manages buffer/cursor/editing. Renders inline completion popup. Implements `getText()`/`setText()`. Submits via `deps.submitFn`. |
| `src/widgets/status-bar-widget.ts` | Pill bar with 19 powerline segments, hardcoded ANSI colors, event-cached state |
| `src/widgets/lens-widget.ts` | pi-lens sidebar: subscribes to `pi.events`, shows per-file diagnostic counts |
| `src/widgets/prompt-bar-widget.ts` | Read-only previous-prompt bar, updates on `agent_end`/`input` |
| `src/status-bar/segments.ts` | 19 powerline segment render functions with Nerd Font icons |
| `src/status-bar/pill-renderer.ts` | `packPills()` algorithm (overflow removes from middle), `makePill()`, separators |
| `src/icons.ts` | Nerd Font icon map (28 glyphs as Unicode escapes) |
| `src/default-config.ts` | 3-row default `GridConfig` |

---

## What Works

1. **Grid layout** — status bar, editor, pi-lens sidebar, prompt bar render in their cells
2. **Custom text editor** — typing, cursor movement, deletion, line navigation (arrows, home/end, Ctrl+A/E, Ctrl+W, Ctrl+K/U)
3. **Status bar** — model, thinking, path, git, context%, cost segments render
4. **Overlay positioning** — grid renders at the bottom, messages above are pi's normal TUI output
5. **Stub editor space reservation** — `reservedEditorHeight` keeps messages from being cropped by the grid
6. **Typecheck** — `npm run typecheck` passes clean

## What Doesn't Work / Needs Testing

1. **Completion popup** — inline rendering code is written but hasn't been verified working end-to-end. May need debugging of the `addAutocompleteProvider` → captured chain → `getSuggestions()` → `applyCompletion()` flow.
2. **Enter/submit** — wired via `deps.submitFn` → `pi.sendUserMessage()`. Not tested at runtime.
3. **pi-lens widget** — subscribes to `pi.events` but hasn't been tested against a running pi-lens instance. Event field names may need adjustment.
4. **Responsive layout** — breakpoint logic is implemented but not tested on narrow terminals.
5. **GridConfig user customization** — `setGridConfig()` API is exposed but untested.
6. **First-render flicker** — `reservedEditorHeight` is estimated at width=80 during setup, then corrected on the first real render. A one-frame mismatch (stub height ≠ grid height) is possible on startup. Self-correcting on the second frame.

## How to Run

```bash
cd /home/calops/projects/pi-zazz
pi --no-extensions -e ./src/index.ts
```

## Debugging Tips

- **No visible grid:** The overlay may be rendering at wrong position. Check `overlayOptions.anchor` (should be `"bottom-left"`) and that the overlay factory returns only grid lines (no transparent prefix).
- **Messages cropped by grid:** The `reservedEditorHeight` may be stale. Verify the overlay's render updates it and that the `StubEditor.render()` uses the current value. On first frame, check the width=80 pre-render estimate.
- **Editor doesn't respond:** The overlay's `handleInput` must consume keystrokes; check that `GridComponent.handleInput()` returns `true` for handled keys.
- **Completion popup positioning:** The popup is drawn above the editor text within the editor widget's cell. If the cell height is too small, the popup + editor text may not both fit.
- **Autocomplete provider chain:** The `addAutocompleteProvider` callback captures the current chain. If this is called before pi sets up completions, the captured chain may be empty/incomplete.
- **`submitFn` wiring:** The editor widget captures `submitFn` from `deps` at widget creation time (lazy, on first render). The `submitFn` is set before widget creation (`submitFn: (text) => pi.sendUserMessage(text)` in the deps object), so the wiring should be correct.

## Design Docs

- **Spec:** `docs/superpowers/specs/2026-06-02-pi-zazz-editor-design.md`
- **Implementation Plan:** `docs/superpowers/plans/2026-06-02-pi-zazz-editor.md`
