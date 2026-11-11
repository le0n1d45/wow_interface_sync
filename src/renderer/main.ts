import "./styles.css";
import type { Ctx, ViewName } from "./context";
import { h } from "./dom";
import { icon } from "./icons";
import { isSetUp } from "./setup";
import { backupsView } from "./views/backups";
import { settingsView } from "./views/settings";
import { syncView } from "./views/sync";

const root = document.getElementById("app")!;
let view: ViewName = "sync";
let busy = false;
let wowRunning = false;
let pendingFlash: string | undefined;
let guarded = new Set<HTMLButtonElement>();

const ctx: Ctx = {
  config: { repoUrl: "", gistId: "", wowRoot: "", accountMap: {}, pushBackups: true },
  token: { stored: false },
  async reload() {
    ctx.config = await window.sync.getConfig();
    ctx.token = await window.sync.getTokenStatus();
    renderChrome();
  },
  go(next) {
    view = next;
    renderAll();
  },
  flash(message) {
    pendingFlash = message;
  },
  guard(button) {
    guarded.add(button);
    button.disabled = busy || wowRunning;
    return button;
  },
  async withBusy(fn) {
    busy = true;
    applyGuards();
    try {
      return await fn();
    } finally {
      busy = false;
      applyGuards();
    }
  },
};

function applyGuards(): void {
  for (const b of guarded) b.disabled = busy || wowRunning;
}

const nav = h("nav", { class: "nav", role: "tablist" });
const status = h("div");
const content = h("main", { class: "content" });

function tab(name: ViewName, label: string, ic: Parameters<typeof icon>[0], enabled: boolean): HTMLButtonElement {
  return h("button", { class: "tab", role: "tab", disabled: !enabled, onclick: () => ctx.go(name) }, icon(ic, 16), label);
}

function renderChrome(): void {
  const ready = isSetUp(ctx.config, ctx.token);
  const tabs: [ViewName, string, Parameters<typeof icon>[0], boolean][] = [
    ["sync", "Sync", "sync", ready],
    ["backups", "Backups", "history", ready],
    ["settings", "Settings", "settings", true],
  ];
  nav.replaceChildren(
    ...tabs.map(([name, label, ic, enabled]) => {
      const t = tab(name, label, ic, enabled);
      t.setAttribute("aria-selected", String(view === name));
      return t;
    }),
  );
  status.replaceChildren(
    h("span", { class: `pill${wowRunning ? " running" : ""}`, title: wowRunning ? "Close WoW to sync or restore" : "Safe to sync" }, h("span", { class: "dot" }), wowRunning ? "WoW is running" : "WoW is closed"),
  );
}

function renderView(): void {
  guarded = new Set();
  const flash = pendingFlash;
  pendingFlash = undefined;
  const v = view === "settings" ? settingsView(ctx) : view === "backups" ? backupsView(ctx) : syncView(ctx, flash);
  content.replaceChildren(v);
  content.scrollTop = 0;
}

function renderAll(): void {
  renderChrome();
  renderView();
}

async function pollWow(): Promise<void> {
  const running = await window.sync.isWowRunning();
  if (running !== wowRunning) {
    wowRunning = running;
    renderChrome();
    applyGuards();
  }
}

async function start(): Promise<void> {
  root.replaceChildren(
    h(
      "div",
      { class: "shell" },
      h("header", { class: "header" }, h("div", { class: "brand" }, h("span", { class: "logo" }, icon("logo", 18)), "WoW Interface Sync"), nav, h("div", { class: "spacer" }), status),
      content,
    ),
  );
  ctx.config = await window.sync.getConfig();
  ctx.token = await window.sync.getTokenStatus();
  view = isSetUp(ctx.config, ctx.token) ? "sync" : "settings";
  wowRunning = await window.sync.isWowRunning();
  renderAll();
  applyGuards();
  setInterval(() => void pollWow(), 5000);
}

void start();
