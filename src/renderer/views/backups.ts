import type { BackupManifest } from "../../main/backup/backup.types";
import { h, msg, msgs } from "../dom";
import type { Ctx } from "../context";
import { icon } from "../icons";
import { describeBackup, describeRemoteBackup } from "../format";

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
    const what = describeBackup(b);
    const actions = h("div", { class: "row-actions" });
    const showRestore = () => {
      actions.replaceChildren(
        ctx.guard(h("button", { class: "btn sm", textContent: "Restore", onclick: () => ask("restore") })),
        h("button", { class: "btn sm ghost danger", textContent: "Delete", onclick: () => ask("delete") }),
      );
    };
    const ask = (action: "restore" | "delete") => {
      const confirm =
        action === "restore"
          ? ctx.guard(
              h("button", {
                class: "btn sm primary",
                textContent: "Yes, restore",
                onclick: async () => {
                  const r = await ctx.withBusy(() => window.sync.restoreBackup(b.id));
                  out.replaceChildren(r.ok ? msg("ok", `Restored the backup from ${when}. Your files from just before are saved as a new backup.`) : msg("err", r.error));
                  await load();
                },
              }),
            )
          : h("button", {
              class: "btn sm danger",
              textContent: "Yes, delete",
              onclick: async () => {
                const r = await window.sync.deleteBackup(b.id);
                out.replaceChildren(r.ok ? msg("ok", `Deleted the backup from ${when} on this computer. Any copy already saved to GitHub is left there.`) : msg("err", r.error));
                await load();
              },
            });
      actions.replaceChildren(
        h("span", { class: "what", textContent: action === "restore" ? "Restore this backup?" : "Delete this backup?" }),
        confirm,
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

  const backUpNow = h("button", {
    class: "btn primary",
    onclick: async () => {
      backUpNow.disabled = true;
      out.replaceChildren(msg("info", "Backing up your settings..."));
      const r = await window.sync.createBackup();
      backUpNow.disabled = false;
      if (!r.ok) {
        out.replaceChildren(msg("err", r.error));
      } else {
        const remote = describeRemoteBackup(r.value.remote);
        out.replaceChildren(...msgs(msg("ok", `Backed up ${r.value.backup.files.length} files. Backups stay on this computer until you delete them.`), remote));
      }
      await load();
    },
  }, icon("history", 16), "Back up now");

  void load();
  return h(
    "div",
    { class: "view" },
    h(
      "div",
      { class: "title-row" },
      h("div", {}, h("h1", { class: "view-title", textContent: "Backups" }), h("p", { class: "view-sub", textContent: "Saved before every pull, or whenever you choose. They stay until you delete them." })),
      backUpNow,
    ),
    out,
    list,
  );
}
