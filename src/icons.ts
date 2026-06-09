/**
 * Nerd Font icon map for pi-zazz.
 * Every icon is a Nerd Font glyph using Unicode code points from the Nerd Fonts v3+ standard.
 */

export const ICONS = {
	// Model / AI
	model: "󰘚 ", // nf-md-brain

	// Shell
	shell: " ", // nf-fa-terminal

	// Path / folder
	folder: " ", // nf-fa-folder

	// Git
	branch: " ", // nf-fa-code_fork
	git: " ", // nf-fa-git
	staged: "󱪙 ", // md-file_document_check — doc with checkmark
	unstaged: "󱇨 ", // md-file_edit_outline — doc with pencil
	untracked: "󰻭 ", // md-file_plus_outline — doc with plus

	// Thinking / cognition
	thinking: " ", // nf-fa-circle

	// Context / memory
	context: "󰃟 ", // nf-md-chart_donut

	// Diagnostics
	error: " ", // nf-fa-times_circle
	warning: " ", // nf-fa-warning
	success: " ", // nf-fa-check_circle
	info: " ", // nf-fa-info_circle

	// Time
	clock: " ", // nf-fa-clock

	// Tokens
	tokensIn: "󰁕 ", // nf-md-arrow_down
	tokensOut: "󰁔 ", // nf-md-arrow_up

	// Cost / money
	cost: " ", // nf-fa-money

	// Blocked / lock
	locked: " ", // nf-fa-lock

	// Session
	session: "󰌆 ", // nf-md-identifier

	// Host
	host: "󰒋 ", // nf-md-server

	// Cache
	cache: "󰏗 ", // nf-md-database
	cacheRead: "\u{DB80}\u{DC55}", // same as tokensIn
	cacheWrite: "\u{DB80}\u{DC54}", // same as tokensOut

	// Navigation
	promptArrow: " ", // nf-fa-chevron_right
	prevPrompt: " ", // nf-fa-chevron_left

	// LSP / language
	lsp: "󰨞 ", // nf-md-language_c

	// Formatter
	formatter: " ", // nf-fa-pencil

	// Separator dot
	sepDot: " ", // nf-fa-circle

	// Auto-compact indicator
	autoCompact: " ", // nf-fa-refresh

	// ── Completion popup categories (double-width Nerd Font) ───

	/** Built-in command */
	compBuiltin: "󰆍 ", // nf-md-console
	/** Extension command */
	compExt: "󰐱 ", // nf-md-puzzle
	/** Skill command */
	compSkill: " ", // nf-md-flash
	/** File */
	compFile: " ", // nf-md-file
	/** Directory */
	compDir: " ", // nf-md-folder
} as const;

export type IconName = keyof typeof ICONS;

/** Get an icon by name, returning empty string if not found */
export function icon(name: IconName): string {
	const value = ICONS[name];
	return value ?? "";
}
