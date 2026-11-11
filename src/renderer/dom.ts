import { icon } from "./icons";

type Child = Node | string | null | undefined | false;

/** Tiny element builder. Text is always set as text, never parsed as HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Omit<HTMLElementTagNameMap[K], "style">> & { class?: string } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: cls, ...rest } = props as Record<string, unknown>;
  if (cls) el.className = cls as string;
  Object.assign(el, rest);
  for (const c of children) if (c) el.append(c);
  return el;
}

export type MsgKind = "ok" | "warn" | "err" | "info";

const MSG_ICON = { ok: "check", warn: "alert", err: "alert", info: "info" } as const;

export function msg(kind: MsgKind, ...children: Child[]): HTMLDivElement {
  return h("div", { class: `msg ${kind}`, role: kind === "err" ? "alert" : "status" }, icon(MSG_ICON[kind]), h("div", { class: "grow" }, ...children));
}

/** Message plus an optional follow-up message, spaced apart. */
export function msgs(first: HTMLElement, second: { kind: MsgKind; text: string } | null): HTMLElement[] {
  return second ? [first, h("div", { class: "gap" }), msg(second.kind, second.text)] : [first];
}

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel: string;
}

/** Modal "are you sure" dialog over the page. Resolves true only for the confirm button; Esc, Cancel and the backdrop resolve false. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const finish = (answer: boolean) => {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      previouslyFocused?.focus();
      resolve(answer);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
    };
    const cancel = h("button", { class: "btn", textContent: "Cancel", onclick: () => finish(false) });
    const confirm = h("button", { class: "btn danger-solid", textContent: opts.confirmLabel, onclick: () => finish(true) });
    const backdrop = h(
      "div",
      { class: "modal-backdrop", onclick: (e: MouseEvent) => { if (e.target === backdrop) finish(false); } },
      h(
        "div",
        { class: "modal", role: "alertdialog", ariaModal: "true", ariaLabel: opts.title },
        h("h2", { textContent: opts.title }),
        h("p", { textContent: opts.body }),
        h("div", { class: "modal-actions" }, cancel, confirm),
      ),
    );
    document.addEventListener("keydown", onKey);
    document.body.append(backdrop);
    cancel.focus(); // the safe choice is the default
  });
}
