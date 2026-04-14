# BuJo — Bullet Journal for Obsidian

A first-class Bullet Journal implementation for Obsidian. BuJo provides a dedicated view for managing your
daily tasks, notes, and events using the proven Bullet Journal method, while storing everything in plain
markdown files in your vault.

## Features

- **Daily Log View**: Clean, focused interface for today's tasks and journal entries
- **Calendar View**: Month-at-a-glance with task counts per day
- **Weekly Review**: Multi-day overview (7–49 days) with overall stats and per-day migration
- **Quick Capture**: Add a task from anywhere via the command palette — no need to open the full view
- **Task Migration**: Easily move tasks to future dates (tomorrow, next week start, next month, or any custom date)
- **Entry Types**:
  - ○ Todo — actionable tasks
  - x Done — completed tasks
  - – Cancelled — tasks you decided not to do
  - › Migrated — tasks moved to another day
  - · Note — non-actionable observations
  - ◇ Event — things happening on a specific date
- **Quick Navigation**: Jump between dates, see past days with open tasks, plan ahead
- **Keyboard Shortcuts**: Fast navigation and task management without touching the mouse
- **Migration Tracking**: See where tasks came from (↳) and where they went to (→)
- **Working Days**: Configure your work schedule (Monday–Friday by default)
- **Plain Markdown**: All data stored as readable markdown in your vault's journal folder

## Getting Started

### Installation

#### From Community Plugins (once published)
1. Open Settings → Community Plugins
2. Browse for "BuJo"
3. Click Install, then Enable

#### Manual Installation
1. Download `main.js`, `styles.css`, and `manifest.json` from the latest release
2. Create a folder: `VaultFolder/.obsidian/plugins/bujo/`
3. Copy the downloaded files into that folder
4. Reload Obsidian
5. Enable the plugin in Settings → Community Plugins

### First Use

1. Click the book icon (📖) in the left ribbon, or use Command Palette: "BuJo: Open today"
2. The BuJo view opens as a tab showing today's date
3. Start adding entries using the input at the bottom

## Usage

### Adding Entries

Type in the input field at the bottom and press Enter:
- Plain text → todo (○)
- Prefix with `. ` → note (·)
- Prefix with `, ` → event (◇)

### Quick Capture

Open the command palette (Cmd/Ctrl+P) and run **BuJo: Quick capture** to add an entry to today's log
without opening the full view. Same prefix rules apply.

### Managing Tasks

- **Space / Click bullet**: Cycle through states (todo → done → cancelled → todo)
- **d**: Mark as done
- **c**: Cancel task
- **o**: Reopen cancelled task
- **m or >**: Open migration panel
- **x or Delete**: Delete cancelled tasks, notes, or events
- **Enter**: Edit entry text
- **↑/↓**: Navigate between entries

### Migrating Tasks

**Migrate All Open Tasks** (from past days):
- Click "Migrate → today" banner that appears on past days with open tasks

**Migrate Single Task**:
- Select a task and press `m` or `>`
- Or double-click the task
- Choose a destination using the shortcut keys shown in the panel, or pick a custom date

### Navigation

**Sidebar**:
- Click any date to jump to it
- **Today** + up to 5 past days with open tasks
- **Future**: Next working day, next week start, next month

**Views**:
- **Journal**: Daily log view (default)
- **Calendar**: Month view with task counts per day
- **Review**: Multi-day review (7–49 days) with stats and migration buttons
  - Use +/− to adjust the review period in 7-day increments
  - Click a day header to jump to that date
  - Press Escape to return to journal view

**Clicking Journal Files**:
- Click any `YYYY-MM-DD.md` file in your vault → BuJo opens to that date automatically
- Click "📄 Open file" in BuJo → opens the raw markdown file

### Inline Formatting

Entries support:
- `[[WikiLinks]]` — links to other notes
- `[text](url)` — external links
- `#tags` — rendered as pills; click to search in Obsidian

### Settings

Open Settings → BuJo:

- **Journal folder**: Where daily notes are stored (default: `journal`)
- **Open on startup**: Automatically open BuJo when Obsidian starts
- **Working days**: Configure which days are working days
  (affects "next working day" calculations)
- **Start of week**: First day of the week for migration shortcuts
- **Custom fonts**: Toggle between BuJo's serif aesthetic and your
  Obsidian interface font

## File Format

BuJo stores data in standard markdown files: `journal/YYYY-MM-DD.md`

Example:
```markdown
- o Finish blog post #writing
- x Buy groceries ↳ 2026-04-13
- - Call dentist
- > Plan weekend trip → 2026-04-15
- . Library book due next Thursday
- , Coffee with Sam 10am
```

## Keyboard Shortcuts

**Navigation**:
- `↑` / `↓` — Navigate entries
- `Alt+↑` / `Alt+↓` (Windows/Linux) or `Opt+↑` / `Opt+↓` (Mac) — Reorder entries
- `r` — Open review
- `Esc` — Deselect (or exit review)
- `n` — Focus new entry input

**Actions**:
- `Space` — Cycle task state
- `d` — Mark done
- `c` — Cancel
- `o` — Reopen cancelled
- `m` / `>` — Migrate
- `x` / `Delete` — Delete (cancelled/notes/events only)
- `Enter` — Edit entry

**Migration Panel** (when open):
- Shortcut keys are shown on each button and adapt to your
  start-of-week setting
- `c` — Cancel

## Shared Vaults

BuJo stores entries in plain markdown files, so it works with any vault
sync method (iCloud, OneDrive, Dropbox, Obsidian Sync, etc.).

**Limitations to be aware of:**
- If two people edit the same daily note file at the same time, the sync
  provider resolves the conflict — typically last-write-wins. This can
  cause lost entries.
- For team use, consider giving each person their own journal folder
  (e.g. `journal/tom/`, `journal/alice/`) via the settings, so files
  never conflict.

## Tips

- Use the calendar view to see task distribution across the month
- Press `r` or click "Review" in the sidebar to reflect on what
  you've accomplished
- Migration tracking helps you see patterns in delayed tasks
- Configure working days to match your schedule
- Use tags to categorize entries for easy searching
- The sidebar shows only past days with open tasks, keeping your
  focus on what matters

## Support & Feedback

Found a bug or have a feature request?
Please [open an issue][issues].

## License

ISC License — See [package.json](package.json) for details.

[issues]: https://github.com/cymantic/obsidian-bujo/issues
