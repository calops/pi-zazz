/**
 * File-type icon mapping combining:
 * - lsd's comprehensive extension→codepoint mapping (icons)
 * - mini.nvim's highlight group→color mapping (colors)
 *
 * lsd provides 342 extension-to-Nerd-Font-icon mappings.
 * mini.nvim provides 9 color categories (Azure, Blue, Cyan, Green,
 * Grey, Orange, Purple, Red, Yellow) mapped to file types.
 *
 * For extensions not explicitly in mini.nvim's color mapping,
 * we infer the color from the dominant file type category.
 */

// ── Highlight group → hex color ─────────────────────────────────────
// Colors derived from mini.nvim's default links:
//   MiniIconsAzure  → Function         → #589ED6
//   MiniIconsBlue   → DiagnosticInfo   → #569CD6
//   MiniIconsCyan   → DiagnosticHint   → #4EC9B0
//   MiniIconsGreen  → DiagnosticOk     → #6A9955
//   MiniIconsGrey   → (default)        → #808080
//   MiniIconsOrange → DiagnosticWarn   → #CE9178
//   MiniIconsPurple → Constant         → #C586C0
//   MiniIconsRed    → DiagnosticError  → #F44747
//   MiniIconsYellow → DiagnosticWarn   → #DCDCAA

const HL = {
	Azure: "#589ED6",
	Blue: "#569CD6",
	Cyan: "#4EC9B0",
	Green: "#6A9955",
	Grey: "#808080",
	Orange: "#CE9178",
	Purple: "#C586C0",
	Red: "#F44747",
	Yellow: "#DCDCAA",
} as const;

type HlName = keyof typeof HL;

// ── Extension → color category ──────────────────────────────────────
// Mapped from mini.nvim's filetype_icons by determining which filetype
// each extension typically corresponds to.

const EXT_HL: Record<string, HlName> = {
	// Source code
	ts: "Azure",
	tsx: "Blue",
	js: "Yellow",
	jsx: "Azure",
	mjs: "Yellow",
	cjs: "Yellow",
	cts: "Azure",
	mts: "Azure",
	rs: "Orange",
	py: "Yellow",
	go: "Azure",
	java: "Orange",
	rb: "Red",
	c: "Blue",
	h: "Purple",
	cpp: "Azure",
	cs: "Green",
	swift: "Orange",
	kt: "Blue",
	scala: "Red",
	dart: "Blue",
	zig: "Orange",
	nim: "Yellow",
	crystal: "Grey",
	elm: "Azure",
	clj: "Green",
	cljs: "Green",
	ex: "Purple",
	exs: "Purple",
	hs: "Purple",
	lua: "Azure",
	php: "Purple",
	pl: "Azure",
	r: "Blue",
	m: "Orange",
	mm: "Yellow",

	// Build & config
	toml: "Orange",
	yaml: "Purple",
	yml: "Purple",
	json: "Yellow",
	jsonc: "Yellow",
	xml: "Orange",
	cfg: "Blue",
	conf: "Grey",
	ini: "Azure",
	make: "Grey",
	mk: "Grey",
	cmake: "Orange",
	bzl: "Green",
	nix: "Azure",

	// Web
	css: "Azure",
	scss: "Red",
	sass: "Red",
	less: "Purple",
	html: "Orange",
	htm: "Orange",
	vue: "Green",
	svelte: "Orange",
	astro: "Orange",

	// Shell
	sh: "Grey",
	bash: "Green",
	zsh: "Green",
	fish: "Grey",
	ps1: "Blue",
	bat: "Grey",
	cmd: "Grey",

	// Data
	sql: "Grey",
	db: "Cyan",
	git: "Orange",
	md: "Grey",
	markdown: "Grey",
	rst: "Yellow",
	csv: "Green",
	tsv: "Blue",
	pdf: "Red",
	svg: "Yellow",
	txt: "Yellow",

	// Media
	png: "Purple",
	jpg: "Orange",
	jpeg: "Orange",
	gif: "Azure",
	webp: "Blue",
	bmp: "Green",
	ico: "Green",
	mp3: "Azure",
	wav: "Green",
	flac: "Orange",
	ogg: "Grey",
	mp4: "Azure",
	mkv: "Green",
	mov: "Cyan",
	avi: "Grey",
	webm: "Grey",

	// Archives
	zip: "Azure",
	tar: "Cyan",
	gz: "Grey",
	bz2: "Orange",
	xz: "Green",
	rar: "Green",
	"7z": "Blue",
	zst: "Yellow",

	// Lock & security
	lock: "Grey",
	pem: "Yellow",
	key: "Yellow",
	asc: "Yellow",
	gpg: "Grey",

	// Docs
	doc: "Azure",
	docx: "Azure",
	xls: "Green",
	xlsx: "Green",
	ppt: "Red",
	pptx: "Red",

	// Rust
	"cargo.lock": "Orange",

	// Licenses
	license: "Cyan",
};

