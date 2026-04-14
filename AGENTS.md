comm# Obsidian Plugin — Agent Guide

Generic guidance for agents working on Obsidian community plugins. For project-specific rules, see
[CLAUDE.md](CLAUDE.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Environment & tooling

- Node.js LTS (18+), npm, TypeScript with `"strict": true`.
- **Bundler: esbuild** — configured in `esbuild.config.mjs`. All code bundles into a single `main.js`.
- Types come from the `obsidian` package (dev dependency).

### Commands

```bash
npm install        # install dependencies
npm run dev        # watch mode (rebuilds on save)
npm run build      # production build (tsc + esbuild)
npm test           # run parser tests
```

## Release artifacts

Three files must exist at the plugin root for Obsidian to load it:
- `main.js` — bundled JavaScript
- `manifest.json` — plugin metadata
- `styles.css` — optional, all plugin styling

**Never commit `main.js` or `node_modules/` to version control.**

## Manifest rules (`manifest.json`)

Required fields: `id`, `name`, `version` (SemVer), `minAppVersion`, `description`, `isDesktopOnly`.
Optional: `author`, `authorUrl`, `fundingUrl`.

- Never change `id` after release.
- Keep `minAppVersion` accurate when using newer APIs.
- Validation spec: [obsidian-releases workflow][validate-workflow]

## Coding conventions

- Keep `main.ts` minimal — lifecycle only (`onload`, `onunload`, `addCommand`, `registerView`). Delegate
  logic to other modules.
- Bundle everything into `main.js` (no unbundled runtime deps).
- Prefer `async/await` over promise chains.
- Use `this.register*` helpers for all cleanup (events, intervals, DOM listeners).
- Avoid Node/Electron APIs if `isDesktopOnly` is `false`.

## Obsidian API rules

These are common review rejection reasons:

- **No `innerHTML`/`outerHTML`/`insertAdjacentHTML`** — XSS risk. Use `createDiv()`, `createEl()`,
  `createSpan()`.
- **No inline styles** — use CSS classes with Obsidian CSS variables. Use `setHeading()` instead of
  `<h1>`/`<h2>` in settings.
- **No `console.log`** in production — use `new Notice()`.
- **No global `app`** — use `this.app` from the plugin instance.
- **No `workspace.activeLeaf`** — use `getActiveViewOfType()`.
- **No `Vault.modify`** for background edits — use `Vault.process` (atomic).
- **No `getMarkdownFiles()` scanning** — use `getFileByPath()`, `getFolderByPath()`, or
  `getAbstractFileByPath()`.
- **Use `normalizePath()`** on any user-defined path.
- **Sentence case** in all UI text (settings, commands, buttons).
- **Don't detach leaves in `onunload`.**
- **Don't set default hotkeys** on commands.

## Settings

- Provide a `PluginSettingTab` with sensible defaults.
- Persist via `this.loadData()` / `this.saveData()`.
- No top-level heading in the settings tab.
- Avoid "settings" in section headings (redundant).

## Versioning & releases

- Bump `version` in both `manifest.json` and `versions.json`.
- Create a GitHub release with tag matching `manifest.json` version (no leading `v`).
- Attach `manifest.json`, `main.js`, and `styles.css` as release assets.

## Security & privacy

- Default to local/offline operation.
- No hidden telemetry — require explicit opt-in for any network calls.
- Never execute remote code or fetch-and-eval.
- Read/write only what's necessary inside the vault.
- Disclose any external services in README and settings.

## Performance

- Keep startup light — defer heavy work until needed.
- Avoid vault-wide file scans; scope to specific folders.
- Debounce/throttle expensive operations on file system events.

## Mobile

- Test on iOS and Android when `isDesktopOnly` is `false`.
- Ensure 44px minimum touch targets.
- Use `16px` font on mobile inputs to prevent iOS zoom.
- Don't assume desktop-only APIs are available.

## Troubleshooting

- **Plugin doesn't load**: ensure `main.js` and `manifest.json` are at the top level of the plugin folder.
- **Build fails**: run `npm run build` to see TypeScript errors.
- **Commands not appearing**: verify `addCommand` runs in `onload()` and IDs are unique.
- **Settings not persisting**: ensure `loadData`/`saveData` are awaited.

## References

- [Obsidian sample plugin][sample-plugin]
- [API documentation][api-docs]
- [Developer policies][dev-policies]
- [Plugin guidelines][plugin-guidelines]
- [Style guide][style-guide]

[sample-plugin]: https://github.com/obsidianmd/obsidian-sample-plugin
[api-docs]: https://docs.obsidian.md
[dev-policies]: https://docs.obsidian.md/Developer+policies
[plugin-guidelines]: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
[style-guide]: https://help.obsidian.md/style-guide
[validate-workflow]: https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml
