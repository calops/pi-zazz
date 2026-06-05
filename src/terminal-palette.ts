/**
 * Terminal color palette — queries the terminal emulator via OSC 4
 * (and OSC 10/11) escape sequences to discover its actual color palette,
 * then assigns distinct, high-contrast colors to each status-bar segment.
 *
 * Query strategy:
 * 1. Spawn a short-lived Node.js subprocess that opens /dev/tty, writes
 *    all 256 OSC 4 queries, reads responses with a 600 ms timeout.
 * 2. Parse `rgb:RRRR/GGGG/BBBB` responses, convert to 8 bit.
 * 3. Analyze hue/saturation/contrast and assign semantic roles.
 *
 * If the query fails entirely (terminal doesn't support OSC 4, or no
 * TTY available) the module falls back to the existing hardcoded values.
 */

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ── Types ────────────────────────────────────────────────────────────────────

/** Raw color record returned by the terminal */
export interface TerminalColor {
	index: number;
	r: number;
	g: number;
	b: number;
}

/** Fully analysed color palette for pi-zazz rendering */
export interface TerminalPalette {
	/** Terminal default background (OSC 11, fallback to OSC 4 color 0) */
	bgRgb: [number, number, number];
	/** Per-segment 256-color background index */
	segmentBg: Readonly<Record<string, number>>;
	/** Neutral gray background index (for extension statuses, etc.) */
	neutralBg: number;
	/** Foreground index (always 0 = terminal default bg → "punched out" text) */
	pillFg: number;
	/** Whether this palette was dynamically queried from the terminal */
	dynamic: boolean;
}

// ── Module-level cache ───────────────────────────────────────────────────────

let _cachedPalette: TerminalPalette | null = null;

// ── Color utilities ──────────────────────────────────────────────────────────

function luminance(r: number, g: number, b: number): number {
	return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** WCAG contrast ratio between sRGB(a,b,c) and sRGB(x,y,z) */
function contrastRatio(
	r1: number,
	g1: number,
	b1: number,
	r2: number,
	g2: number,
	b2: number,
): number {
	const l1 = luminance(r1, g1, b1) / 255;
	const l2 = luminance(r2, g2, b2) / 255;
	const lighter = Math.max(l1, l2);
	const darker = Math.min(l1, l2);
	return (lighter + 0.05) / (darker + 0.05);
}

/** RGB → HSL */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
	const rs = r / 255;
	const gs = g / 255;
	const bs = b / 255;
	const mx = Math.max(rs, gs, bs);
	const mn = Math.min(rs, gs, bs);
	const l = (mx + mn) / 2;
	if (mx === mn) return [0, 0, l];
	const d = mx - mn;
	const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
	let h = 0;
	if (mx === rs) h = ((gs - bs) / d + (gs < bs ? 6 : 0)) * 60;
	else if (mx === gs) h = ((bs - rs) / d + 2) * 60;
	else h = ((rs - gs) / d + 4) * 60;
	return [h, s, l];
}

/** Categorise a color into a hue bin name */
function hueBin(hue: number, sat: number): string {
	if (sat < 0.15) return "gray";
	if (hue < 25 || hue >= 335) return "red";
	if (hue < 45) return "orange";
	if (hue < 70) return "yellow";
	if (hue < 160) return "green";
	if (hue < 200) return "cyan";
	if (hue < 260) return "blue";
	if (hue < 300) return "purple";
	return "magenta";
}

// ── Query implementation via subprocess ──────────────────────────────────────

