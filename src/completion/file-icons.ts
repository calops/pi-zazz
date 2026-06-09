/**
 * File-type icon mapping extracted from mini.nvim's icons module.
 *
 * Source: https://github.com/echasnovski/mini.nvim/blob/main/lua/mini/icons.lua
 *
 * mini.nvim provides both Nerd Font glyphs AND color categories for
 * file types. This module combines:
 * - filetype icons: 200+ filetype → {glyph, hl} entries
 * - extension icons: direct extension → {glyph, hl} for tricky cases
 * - An extension→filetype mapping to look up icons by file extension
 */

// ── Highlight group → hex color ─────────────────────────────────────
// Derived from mini.nvim's default highlight group links:
//   Azure  → Function       → #589ED6
//   Blue   → DiagnosticInfo → #569CD6
//   Cyan   → DiagnosticHint → #4EC9B0
//   Green  → DiagnosticOk   → #6A9955
//   Grey   → (default)      → #808080
//   Orange → DiagnosticWarn → #CE9178
//   Purple → Constant       → #C586C0
//   Red    → DiagnosticError→ #F44747
//   Yellow → DiagnosticWarn → #DCDCAA

const HL: Record<string, string> = {
	A: "#589ED6", B: "#569CD6", C: "#4EC9B0",
	G: "#6A9955", g: "#808080", O: "#CE9178",
	P: "#C586C0", R: "#F44747", Y: "#DCDCAA",
};
type H = keyof typeof HL;

// ── Filetype → [glyph, highlight] ───────────────────────────────────
// From mini.nvim's H.filetype_icons.
// Keys are Neovim filetype names. Some are also valid as file
// extensions (like "nix", "rust", "toml", "yaml").

