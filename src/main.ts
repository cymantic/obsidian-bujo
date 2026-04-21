import { Plugin, Modal, Notice, MarkdownView } from 'obsidian';
import { BujoView, BUJO_VIEW_TYPE } from './BujoView';
import { BujoSettings, DEFAULT_SETTINGS } from './types';
import { BujoSettingTab } from './SettingsTab';
import { todayIso, localIso, nextWorkingDay } from './DailyNote';

export default class BujoPlugin extends Plugin {
  settings: BujoSettings = DEFAULT_SETTINGS;
  isOpeningFromBujo = false; // Flag to track intentional file opens from BuJo view

  async onload() {
    await this.loadSettings();

    // register the view
    this.registerView(
      BUJO_VIEW_TYPE,
      (leaf) => new BujoView(leaf, this),
    );

    // ribbon icon — opens today
    // eslint-disable-next-line obsidianmd/ui/sentence-case -- BuJo is a proper name
    this.addRibbonIcon('book-open', 'Open BuJo', () => {
      void this.openBujoView(todayIso());
    });

    // command: open today
    this.addCommand({
      id: 'open-today',
      name: 'Open today',
      callback: () => void this.openBujoView(todayIso()),
    });

    // command: open tomorrow
    this.addCommand({
      id: 'open-tomorrow',
      name: 'Open tomorrow',
      callback: () => void this.openBujoView(localIso(nextWorkingDay(new Date(), this.settings))),
    });

    // command: migrate tasks to today (run from anywhere)
    this.addCommand({
      id: 'migrate-yesterday',
      name: 'Migrate open tasks to today',
      callback: async () => {
        const { migrateToToday } = await import('./DailyNote');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const fromDate = localIso(yesterday);
        const { migrated } = await migrateToToday(this.app, fromDate, this.settings);
        new Notice(migrated > 0
          ? `${migrated} task${migrated === 1 ? '' : 's'} migrated to today ›`
          : 'No open tasks to migrate.'
        );
        // refresh the view if open
        const view = this.getBujoView();
        if (view) await view.navigateTo(todayIso());
      },
    });

    // command: quick capture
    this.addCommand({
      id: 'quick-capture',
      name: 'Quick capture',
      callback: () => new QuickCaptureModal(this).open(),
    });

    // open BuJo on startup if setting enabled
    if (this.settings.openOnStartup) {
      this.app.workspace.onLayoutReady(() => {
        void this.openBujoView(todayIso());
      });
    }

    // settings tab
    this.addSettingTab(new BujoSettingTab(this.app, this));

    // auto-open BuJo view when journal files are opened
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (!file) return;

        // Check if file is in journal folder
        const journalPath = this.settings.journalFolder + '/';
        if (!file.path.startsWith(journalPath)) return;

        // Extract date from filename (assumes YYYY-MM-DD.md format)
        const basename = file.basename;
        const dateMatch = basename.match(/^(\d{4}-\d{2}-\d{2})$/);
        if (!dateMatch) return;

        const date = dateMatch[1];

        // If opening from BuJo "Open file" button, allow it and clear flag
        if (this.isOpeningFromBujo) {
          this.isOpeningFromBujo = false;
          return;
        }

        // Otherwise, close the markdown leaf and open BuJo view instead
        activeWindow.setTimeout(() => {
          // Find all leaves showing this journal file as markdown
          const leaves = this.app.workspace.getLeavesOfType('markdown');
          for (const leaf of leaves) {
            const mdView = leaf.view;
            if (mdView instanceof MarkdownView && mdView.file && mdView.file.path === file.path) {
              leaf.detach();
            }
          }
        }, 10);

        // Open BuJo view to this date
        void this.openBujoView(date);
      })
    );

  }

  onunload() {
    // Don't detach leaves — Obsidian guideline
  }

  // ── settings ──────────────────────────────────────────────────────────────
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<BujoSettings>);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // ── view management ───────────────────────────────────────────────────────

  getBujoView(): BujoView | null {
    const leaves = this.app.workspace.getLeavesOfType(BUJO_VIEW_TYPE);
    if (leaves.length > 0 && leaves[0].view instanceof BujoView) return leaves[0].view;
    return null;
  }

  async openBujoView(date: string) {
    const existing = this.app.workspace.getLeavesOfType(BUJO_VIEW_TYPE);

    if (existing.length > 0) {
      // view already open — navigate to date
      await this.app.workspace.revealLeaf(existing[0]);
      const view = existing[0].view;
      if (view instanceof BujoView) await view.navigateTo(date);
      return;
    }

    // open in main area as a tab
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: BUJO_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);

    const view = leaf.view;
    if (view instanceof BujoView) await view.navigateTo(date);
  }
}

// ── quick capture modal ─────────────────────────────────────────────────────

class QuickCaptureModal extends Modal {
  private plugin: BujoPlugin;

  constructor(plugin: BujoPlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('bujo-quick-capture');
    contentEl.createEl('label', { text: 'Add to today', cls: 'bj-qc-label' });

    const input = contentEl.createEl('input', {
      cls: 'bj-qc-input',
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- prefix syntax examples
      attr: { type: 'text', placeholder: '. note  , event  x done  or type a task' },
    });

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && input.value.trim()) {
        ev.preventDefault();
        void this.capture(input.value.trim());
        this.close();
      }
    });

    // Focus after the modal animation settles
    activeWindow.setTimeout(() => input.focus(), 50);
  }

  onClose() {
    this.contentEl.empty();
  }

  private async capture(raw: string) {
    const { loadDay, saveDay, todayIso: todayIsoFn } = await import('./DailyNote');
    const { makeId, parseEntryType } = await import('./Parser');

    const today = todayIsoFn();
    const note = await loadDay(this.app, today, this.plugin.settings);

    const { type, text } = parseEntryType(raw);
    note.entries.push({ id: makeId(), type, text });
    await saveDay(this.app, note, this.plugin.settings);

    new Notice(`Added ${type} to today's log`);

    // Refresh view if open
    const view = this.plugin.getBujoView();
    if (view) await view.navigateTo(today);
  }
}
