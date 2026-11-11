import type { BackupManifest } from "../../main/backup/backup.types";
import { h, msg } from "../dom";
import type { Ctx } from "../context";

export function backupsView(ctx: Ctx): HTMLElement {
  const out = h("div");
  const list = h("div", { class: "stack" });

  async function load(): Promise<void> {
    const backups = await window.sync.listBackups();
    list.replaceChildren(
      ...(backups.length === 0
        ? [h("div", { class: "card empty" }, h("div", { class: "big", textContent: "No backups yet" }), h("div", { textContent: "One is made automatically before any pull that changes your files." }))]
        : backups.map(row)),
    );
  }

  function row(b: BackupManifest): HTMLElement {
    const when = new Date(b.createdAt).toLocaleString();
    const what = b.reason === "pull" ? `Before a pull: ${b.summary.changed} changed, ${b.summary.new} new` : "Before a restore";
    const actions = h("div");
    const showRestore = () => {
      actions.replaceChildren(
        ctx.guard(h("button", { class: "btn sm", textContent: "Restore", onclick: () => ask() })),
      );
    };
    const ask = () => {
      actions.replaceChildren(
        h("span", { class: "what", textContent: "Restore this backup? " }),
        ctx.guard(
          h("button", {
            class: "btn sm primary",
            textContent: "Yes, restore",
            onclick: async () => {
              const r = await ctx.withBusy(() => window.sync.restoreBackup(b.id));
              out.replaceChildren(r.ok ? msg("ok", `Restored the backup from ${when}. Your files from just before are saved as a new backup.`) : msg("err", r.error));
              await load();
            },
          }),
        ),
        " ",
        h("button", { class: "btn sm ghost", textContent: "Cancel", onclick: showRestore }),
      );
    };
    showRestore();

    return h(
      "section",
      { class: "card backup" },
      h("div", { class: "backup-row" }, h("div", { class: "info" }, h("div", { class: "when", textContent: when }), h("div", { class: "what", textContent: what })), actions),
      h("details", { class: "adv" }, h("summary", { textContent: `${b.files.length} file${b.files.length === 1 ? "" : "s"}` }), h("pre", { class: "files", textContent: b.files.map((f) => f.path).join("\n") })),
    );
  }

  void load();
  return h(
    "div",
    { class: "view" },
    h("div", {}, h("h1", { class: "view-title", textContent: "Backups" }), h("p", { class: "view-sub", textContent: "Every pull saves the files it replaces. Restore any of them, even from a while ago." })),
    out,
    list,
  );
}
