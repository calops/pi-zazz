/**
 * Named color registry — the single source of truth for all colour values.
 *
 * Every colour used for rendering is stored here by name. Functional files
 * never deal with raw RGB numbers or escape sequences; they only reference
 * colours by name (e.g. `"model"`, `"terminal-bg"`, `"neutral"`).
 *
 * To use a new colour, call `define()` here or in the palette initialiser
 * (`ensureColors` in the status-bar widget). Never hardcode an RGB triple
 * or escape sequence outside this module and `ansi.ts`.
 */

// ── In-memory store ─────────────────────────────────────────────────────────

const _colors: Record<string, [number, number, number]> = {};

/** Terminal background — also used as the "punched out" foreground. */
let _bgRgb: [number, number, number] = [30, 30, 46];

// ── Public API ───────────────────────────────────────────────────────────────

/** Register a named colour (or overwrite an existing one). */
export function define(name: string, r: number, g: number, b: number): void {
	_colors[name] = [r, g, b];
}

/** Check whether a colour name is registered. */
export function has(name: string): boolean {
	return name in _colors;
}

/** Look up a colour by name. Throws if unknown. */
export function getRgb(name: string): [number, number, number] {
	const c = _colors[name];
	if (!c) throw new Error(`Unknown colour: "${name}"`);
	return c;
}

/** Look up a colour by name, returning null on miss. */
export function getRgbOrNull(name: string): [number, number, number] | null {
	return _colors[name] ?? null;
}

// ── Terminal background ──────────────────────────────────────────────────────

/**
 * Update the terminal background colour.
 * This also registers the `"terminal-bg"` named colour so it can be used
 * as a foreground (punched-out effect) and as the blend target.
 */
export function setBgRgb(r: number, g: number, b: number): void {
	_bgRgb = [r, g, b];
	define("terminal-bg", r, g, b);
}

/** Return the current terminal background. */
export function getBgRgb(): [number, number, number] {
	return _bgRgb;
}

// ── Color blending ──────────────────────────────────────────────────────────

/**
 * Blend a base colour toward the terminal background.
 * Uses linear RGB interpolation (snacks.nvim formula).
 */
export function blendTowardBg(
	r: number,
	g: number,
	b: number,
	alpha: number,
): [number, number, number] {
	return [
		Math.round(alpha * r + (1 - alpha) * _bgRgb[0]),
		Math.round(alpha * g + (1 - alpha) * _bgRgb[1]),
		Math.round(alpha * b + (1 - alpha) * _bgRgb[2]),
	];
}

/** Register a blended (darkened) variant of an existing colour. */
export function defineBlend(baseName: string, alpha: number): string {
	const blendName = `${baseName}:blend`;
	if (!has(blendName)) {
		const [r, g, b] = getRgb(baseName);
		const [dr, dg, db] = blendTowardBg(r, g, b, alpha);
		define(blendName, dr, dg, db);
	}
	return blendName;
}

// ── Pre-defined basic colours ───────────────────────────────────────────────

define("black", 0, 0, 0);
define("white", 255, 255, 255);
define("red", 255, 80, 80);
define("green", 80, 200, 120);
define("success", 80, 200, 120); // alias for green (used in fallback styling)