const FT: Record<string, [string, H]> = {
	ada: ["\u{f0477}", "A"], applescript: ["\u{f0035}", "Y"],
	arduino: ["\u{f034b}", "A"], asm: ["\u{e637}", "P"],
	astro: ["\u{e6b3}", "O"], awk: ["\u{e691}", "g"],
	bash: ["\u{e691}", "G"], c: ["\u{f0671}", "B"],
	clojure: ["\u{e768}", "G"], cmake: ["\u{f0664}", "O"],
	cpp: ["\u{f0672}", "A"], crystal: ["\u{e62f}", "g"],
	cs: ["\u{f031b}", "G"], csh: ["\u{e691}", "g"],
	css: ["\u{f031c}", "A"], d: ["\u{e7af}", "G"],
	dart: ["\u{e798}", "B"], dockerfile: ["\u{f0868}", "B"],
	elixir: ["\u{e62d}", "P"], elm: ["\u{e62c}", "A"],
	erlang: ["\u{e7b1}", "R"], fennel: ["\u{e6af}", "Y"],
	fish: ["\u{e691}", "g"], fortran: ["\u{f035a}", "P"],
	fsharp: ["\u{e7a7}", "B"], gdscript: ["\u{e65f}", "Y"],
	glsl: ["\u{f03b4}", "C"], go: ["\u{f07d3}", "A"],
	gomod: ["\u{f07d3}", "A"], gosum: ["\u{f07d3}", "C"],
	gowork: ["\u{f07d3}", "P"], graphql: ["\u{f0877}", "R"],
	groovy: ["\u{e775}", "A"], haskell: ["\u{f03b2}", "P"],
	hcl: ["\u{f03b5}", "A"], heex: ["\u{e62d}", "R"],
	html: ["\u{f031d}", "O"], hyprlang: ["\u{f0359}", "C"],
	java: ["\u{f03b7}", "O"], javascript: ["\u{f031e}", "Y"],
	javascriptreact: ["\u{e625}", "A"], jinja: ["\u{e66f}", "R"],
	jq: ["\u{f0626}", "B"], json: ["\u{f0626}", "Y"],
	julia: ["\u{e624}", "P"], just: ["\u{f05f7}", "O"],
	kotlin: ["\u{f0359}", "B"], less: ["\u{f031c}", "P"],
	lisp: ["\u{e6b0}", "g"], lua: ["\u{f08b1}", "A"],
	make: ["\u{f0664}", "g"], markdown: ["\u{f0354}", "g"],
	mojo: ["\u{f0878}", "R"], nim: ["\u{e677}", "Y"],
	nix: ["\u{f3145}", "A"], ocaml: ["\u{e67a}", "O"],
	odin: ["\u{f0394}", "B"], openscad: ["\u{f034e}", "Y"],
	pascal: ["\u{f090a}", "R"], perl: ["\u{e67e}", "A"],
	php: ["\u{f031f}", "P"], prisma: ["\u{e684}", "B"],
	prolog: ["\u{e7a1}", "Y"], proto: ["\u{f09a0}", "R"],
	purescript: ["\u{e630}", "g"], python: ["\u{f0320}", "Y"],
	r: ["\u{f07d4}", "B"], racket: ["\u{f0627}", "R"],
	raku: ["\u{f0589}", "Y"], rb: ["\u{f032d}", "R"],
	rescript: ["\u{f03bf}", "A"], rmd: ["\u{f0354}", "A"],
	roc: ["\u{f05c6}", "P"], rst: ["\u{f0284}", "Y"],
	ruby: ["\u{f032d}", "R"], rust: ["\u{f0617}", "O"],
	sass: ["\u{f07ec}", "R"], scala: ["\u{e737}", "R"],
	scheme: ["\u{f0627}", "g"], scss: ["\u{f07ec}", "R"],
	sh: ["\u{e691}", "g"], solidity: ["\u{e656}", "A"],
	sql: ["\u{f01bc}", "g"], stata: ["\u{f05eb}", "R"],
	stylus: ["\u{f0312}", "g"], svelte: ["\u{e697}", "O"],
	swift: ["\u{f06e5}", "O"], terraform: ["\u{f0662}", "B"],
	tex: ["\u{e69b}", "G"], toml: ["\u{e6b2}", "O"],
	tsx: ["\u{e7ba}", "B"], twig: ["\u{e61c}", "G"],
	typescript: ["\u{f06e6}", "A"], typst: ["\u{f06db}", "A"],
	v: ["\u{e6ac}", "B"], vala: ["\u{f031d}", "P"],
	vb: ["\u{f06e4}", "P"], verilog: ["\u{f035b}", "G"],
	vhdl: ["\u{f035b}", "G"], vim: ["\u{e7c5}", "G"],
	vue: ["\u{f0704}", "G"], wasm: ["\u{eae8}", "g"],
	wgsl: ["\u{f03b4}", "B"], yaml: ["\u{e6a8}", "P"],
	yang: ["\u{f03b6}", "C"], zig: ["\u{e6a9}", "O"],
	zsh: ["\u{e691}", "G"],

	// Config
	apache: ["\u{f0313}", "G"], bzl: ["\u{e63a}", "G"],
	cfg: ["\u{f0313}", "B"], conf: ["\u{f0313}", "g"],
	config: ["\u{f0313}", "C"], desktop: ["\u{f03b9}", "P"],
	diff: ["\u{f0693}", "R"], dosini: ["\u{f03c8}", "A"],
	editorconfig: ["\u{e652}", "g"],
	gitattributes: ["\u{f028a}", "Y"],
	gitcommit: ["\u{f028a}", "G"],
	gitconfig: ["\u{f0313}", "O"],
	gitignore: ["\u{f028a}", "P"],
	gitrebase: ["\u{f028a}", "A"],
	gradle: ["\u{e660}", "O"], http: ["\u{f0337}", "O"],
	kconfig: ["\u{f0313}", "P"], mermaid: ["\u{f03ba}", "C"],
	meson: ["\u{f03ba}", "B"], nginx: ["\u{f0313}", "G"],
	ninja: ["\u{f05f4}", "g"], sed: ["\u{f07e5}", "R"],
	systemd: ["\u{f031a}", "g"], tcl: ["\u{f06d3}", "R"],
	tf: ["\u{f03b5}", "R"], xml: ["\u{f05c0}", "O"],

	// Media
	aac: ["\u{f0223}", "Y"], avi: ["\u{f022b}", "g"],
	bmp: ["\u{f021f}", "G"], eps: ["\u{e7b4}", "R"],
	flac: ["\u{f0223}", "O"], gif: ["\u{f05f8}", "A"],
	jpeg: ["\u{f0225}", "O"], jpg: ["\u{f0225}", "O"],
	mkv: ["\u{f022b}", "G"], mov: ["\u{f022b}", "C"],
	mp3: ["\u{f0223}", "A"], mp4: ["\u{f022b}", "A"],
	mpeg: ["\u{f022b}", "P"], ogg: ["\u{f0223}", "g"],
	png: ["\u{f0e2d}", "P"], svg: ["\u{f0721}", "Y"],
	tiff: ["\u{f021f}", "Y"], wav: ["\u{f0223}", "G"],
	webm: ["\u{f022b}", "g"], webp: ["\u{f021f}", "B"],
	wma: ["\u{f0223}", "B"], wmv: ["\u{f022b}", "B"],

	// Documents
	doc: ["\u{f0492}", "A"], docx: ["\u{f0492}", "A"],
	pdf: ["\u{f0226}", "R"], ppt: ["\u{f0490}", "R"],
	pptx: ["\u{f0490}", "R"], xls: ["\u{f048f}", "G"],
	xlsx: ["\u{f048f}", "G"],

	// Archives
	"7z": ["\u{f05c4}", "B"], bz2: ["\u{f05c4}", "O"],
	deb: ["\u{f0187}", "R"], gz: ["\u{f05c4}", "g"],
	rpm: ["\u{f0187}", "R"], rar: ["\u{f05c4}", "G"],
	tar: ["\u{f05c4}", "C"], xz: ["\u{f05c4}", "G"],
	zip: ["\u{f05c4}", "G"], zst: ["\u{f05c4}", "Y"],

	// Shells
	bat: ["\u{f03c2}", "g"], cmd: ["\u{f03c2}", "g"],
	ps1: ["\u{f028a}", "B"],

	// Security
	asc: ["\u{f0659}", "Y"], gpg: ["\u{f0313}", "g"],
	pem: ["\u{f0306}", "Y"], key: ["\u{f0306}", "Y"],
	lock: ["\u{f0023}", "g"],
};

