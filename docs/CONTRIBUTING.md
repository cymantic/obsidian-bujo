# Contributing to BuJo

Thanks for your interest in contributing to BuJo! This document
provides guidelines and information for developers.

## Development Setup

### Prerequisites

- Node.js v16 or higher
- npm
- Obsidian (for testing)
- Git

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/cymantic/obsidian-bujo.git
   cd obsidian-bujo
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up development vault**

   For hot-reload during development, link the plugin to your dev
   vault:

   ```bash
   # Symlink to your dev vault's plugins folder
   ln -s $(pwd) \
     ~/path/to/dev-vault/.obsidian/plugins/obsidian-bujo
   ```

4. **Start development build**
   ```bash
   npm run dev
   ```

   This watches for changes and rebuilds automatically.

5. **Install Hot-Reload plugin** (optional but recommended)

   In your dev vault:
   - Install the [Hot-Reload][hot-reload] community plugin
   - Enable it in Settings
   - Now changes auto-reload without manual Obsidian restart

### Project Structure

```
obsidian-bujo/
├── src/
│   ├── main.ts         # Plugin entry, commands, quick capture
│   ├── BujoView.ts     # Main view, UI, keyboard handlers
│   ├── DailyNote.ts    # Vault I/O, date utils, migration
│   ├── Parser.ts       # Markdown ↔ BujoEntry parsing
│   ├── SettingsTab.ts  # Settings UI
│   └── types.ts        # TypeScript interfaces
├── styles.css          # Styling (Obsidian CSS variables)
├── manifest.json       # Plugin metadata
├── docs/
│   ├── ARCHITECTURE.md # Design decisions, codebase structure
│   └── CONTRIBUTING.md # This file
├── test/               # Tests
└── README.md           # User-facing documentation
```

## Development Workflow

### Making Changes

1. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Edit source files in `src/`
   - Run `npm run dev` to auto-rebuild
   - Test in Obsidian

3. **Run ESLint**
   ```bash
   npx eslint src/
   ```
   All errors must pass before submitting. The project uses
   [eslint-plugin-obsidianmd][eslint-plugin] which mirrors
   the automated Obsidian plugin review scanner.

4. **Follow code style**
   - Use TypeScript strict mode
   - Prefer `const` and arrow functions
   - Use Obsidian DOM helpers
     (`createDiv`, `createEl`, `createSpan`)
   - Never use `document.createElement()` directly
   - Never use inline `style.*` — use CSS classes instead
   - Use `activeDocument`/`activeWindow` instead of
     `document`/`window` (popout window compatibility)
   - Use `void` for fire-and-forget promises in event
     listeners — never leave promises floating
   - All dates use local time (never `toISOString()`)
   - File writes use `Vault.process` for existing files
   - See docs/ARCHITECTURE.md for more conventions

5. **Test your changes**
   - Create test entries of all types
   - Test keyboard shortcuts
   - Test migration
   - Test calendar view
   - Test with different vault configurations

6. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add feature description"
   ```

   Use conventional commits:
   - `feat:` new feature
   - `fix:` bug fix
   - `docs:` documentation
   - `style:` formatting, CSS
   - `refactor:` code restructuring
   - `test:` adding tests
   - `chore:` maintenance

7. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

   Then create a pull request on GitHub.

### Code Style

- **TypeScript**: Strict null checks enabled
- **DOM creation**: Use Obsidian helpers (`el.createDiv()`,
  not `document.createElement()`)
- **Styling**: CSS classes + Obsidian CSS variables, never
  inline styles
- **Date handling**: Always use `localIso()`, never
  `toISOString()`
- **User feedback**: Use `new Notice()` for messages
- **No React**: This plugin uses vanilla DOM manipulation
- **Async/await**: Always await async operations; use `void`
  prefix for fire-and-forget promises in event listeners
- **Popout windows**: Use `activeDocument`/`activeWindow`
  instead of `document`/`window`/`setTimeout`/`clearTimeout`
- **Comments**: Only add comments where logic isn't self-evident

### Testing

1. **Parser tests**
   ```bash
   npm test
   ```

2. **Manual testing checklist**
   - [ ] Create entries of all 6 types
   - [ ] Test keyboard shortcuts (space, d, c, o, m, x, etc.)
   - [ ] Test migration (single task and all tasks)
   - [ ] Test calendar view navigation
   - [ ] Test review view (adjust period, migrate from review)
   - [ ] Test quick capture from command palette
   - [ ] Test clicking journal files in file explorer
   - [ ] Test "Open file" button
   - [ ] Test working days configuration
   - [ ] Test with empty vault (no journal folder yet)
   - [ ] Test migration tracking (↳ and →)

3. **Cross-platform testing**
   - [ ] Windows
   - [ ] macOS
   - [ ] Linux
   - [ ] Mobile (if applicable)

## Architecture Guidelines

### Key Principles

1. **Vault is the database**: No separate storage, everything
   in markdown
2. **No frameworks**: Pure TypeScript + Obsidian API
3. **Obsidian CSS variables**: Never hardcode colours or use
   inline styles
4. **Local time always**: Never convert to UTC
5. **Reload from disk**: After mutations, reload to ensure
   consistency
6. **Atomic writes**: Use `Vault.process` for existing files

### Common Tasks

#### Adding a New Entry Type

1. Update `EntryType` in `src/types.ts`
2. Add symbol and class to `STATES` in `src/BujoView.ts`
3. Add parsing logic to `src/Parser.ts`
4. Add prefix handling to `parseEntryType()` in `src/Parser.ts`
5. Add colour to `.bj-yourtype` in `styles.css`
6. Update legend in `renderSidebar()`

#### Adding a New Setting

1. Add field to `BujoSettings` interface in `src/types.ts`
2. Add default value to `DEFAULT_SETTINGS`
3. Add UI control in `src/SettingsTab.ts`
4. Use the setting where needed (accessed via `this.settings`
   getter in BujoView)

#### Adding a Keyboard Shortcut

1. Add handler in `handleKeydown()` in `src/BujoView.ts`
2. Add to keyboard hints in `renderMain()`
3. Update README.md

### File I/O Best Practices

- Always use `notePathForDate()` to construct paths
- Use `loadDay()` for reading, `saveDay()` for writing
- After saving, reload affected days to get fresh state
- Never update `this.currentNote` in memory after save
- Use `navigateTo()` to reload and re-render
- Use `journalFiles()` to list files in the journal folder
  (scoped, not vault-wide)

### Avoiding Common Pitfalls

1. **Race conditions**: Always `await` async operations
2. **ID matching**: Entry IDs regenerate on parse, match by
   text+type for migrations
3. **File creation**: Always check folder exists before writing
4. **Event handlers**: Stop propagation to prevent bubbling
5. **Strikethrough**: Apply to `.bj-entry-text`, not the bullet
6. **No inline styles**: Use CSS classes — Obsidian guidelines
   require it

## Submitting Pull Requests

### Before Submitting

- [ ] `npx eslint src/` passes with no errors
- [ ] `npm run build` succeeds
- [ ] Code follows the style guide
- [ ] All features work as expected
- [ ] No console errors or warnings
- [ ] README.md updated if user-facing changes
- [ ] docs/ARCHITECTURE.md updated if design changes
- [ ] Manual testing completed

### PR Description Template

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How was this tested? What scenarios were covered?

## Screenshots (if applicable)
Add screenshots for UI changes.

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings/errors
- [ ] Tested manually
```

## Getting Help

- **Questions**: Open a [GitHub Discussion][discussions]
- **Bugs**: Open a [GitHub Issue][issues]
- **Architecture questions**: Check docs/ARCHITECTURE.md first
- **Obsidian API**: See the [Obsidian developer docs][obsidian-docs]

## Code of Conduct

Be respectful, helpful, and constructive. We're all here to make
a great tool together.

## License

By contributing, you agree that your contributions will be
licensed under the ISC License.

[hot-reload]: https://github.com/pjeby/hot-reload
[eslint-plugin]: https://github.com/obsidianmd/eslint-plugin
[discussions]: https://github.com/cymantic/obsidian-bujo/discussions
[issues]: https://github.com/cymantic/obsidian-bujo/issues
[obsidian-docs]: https://docs.obsidian.md
