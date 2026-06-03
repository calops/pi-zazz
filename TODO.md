# TODO

## Editor subclass compatibility

We subclass the built-in `Editor` from `@earendil-works/pi-tui`
and monkey-patch three private methods to intercept completion rendering:

- `createAutocompleteList()` → show our overlay instead of building a `SelectList`
- `clearAutocompleteUi()` → hide our overlay
- `isShowingAutocomplete()` → delegate to our overlay state

We also read two private fields:
- `autocompleteState` — the current completion suggestions
- `scrollOffset` — to compute cursor terminal row

**If upstream changes these internals**, the completion overlay will
break silently (fallback: built-in inline SelectList rendering).

### CI check idea

A smoke test that:
1. Loads pi-zazz in CI against the current pi pin
2. Types `@` in the editor
3. Asserts the completion overlay appears (not the inline SelectList)

Run this weekly against `main` of pi-mono and alert on breakage.
