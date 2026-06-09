import { icon } from "../icons.ts";
import type { AutocompleteItem } from "@earendil-works/pi-tui";

// ── Category type ──────────────────────────────────────────────────

export type CompletionCategory =
	| "builtin"
	| "extension"
	| "skill"
	| "file"
	| "directory";

// ── Row context passed to column renderers ─────────────────────────

export interface RowContext {
	/** The category of the current item (for the icon column) */
	category: CompletionCategory;
	/** Whether this row is the selected/highlighted item */
	isSelected: boolean;
}

// ── Category → icon / color ────────────────────────────────────────

/** Map a completion category to its Nerd Font icon */
export function iconForCategory(cat: CompletionCategory): string {
	switch (cat) {
		case "builtin":
			return icon("compBuiltin");
		case "extension":
			return icon("compExt");
		case "skill":
			return icon("compSkill");
		case "file":
			return icon("compFile");
		case "directory":
			return icon("compDir");
	}
}

/** Map a completion category to the theme color name used for its icon */
export function categoryColorName(cat: CompletionCategory): string {
	switch (cat) {
		case "builtin":
			return "accent";
		case "extension":
			return "mdLink";
		case "skill":
			return "warning";
		case "file":
			return "dim";
		case "directory":
			return "accent";
	}
}

// ── Category detection ─────────────────────────────────────────────

/** Determine the category for each autocomplete item based on content and prefix */
export function computeItemCategories(
	items: AutocompleteItem[],
	prefix: string,
): CompletionCategory[] {
	const isSlashContext = prefix.startsWith("/") && !prefix.includes(" ");
	const isFileAttachment = prefix.startsWith("@");
	const isPathContext =
		prefix.includes("/") ||
		prefix.startsWith(".") ||
		prefix.startsWith("~") ||
		prefix.endsWith(" ") ||
		prefix === "";

	return items.map((item) => {
		if (isSlashContext || (!isFileAttachment && !isPathContext)) {
			if (item.label.startsWith("skill:")) return "skill";
			if (item.description && item.description.startsWith("[")) {
				return "extension";
			}
			return "builtin";
		}

		if (item.label.endsWith("/")) return "directory";
		return "file";
	});
}
