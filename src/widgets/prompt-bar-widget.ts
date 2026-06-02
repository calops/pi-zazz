import { visibleWidth } from "@earendil-works/pi-tui";
import { icon } from "../icons.ts";
import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetFactory } from "./types.ts";

export const promptBarWidgetFactory: WidgetFactory = (
  deps: WidgetDeps,
  config: unknown,
) => {
  const opts = (config as { maxLength?: number } | undefined) ?? {};
  const maxLength = opts.maxLength ?? 120;

  let lastPrompt = "";

  const pi = deps.pi as { on: (event: string, handler: (...args: never[]) => void) => void };
  pi.on("agent_end", (event: unknown) => {
    const e = event as { messages?: Array<{ role: string; content: Array<{ type: string; text: string }> }> };
    const lastUser = [...(e.messages ?? [])].reverse().find((m) => m.role === "user");
    if (lastUser) {
      const text = lastUser.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join(" ");
      lastPrompt = text;
    }
  });

  pi.on("input", (event: unknown) => {
    const e = event as { text?: string };
    if (e.text) lastPrompt = e.text;
  });

  return {
    render(width: number, _height: number): string[] {
      if (!lastPrompt) {
        return [deps.theme.fg("dim", `${icon("prevPrompt")}  no previous prompt`)];
      }
      const prefix = `${icon("prevPrompt")}  `;
      const prefixWidth = visibleWidth(prefix);
      const available = width - prefixWidth;
      let display = lastPrompt.replace(/\n/g, " ").trim();
      if (display.length > maxLength) display = display.slice(0, maxLength) + "…";
      if (visibleWidth(display) > available) {
        display = display.slice(0, Math.max(0, available - 1)) + "…";
      }
      return [prefix + deps.theme.fg("muted", display)];
    },

    invalidate(): void {},
  };
};

registerWidget("prompt-bar", promptBarWidgetFactory);
