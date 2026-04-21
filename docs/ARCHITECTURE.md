# BuJo Obsidian Plugin — Architecture

## What this is

An Obsidian plugin implementing the Bullet Journal method as a first-class daily log view. It opens as a tab
in Obsidian's main area, reads/writes standard markdown files, and works with any vault sync method (iCloud,
OneDrive, Obsidian Sync, etc.).

---

## Architecture

```
src/
  types.ts        — shared types: BujoEntry, DailyNote, BujoSettings
  Parser.ts       — markdown ↔ BujoEntry[] round-trip, tag extraction, entry type parsing
  DailyNote.ts    — all vault I/O: load, save, migrate, journal folder helpers
  BujoView.ts     — Obsidian ItemView: full UI rendered via DOM API (no React)
  SettingsTab.ts  — settings UI (PluginSettingTab)
  main.ts         — plugin entry point, commands, ribbon icon, quick capture modal
styles.css        — all styling via Obsidian CSS variables (light/dark auto)
manifest.json
esbuild.config.mjs
```

### Key design decisions

- **No React/framework** — UI is built with Obsidian's DOM helper API (`createDiv`, `createEl`, `createSpan`
  etc). Keep it this way unless there's a strong reason to change.
- **Vault is the database** — no separate storage. Entries live in `journal/YYYY-MM-DD.md`. The plugin
  reads/writes those files directly via `Vault.process` (atomic) for existing files and `Vault.create` for
  new ones.
- **File format** — daily note markdown uses `- <sym> <text>` lines. Symbols: `o` todo, `x` done,
  `-` cancelled, `>` migrated, `.` note, `,` event. Migration origin stored as `↳ YYYY-MM-DD` suffix on the
  text; destination as `→ YYYY-MM-DD`.
- **Obsidian CSS variables** — all colours use `var(--background-primary)`, `var(--text-muted)` etc. Never
  hardcode hex colours or inline styles. This gives free light/dark mode.
- **Settings** — stored in `data.json` via `loadData()`/`saveData()`. `BujoSettings` in `types.ts`. Default
  journal folder is `journal/`. The view reads settings from the plugin instance via a getter so changes take
  effect immediately.

---

## Entry types and symbols

| Symbol | Type      | Markdown | Behaviour                                          |
|--------|-----------|----------|----------------------------------------------------|
| ○      | todo      | `- o`    | Cycles: todo → done → cancelled → todo             |
| x      | done      | `- x`    | Strikethrough. No delete button.                   |
| –      | cancelled | `- -`    | Strikethrough, dimmed. Delete button. `o` reopens. |
| ›      | migrate   | `- >`    | Dimmed. Set when migrated to another day.          |
| ·      | note      | `- .`    | Non-actionable. No cycling.                        |
| ◇      | event     | `- ,`    | Something happening on this date. No cycling.      |

---

## Inline syntax

Entries support three inline syntaxes rendered in the view:

- `[[WikiLink]]` — opens file in Obsidian via `app.workspace.openLinkText()`
- `[text](url)` — external URL opens in browser; internal name opens as wikilink
- `#tag` — renders as a pill; clicking opens Obsidian's global search for that tag

---

## Keyboard shortcuts

| Key                       | Action                                                    |
|---------------------------|-----------------------------------------------------------|
| `↑` / `↓`                 | Navigate entries                                          |
| `Alt/Opt+↑` / `Alt/Opt+↓` | Reorder entries                                           |
| `Enter`                   | Edit selected entry (toggle edit mode)                    |
| `Space`                   | Cycle task state                                          |
| `n`                       | Focus new entry input                                     |
| `d`                       | Mark selected todo as done                                |
| `c`                       | Cancel selected entry                                     |
| `o`                       | Reopen cancelled entry                                    |
| `m` / `>`                 | Open migrate panel on selected todo                       |
| `x` / `Del`               | Delete selected cancelled entry, note, or event           |
| `r`                       | Open review view                                          |
| `Esc`                     | Deselect / close edit / close migrate panel / exit review |
| dbl-click                 | Open migrate panel on a todo                              |
| single-click              | Edit entry text inline                                    |

---

## Sidebar behaviour

The sidebar always shows:

1. **Today** — always visible, pill: `today`
2. **Up to 5 past days that have at least one open todo** — drops off when todos are cleared
3. **Future** section: next working day (`tomorrow`), next week start, next month

Below the day list: a **legend** showing all entry type symbols.

---

## Migration behaviour

- **Carry all** — marks all `todo` entries on a past day as `migrate`, prepends them to today with
  `↳ fromDate` tag
- **Migrate single entry** — dbl-click or `m` key opens a panel with: next working day / next week start /
  first working day of next month / date picker. Marks source as `migrate`, creates new `todo` on target
  with `↳ fromDate`.
- Migration always goes **to today or a future date**, never backwards.
- Migration shortcuts in the panel adapt to the user's start-of-week setting.

---

## Build

```bash
npm run dev      # watch mode (use with Obsidian Hot Reload plugin)
npm run build    # production bundle
npx eslint src/  # lint (must pass before submission)
```

The plugin is loaded from `.obsidian/plugins/obsidian-bujo/` in the dev vault.

## Linting

The project uses [eslint-plugin-obsidianmd][eslint-plugin] — the official Obsidian ESLint plugin that mirrors
the automated review scanner. All errors must be resolved before pushing; the Obsidian bot re-scans within
6 hours of each push.

Key rules enforced:

- **Sentence case for UI text** — first word capitalised, rest lowercase. Suppress with
  `eslint-disable` for proper names (BuJo) and format strings (YYYY-MM-DD).
- **No floating promises** — every promise must be `await`ed, `.catch()`ed, or prefixed with `void`.
- **No `document`/`window`/`setTimeout`/`clearTimeout`** — use `activeDocument`, `activeWindow`,
  `activeWindow.setTimeout()`, `activeWindow.clearTimeout()` for popout window compatibility.
- **No plugin ID in command IDs** — Obsidian namespaces commands automatically.
- **No `detachLeavesOfType` in `onunload`** — resets leaf position on reload.
- **`minAppVersion` in `manifest.json`** — must cover all APIs used (currently `1.7.2`).

## Code style

- TypeScript strict null checks are on — don't bypass with `!` unless you've actually checked
- Prefer `const` and arrow functions
- DOM creation: use Obsidian's `el.createDiv()`, `el.createEl()`, `el.createSpan()` helpers — not
  `document.createElement()`
- Styling: use CSS classes and Obsidian CSS variables — never inline `style.*` assignments
- Use `new Notice(msg)` for user-facing toasts, not `console.log`
- All date handling uses local time — never `toISOString()` (it converts to UTC and causes off-by-one on
  dates). Use `localIso()` from `DailyNote.ts`
- File writes use `Vault.process` (atomic) for existing files
- Journal folder file listing uses `getFolderByPath` + `children`, not `getMarkdownFiles()` scan
- Use `activeDocument`/`activeWindow` instead of `document`/`window` for popout window compatibility
- Promises in event listeners: use `void` prefix for fire-and-forget, `await` where sequential

[eslint-plugin]: https://github.com/obsidianmd/eslint-plugin