// ── lsd extension→codepoint mapping ────────────────────────────────
// Extracted from lsd (Rust file lister) at
// https://github.com/lsd-rs/lsd/blob/main/src/theme/icon.rs

const LSD: Record<string, number> = {
	"1": 0xf02d,
	"2": 0xf02d,
	"3": 0xf02d,
	"4": 0xf02d,
	"5": 0xf02d,
	"6": 0xf02d,
	"7": 0xf02d,
	"7z": 0xf410,
	"890": 0xf015e,
	a: 0xe624,
	ai: 0xe7b4,
	ape: 0xf001,
	apk: 0xe70e,
	apng: 0xf1c5,
	ar: 0xf410,
	asc: 0xf099d,
	asm: 0xf471,
	asp: 0xf121,
	avi: 0xf008,
	avif: 0xf1c5,
	avro: 0xe60b,
	awk: 0xf489,
	bak: 0xf006f,
	bash: 0xf489,
	bat: 0xf17a,
	bin: 0xeae8,
	blend: 0xf00ab,
	bmp: 0xf1c5,
	bz2: 0xf410,
	c: 0xe61e,
	"c++": 0xe61d,
	cc: 0xe61d,
	cfg: 0xe615,
	cjs: 0xe74e,
	class: 0xe738,
	clj: 0xe768,
	cljs: 0xe76a,
	cls: 0xe600,
	cmd: 0xf17a,
	coffee: 0xf0f4,
	conf: 0xe615,
	cp: 0xe61d,
	cpp: 0xe61d,
	cr: 0xe629,
	cs: 0xf031b,
	csh: 0xf489,
	css: 0xe749,
	csv: 0xf1c3,
	csx: 0xf031b,
	cts: 0xe628,
	cue: 0xf001,
	cxx: 0xe61d,
	dart: 0xe798,
	dat: 0xf1c0,
	db: 0xf1c0,
	deb: 0xf187,
	desktop: 0xf108,
	diff: 0xe728,
	dll: 0xf17a,
	doc: 0xf1c2,
	docx: 0xf1c2,
	ds_store: 0xf179,
	dump: 0xf1c0,
	ebuild: 0xf30d,
	eclass: 0xf30d,
	editorconfig: 0xe615,
	ejs: 0xe618,
	el: 0xf0172,
	elf: 0xf489,
	elm: 0xe62c,
	env: 0xf462,
	eot: 0xf031,
	epub: 0xe28a,
	erb: 0xe73b,
	erl: 0xe7b1,
	ex: 0xe62d,
	exe: 0xf17a,
	exs: 0xe62d,
	fish: 0xf489,
	flac: 0xf001,
	flv: 0xf008,
	fnl: 0xe6af,
	font: 0xf031,
	fs: 0xe7a7,
	fsi: 0xe7a7,
	fsx: 0xe7a7,
	gemfile: 0xe21e,
	gif: 0xf1c5,
	git: 0xf1d3,
	go: 0xe627,
	gpg: 0xf099d,
	gradle: 0xe660,
	gz: 0xf410,
	h: 0xf0fd,
	hbs: 0xe60f,
	heic: 0xf1c5,
	hh: 0xf0fd,
	hpp: 0xf0fd,
	hs: 0xe777,
	htm: 0xf13b,
	html: 0xf13b,
	hxx: 0xf0fd,
	ico: 0xf1c5,
	iml: 0xe7b5,
	in: 0xf15c,
	info: 0xe795,
	ini: 0xe615,
	ipynb: 0xe606,
	iso: 0xf1c0,
	jar: 0xe738,
	java: 0xe738,
	jl: 0xe624,
	jpeg: 0xf1c5,
	jpg: 0xf1c5,
	js: 0xe74e,
	json: 0xe60b,
	jsonc: 0xe60b,
	jsx: 0xe7ba,
	key: 0xf0306,
	ksh: 0xf489,
	kt: 0xe634,
	kts: 0xe634,
	ld: 0xe624,
	less: 0xe758,
	lhs: 0xe777,
	license: 0xe60a,
	lisp: 0xf0172,
	lock: 0xf023,
	log: 0xf18d,
	lss: 0xe749,
	lua: 0xe620,
	lz: 0xf410,
	m4a: 0xf001,
	m4v: 0xf008,
	make: 0xe615,
	makefile: 0xe615,
	man: 0xf02d,
	md: 0xe609,
	mjs: 0xe74e,
	mk: 0xf085,
	mkv: 0xf008,
	ml: 0xe67a,
	mli: 0xe67a,
	mov: 0xf008,
	mp3: 0xf001,
	mp4: 0xf008,
	msi: 0xf17a,
	mts: 0xe628,
	mustache: 0xe60f,
	nim: 0xe677,
	nix: 0xf313,
	npmignore: 0xe71e,
	o: 0xeae8,
	ogg: 0xf001,
	old: 0xf006f,
	opus: 0xf001,
	org: 0xe633,
	otf: 0xf031,
	part: 0xf43a,
	patch: 0xe728,
	pdf: 0xf1c1,
	pem: 0xf0306,
	php: 0xe608,
	pl: 0xe769,
	png: 0xf1c5,
	ppt: 0xf1c4,
	pptx: 0xf1c4,
	ps1: 0xf489,
	psd: 0xe7b8,
	py: 0xe606,
	pyc: 0xe606,
	r: 0xf0cf,
	rar: 0xf410,
	rb: 0xe21e,
	rs: 0xe68b,
	rss: 0xf09e,
	ru: 0xe68b,
	scala: 0xe737,
	scss: 0xe603,
	sh: 0xf489,
	so: 0xeae8,
	sql: 0xe7c4,
	sqlite: 0xe7c4,
	srt: 0xf001,
	styl: 0xe603,
	sv: 0xe5fe,
	svg: 0xf1c5,
	swift: 0xe755,
	tar: 0xf410,
	tex: 0xe69b,
	tgz: 0xf410,
	tiff: 0xf1c5,
	toml: 0xe615,
	torrent: 0xf023,
	ts: 0xe628,
	tsx: 0xe7ba,
	ttf: 0xf031,
	twig: 0xe60f,
	txt: 0xf15c,
	v: 0xe5fe,
	vim: 0xe62b,
	vue: 0xe6a8,
	wasm: 0xeae8,
	wav: 0xf001,
	webm: 0xf008,
	webp: 0xf1c5,
	wma: 0xf001,
	wmv: 0xf008,
	woff: 0xf031,
	woff2: 0xf031,
	xcf: 0xe7b8,
	xls: 0xf1c3,
	xlsx: 0xf1c3,
	xml: 0xf121,
	xz: 0xf410,
	yaml: 0xe615,
	yml: 0xe615,
	zig: 0xe6a9,
	zip: 0xf410,
	zsh: 0xf489,
	zst: 0xf410,
};

// ── Public API ──────────────────────────────────────────────────────

const DEFAULT_HL: HlName = "Grey";

/**
 * Get icon character, hex color, and highlight group for a file extension.
 */
export function getFileIcon(
	extension: string,
): { icon: string; color: string } | null {
	const ext = extension.replace(/^\./, "").toLowerCase();
	if (!ext) return null;

	const cp = LSD[ext];
	const hl = EXT_HL[ext] ?? DEFAULT_HL;
	const color = HL[hl];

	const icon = cp ? String.fromCodePoint(cp) : null;
	if (!icon) return null;

	return { icon: icon + " ", color };
}

/**
 * Check if a file extension has a known icon.
 */
export function hasFileIcon(extension: string): boolean {
	const ext = extension.replace(/^\./, "").toLowerCase();
	return ext in LSD;
}