function queryTerminalWithScript(): Promise<{
	colors: TerminalColor[];
	fgRgb: [number, number, number] | null;
	bgRgb: [number, number, number] | null;
} | null> {
	return new Promise((resolve) => {
		if (!process.stdout.isTTY) {
			resolve(null);
			return;
		}

		const tmpDir = mkdtempSync(join(tmpdir(), "pi-zazz-"));
		const scriptPath = join(tmpDir, "query-colors.mjs");

		// Build the query script — written as a temp ESM file so we can use
		// top-level await and async I/O without the parent TUI interference.
		const scriptLines = [
			'import fs from "fs";',
			'const ttyFd = fs.openSync("/dev/tty", "r+");',
			"const ESC = String.fromCharCode(27);",
			'const ST = ESC + "\\\\";',
			'const q = Array.from({length:256},(_,i)=> ESC + "]4;" + i + ";?" + ST).join("");',
			"fs.writeSync(ttyFd, q);",
			'fs.writeSync(ttyFd, ESC + "]10;?" + ST);',
			'fs.writeSync(ttyFd, ESC + "]11;?" + ST);',
			"const buf = Buffer.alloc(131072);",
			"let offset = 0;",
			"let timedOut = false;",
			"setTimeout(() => { timedOut = true; }, 600);",
			"function poll() {",
			"  if (timedOut) {",
			"    fs.closeSync(ttyFd);",
			'    const str = buf.toString("utf8", 0, offset);',
			"    const reC = /\\x1b\\]4;(\\d+);rgb:([0-9a-f]+)\\/([0-9a-f]+)\\/([0-9a-f]+)\\x1b\\\\/g;",
			"    const colors = [];",
			"    let m;",
			"    while ((m = reC.exec(str)) !== null) {",
			"      colors.push({",
			"        i: parseInt(m[1],10),",
			"        r: Math.round(parseInt(m[2],16)/257),",
			"        g: Math.round(parseInt(m[3],16)/257),",
			"        b: Math.round(parseInt(m[4],16)/257),",
			"      });",
			"    }",
			"    const re10 = /\\x1b\\]10;rgb:([0-9a-f]+)\\/([0-9a-f]+)\\/([0-9a-f]+)\\x1b\\\\/;",
			"    const re11 = /\\x1b\\]11;rgb:([0-9a-f]+)\\/([0-9a-f]+)\\/([0-9a-f]+)\\x1b\\\\/;",
			"    const fgM = re10.exec(str);",
			"    const bgM = re11.exec(str);",
			"    process.stdout.write(JSON.stringify({",
			"      colors,",
			"      fg: fgM ? { r: Math.round(parseInt(fgM[1],16)/257), g: Math.round(parseInt(fgM[2],16)/257), b: Math.round(parseInt(fgM[3],16)/257) } : null,",
			"      bg: bgM ? { r: Math.round(parseInt(bgM[1],16)/257), g: Math.round(parseInt(bgM[2],16)/257), b: Math.round(parseInt(bgM[3],16)/257) } : null,",
			"    }));",
			"    return;",
			"  }",
			"  fs.read(ttyFd, buf, offset, buf.length - offset, null, (err, bytes) => {",
			"    if (err || bytes === 0) { timedOut = true; poll(); return; }",
			"    offset += bytes;",
			"    poll();",
			"  });",
			"}",
			"poll();",
		].join("\n");

		try {
			writeFileSync(scriptPath, scriptLines, "utf8");
			const result = spawnSync("node", [scriptPath], {
				encoding: "utf8",
				timeout: 3000,
				stdio: ["inherit", "pipe", "inherit"],
			});

			// Cleanup temp files
			try {
				unlinkSync(scriptPath);
			} catch {
				/* ignore */
			}
			try {
				(fs.rmSync ?? fs.rmdirSync)(tmpDir, { recursive: true, force: true });
			} catch {
				/* ignore */
			}

			if (result.error || result.status !== 0 || !result.stdout.trim()) {
				resolve(null);
				return;
			}

			const parsed = JSON.parse(result.stdout.trim());
			const colors: TerminalColor[] = (parsed.colors ?? []).map(
				(c: { i: number; r: number; g: number; b: number }) => ({
					index: c.i,
					r: Math.round(c.r),
					g: Math.round(c.g),
					b: Math.round(c.b),
				}),
			);

			const bgRgb: [number, number, number] | null = parsed.bg
				? [
						Math.round(parsed.bg.r),
						Math.round(parsed.bg.g),
						Math.round(parsed.bg.b),
					]
				: null;
			const fgRgb: [number, number, number] | null = parsed.fg
				? [
						Math.round(parsed.fg.r),
						Math.round(parsed.fg.g),
						Math.round(parsed.fg.b),
					]
				: null;

			resolve(colors.length >= 16 ? { colors, fgRgb, bgRgb } : null);
		} catch {
			// Cleanup on error too
			try {
				unlinkSync(scriptPath);
			} catch {
				/* ignore */
			}
			try {
				(fs.rmSync ?? fs.rmdirSync)(tmpDir, { recursive: true, force: true });
			} catch {
				/* ignore */
			}
			resolve(null);
		}
	});
}

// ── Palette builder ──────────────────────────────────────────────────────────

/** Segments that should share the same neutral gray. */
const NEUTRAL_SEGMENTS: string[] = [
	"context_total",
	"token_in",
	"token_out",
	"token_total",
	"cache_read",
	"cache_write",
	"time",
	"time_spent",
	"session",
	"hostname",
	"extension_statuses",
];

/**
 * From a set of queried terminal colors and the terminal background,
 * build a palette that assigns each semantic segment a distinct, legible
 * 256-color index.
 */
function buildPalette(
	colors: TerminalColor[],
	bgRgb: [number, number, number],
): TerminalPalette {
	// 1. Compute stats for every colour
	type Scored = TerminalColor & {
		lum: number;
		contrast: number;
		hue: number;
		sat: number;
		bin: string;
	};
	const scored: Scored[] = colors.map((c) => {
		const [h, s] = rgbToHsl(c.r, c.g, c.b);
		return {
			...c,
			lum: luminance(c.r, c.g, c.b),
			contrast: contrastRatio(c.r, c.g, c.b, bgRgb[0], bgRgb[1], bgRgb[2]),
			hue: h,
			sat: s,
			bin: hueBin(h, s),
		};
	});

	// 2. Score colours: prefer high saturation × contrast, and prefer
	//    cube/grayscale colors (>= 16) over ANSI 0-15 which users often
	//    customize arbitrarily
	const MIN_CONTRAST = 2.8;
	const sorted = [...scored].filter((s) => s.contrast >= MIN_CONTRAST);
	sorted.sort((a, b) => {
		const aBonus = a.index >= 16 ? 0.3 : 0;
		const bBonus = b.index >= 16 ? 0.3 : 0;
		return b.sat * b.contrast + bBonus - (a.sat * a.contrast + aBonus);
	});

	// 3. For each hue bin, record the best candidate
	const binBest = new Map<string, Scored>();
	for (const s of sorted) {
		if (!binBest.has(s.bin)) {
			binBest.set(s.bin, s);
		}
	}

	// 4. Assign colours to segments
	const assignments: Record<string, number> = {};
	const assigned = new Set<number>();

	function pickBin(bin: string, fallback: number): number {
		const c = sorted.find((s) => s.bin === bin && !assigned.has(s.index));
		if (c) {
			assigned.add(c.index);
			return c.index;
		}
		const b = binBest.get(bin);
		if (b) {
			assigned.add(b.index);
			return b.index;
		}
		return fallback;
	}

	// Priority order: first pick in a bin gets the best unassigned color
	assignments.model = pickBin("blue", 39);
	assignments.path = pickBin("green", 71);
	assignments.git = pickBin("yellow", 178);
	assignments.thinking = pickBin("purple", 99);
	assignments.cost = pickBin("orange", 130);
	assignments.shell_mode = pickBin("cyan", 33);

	// 4b. Context pill — distinct color (red hue to indicate usage importance)
	assignments.context_pct = pickBin("red", 167);

	// 5. Neutral gray segments
	const neutral = sorted.find(
		(s) => s.bin === "gray" && !assigned.has(s.index) && s.lum > 40,
	);
	const neutralBg = neutral?.index ?? 238;
	for (const seg of NEUTRAL_SEGMENTS) {
		assignments[seg] = neutralBg;
	}

	return {
		bgRgb,
		segmentBg: assignments,
		neutralBg,
		pillFg: 0,
		dynamic: true,
	};
}

// ── Fallback ─────────────────────────────────────────────────────────────────

function buildFallbackPalette(): TerminalPalette {
	return {
		bgRgb: [30, 30, 46], // Catppuccin Mocha base
		segmentBg: {
			model: 39,
			thinking: 99,
			shell_mode: 33,
			path: 71,
			git: 178,
			context_pct: 167,
			context_total: 238,
			cost: 130,
			token_in: 238,
			token_out: 238,
			token_total: 238,
			cache_read: 238,
			cache_write: 238,
			time: 238,
			time_spent: 238,
			session: 238,
			hostname: 238,
			extension_statuses: 238,
		},
		neutralBg: 238,
		pillFg: 0,
		dynamic: false,
	};
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise the palette by querying the terminal.  Safe to call
 * multiple times — subsequent calls return the cached result.
 *
 * Call early (e.g. at session_start) so that widget factories see the
 * palette when they render.
 */
export async function initializePalette(): Promise<TerminalPalette> {
	if (_cachedPalette) return _cachedPalette;

	const queryResult = await queryTerminalWithScript();

	if (queryResult && queryResult.colors.length >= 16) {
		const bgRgb = queryResult.bgRgb ?? getBgFromColor0(queryResult.colors);
		_cachedPalette = buildPalette(queryResult.colors, bgRgb);
	} else {
		_cachedPalette = buildFallbackPalette();
	}

	return _cachedPalette;
}

/** Extract bg from color 0 when OSC 11 isn't available. */
function getBgFromColor0(colors: TerminalColor[]): [number, number, number] {
	const c0 = colors.find((c) => c.index === 0);
	if (c0) return [c0.r, c0.g, c0.b];
	return [30, 30, 46];
}

/**
 * Return the current (cached) palette.  If not yet initialised,
 * returns the hardcoded fallback.
 */
export function getPalette(): TerminalPalette {
	return _cachedPalette ?? buildFallbackPalette();
}

/**
 * Reset cached palette (useful for testing or re-query).
 */
export function resetPalette(): void {
	_cachedPalette = null;
}
