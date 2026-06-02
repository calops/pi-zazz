/**
 * Nerd Font icon map for pi-zazz.
 * Every icon is a Nerd Font glyph using Unicode code points from the Nerd Fonts v3+ standard.
 */

export const ICONS = {
	// Model / AI
	model: "\u{DB80}\u{DE1A}", // nf-md-brain 󰘚

	// Shell
	shell: "\u{ED48}", // nf-fa-terminal 

	// Path / folder
	folder: "\u{F07B}", // nf-fa-folder 

	// Git
	branch: "\u{E725}", // nf-dev-git_branch 
	git: "\u{F1D3}", // nf-fa-git 
	staged: "\u{F457}", // nf-oct-diff_added 
	unstaged: "\u{F459}", // nf-oct-diff_modified 
	untracked: "\u{F128}", // nf-fa-question 

	// Thinking / cognition
	thinking: "\u{F192}", // nf-fa-circle 

	// Context / memory
	context: "\u{DB80}\u{DCDF}", // nf-md-chart_donut 󰃟

	// Diagnostics
	error: "\u{F057}", // nf-fa-times_circle 
	warning: "\u{F071}", // nf-fa-warning 
	success: "\u{F058}", // nf-fa-check_circle 
	info: "\u{F05A}", // nf-fa-info_circle 

	// Time
	clock: "\u{F017}", // nf-fa-clock 

	// Tokens
	tokensIn: "\u{DB80}\u{DC55}", // nf-md-arrow_down 󰁕
	tokensOut: "\u{DB80}\u{DC54}", // nf-md-arrow_up 󰁔

	// Cost / money
	cost: "\u{F155}", // nf-fa-money 

	// Session
	session: "\u{DB80}\u{DF06}", // nf-md-identifier 󰌆

	// Host
	host: "\u{DB80}\u{DE4B}", // nf-md-server 󰒋

	// Cache
	cache: "\u{DB80}\u{DC56}", // nf-md-database 󰏗
	cacheRead: "\u{DB80}\u{DC55}", // same as tokensIn
	cacheWrite: "\u{DB80}\u{DC54}", // same as tokensOut

	// Navigation
	prevPrompt: "\u{F053}", // nf-fa-chevron_left 

	// LSP / language
	lsp: "\u{DB80}\u{DE1E}", // nf-md-language_c 󰨞

	// Formatter
	formatter: "\u{F040}", // nf-fa-pencil 

	// Separator dot
	sepDot: "\u{F111}", // nf-fa-circle 

	// Auto-compact indicator
	autoCompact: "\u{F021}", // nf-fa-refresh 
} as const;

export type IconName = keyof typeof ICONS;

/** Get an icon by name, returning empty string if not found */
export function icon(name: IconName): string {
	const value = ICONS[name];
	return value ?? "";
}
