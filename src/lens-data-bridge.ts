/**
 * Shared data bridge for pi-lens diagnostics.
 *
 * pi-lens emits diagnostics data via the shared EventBus (pi.events).
 * This module subscribes to those events in the extension's default
 * function (where pi.events is definitely available) and exposes the
 * data to the lens widget via module-level state.
 *
 * The lens widget reads from the same module-level variables, avoiding
 * timing issues with widget factory event subscriptions.
 */

import { resolve } from "node:path";

// ── Types ────────────────────────────────────────────────────────────────────

export interface LensDiagnostic {
	severity: string;
	semantic?: string;
	message: string;
	line?: number;
	filePath: string;
	tool?: string;
	rule?: string;
}

export interface LensFileRecord {
	filePath: string;
	diagnostics: LensDiagnostic[];
	touchedAt: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Max age (ms) for a clean entry before eviction. */
const CLEAN_ENTRY_TTL = 60_000;

// ── Shared module state ──────────────────────────────────────────────────────

const files = new Map<string, LensFileRecord>();
let totalBlocking = 0;
let totalErrors = 0;
let totalWarnings = 0;
let totalResolved = 0;
let sessionLanguages: string[] = [];
let requestRenderFn: (() => void) | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function isBlocking(d: LensDiagnostic): boolean {
	if (d.semantic === "blocking") return true;
	return d.severity === "error";
}

function recalcCounts(): void {
	let b = 0;
	let e = 0;
	let w = 0;
	for (const rec of files.values()) {
		for (const d of rec.diagnostics) {
			if (isBlocking(d)) b++;
			if (d.severity === "error") e++;
			if (d.severity === "warning") w++;
		}
	}
	totalBlocking = b;
	totalErrors = e;
	totalWarnings = w;
}

/** Remove entries that have been clean for longer than TTL. */
function evictStaleEntries(): void {
	const now = Date.now();
	for (const [filePath, rec] of files) {
		if (rec.diagnostics.length === 0 && now - rec.touchedAt > CLEAN_ENTRY_TTL) {
			files.delete(filePath);
		}
	}
}

// ── Public API ───────────────────────────────────────────────────────────────

export function getState() {
	evictStaleEntries();
	return {
		files,
		totalBlocking,
		totalErrors,
		totalWarnings,
		totalResolved,
		sessionLanguages,
	};
}

export function setRenderCallback(fn: (() => void) | null): void {
	requestRenderFn = fn;
}

/** Called by the extension's default function to subscribe to pi-lens events. */
export function subscribeToLensEvents(
	events:
		| { on: (evt: string, handler: (data: unknown) => void) => void }
		| undefined,
): void {
	if (!events) return;

	events.on("pi-lens/analysis-complete", (payload: unknown) => {
		const p = payload as {
			diagnostics?: LensDiagnostic[];
			blockers?: LensDiagnostic[];
			warnings?: LensDiagnostic[];
			fixed?: LensDiagnostic[];
			filePath?: string;
			resolvedCount?: number;
			changedFiles?: string[];
			sessionLanguages?: string[];
		};
		if (p.filePath && p.diagnostics) {
			// ── Update primary file entry ──────────────────────────────
			const rec: LensFileRecord = {
				filePath: p.filePath,
				diagnostics: [
					...(p.blockers ?? []).map((d) => ({
						...d,
						filePath: p.filePath!,
						semantic: "blocking" as const,
					})),
					...(p.warnings ?? []).map((d) => ({
						...d,
						filePath: p.filePath!,
					})),
					...p.diagnostics.map((d) => ({
						...d,
						filePath: p.filePath!,
					})),
				],
				touchedAt: Date.now(),
			};
			files.set(p.filePath, rec);

			// ── Track resolved diagnostics ────────────────────────────
			if (p.fixed && p.fixed.length > 0) {
				totalResolved += p.fixed.length;
			}

			// ── Clear stale entries for side-effect-modified files ─────
			// When autofix/format touches other files, they weren't
			// re-analyzed — clear their stale entries so they don't
			// show old diagnostics until re-analyzed.
			if (p.changedFiles && p.changedFiles.length > 0) {
				for (const changedFile of p.changedFiles) {
					const resolved = resolve(changedFile);
					if (resolved !== p.filePath && files.has(resolved)) {
						files.delete(resolved);
					}
				}
			}

			if (p.sessionLanguages) {
				sessionLanguages = p.sessionLanguages;
			}
			recalcCounts();
			evictStaleEntries();
			requestRenderFn?.();
		}
	});

	events.on("pi-lens/findings", () => {
		requestRenderFn?.();
	});
}

export function clearState(): void {
	files.clear();
	totalBlocking = 0;
	totalErrors = 0;
	totalWarnings = 0;
	totalResolved = 0;
	sessionLanguages = [];
}

// ── Test data (for layout verification when no pi-lens events are flowing) ──

let testDataInjected = false;

/**
 * Inject sample diagnostic data so the widget can demonstrate its layout
 * even when pi-lens hasn't emitted analysis-complete events yet.
 * Only runs once, and only if the files map is empty.
 */
export function injectTestData(): void {
	if (testDataInjected) return;
	if (files.size > 0) return;

	const now = Date.now();

	function addFile(
		name: string,
		diags: Array<{
			severity: string;
			message: string;
			line?: number;
			rule?: string;
			tool?: string;
		}>,
	) {
		const filePath = `/home/calops/projects/pi-zazz/src/${name}`;
		const diagnostics: LensDiagnostic[] = diags.map((d) => ({
			severity: d.severity,
			message: d.message,
			line: d.line,
			rule: d.rule,
			tool: d.tool ?? "typescript",
			filePath,
			semantic: d.severity === "error" ? ("blocking" as const) : undefined,
		}));
		files.set(filePath, { filePath, diagnostics, touchedAt: now });
	}

	addFile("icons.ts", [
		{
			severity: "error",
			message: "Property 'nonexistent' does not exist on type",
			line: 78,
			rule: "@typescript-eslint/no-unsafe-member-access",
		},
		{
			severity: "error",
			message: "String is not assignable to type 'IconName'",
			line: 79,
			rule: "@typescript-eslint/no-unsafe-assignment",
		},
	]);

	addFile("default-config.ts", [
		{
			severity: "error",
			message:
				"Object literal may only specify known properties, and 'bogusProp' does not exist in type 'GridConfig'",
			line: 4,
			rule: "@typescript-eslint/no-unsafe-assignment",
		},
	]);

	addFile("terminal-palette.ts", [
		{
			severity: "error",
			message:
				"Cannot find module 'node:does-not-exist' or its corresponding type declarations",
			line: 18,
			rule: "@typescript-eslint/no-unsafe-member-access",
		},
		{
			severity: "error",
			message: "'nonExistentUtil' is declared but its value is never read.",
			line: 18,
			rule: "@typescript-eslint/no-unused-vars",
		},
		{
			severity: "warning",
			message: "Import from 'node:does-not-exist' will fail at runtime",
			line: 18,
			rule: "import/no-unresolved",
		},
		{
			severity: "error",
			message:
				"Cannot find module 'node:os' or its corresponding type declarations",
			line: 20,
			rule: "@typescript-eslint/no-unsafe-assignment",
		},
		{
			severity: "warning",
			message: "Terminal palette will fall back to hardcoded values",
			line: 22,
			rule: "@typescript-eslint/no-unsafe-assignment",
		},
	]);

	addFile("grid-engine.ts", [
		{
			severity: "error",
			message:
				"Cannot find module './non-existent-module.ts' or its corresponding type declarations",
			line: 9,
			rule: "import/no-unresolved",
		},
		{
			severity: "warning",
			message: "'something' is declared but its value is never read.",
			line: 9,
			rule: "@typescript-eslint/no-unused-vars",
		},
	]);

	addFile("index.ts", [
		{
			severity: "error",
			message:
				"Cannot find module '@earendil-works/pi-coding-agent' or its corresponding type declarations",
			line: 3,
			rule: "import/no-unresolved",
		},
		{
			severity: "error",
			message: "'nonExistentThing' is declared but its value is never read.",
			line: 5,
			rule: "@typescript-eslint/no-unused-vars",
		},
		{
			severity: "error",
			message:
				"This member cannot have an 'override' modifier because its containing class 'StubEditor' does not extend another class",
			line: 67,
			rule: "@typescript-eslint/no-unsafe-member-access",
		},
		{
			severity: "error",
			message:
				"Property 'onExtensionShortcut' does not exist on type 'StubEditor'",
			line: 78,
			rule: "@typescript-eslint/no-unsafe-call",
		},
		{
			severity: "error",
			message: "Property 'keybindings' does not exist on type 'StubEditor'",
			line: 79,
			rule: "@typescript-eslint/no-unsafe-call",
		},
		{
			severity: "error",
			message: "Property 'onPasteImage' does not exist on type 'StubEditor'",
			line: 80,
			rule: "@typescript-eslint/no-unsafe-call",
		},
		{
			severity: "warning",
			message: "Unused parameter 'width' in render method",
			line: 67,
			rule: "@typescript-eslint/no-unused-vars",
		},
		{
			severity: "warning",
			message: "Type 'StubEditor' is not assignable to type 'CustomEditor'",
			line: 57,
			rule: "@typescript-eslint/no-unsafe-assignment",
		},
	]);

	addFile("widgets/lens-widget.ts", [
		{
			severity: "warning",
			message: "'green' is declared but its value is never read.",
			line: 156,
			rule: "@typescript-eslint/no-unused-vars",
		},
	]);

	addFile("widgets/editor-widget.ts", [
		{
			severity: "warning",
			message: "Unused parameter '_config' in render method",
			line: 12,
			rule: "@typescript-eslint/no-unused-vars",
		},
	]);

	sessionLanguages = ["ts", "js"];
	testDataInjected = true;
	recalcCounts();
	requestRenderFn?.();
}
