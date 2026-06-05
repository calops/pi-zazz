# Implementation Plan: Generic Extension Widget Host

## Order

### Step 1: `src/widget-capturer.ts`
Module-level singleton that intercepts all `setWidget()` calls.
- `.capture(key, factory)` / `.captureLines(key, lines)` / `.release(key)`
- `.renderWidget(key, width)` — lazy component creation, cached output
- `.getActiveKeys()` — keys whose last render returned non-empty lines
- `.setContext(tui, theme)` / `.setOnChange(fn)`

### Step 2: `src/widgets/extensions-host-widget.ts`
Grid widget `"extensions-host"` with config `{ maxWidgetsPerRow, minWidgetWidth }`.
- Layout: `columns = min(maxWidgetsPerRow, floor(W / minWidgetWidth))`
- Groups active widgets into sub-rows, composites side-by-side with `│`
- `heightConstraint()`: hides when no active widgets
- Responsive to terminal width

### Step 3: `src/index.ts`
- Replace specific setWidget suppression with generic capture
- Remove old data bridge subscriptions
- Remove old widget side-effect imports (files stay on disk)
- Wire capturer with tui/theme

### Step 4: `src/default-config.ts`
- Replace lens+tasks columns with extensions-host column in a row

### Step 5: Verify
- `npx tsc --noEmit` — clean
- Commit and push
