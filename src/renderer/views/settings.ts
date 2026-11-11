import type { AppConfig } from "@shared/config.types";
import { confirmDialog, h, msg } from "../dom";
import { icon } from "../icons";
import type { Ctx } from "../context";
import { formatAccountMap, parseAccountMap } from "../format";
import { isSetUp, repoLabel } from "../setup";

function field(label: string, control: HTMLElement, help?: string): HTMLLabelElement {
  return h("label", { class: "field" }, h("span", { class: "label", textContent: label }), control, help ? h("span", { class: "help", textContent: help }) : null);
}

export function settingsView(ctx: Ctx): HTMLElement {
  const firstRun = !isSetUp(ctx.config, ctx.token);
  const c = ctx.config;

  const repoUrl = h("input", { class: "input", value: c.repoUrl, placeholder: "https://github.com/you/wow-settings", spellcheck: false });
  const gistId = h("input", { class: "input", value: c.gistId, placeholder: "e.g. 8f3a9c2d41b6e0a7d5c9", spellcheck: false });
  const token = h("input", { class: "input", type: "password", autocomplete: "off", placeholder: ctx.token.stored ? "Stored. Type a new token to replace it" : "ghp_..." });
  const wowRoot = h("input", { class: "input", value: c.wowRoot, placeholder: "Folder that contains _forever_", spellcheck: false });
  const pushBackups = h("input", { type: "checkbox", checked: c.pushBackups });
  const installAddons = h("input", { type: "checkbox", checked: c.installAddonsOnPull });
  const curseKey = h("input", { class: "input", type: "password", autocomplete: "off", placeholder: ctx.curse.stored ? "Stored. Type a new key to replace it" : "Your CurseForge API key" });
  const curseLine = h("span", { class: "help" });
  const renderCurseLine = () => {
    curseLine.textContent = ctx.curse.stored ? "A key is stored, encrypted by your operating system." : "No key stored yet. Without one, addons are not downloaded.";
  };
  renderCurseLine();
  const clearCurse = h("button", { class: "btn sm ghost danger", textContent: "Remove stored key", hidden: !ctx.curse.stored });
  clearCurse.onclick = async () => {
    await window.sync.clearCurseKey();
    await ctx.reload();
    clearCurse.hidden = true;
    renderCurseLine();
  };
  const accounts = h("textarea", { class: "input", value: formatAccountMap(c.accountMap), placeholder: "MYACCOUNT=shared", spellcheck: false });

  const tokenLine = h("span", { class: "help" });
  const renderTokenLine = () => {
    tokenLine.textContent = ctx.token.stored
      ? ctx.token.protection === "os-encrypted"
        ? "A token is stored, encrypted by your operating system."
        : "A token is stored. This system has no secure keyring, so it is only lightly protected."
      : "No token stored yet.";
  };
  renderTokenLine();

  const out = h("div");
  const clear = ctx.guard(h("button", { class: "btn sm ghost danger", textContent: "Remove stored token", hidden: !ctx.token.stored }));
  clear.onclick = async () => {
    await window.sync.clearToken();
    await ctx.reload();
    token.placeholder = "ghp_...";
    clear.hidden = true;
    renderTokenLine();
    out.replaceChildren(msg("ok", "Token removed."));
  };

  const detect = h("button", {
    class: "btn",
    type: "button",
    textContent: "Detect",
    onclick: async () => {
      const found = await window.sync.detectWowRoot();
      if (found) wowRoot.value = found;
      out.replaceChildren(found ? msg("ok", `Found WoW Forever in ${found}`) : msg("warn", "Could not find it automatically. Type the folder that contains _forever_."));
    },
  });

  const save = h("button", {
    class: "btn primary",
    textContent: firstRun ? "Save and continue" : "Save settings",
    onclick: async () => {
      const next: AppConfig = { repoUrl: repoUrl.value.trim(), gistId: gistId.value.trim(), wowRoot: wowRoot.value.trim(), accountMap: parseAccountMap(accounts.value), pushBackups: pushBackups.checked, installAddonsOnPull: installAddons.checked };
      save.disabled = true;
      try {
        const saved = await window.sync.saveConfig(next);
        if (!saved.ok) {
          out.replaceChildren(msg("err", h("ul", {}, ...saved.issues.map((i) => h("li", { textContent: `${i.field}: ${i.message}` })))));
          return;
        }
        if (token.value.trim()) {
          out.replaceChildren(msg("info", "Checking the token with GitHub..."));
          const t = await window.sync.saveToken(token.value);
          if (!t.ok) {
            out.replaceChildren(msg("err", h("ul", {}, ...t.problems.map((p) => h("li", { textContent: p })))));
            return;
          }
          token.value = "";
        }
        if (curseKey.value.trim()) {
          out.replaceChildren(msg("info", "Checking the CurseForge key..."));
          const k = await window.sync.saveCurseKey(curseKey.value);
          if (!k.ok) {
            out.replaceChildren(msg("err", k.problem ?? "CurseForge rejected the key."));
            return;
          }
          curseKey.value = "";
        }
        await ctx.reload(); // refresh config + token status so the UI never shows stale state
        renderTokenLine();
        clear.hidden = !ctx.token.stored;
        clearCurse.hidden = !ctx.curse.stored;
        curseKey.placeholder = ctx.curse.stored ? "Stored. Type a new key to replace it" : "Your CurseForge API key";
        renderCurseLine();
        token.placeholder = ctx.token.stored ? "Stored. Type a new token to replace it" : "ghp_...";
        if (isSetUp(ctx.config, ctx.token)) {
          ctx.flash("Settings saved. You're ready to sync.");
          ctx.go("sync");
        } else {
          out.replaceChildren(msg("warn", "Saved, but a token is still needed before you can sync."));
        }
      } finally {
        save.disabled = false;
      }
    },
  });

  const dangerOut = h("div");
  const wipe = ctx.guard(
    h("button", {
      class: "btn danger",
      textContent: "Delete all data in the sync repo",
      onclick: async () => {
        const sure = await confirmDialog({
          title: "Delete all data in the sync repo?",
          body: `This removes every file from ${repoLabel(ctx.config.repoUrl)}: your synced settings and all uploaded backups. Git history keeps the older versions, so GitHub can still recover them. Nothing on this computer is touched.`,
          confirmLabel: "Yes, delete everything",
        });
        if (!sure) return;
        const r = await ctx.withBusy(() => window.sync.wipeRepo());
        dangerOut.replaceChildren(
          r.ok ? msg("ok", r.value.removedFiles === 0 ? "The repo was already empty." : `Deleted ${r.value.removedFiles} files from the repo.`) : msg("err", r.error),
        );
      },
    }),
  );
  const addonsCard = firstRun
    ? null
    : h(
        "section",
        { class: "card" },
        h("h2", { textContent: "Addon downloads" }),
        h("p", { class: "hint", textContent: "On pull, install addons from your WowUp list that this computer is missing." }),
        h("label", { class: "check" }, installAddons, h("span", { textContent: "Download missing addons when I pull" })),
        h("label", { class: "field" }, h("span", { class: "label", textContent: "CurseForge API key" }), curseKey, curseLine, h("span", { class: "help", textContent: "Free at console.curseforge.com. Most addons come from CurseForge, which only lets apps with a key download them." }), clearCurse),
      );
  const dangerCard = firstRun
    ? null
    : h("section", { class: "card" }, h("h2", { textContent: "Danger zone" }), h("p", { class: "hint", textContent: "Empties the sync repo, for a fresh start." }), wipe, dangerOut);

  return h(
    "div",
    { class: "view" },
    h("div", {}, h("h1", { class: "view-title", textContent: firstRun ? "Let's get you set up" : "Settings" }), h("p", { class: "view-sub", textContent: firstRun ? "Connect a private GitHub repo to hold your settings, and tell the app where WoW Forever lives." : "Where your settings are kept and where WoW Forever is installed." })),
    h(
      "div",
      { class: "grid-2" },
      h(
        "section",
        { class: "card" },
        h("h2", { textContent: "GitHub" }),
        h("p", { class: "hint", textContent: "Use a private repo for your settings." }),
        field("Settings repo", repoUrl),
        field("Gist ID", gistId, "Receives your WowUp addon list. It's the code at the end of the gist's URL."),
        h("label", { class: "field" }, h("span", { class: "label", textContent: "Access token" }), token, tokenLine, h("span", { class: "help", textContent: "A classic personal access token with the repo and gist scopes." }), clear),
      ),
      h(
        "div",
        { class: "stack" },
        h(
        "section",
        { class: "card" },
        h("h2", { textContent: "World of Warcraft" }),
        h("p", { class: "hint", textContent: "The folder that contains _forever_." }),
        h("div", { class: "field" }, h("span", { class: "label", textContent: "WoW folder" }), h("div", { class: "inline" }, wowRoot, detect)),
        h("label", { class: "check" }, pushBackups, h("span", { textContent: "Also save each backup to the GitHub repo, in a folder for this computer (the newest 20 are kept there)." })),
        h("details", { class: "adv" }, h("summary", { textContent: "Advanced: account names" }), field("Account mapping", accounts, "Only if your account folder (WTF/Account/<name>) is named differently on your computers. One per line: THISCOMPUTER=shared")),
        ),
        addonsCard,
        dangerCard,
      ),
    ),
    h("div", { class: "savebar" }, out, save),
  );
}
