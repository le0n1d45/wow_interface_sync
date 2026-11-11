import type { SyncProgress } from "@shared/sync.types";
import { h } from "./dom";
import { describeProgress } from "./format";

function bar(label: string): { el: HTMLElement; set(fraction: number | null): void } {
  const fill = h("div", { class: "fill" });
  const track = h("div", { class: "track", role: "progressbar", ariaLabel: label, ariaValueMin: "0", ariaValueMax: "100" }, fill);
  return {
    el: track,
    set(fraction) {
      track.classList.toggle("indeterminate", fraction === null);
      fill.style.width = fraction === null ? "" : `${Math.round(fraction * 100)}%`;
      if (fraction === null) track.removeAttribute("aria-valuenow");
      else track.setAttribute("aria-valuenow", String(Math.round(fraction * 100)));
    },
  };
}

/** Live progress for a pull: what it is doing now, overall position, and the current download's bytes. */
export function progressPanel(initialTitle: string): { el: HTMLElement; update(p: SyncProgress): void } {
  const title = h("div", { class: "p-title", textContent: initialTitle });
  const position = h("div", { class: "p-side" });
  const bytes = h("div", { class: "p-side" });
  const overall = bar("Overall progress");
  const download = bar("Current download");
  overall.set(null);
  const downloadRow = h("div", { class: "p-row" }, download.el, bytes);
  downloadRow.hidden = true;

  const el = h(
    "div",
    { class: "progress", role: "status", ariaLive: "polite" },
    h("div", { class: "p-row" }, title, position),
    overall.el,
    downloadRow,
  );

  return {
    el,
    update(p) {
      const v = describeProgress(p);
      title.textContent = v.title;
      position.textContent = v.position ?? "";
      overall.set(v.overall);
      downloadRow.hidden = v.bytes === null;
      bytes.textContent = v.bytes ?? "";
      download.set(v.download);
    },
  };
}