// ── Direct extension → [glyph, highlight] ───────────────────────────
// From mini.nvim's H.extension_icons — extensions where filetype
// matching alone gives wrong results.

const EXT: Record<string, [string, H]> = {
	// Filetype mismatch cases
	h: ["\u{f03b5}", "P"], ipynb: ["\u{f062e}", "O"],
	exs: ["\u{e653}", "P"],

	// Video (extra)
	"3gp": ["\u{f022b}", "Y"], cast: ["\u{f022b}", "R"],
	m4v: ["\u{f022b}", "O"], mpg: ["\u{f022b}", "P"],

	// Audio (extra)
	aif: ["\u{f0223}", "C"], snd: ["\u{f0223}", "R"],

	// Image (extra)
	heic: ["\u{f021f}", "B"], heif: ["\u{f021f}", "B"],
	tif: ["\u{f021f}", "Y"],

	// Archives (extra)
	bz: ["\u{f05c4}", "O"], sit: ["\u{f05c4}", "R"],
	txz: ["\u{f05c4}", "P"], z: ["\u{f05c4}", "g"],

	// Software
	exe: ["\u{f05f3}", "R"],
	xlt: ["\u{f048f}", "G"], xltm: ["\u{f048f}", "G"],
	xltx: ["\u{f048f}", "G"],
};

// ── Extension → filetype ────────────────────────────────────────────
// For extensions not in EXT, map to the filetype name used in FT.

