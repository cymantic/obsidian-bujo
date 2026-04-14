# BuJo — Agent Instructions

For full project architecture, file structure, entry types, keyboard shortcuts, sidebar/migration behaviour,
and code style rules, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Everything below is agent-specific
guidance that supplements that document.

---

## Critical rules

- **No React/framework.** All UI uses Obsidian's DOM helpers (`createDiv`, `createEl`, `createSpan`). Do not
  introduce React, Svelte, or any UI framework.
- **No inline styles.** Never write `el.style.x = ...`. Use CSS classes in `styles.css` with Obsidian CSS
  variables. This is an [Obsidian plugin guideline][plugin-guidelines] and will fail review.
- **No `console.log` in production paths.** Use `new Notice()` for user-facing messages. Debug logging must
  be gated or removed.
- **No `innerHTML`, `outerHTML`, or `insertAdjacentHTML`.** Security risk — Obsidian reviewers reject it.
- **Local time only.** Never use `toISOString()` — it converts to UTC and causes off-by-one date bugs. Use
  `localIso()` from `DailyNote.ts`.
- **Atomic file writes.** Use `Vault.process` for modifying existing files, `Vault.create` for new files.
  Never use `Vault.modify`.
- **Scoped file listing.** Use `getFolderByPath()` + `children` to list journal files. Never scan the entire
  vault with `getMarkdownFiles()`.
- **Settings via getter.** `BujoView` reads settings from `this.plugin.settings` through a getter. Never
  pass or store a separate settings copy.
- **`normalizePath` on all user-configured paths.** Always normalise folder paths from settings before use.

---

## Vault I/O patterns

- Construct paths with `notePathForDate(date, settings)`
- Read with `loadDay()`, write with `saveDay()`
- List journal files with `journalFiles()` (scoped helper in `DailyNote.ts`)
- After any save, reload from disk — never trust in-memory state
- Use `navigateTo()` to reload and re-render the view

---

## Adding new features — checklist

**New entry type:**
1. Add to `EntryType` union in `types.ts`
2. Add symbol + class to `STATES` in `BujoView.ts`
3. Add parse/serialise logic in `Parser.ts`
4. Add prefix to `parseEntryType()` in `Parser.ts`
5. Add `.bj-yourtype` colour in `styles.css`
6. Update legend in `renderSidebar()`

**New setting:**
1. Add to `BujoSettings` in `types.ts` + `DEFAULT_SETTINGS`
2. Add UI in `SettingsTab.ts`
3. Access via `this.settings` in BujoView (getter)

**New keyboard shortcut:**
1. Add handler in `handleKeydown()` in `BujoView.ts`
2. Add to kbd hint bar in `renderMain()`
3. Update README.md

**New command:**
1. Add via `this.addCommand()` in `main.ts` `onload()`
2. Use stable ID — never rename after release

---

## What not to do

- Don't add dependencies unless absolutely necessary. The plugin should stay small and browser-compatible.
- Don't create new files for small additions — prefer extending existing modules.
- Don't bypass TypeScript strict null checks with `!` unless you've verified the value exists.
- Don't use `Vault.adapter` — use the `Vault` API for file ops.
- Don't access `workspace.activeLeaf` — use `getActiveViewOfType()` or `getLeavesOfType()`.
- Don't detach leaves in `onunload`.
- Don't set default hotkeys on commands (causes conflicts).

---

## Formatting

- Markdown files in this project wrap at 120 characters.
- External URLs use reference-style links at the bottom of the file.

[plugin-guidelines]: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
