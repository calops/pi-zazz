# Generic Extension Widget Host in pi-zazz

## Problem

Every extension that renders UI in pi's TUI via `ctx.ui.setWidget()` currently needs
custom integration code in pi-zazz:

1. A manual suppression rule in `index.ts` (e.g., `if (key === "pi-lens") return`)
2. A custom data bridge to capture/transform the extension's state
3. A custom grid widget that reads from the bridge and renders in the grid
4. A manual column entry in `default-config.ts`

This doesn't scale — every new extension widget requires the same boilerplate.

## Goal

Replace per-extension integration with a **generic widget host** that:

- Intercepts ALL `setWidget()` calls and captures the extension's render callback
- Renders each captured widget's output inside a grid cell automatically
- Lays them out in rows (configurable widgets-per-row, reactive to terminal width)
- Collapses the row when no widgets have content
- Existing per-extension files (`lens-widget.ts`, `task-list-widget.ts`, bridges)
  are kept in-tree for discussion but disconnected from the active path.

## Architecture

```
setWidget("pi-lens", (tui, theme) => component)
  └──→ index.ts: intercept, capture factory in WidgetCapturer
      
setWidget("tasks", (tui, theme) => component)
  └──→ index.ts: intercept, capture factory in WidgetCapturer

Grid render
  └──→ ExtensionsHostWidget.render(width, height)
        └──→ WidgetCapturer.renderWidget("pi-lens", cellWidth)
        └──→ WidgetCapturer.renderWidget("tasks", cellWidth)
        └──→ Composite: side-by-side with separators, wrapped to rows
```

## Components

### 1. `src/widget-capturer.ts` — Capture all setWidget calls

Module-level singleton. Three methods:

- `capture(key, factory, options?)` — store the factory for component-based widgets
- `captureLines(key, lines, options?)` — store static text content
- `release(key)` — remove a widget and dispose its component
- `renderWidget(key, width): string[]` — lazily create component, render, return lines
- `getActiveKeys(): string[]` — keys with non-empty render output  
- `getAllKeys(): string[]` — all captured keys
- `invalidate(key)` — invalidate a specific widget's cached output
- `setContext(tui, theme)` — set the TUI/Theme references for factory calls
- `setOnChange(fn)` — callback when widgets are captured/released

Lazy component creation: factories are stored but not called until first `renderWidget()`.

### 2. `src/widgets/extensions-host-widget.ts` — Grid widget

Registered as `"extensions-host"` widget type. Config:

```typescript
interface ExtensionsHostConfig {
    maxWidgetsPerRow: number;   // default: 2
    minWidgetWidth: number;     // default: 40
}
```

**Layout algorithm**:

Given available width `W`:

```
columns = Math.min(config.maxWidgetsPerRow, Math.floor(W / config.minWidgetWidth))
columns = Math.max(1, columns)
```

Active widgets (from `getActiveKeys()`) are grouped into rows of `columns` each.
Each sub-row is rendered as a horizontal composition of widget outputs separated
by `│`. Row height = tallest widget in that sub-row. Widget lines are padded to
equal heights.

**Height negotiation**:

```typescript
heightConstraint(): { min: number; max: number } {
    const active = widgetCapturer.getActiveKeys();
    return active.length > 0
        ? { min: 1, max: Infinity }
        : { min: 0, max: 0 };
}
```

Active detection: on first render, check if any captured widget returns non-empty
output. Cache the result for `heightConstraint()` calls in subsequent cycles.
A one-cycle lag is acceptable (grid re-renders immediately after).

**Border separators**: Between adjacent sub-columns, render a `│` in the theme's
border color. No border before the first or after the last column.

### 3. `src/index.ts` changes

- Replace specific setWidget suppression with generic capture:

```typescript
plUi.setWidget = (key, content) => {
    if (content === undefined || content === null) {
        widgetCapturer.release(key);
    } else if (typeof content === "function") {
        widgetCapturer.capture(key, content);
    } else if (Array.isArray(content)) {
        widgetCapturer.captureLines(key, content);
    }
};
```

- Remove side-effect imports for old custom widgets:

```typescript
// REMOVED:
// import "./widgets/lens-widget.ts";
// import "./widgets/task-list-widget.ts";
```

- Remove data bridge subscriptions:

```typescript
// REMOVED:
// subscribeToLensEvents(pi.events);
// subscribeToTaskEvents(pi as never);
```

- Wire widget capturer with tui/theme when overlay is created

### 4. `src/default-config.ts` changes

Replace the lens+tasks columns in the `lints` row with a single extensions-host
widget:

```typescript
{
    id: "extensions",
    height: { min: 0, max: 12 },
    columns: [
        {
            id: "host",
            width: {},
            widget: {
                type: "extensions-host",
                config: {
                    maxWidgetsPerRow: 2,
                    minWidgetWidth: 40,
                },
            },
        },
    ],
}
```

The row id changes from `"lints"` to `"extensions"` to reflect the generic
purpose.

## Existing files

These files stay in the repository but are no longer imported or used:

- `src/lens-data-bridge.ts`
- `src/task-data-bridge.ts`
- `src/widgets/lens-widget.ts`
- `src/widgets/task-list-widget.ts`

Import lines are removed from `src/index.ts`; the `.ts` files remain on disk.

## Edge Cases

- **Widget registered with undefined**: `setWidget("foo", undefined)` → release from capturer.
- **Widget re-registered**: Old component disposed, new factory stored.
- **Widget factory throws on render**: Catch error, return `["⚠ widget error"]` line.
- **No active widgets**: Row collapses (height 0, column hidden).
- **Too many widgets**: Overflow pushed to subsequent sub-rows down to the row's maxHeight.
- **Narrow terminal**: Falls back to 1 column per row if width < minWidgetWidth.
- **Config outside terminal bounds**: `minWidgetWidth` clamped to min 20; `maxWidgetsPerRow` clamped to min 1.

## Open for Discussion

- What about widgets with `placement: "belowEditor"` vs `"aboveEditor"` — should
  they render in different grid rows?
- Some widgets may depend on specific input/event wiring that the grid overlay
  doesn't provide (non-capturing). The component's `handleInput()` won't be
  reachable. This is acceptable for first draft.
- The string[] content overload: currently no extension in this project uses it,
  but the capturer supports it for completeness.