const EXT_FT: Record<string, string> = {
	ts: "typescript", tsx: "tsx", js: "javascript",
	jsx: "javascriptreact", mjs: "javascript", cjs: "javascript",
	cts: "typescript", mts: "typescript",
	rb: "ruby", py: "python", rs: "rust", go: "go", java: "java",
	kt: "kotlin", kts: "kotlin", cpp: "cpp", c: "c", hpp: "cpp",
	hh: "cpp", hxx: "cpp", cc: "cpp", cxx: "cpp", cs: "cs",
	swift: "swift", scala: "scala", dart: "dart", zig: "zig",
	nim: "nim", ex: "elixir", exs: "elixir", hs: "haskell",
	lhs: "haskell", lua: "lua", php: "php", pl: "perl", pm: "perl",
	r: "r", m: "objc", mm: "objcpp",
	clj: "clojure", cljs: "clojure", cljc: "clojure", elm: "elm",
	crystal: "crystal", purs: "purescript",
	fn: "fsharp", fs: "fsharp", fsscript: "fsharp",
	svelte: "svelte", vue: "vue", astro: "astro",
	sass: "sass", scss: "scss", less: "less", styl: "stylus",
	css: "css", html: "html", htm: "html", xhtml: "html",
	md: "markdown", rmd: "rmd", rst: "rst", org: "org",
	tex: "tex", bib: "bib",
	json: "json", jsonc: "json", yaml: "yaml", yml: "yaml",
	toml: "toml", xml: "xml", sql: "sql", sqlite: "sql",
	cmake: "cmake", make: "make", mk: "make", bzl: "bzl",
	nix: "nix", dockerfile: "dockerfile", just: "just",
	typst: "typst", prisma: "prisma", gradle: "gradle",
	proto: "proto", graphql: "graphql", jinja: "jinja",
	vala: "vala", odin: "odin", mojo: "mojo", julia: "julia",
	raku: "raku", wasm: "wasm", haddock: "haskell",
	"7z": "7z", zip: "zip", tar: "tar", gz: "gz", bz2: "bz2",
	xz: "xz", rar: "rar", zst: "zst",
	pdf: "pdf", doc: "doc", docx: "docx", xls: "xls",
	xlsx: "xlsx", ppt: "ppt", pptx: "pptx",
	sh: "sh", bash: "bash", zsh: "zsh", fish: "fish", ps1: "ps1",
	bat: "bat", cmd: "cmd", csh: "csh", ksh: "ksh",
	csv: "csv", tsv: "csv", env: "env", lock: "lock", log: "log",
	txt: "txt", png: "png", jpg: "jpg", jpeg: "jpg", gif: "gif",
	webp: "webp", bmp: "bmp", ico: "bmp", svg: "svg",
	mp3: "mp3", wav: "wav", flac: "flac", ogg: "ogg",
	m4a: "m4a", mp4: "mp4", mkv: "mkv", mov: "mov", avi: "avi",
	webm: "webm", wmv: "wmv", diff: "diff", patch: "diff",
	vim: "vim", license: "license", editorconfig: "editorconfig",
	cfg: "cfg", conf: "conf", ini: "cfg", desktop: "desktop",
	asc: "asc", gpg: "gpg", pem: "pem", key: "key",
};

// ── Public API ──────────────────────────────────────────────────────

export function getFileIcon(
	extension: string,
): { icon: string; color: string } | null {
	const ext = extension.replace(/^\./, "").toLowerCase();
	if (!ext) return null;

	// 1. Try direct extension match
	if (ext in EXT) {
		const hit = EXT[ext]!;
		return { icon: hit[0] + " ", color: HL[hit[1]] };
	}

	// 2. Try extension → filetype → filetype table
	const ft = EXT_FT[ext] ?? ext;
	if (ft in FT) {
		const hit = FT[ft]!;
		return { icon: hit[0] + " ", color: HL[hit[1]] };
	}

	return null;
}

export function hasFileIcon(extension: string): boolean {
	const ext = extension.replace(/^\./, "").toLowerCase();
	if (!ext) return false;
	if (ext in EXT) return true;
	return (EXT_FT[ext] ?? ext) in FT;
}
