import { visibleWidth } from "@earendil-works/pi-tui";

export interface CompletionItem {
	value: string;
	label: string;
	description?: string;
}

export interface CompletionPopupOptions {
	items: CompletionItem[];
	width: number;
	maxHeight: number;
	onSelect: (item: CompletionItem) => void;
	onCancel: () => void;
	theme: {
		fg: (color: string, text: string) => string;
		bg: (color: string, text: string) => string;
	};
}

export class CompletionPopup {
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
		if (data === "\x1b[A" || data === "\x1bOA") {
			this.selected = Math.max(0, this.selected - 1);
		} else if (data === "\x1b[B" || data === "\x1bOB") {
			this.selected = Math.min(this.items.length - 1, this.selected + 1);
		} else if (data === "\r" || data === "\n") {
			const item = this.items[this.selected];
			if (item) this.onSelect(item);
		} else if (data === "\x1b" || data === "\x03") {
			this.onCancel();
		}
	}

	render(_width: number): string[] {
		const items = this.items.slice(0, this.maxHeight);
		const dim = (s: string) => this.theme.fg("dim", s);
		const accent = (s: string) => this.theme.fg("accent", s);
		const highlight = (s: string) => this.theme.bg("selectedBg", s);

		const lines: string[] = [];
		lines.push(dim("╔" + "═".repeat(Math.max(0, this.width - 2)) + "╗"));

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

		for (let i = items.length; i < this.maxHeight; i++) {
			lines.push(dim("║") + " ".repeat(this.width - 2) + dim("║"));
		}

		lines.push(dim("╚" + "═".repeat(Math.max(0, this.width - 2)) + "╝"));
		return lines;
	}

	invalidate(): void {
		// No cache to clear
	}

	private padLine(text: string, targetWidth: number): string {
		const vw = visibleWidth(text);
		if (vw >= targetWidth) {
			let result = "";
			let pos = 0;
			let inEscape = false;
			for (const ch of text) {
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
				if (pos >= targetWidth - 1) {
					result += "…";
					break;
				}
				result += ch;
				pos++;
			}
			return result;
		}
		return text + " ".repeat(targetWidth - vw);
	}
}
