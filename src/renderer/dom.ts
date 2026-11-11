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
