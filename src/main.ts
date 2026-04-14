import { Plugin, Modal, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import { BujoView, BUJO_VIEW_TYPE } from './BujoView';
import { BujoSettings, DEFAULT_SETTINGS } from './types';
import { BujoSettingTab } from './SettingsTab';
import { todayIso, localIso, nextWorkingDay } from './DailyNote';

export default class BujoPlugin extends Plugin {
  settings: BujoSettings;
  isOpeningFromBujo = false; // Flag to track intentional file opens from BuJo view

  async onload() {
    await this.loadSettings();

    // register the view
    this.registerView(
      BUJO_VIEW_TYPE,
      (leaf) => new BujoView(leaf, this),
    );

    // ribbon icon — opens today
    this.addRibbonIcon('book-open', 'Open BuJo', () => {
      this.openBujoView(todayIso());
    });

    // command: open today
    this.addCommand({
      id: 'bujo-open-today',
      name: 'Open today',
      callback: () => this.openBujoView(todayIso()),
    });

    // command: open tomorrow
    this.addCommand({
      id: 'bujo-open-tomorrow',
      name: 'Open tomorrow',
      callback: () => this.openBujoView(localIso(nextWorkingDay(new Date(), this.settings))),
    });

    // command: migrate tasks to today (run from anywhere)
    this.addCommand({
      id: 'bujo-migrate-yesterday',
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
      id: 'bujo-quick-capture',
      name: 'Quick capture',
      callback: () => new QuickCaptureModal(this).open(),
    });

    // open BuJo on startup if setting enabled
    if (this.settings.openOnStartup) {
      this.app.workspace.onLayoutReady(() => {
        this.openBujoView(todayIso());
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
        // Use setTimeout to ensure the leaf is fully created
        setTimeout(() => {
          // Find all leaves showing this journal file as markdown
          const leaves = this.app.workspace.getLeavesOfType('markdown');
          for (const leaf of leaves) {
            const mdView = leaf.view as any;
            if (mdView.file && mdView.file.path === file.path) {
              // Close this markdown view
              leaf.detach();
            }
          }
        }, 10);

        // Open BuJo view to this date
        this.openBujoView(date);
      })
    );

  }

  onunload() {
    this.app.workspace.detachLeavesOfType(BUJO_VIEW_TYPE);
  }

  // ── settings ──────────────────────────────────────────────────────────────

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // ── view management ───────────────────────────────────────────────────────

  getBujoView(): BujoView | null {
    const leaves = this.app.workspace.getLeavesOfType(BUJO_VIEW_TYPE);
    if (leaves.length > 0) return leaves[0].view as BujoView;
    return null;
  }

  async openBujoView(date: string) {
    const existing = this.app.workspace.getLeavesOfType(BUJO_VIEW_TYPE);

    if (existing.length > 0) {
      // view already open — navigate to date
      this.app.workspace.revealLeaf(existing[0]);
      const view = existing[0].view as BujoView;
      await view.navigateTo(date);
      return;
    }

    // open in main area as a tab
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: BUJO_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);

    const view = leaf.view as BujoView;
    await view.navigateTo(date);
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
      attr: { type: 'text', placeholder: '. note  , event  or just type a task' },
    });

    input.addEventListener('keydown', async (ev) => {
      if (ev.key === 'Enter' && input.value.trim()) {
        ev.preventDefault();
        await this.capture(input.value.trim());
        this.close();
      }
    });

    // Focus after the modal animation settles
    setTimeout(() => input.focus(), 50);
  }

  onClose() {
    this.contentEl.empty();
  }

  private async capture(raw: string) {
    const { loadDay, saveDay, todayIso } = await import('./DailyNote');
    const { makeId, parseEntryType } = await import('./Parser');

    const today = todayIso();
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
