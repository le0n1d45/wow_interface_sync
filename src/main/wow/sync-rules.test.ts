import { describe, expect, it } from "vitest";
import { isSyncPath } from "./sync-rules";

const A = "WTF/Account/ACCT1";
const C = `${A}/Dark Iron/Mychar`;

describe("isSyncPath", () => {
  it.each([
    "WTF/SavedVariables/Details.lua",
    "WTF/SavedVariables/Blizzard_AddOnList.lua",
    `${A}/SavedVariables/DBM-Core.lua`,
    `${C}/SavedVariables/Details.lua`,
    `${C}/AddOns.txt`,
  ])("syncs %s", (p) => expect(isSyncPath(p)).toBe(true));

  it.each([
    "WTF/Config.wtf",
    `${A}/config-cache.wtf`,
    `${A}/bindings-cache.wtf`,
    `${A}/click-bindings-cache.txt`,
    `${A}/macros-cache.txt`,
    `${A}/chat-cache.txt`,
    `${A}/cache.md5`,
    // Edit Mode layouts are synced by the game itself
    `${A}/edit-mode-cache-account.txt`,
    `${C}/edit-mode-cache-character.txt`,
    `${C}/config-cache.wtf`,
    `${C}/layout-local.txt`,
    `${C}/chat-cache.txt`,
    "WTF/SavedVariables/Blizzard_Console.lua",
    "WTF/SavedVariables/Blizzard_GlueSavedVariables.lua",
    "WTF/SavedVariables/Details.lua.bak",
    `${A}/SavedVariables/DBM-Core.lua.old`,
    `${C}/edit-mode-cache-character.old`,
    "Cache/something.lua",
    "Interface/AddOns/Details/Details.lua",
    `${A}/Dark Iron/SavedVariables/Details.lua`,
    "WTF/Account/../../../AddOns.txt",
    "WTF/Account/ACCT1/../../SavedVariables/../Details.lua",
  ])("skips %s", (p) => expect(isSyncPath(p)).toBe(false));
});
