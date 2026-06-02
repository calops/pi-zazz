import { CompletionPopup } from "./completion-popup.ts";
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
  private _onApply: ((value: string) => void) | null = null;

  constructor(
    openOverlay: (
      component: CompletionPopup,
      opts: { overlay: boolean },
    ) => { close: () => void },
  ) {
    this.openOverlay = openOverlay;
  }

  show(
    items: CompletionItem[],
    _termHeight: number,
    editorWidth: number,
    theme: { fg: (c: string, t: string) => string; bg: (c: string, t: string) => string },
    cursorRow: number,
  ): void {
    if (items.length === 0) return;
    this.dismiss();

    const maxHeight = Math.min(items.length, 8);
    const width = Math.max(20, Math.min(editorWidth, 60));

    // Position: above cursor if room, else below (handled by overlay anchor)
    void cursorRow; // reserved for future anchor calculation

    const popup = new CompletionPopup({
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
