import { h, msg, msgs } from "../dom";
import { icon } from "../icons";
import type { Ctx } from "../context";
import { describePull, describePush, describeRemoteBackup } from "../format";
import { repoLabel, shortPath } from "../setup";

function stat(label: string, value: string): HTMLElement {
  return h("div", { class: "stat" }, h("div", { class: "label", textContent: label }), h("div", { class: "value", textContent: value, title: value }));
}

export function syncView(ctx: Ctx, flash?: string): HTMLElement {
  const out = h("div");
  if (flash) out.append(msg("ok", flash));

  const push = ctx.guard(
    h("button", {
      class: "btn primary block",
      onclick: async () => {
        out.replaceChildren(msg("info", "Pushing your settings..."));
        const r = await ctx.withBusy(() => window.sync.push());
        out.replaceChildren(r.ok ? msg(r.value.gist.status === "failed" ? "warn" : "ok", describePush(r.value)) : msg("err", r.error));
      },
    }, icon("push"), "Push to GitHub"),
  );

  const pull = ctx.guard(
    h("button", {
      class: "btn block",
      onclick: async () => {
        out.replaceChildren(msg("info", "Pulling settings..."));
        const r = await ctx.withBusy(() => window.sync.pull());
        if (!r.ok) {
          out.replaceChildren(msg("err", r.error));
          return;
        }
        const { backupId, changed, created, identical, remoteBackup } = r.value;
        const remote = describeRemoteBackup(remoteBackup);
        const undo = backupId
          ? ctx.guard(
              h("button", {
                class: "btn sm",
                textContent: "Undo",
                onclick: async () => {
                  const u = await ctx.withBusy(() => window.sync.restoreBackup(backupId));
                  out.replaceChildren(u.ok ? msg("ok", "Pull undone. Your previous files are back.") : msg("err", u.error));
                },
              }),
            )
          : null;
        out.replaceChildren(...msgs(msg("ok", describePull(changed, created, identical), undo), remote));
      },
    }, icon("pull"), "Pull from GitHub"),
  );

  const copyOut = h("div");
  const copyBtn = h("button", {
    class: "btn",
    onclick: async () => {
      copyBtn.disabled = true;
      const r = await window.sync.copyImportString();
      copyBtn.disabled = false;
      copyOut.replaceChildren(
        r.ok
          ? msg("ok", `Copied ${r.value.addonCount} addons to the clipboard${r.value.source === "local" ? " (built from this computer's WowUp)" : ""}. In WowUp, open My Addons, choose Import and paste.`)
          : msg("err", r.error),
      );
    },
  }, icon("copy"), "Copy WowUp import string");

  return h(
    "div",
    { class: "view" },
    h("div", {}, h("h1", { class: "view-title", textContent: "Sync" }), h("p", { class: "view-sub", textContent: "Keep your WoW Forever addon settings in step across computers." })),
    h("section", { class: "card summary" }, stat("Repository", repoLabel(ctx.config.repoUrl)), stat("WoW folder", shortPath(ctx.config.wowRoot)), stat("GitHub token", ctx.token.stored ? "Stored securely" : "Missing")),
    h(
      "div",
      { class: "actions" },
      h("section", { class: "card action" }, h("div", { class: "icon" }, icon("push", 20)), h("h2", { textContent: "Push" }), h("p", { textContent: "Send this computer's addon settings, and refresh your WowUp addon list." }), push),
      h("section", { class: "card action" }, h("div", { class: "icon" }, icon("pull", 20)), h("h2", { textContent: "Pull" }), h("p", { textContent: "Apply the saved settings here. Anything that would change is backed up first, so you can undo it." }), pull),
    ),
    h(
      "section",
      { class: "card import" },
      h("div", { class: "import-text" }, h("h2", { textContent: "WowUp addon list" }), h("p", { textContent: "Copy your addon list to paste into WowUp's Import dialog on any computer." })),
      copyBtn,
    ),
    copyOut,
    out,
  );
}
