import { basename } from "node:path";
import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetFactory } from "./types.ts";

interface Diagnostic {
	severity: string;
	semantic?: string;
	message: string;
	line?: number;
	filePath: string;
}

interface FileRecord {
	filePath: string;
	diagnostics: Diagnostic[];
	touchedAt: number;
}

const files = new Map<string, FileRecord>();
let totalBlocking = 0;
let totalErrors = 0;
let totalWarnings = 0;

function isBlocking(d: Diagnostic): boolean {
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

export const lensWidgetFactory: WidgetFactory = (
	deps: WidgetDeps,
	_config: unknown,
) => {
	let requestRender: (() => void) | null = null;

	const pi = deps.pi as {
		events?: { on: (evt: string, handler: (payload: unknown) => void) => void };
	};
	if (pi.events) {
		pi.events.on("pi-lens/analysis-complete", (payload: unknown) => {
			const p = payload as {
				filePath?: string;
				diagnostics?: Diagnostic[];
				blockers?: Diagnostic[];
				warnings?: Diagnostic[];
			};
			if (p.filePath && p.diagnostics) {
				const rec: FileRecord = {
					filePath: p.filePath,
					diagnostics: [
						...(p.blockers ?? []).map((d) => ({
							...d,
							filePath: p.filePath!,
							semantic: "blocking" as const,
						})),
						...(p.warnings ?? []).map((d) => ({ ...d, filePath: p.filePath! })),
						...p.diagnostics.map((d) => ({ ...d, filePath: p.filePath! })),
					],
					touchedAt: Date.now(),
				};
				files.set(p.filePath, rec);
				recalcCounts();
				requestRender?.();
			}
		});

		pi.events.on("pi-lens/findings", () => {
			requestRender?.();
		});
	}

	return {
		render(_width: number, height: number): string[] {
			requestRender = () => deps.tui.requestRender?.();
			const lines: string[] = [];

			const dim = (s: string) => deps.theme.fg("dim", s);
			const red = (s: string) => deps.theme.fg("error", s);
			const yellow = (s: string) => deps.theme.fg("warning", s);
			const green = (s: string) => deps.theme.fg("success", s);

			if (totalBlocking > 0) {
				lines.push(
					` ${red(`● ${totalErrors}E`)}${totalWarnings > 0 ? " " + yellow(`${totalWarnings}W`) : ""}`,
				);
			} else if (totalErrors > 0 || totalWarnings > 0) {
				lines.push(
					` ${yellow(`! ${totalErrors}E`)}${totalWarnings > 0 ? " " + yellow(`${totalWarnings}W`) : ""}`,
				);
			} else if (files.size > 0) {
				lines.push(` ${green("✓ clean")}`);
			} else {
				lines.push(` ${dim("pi-lens waiting…")}`);
			}

			const sorted = [...files.values()]
				.filter((r) => r.diagnostics.length > 0)
				.sort((a, b) => b.touchedAt - a.touchedAt)
				.slice(0, height - 1);

			for (const rec of sorted) {
				const name = basename(rec.filePath);
				const bCount = rec.diagnostics.filter(isBlocking).length;
				const eCount = rec.diagnostics.filter(
					(d) => d.severity === "error",
				).length;
				const wCount = rec.diagnostics.filter(
					(d) => d.severity === "warning",
				).length;
				const dot =
					bCount > 0
						? red("●")
						: eCount > 0 || wCount > 0
							? yellow("!")
							: green("✓");
				lines.push(` ${dot} ${dim(name)}`);
			}

			return lines.slice(0, height);
		},

		invalidate(): void {},
	};
};

registerWidget("pi-lens", lensWidgetFactory);
