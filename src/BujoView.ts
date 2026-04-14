import { ItemView, WorkspaceLeaf, App, Notice, Platform } from 'obsidian';
import { BujoSettings, BujoEntry, DailyNote } from './types';
import {
  loadDay, saveDay, migrateToToday, migrateEntry,
  loadRecentDays,
  todayIso, localIso, nextWorkingDay, nextMonday, nextWeekStart,
  firstWorkingDayNextMonth, parseIso,
} from './DailyNote';
import { makeId } from './Parser';

export const BUJO_VIEW_TYPE = 'bujo-daily-view';

// ── helpers ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const fmtLong = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
const fmtShort = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d);

const STATES: Record<string, { sym: string; cls: string }> = {
  todo:      { sym: '○', cls: 'bj-todo' },
  done:      { sym: 'x', cls: 'bj-done' },
  cancelled: { sym: '–', cls: 'bj-cancelled' },
  migrate:   { sym: '›', cls: 'bj-migrate' },
  note:      { sym: '·', cls: 'bj-note' },
  event:     { sym: '◇', cls: 'bj-event' },
};

const CYCLE: Partial<Record<string, string>> = {
  todo: 'done', done: 'cancelled', cancelled: 'todo',
};

// ── view ─────────────────────────────────────────────────────────────────────

export class BujoView extends ItemView {
  public currentDate: string; // Public so main.ts can check it
  private currentNote: DailyNote | null = null;
  private selectedId: string | null = null;
  private deferFor: string | null = null;
  private editingId: string | null = null;
  private recentDays: DailyNote[] = [];
  private clickTimer: ReturnType<typeof setTimeout> | null = null;
  private viewMode: 'journal' | 'calendar' | 'review' = 'journal';
  private calendarMonth: Date = new Date();
  private reviewDays = 7; // How many days to show in review (7-49, step by 7)
  private plugin: import('./main').default;

  /** Always read settings from the plugin so changes are reflected immediately. */
  private get settings(): BujoSettings { return this.plugin.settings; }

  constructor(leaf: WorkspaceLeaf, plugin: import('./main').default) {
    super(leaf);
    this.plugin = plugin;
    this.currentDate = todayIso();
  }

  getViewType() { return BUJO_VIEW_TYPE; }
  getDisplayText() { return 'Daily Log'; }
  getIcon() { return 'book-open'; }

  async onOpen() {
    this.containerEl.addClass('bujo-view');
    this.applyFontClass();
    await this.loadAndRender(this.currentDate);
  }

  async onClose() {
    this.containerEl.empty();
  }

  // ── font class management ──
  private applyFontClass() {
    this.containerEl.toggleClass('bujo-custom-fonts', this.settings.useCustomFonts);
  }

  // ── public API (called from main.ts) ──
  async navigateTo(date: string) {
    this.currentDate = date;
    this.selectedId = null;
    this.deferFor = null;
    this.editingId = null;
    await this.loadAndRender(date);
  }

  // ── load + render cycle ──
  async loadAndRender(date: string) {
    this.currentNote = await loadDay(this.app, date, this.settings);
    this.recentDays = await loadRecentDays(this.app, this.settings, 5);
    await this.render();
  }

  async save() {
    if (!this.currentNote) return;
    await saveDay(this.app, this.currentNote, this.settings);
    // rebuild caches after save
    this.recentDays = await loadRecentDays(this.app, this.settings, 5);
  }

  // ── top-level render ──
  async render() {
    const el = this.containerEl;
    el.empty();
    this.applyFontClass();
    el.createDiv({ cls: 'bujo-layout' }, layout => {
      layout.createDiv({ cls: 'bujo-sidebar', attr: { id: 'bj-sidebar' } });
      layout.createDiv({ cls: 'bujo-main', attr: { id: 'bj-main' } });
    });
    await this.renderSidebar();
    if (this.viewMode === 'calendar') {
      await this.renderCalendar();
    } else if (this.viewMode === 'review') {
      await this.renderReview();
    } else {
      this.renderMain();
    }
  }

  // ── sidebar ──
  private async renderSidebar() {
    const el = this.containerEl.querySelector('#bj-sidebar') as HTMLElement;
    if (!el) return;
    el.empty();

    const today = todayIso();
    const todayDate = new Date();
    const nwd = localIso(nextWorkingDay(todayDate, this.settings));
    const nextWk = localIso(nextWeekStart(todayDate, this.settings));
    const nextMonth = localIso(firstWorkingDayNextMonth(todayDate, this.settings));

    // ── view switcher ──
    const viewSwitcher = el.createDiv({ cls: 'bj-view-switcher' });
    viewSwitcher.createSpan({
      cls: `bj-view-btn${this.viewMode === 'journal' ? ' active' : ''}`,
      text: 'Journal'
    }).addEventListener('click', async () => {
      this.viewMode = 'journal';
      await this.render();
    });
    viewSwitcher.createSpan({
      cls: `bj-view-btn${this.viewMode === 'calendar' ? ' active' : ''}`,
      text: 'Calendar'
    }).addEventListener('click', async () => {
      this.viewMode = 'calendar';
      await this.render();
    });

    // ── section switcher (Recent / Review) ──
    const sectionSwitcher = el.createDiv({ cls: 'bj-view-switcher' });
    sectionSwitcher.createSpan({
      cls: `bj-view-btn${this.viewMode === 'journal' ? ' active' : ''}`,
      text: 'Recent'
    }).addEventListener('click', async () => {
      if (this.viewMode !== 'journal') {
        this.viewMode = 'journal';
        await this.render();
      }
    });
    sectionSwitcher.createSpan({
      cls: `bj-view-btn${this.viewMode === 'review' ? ' active' : ''}`,
      text: 'Review'
    }).addEventListener('click', async () => {
      if (this.viewMode !== 'review') {
        this.viewMode = 'review';
        await this.render();
      }
    });

    // ── journal days ──
    if (this.viewMode === 'journal') {
      // today
      await this.renderDayItem(el, today, today, nwd, nextWk, nextMonth);
      // recent past days with todos (cached)
      for (const note of this.recentDays) {
        await this.renderDayItem(el, note.date, today, nwd, nextWk, nextMonth);
      }

      // separator
      el.createDiv({ cls: 'bj-section-divider' });
      el.createDiv({ cls: 'bj-section-label', text: 'Future' });

      // tomorrow
      await this.renderDayItem(el, nwd, today, nwd, nextWk, nextMonth);
      // next week start
      await this.renderDayItem(el, nextWk, today, nwd, nextWk, nextMonth);
      // next month
      await this.renderDayItem(el, nextMonth, today, nwd, nextWk, nextMonth);
    }

    // ── legend ──
    const legendLabel = el.createDiv({ cls: 'bj-section-label bj-legend-label' });
    legendLabel.setText('Legend');
    const tips: Record<string, string> = {
      todo: 'open task', done: 'completed', cancelled: 'cancelled',
      migrate: 'migrated to another day', note: 'note — non-actionable',
      event: 'something happening on this date',
    };
    for (const [type, { sym }] of Object.entries(STATES)) {
      const row = el.createDiv({ cls: 'bj-legend-row', attr: { title: tips[type] } });
      row.createSpan({ cls: `bj-sym bj-${type}`, text: sym });
      const displayName = type === 'migrate' ? 'migrated' : type;
      row.createSpan({ text: displayName });
    }
  }

  private async renderDayItem(
    parent: HTMLElement,
    date: string,
    today: string,
    nwd: string,
    nextWk: string,
    nextMonth: string,
  ) {
    const note = await loadDay(this.app, date, this.settings);
    const open = note.entries.filter(e => e.type === 'todo').length;
    const done = note.entries.filter(e => e.type === 'done').length;
    const isActive = date === this.currentDate;

    const item = parent.createDiv({ cls: `bj-day-item${isActive ? ' active' : ''}` });
    const nameRow = item.createDiv({ cls: 'bj-day-name' });
    nameRow.createSpan({ text: fmtShort(parseIso(date)) });
    if (date === today) nameRow.createSpan({ cls: 'bj-pill', text: 'today' });
    if (date === nwd)   nameRow.createSpan({ cls: 'bj-pill bj-pill-muted', text: 'tomorrow' });
    if (date === nextWk) {
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const weekStartName = dayNames[this.settings.startOfWeek];
      nameRow.createSpan({ cls: 'bj-pill bj-pill-muted', text: weekStartName });
    }
    if (date === nextMonth) nameRow.createSpan({ cls: 'bj-pill bj-pill-muted', text: 'next month' });
    item.createDiv({ cls: 'bj-day-meta', text: `${done} done · ${open} open` });

    item.addEventListener('click', () => {
      this.navigateTo(date);
    });
  }

  // ── main journal view ──
  private renderMain() {
    const el = this.containerEl.querySelector('#bj-main') as HTMLElement;
    if (!el) return;
    el.empty();

    const note = this.currentNote;
    if (!note) return;

    const today = todayIso();
    const isToday = note.date === today;
    const open = note.entries.filter(e => e.type === 'todo').length;
    const done = note.entries.filter(e => e.type === 'done').length;

    // header
    const hdr = el.createDiv({ cls: 'bj-header' });
    const headerLeft = hdr.createDiv({ cls: 'bj-header-left' });
    headerLeft.createDiv({ cls: 'bj-date', text: fmtLong(parseIso(note.date)) });
    headerLeft.createDiv({ cls: 'bj-stats', text: `${open} open · ${done} done · ${note.entries.length} total` });

    const actions = hdr.createDiv({ cls: 'bj-actions' });

    // Open file button
    const openFileBtn = actions.createEl('button', {
      cls: 'bj-btn bj-btn-sm',
      text: '📄 Open file',
      attr: { title: 'Open daily note in editor' }
    });
    openFileBtn.addEventListener('click', async () => {
      const file = this.app.vault.getAbstractFileByPath(note.path);
      if (file) {
        // Set flag to allow this file to open normally
        this.plugin.isOpeningFromBujo = true;
        await this.app.workspace.getLeaf(false).openFile(file as any);
      }
    });

    // migration banner
    const isPast = note.date < today;
    if (isPast && open > 0) {
      const banner = el.createDiv({ cls: 'bj-banner' });
      banner.createSpan({ text: `${open} open task${open === 1 ? '' : 's'} from ${fmtShort(parseIso(note.date))} — migrate to today?` });
      banner.createEl('button', { cls: 'bj-btn bj-btn-accent bj-btn-sm', text: 'Migrate → today' })
        .addEventListener('click', () => this.doMigrateAll());
    }

    // entries
    const list = el.createDiv({ cls: 'bj-entries', attr: { tabindex: '0' } });
    this.renderEntries(list, note.entries);

    // click on empty area deselects
    list.addEventListener('click', (ev) => {
      if (ev.target === list) {
        this.selectedId = null;
        this.editingId = null;
        this.deferFor = null;
        this.renderMain();
      }
    });

    // keyboard bar
    const kbdBar = el.createDiv({ cls: 'bj-kbd-bar' });
    const modKey = Platform.isMacOS ? 'Opt' : 'Alt';
    [['↑↓', 'nav'], [`${modKey}+↑↓`, 'reorder'], ['␣', 'cycle'], ['Enter', 'edit'], ['d', 'done'], ['c', 'cancel'], ['o', 'reopen'],
     ['m/>', 'migrate'], ['x', 'delete'], ['n', 'new'], ['r', 'review'], ['Esc', 'deselect']].forEach(([k, label]) => {
      const hint = kbdBar.createSpan({ cls: 'bj-kbd-hint' });
      hint.createEl('kbd', { text: k });
      if (label) hint.appendText(` ${label}`);
    });

    // input row
    const inputRow = el.createDiv({ cls: 'bj-input-row' });
    const symEl = inputRow.createSpan({ cls: 'bj-input-sym', text: '○' });
    const input = inputRow.createEl('input', {
      cls: 'bj-input',
      attr: { placeholder: '. note  , event  [[Link]]  #tag  or just type a task' },
    });
    input.addEventListener('input', () => {
      const v = input.value;
      symEl.setText(v.startsWith('. ') ? '·' : v.startsWith(', ') ? '◇' : '○');
    });
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); this.addEntry(input.value); input.value = ''; symEl.setText('○'); }
      if (ev.key === 'Escape') input.blur();
    });
    inputRow.createEl('button', { cls: 'bj-btn', text: 'Add' })
      .addEventListener('click', () => { this.addEntry(input.value); input.value = ''; symEl.setText('○'); });

    // keyboard nav
    list.addEventListener('keydown', (ev) => this.handleKeydown(ev, input));
    list.focus();
  }

  // ── calendar view ──
  private async renderCalendar() {
    const el = this.containerEl.querySelector('#bj-main') as HTMLElement;
    if (!el) return;
    el.empty();

    const content = el.createDiv({ cls: 'bj-calendar-view' });
    const today = todayIso();
    const year = this.calendarMonth.getFullYear();
    const month = this.calendarMonth.getMonth();

    // Header with month/year and navigation
    const header = content.createDiv({ cls: 'bj-cal-header' });
    header.createEl('button', { cls: 'bj-btn bj-btn-sm', text: '‹' })
      .addEventListener('click', async () => {
        this.calendarMonth = new Date(year, month - 1, 1);
        await this.render();
      });
    header.createDiv({
      cls: 'bj-cal-title',
      text: new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(this.calendarMonth)
    });
    header.createEl('button', { cls: 'bj-btn bj-btn-sm', text: '›' })
      .addEventListener('click', async () => {
        this.calendarMonth = new Date(year, month + 1, 1);
        await this.render();
      });

    // Weekday headers
    const grid = content.createDiv({ cls: 'bj-cal-grid' });
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (const day of weekdays) {
      grid.createDiv({ cls: 'bj-cal-weekday', text: day });
    }

    // Calculate first day of month (0=Sun, 1=Mon, etc.)
    const firstDay = new Date(year, month, 1);
    let firstWeekday = firstDay.getDay(); // 0=Sun
    firstWeekday = firstWeekday === 0 ? 6 : firstWeekday - 1; // Convert to 0=Mon

    // Days in current month
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Previous month padding
    for (let i = 0; i < firstWeekday; i++) {
      grid.createDiv({ cls: 'bj-cal-day bj-cal-empty' });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = localIso(date);
      const note = await loadDay(this.app, dateStr, this.settings);
      const openCount = note.entries.filter(e => e.type === 'todo').length;
      const doneCount = note.entries.filter(e => e.type === 'done').length;
      const eventCount = note.entries.filter(e => e.type === 'event').length;
      const noteCount = note.entries.filter(e => e.type === 'note').length;

      const isToday = dateStr === today;
      const isViewing = dateStr === this.currentDate;

      const cell = grid.createDiv({
        cls: `bj-cal-day${isToday ? ' bj-cal-today' : ''}${isViewing ? ' bj-cal-viewing' : ''}`
      });
      cell.createDiv({ cls: 'bj-cal-day-num', text: String(day) });

      if (openCount > 0 || doneCount > 0 || eventCount > 0 || noteCount > 0) {
        const counts = cell.createDiv({ cls: 'bj-cal-counts' });
        if (openCount > 0) counts.createSpan({ cls: 'bj-cal-open', text: `○${openCount}` });
        if (doneCount > 0) counts.createSpan({ cls: 'bj-cal-done', text: `x${doneCount}` });
        if (eventCount > 0) counts.createSpan({ cls: 'bj-cal-event', text: `◇${eventCount}` });
        if (noteCount > 0) counts.createSpan({ cls: 'bj-cal-note', text: `·${noteCount}` });
      }

      cell.addEventListener('click', () => {
        this.viewMode = 'journal';
        this.navigateTo(dateStr);
      });
    }
  }

  // ── review view ──
  private async renderReview() {
    const el = this.containerEl.querySelector('#bj-main') as HTMLElement;
    if (!el) return;
    el.empty();

    const today = new Date();
    const days: Array<{ date: string; note: DailyNote }> = [];

    // Load days based on reviewDays setting
    for (let i = 0; i < this.reviewDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = localIso(d);
      const note = await loadDay(this.app, dateStr, this.settings);
      days.push({ date: dateStr, note });
    }

    // Calculate totals across all days
    let totalTodo = 0;
    let totalDone = 0;
    let totalCancelled = 0;
    let totalMigrated = 0;

    for (const { note } of days) {
      totalTodo += note.entries.filter(e => e.type === 'todo').length;
      totalDone += note.entries.filter(e => e.type === 'done').length;
      totalCancelled += note.entries.filter(e => e.type === 'cancelled').length;
      totalMigrated += note.entries.filter(e => e.type === 'migrate').length;
    }

    // Header
    const header = el.createDiv({ cls: 'bj-header bj-review-header' });
    const headerLeft = header.createDiv({ cls: 'bj-header-left' });
    headerLeft.createDiv({ cls: 'bj-date', text: 'Review' });

    // Overall totals
    const totals = headerLeft.createDiv({ cls: 'bj-review-totals' });
    totals.createSpan({ cls: 'bj-review-total bj-done', text: `${totalDone} done` });
    totals.createSpan({ cls: 'bj-review-total bj-todo', text: `${totalTodo} open` });
    totals.createSpan({ cls: 'bj-review-total bj-cancelled', text: `${totalCancelled} cancelled` });
    totals.createSpan({ cls: 'bj-review-total bj-migrate', text: `${totalMigrated} migrated` });

    // Controls
    const controls = header.createDiv({ cls: 'bj-review-controls' });

    // - button (decrease by 7 days, min 7)
    const minusBtn = controls.createEl('button', {
      cls: 'bj-btn bj-btn-sm',
      text: '−',
      attr: { title: 'Show fewer days (-7)' }
    });
    if (this.reviewDays <= 7) minusBtn.disabled = true;
    minusBtn.addEventListener('click', async () => {
      if (this.reviewDays > 7) {
        this.reviewDays -= 7;
        await this.render();
      }
    });

    // Days label
    controls.createSpan({ cls: 'bj-review-days-label', text: `${this.reviewDays} days` });

    // + button (increase by 7 days, max 49)
    const plusBtn = controls.createEl('button', {
      cls: 'bj-btn bj-btn-sm',
      text: '+',
      attr: { title: 'Show more days (+7)' }
    });
    if (this.reviewDays >= 49) plusBtn.disabled = true;
    plusBtn.addEventListener('click', async () => {
      if (this.reviewDays < 49) {
        this.reviewDays += 7;
        await this.render();
      }
    });

    // Content (more compact)
    const content = el.createDiv({ cls: 'bj-review-content' });

    for (const { date, note } of days) {
      if (note.entries.length === 0) continue;

      const daySection = content.createDiv({ cls: 'bj-review-day' });

      // Day header with stats (compact)
      const dayHeader = daySection.createDiv({ cls: 'bj-review-day-header' });

      const open = note.entries.filter(e => e.type === 'todo').length;
      const done = note.entries.filter(e => e.type === 'done').length;
      const cancelled = note.entries.filter(e => e.type === 'cancelled').length;
      const migrated = note.entries.filter(e => e.type === 'migrate').length;

      const headerLeft = dayHeader.createDiv({ cls: 'bj-review-day-left' });

      const dateLabel = headerLeft.createSpan({ cls: 'bj-review-day-label' });
      dateLabel.setText(fmtShort(parseIso(date)));

      const stats = headerLeft.createSpan({ cls: 'bj-review-day-stats' });
      stats.setText(`${done}✓ ${open}○ ${cancelled}⊗ ${migrated}›`);

      // Migrate button for past days with open todos
      const isPast = date < todayIso();
      if (isPast && open > 0) {
        const migrateBtn = dayHeader.createEl('button', {
          cls: 'bj-btn bj-btn-sm bj-review-migrate-btn',
          text: '→ today'
        });
        migrateBtn.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const { migrateToToday } = await import('./DailyNote');
          const { migrated } = await migrateToToday(this.app, date, this.settings);
          new Notice(migrated > 0
            ? `${migrated} task${migrated === 1 ? '' : 's'} migrated to today ›`
            : 'No open tasks to migrate.'
          );
          // Refresh review
          await this.render();
        });
      }

      // Entries for this day
      const entriesList = daySection.createDiv({ cls: 'bj-review-entries' });
      for (const entry of note.entries) {
        this.renderEntry(entriesList, entry);
      }

      // Click day header to navigate to that day
      dayHeader.addClass('bj-clickable');
      dayHeader.addEventListener('click', async (ev) => {
        // Don't navigate if clicking the migrate button
        if ((ev.target as HTMLElement).classList.contains('bj-review-migrate-btn')) return;
        this.viewMode = 'journal';
        await this.navigateTo(date);
      });
    }

    // Keyboard nav for review
    content.setAttribute('tabindex', '0');
    content.addEventListener('keydown', (ev) => this.handleKeydown(ev, null));
    content.focus();
  }

  // ── render entries ──
  private renderEntries(container: HTMLElement, entries: BujoEntry[]) {
    container.empty();
    if (entries.length === 0) {
      container.createDiv({ cls: 'bj-empty', text: 'No entries yet — add one below.' });
      return;
    }
    for (const entry of entries) {
      this.renderEntry(container, entry);
      if (this.deferFor === entry.id && entry.type === 'todo') {
        this.renderDeferPanel(container, entry);
      }
    }
  }

  private renderEntry(parent: HTMLElement, entry: BujoEntry) {
    const st = STATES[entry.type] ?? STATES.note;
    const canCycle = !!CYCLE[entry.type];
    const canDel = entry.type === 'cancelled' || entry.type === 'note' || entry.type === 'event';
    const isSel = entry.id === this.selectedId;
    const isEditing = entry.id === this.editingId;

    const row = parent.createDiv({ cls: `bj-entry${isSel ? ' selected' : ''}`, attr: { 'data-id': entry.id } });

    // bullet
    const bullet = row.createSpan({ cls: `bj-bullet${canCycle ? '' : ' fixed'}`, text: st.sym });
    bullet.addClass(`bj-${entry.type}`);
    bullet.addEventListener('click', (ev) => { ev.stopPropagation(); this.cycleEntry(entry.id); });

    // body
    const body = row.createDiv({ cls: 'bj-entry-body' });

    if (isEditing) {
      const inp = body.createEl('input', { cls: 'bj-entry-edit', attr: { value: entry.text } });
      inp.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); this.commitEdit(entry.id, inp.value); }
        if (ev.key === 'Escape') { this.editingId = null; this.renderMain(); }
        ev.stopPropagation();
      });
      inp.addEventListener('blur', () => this.commitEdit(entry.id, inp.value));
      inp.addEventListener('click', ev => ev.stopPropagation());
      setTimeout(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 0);
    } else {
      const textSpan = body.createSpan({ cls: `bj-entry-text bj-${entry.type}` });
      this.renderInlineText(textSpan, entry.text);
      if (entry.fromDate) {
        const fromTag = textSpan.createSpan({ cls: 'bj-from-tag', text: ` ↳ ${fmtShort(parseIso(entry.fromDate))}` });
        fromTag.addClass('bj-clickable');
        fromTag.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.navigateTo(entry.fromDate!);
        });
      }
      if (entry.toDate) {
        const toTag = textSpan.createSpan({ cls: 'bj-to-tag', text: ` → ${fmtShort(parseIso(entry.toDate))}` });
        toTag.addClass('bj-clickable');
        toTag.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.navigateTo(entry.toDate!);
        });
      }

      // click/dblclick on body
      body.addClass('bj-clickable');
      body.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if ((ev.target as HTMLElement).closest('.bj-link,.bj-tag-pill,.bj-entry-edit')) return;
        if (this.clickTimer) { clearTimeout(this.clickTimer); this.clickTimer = null; return; }
        this.clickTimer = setTimeout(() => {
          this.clickTimer = null;
          this.editingId = entry.id; this.selectedId = entry.id; this.deferFor = null;
          this.renderMain();
        }, 220);
      });
      body.addEventListener('dblclick', (ev) => {
        ev.stopPropagation();
        if ((ev.target as HTMLElement).closest('.bj-link,.bj-tag-pill')) return;
        if (this.clickTimer) { clearTimeout(this.clickTimer); this.clickTimer = null; }
        if (entry.type !== 'todo') return;
        this.deferFor = entry.id; this.editingId = null; this.selectedId = entry.id;
        this.renderMain();
      });
    }

    if (canDel) {
      const del = row.createSpan({ cls: 'bj-del-btn', text: '✕', attr: { title: 'Delete (x)' } });
      del.addEventListener('click', (ev) => { ev.stopPropagation(); this.deleteEntry(entry.id); });
    }

    // row click → select
    row.addEventListener('click', () => { this.selectedId = entry.id; this.renderMain(); });
  }

  private renderInlineText(parent: HTMLElement, text: string) {
    // parse [[links]], [text](url), #tags, plain text — split into tokens
    const tokenRe = /(\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\)|(?:^|\s)#[a-zA-Z][a-zA-Z0-9_-]*)/g;
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = tokenRe.exec(text)) !== null) {
      // plain text before this token
      if (m.index > last) parent.appendText(text.slice(last, m.index));

      const token = m[0].trimStart();
      const leadingSpace = m[0].length - token.length;
      if (leadingSpace > 0) parent.appendText(' ');

      if (token.startsWith('[[')) {
        // wikilink
        const name = token.slice(2, -2);
        const link = parent.createSpan({ cls: 'bj-link', text: name, attr: { title: `Go to: ${name}` } });
        link.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (this.clickTimer) { clearTimeout(this.clickTimer); this.clickTimer = null; }
          this.app.workspace.openLinkText(name, '', false);
        });
      } else if (token.startsWith('[')) {
        // markdown link
        const lm = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (lm) {
          const [, label, target] = lm;
          const isUrl = /^https?:\/\//.test(target);
          const link = parent.createSpan({ cls: 'bj-link', text: label, attr: { title: isUrl ? target : `Go to: ${target}` } });
          link.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (this.clickTimer) { clearTimeout(this.clickTimer); this.clickTimer = null; }
            if (isUrl) window.open(target, '_blank');
            else this.app.workspace.openLinkText(target, '', false);
          });
        }
      } else if (token.startsWith('#')) {
        // tag - open Obsidian's search
        const pill = parent.createSpan({ cls: 'bj-tag-pill', text: token });
        pill.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (this.clickTimer) { clearTimeout(this.clickTimer); this.clickTimer = null; }
          // Open Obsidian's search for this tag
          (this.app as any).internalPlugins.getPluginById('global-search')?.instance.openGlobalSearch(`tag:${token}`);
        });
      }

      last = m.index + m[0].length;
    }

    if (last < text.length) parent.appendText(text.slice(last));
  }

  // ── defer/migrate panel ──
  private renderDeferPanel(parent: HTMLElement, entry: BujoEntry) {
    const today = new Date();
    const tomorrowDate = localIso(nextWorkingDay(today, this.settings));
    const weekStartDate = localIso(nextWeekStart(today, this.settings));
    const nextMonthDate = localIso(firstWorkingDayNextMonth(today, this.settings));
    const min = localIso(new Date(Date.now() + 86400000));

    // Determine shortcuts based on start of week
    const startOfWeek = this.settings.startOfWeek;
    const isTuesdayOrThursday = startOfWeek === 2 || startOfWeek === 4;
    const tomorrowKey = isTuesdayOrThursday ? 'd' : 't';
    const tomorrowLabel = isTuesdayOrThursday ? 'day' : 'tomorrow';

    // Get week start day name and shortcut
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayShortcuts = ['s', 'm', 't', 'w', 'r', 'f', 's'];
    const weekStartName = dayNames[startOfWeek];
    const weekStartKey = dayShortcuts[startOfWeek];

    const panel = parent.createDiv({ cls: 'bj-defer-panel' });
    const lbl = entry.text.length > 38 ? entry.text.slice(0, 38) + '…' : entry.text;
    panel.createDiv({ cls: 'bj-defer-label', text: `Migrate "${lbl}" to…` });

    const quick = panel.createDiv({ cls: 'bj-defer-quick' });

    // Tomorrow button
    const tomorrowBtn = quick.createEl('button', { cls: 'bj-btn bj-btn-sm' });
    tomorrowBtn.createEl('u', { text: tomorrowKey });
    tomorrowBtn.appendText(tomorrowLabel.slice(1));
    tomorrowBtn.addEventListener('click', () => this.doMigrateEntry(entry, tomorrowDate));

    // Next week start button
    const weekStartBtn = quick.createEl('button', { cls: 'bj-btn bj-btn-sm' });
    weekStartBtn.createEl('u', { text: weekStartKey });
    weekStartBtn.appendText(weekStartName.slice(1).toLowerCase());
    weekStartBtn.addEventListener('click', () => this.doMigrateEntry(entry, weekStartDate));

    // Next month button
    const nextMonthBtn = quick.createEl('button', { cls: 'bj-btn bj-btn-sm' });
    nextMonthBtn.createEl('u', { text: 'n' });
    nextMonthBtn.appendText('ext month');
    nextMonthBtn.addEventListener('click', () => this.doMigrateEntry(entry, nextMonthDate));

    const row = panel.createDiv({ cls: 'bj-defer-row' });
    row.createSpan({ cls: 'bj-hint', text: 'or pick' });
    const dateInput = row.createEl('input', { cls: 'bj-date-input', type: 'date', attr: { min, value: min } });
    dateInput.addEventListener('change', () => { if (dateInput.value) this.doMigrateEntry(entry, dateInput.value); });
    const cancelBtn = row.createEl('button', { cls: 'bj-btn bj-btn-sm' });
    cancelBtn.createEl('u', { text: 'c' });
    cancelBtn.appendText('ancel');
    cancelBtn.addEventListener('click', () => { this.deferFor = null; this.renderMain(); });
  }

  // ── actions ──
  private async cycleEntry(id: string) {
    if (!this.currentNote) return;
    this.currentNote.entries = this.currentNote.entries.map(e => {
      if (e.id !== id) return e;
      const nxt = CYCLE[e.type];
      return nxt ? { ...e, type: nxt as BujoEntry['type'] } : e;
    });
    await this.save();
    await this.render();
  }

  private async deleteEntry(id: string) {
    if (!this.currentNote) return;
    this.currentNote.entries = this.currentNote.entries.filter(e => e.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    await this.save();
    new Notice('Entry deleted.');
    await this.render();
  }

  private async commitEdit(id: string, value: string) {
    const v = value.trim();
    if (!this.currentNote || !v) { this.editingId = null; this.renderMain(); return; }
    this.currentNote.entries = this.currentNote.entries.map(e =>
      e.id === id ? { ...e, text: v } : e
    );
    this.editingId = null;
    await this.save();
    await this.render();
  }

  private async addEntry(raw: string) {
    const text = raw.trim();
    if (!text || !this.currentNote) return;
    let type: BujoEntry['type'] = 'todo';
    let entryText = text;
    if (text.startsWith('. ')) { type = 'note'; entryText = text.slice(2); }
    else if (text.startsWith(', ')) { type = 'event'; entryText = text.slice(2); }
    this.currentNote.entries.push({ id: makeId(), type, text: entryText });
    await this.save();
    await this.render();
  }

  private async doMigrateAll() {
    if (!this.currentNote) return;
    const fromDate = this.currentNote.date;
    const { migrated } = await migrateToToday(this.app, fromDate, this.settings);
    new Notice(`${migrated} task${migrated === 1 ? '' : 's'} migrated to today ›`);
    // Navigate to today - this will reload both notes from disk with correct state
    await this.navigateTo(todayIso());
  }

  private async doMigrateEntry(entry: BujoEntry, toDate: string) {
    if (!this.currentNote) return;
    const fromDate = this.currentNote.date;
    await migrateEntry(this.app, entry, fromDate, toDate, this.settings);
    this.deferFor = null;
    const toD = parseIso(toDate);
    new Notice(`Migrated to ${fmtShort(toD)} ›`);
    // Reload from disk to get the correct state
    if (toDate === todayIso()) await this.navigateTo(todayIso());
    else await this.loadAndRender(fromDate);
  }

  // ── keyboard ──
  private async handleKeydown(ev: KeyboardEvent, input: HTMLInputElement | null) {
    // if the new-entry input is focused, only intercept Escape
    if (input && document.activeElement === input) {
      if (ev.key === 'Escape') { input.blur(); input.value = ''; }
      return;
    }

    // if an inline edit input is active, Enter commits, Escape cancels
    const activeEdit = document.activeElement as HTMLElement;
    if (activeEdit?.classList.contains('bj-entry-edit')) {
      // handled inside renderEntry's own keydown listener — don't double-fire
      return;
    }

    const entries = this.currentNote?.entries ?? [];
    const ids = entries.map(e => e.id);
    const idx = ids.indexOf(this.selectedId ?? '');

    // Alt+↑/↓ — reorder entries
    if (ev.altKey && this.selectedId && this.currentNote) {
      if (ev.key === 'ArrowUp' && idx > 0) {
        ev.preventDefault();
        // Swap with previous entry
        const temp = this.currentNote.entries[idx];
        this.currentNote.entries[idx] = this.currentNote.entries[idx - 1];
        this.currentNote.entries[idx - 1] = temp;
        await this.save();
        await this.render();
        this.containerEl.querySelector('.bj-entry.selected')?.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (ev.key === 'ArrowDown' && idx >= 0 && idx < entries.length - 1) {
        ev.preventDefault();
        // Swap with next entry
        const temp = this.currentNote.entries[idx];
        this.currentNote.entries[idx] = this.currentNote.entries[idx + 1];
        this.currentNote.entries[idx + 1] = temp;
        await this.save();
        await this.render();
        this.containerEl.querySelector('.bj-entry.selected')?.scrollIntoView({ block: 'nearest' });
        return;
      }
    }

    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      this.selectedId = ids[idx < 0 ? 0 : Math.min(idx + 1, ids.length - 1)];
      this.deferFor = null; this.editingId = null; this.renderMain();
      this.containerEl.querySelector('.bj-entry.selected')?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      this.selectedId = ids[idx < 0 ? ids.length - 1 : Math.max(idx - 1, 0)];
      this.deferFor = null; this.editingId = null; this.renderMain();
      this.containerEl.querySelector('.bj-entry.selected')?.scrollIntoView({ block: 'nearest' });
      return;
    }

    // Enter — toggle edit on selected entry
    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (this.selectedId) {
        if (this.editingId === this.selectedId) {
          // already editing — commit (find the live input and trigger commit)
          const liveInput = this.containerEl.querySelector('.bj-entry-edit') as HTMLInputElement | null;
          if (liveInput) this.commitEdit(this.selectedId, liveInput.value);
        } else {
          // enter edit mode on selected entry
          this.editingId = this.selectedId;
          this.deferFor = null;
          this.renderMain();
        }
      }
      return;
    }

    // n — focus the new entry input (only if not already in an input/textarea)
    if (ev.key === 'n' && !ev.ctrlKey && !ev.metaKey && input) {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        return; // don't intercept if typing in an input field
      }
      ev.preventDefault();
      input.focus();
      return;
    }

    // r — open review (only if not in an input field)
    if (ev.key === 'r' && !ev.ctrlKey && !ev.metaKey) {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        return; // don't intercept if typing in an input field
      }
      ev.preventDefault();
      this.viewMode = 'review';
      await this.render();
      return;
    }

    if (ev.key === 'Escape') {
      // If in review mode, go back to journal
      if (this.viewMode === 'review') {
        ev.preventDefault();
        this.viewMode = 'journal';
        await this.navigateTo(todayIso());
        return;
      }
      // Otherwise clear selection and edit state
      this.selectedId = null; this.deferFor = null; this.editingId = null;
      this.renderMain();
      return;
    }

    // migrate panel shortcuts
    if (this.deferFor) {
      const entry = entries.find(e => e.id === this.deferFor);
      if (entry && entry.type === 'todo') {
        const today = new Date();
        const startOfWeek = this.settings.startOfWeek;
        const isTuesdayOrThursday = startOfWeek === 2 || startOfWeek === 4;
        const tomorrowKey = isTuesdayOrThursday ? 'd' : 't';
        const dayShortcuts = ['s', 'm', 't', 'w', 'r', 'f', 's'];
        const weekStartKey = dayShortcuts[startOfWeek];

        // Tomorrow shortcut
        if (ev.key === tomorrowKey) {
          ev.preventDefault();
          this.doMigrateEntry(entry, localIso(nextWorkingDay(today, this.settings)));
          return;
        }

        // Next week start shortcut
        if (ev.key === weekStartKey) {
          ev.preventDefault();
          this.doMigrateEntry(entry, localIso(nextWeekStart(today, this.settings)));
          return;
        }

        // Next month
        if (ev.key === 'n') {
          ev.preventDefault();
          this.doMigrateEntry(entry, localIso(firstWorkingDayNextMonth(today, this.settings)));
          return;
        }

        // Cancel
        if (ev.key === 'c') {
          ev.preventDefault();
          this.deferFor = null;
          this.renderMain();
          return;
        }
      }
    }

    if (!this.selectedId || ev.ctrlKey || ev.metaKey) return;
    const entry = entries.find(e => e.id === this.selectedId);
    if (!entry) return;

    if (ev.key === ' ' && CYCLE[entry.type]) { ev.preventDefault(); this.cycleEntry(entry.id); }
    if (ev.key === 'd' && CYCLE[entry.type]) { ev.preventDefault(); this.cycleEntry(entry.id); }
    if (ev.key === 'c' && CYCLE[entry.type]) {
      ev.preventDefault();
      if (!this.currentNote) return;
      this.currentNote.entries = this.currentNote.entries.map(e =>
        e.id === entry.id ? { ...e, type: 'cancelled' } : e
      );
      await this.save();
      await this.render();
    }
    if (ev.key === 'o' && entry.type === 'cancelled') {
      ev.preventDefault();
      if (!this.currentNote) return;
      this.currentNote.entries = this.currentNote.entries.map(e =>
        e.id === entry.id ? { ...e, type: 'todo' } : e
      );
      await this.save();
      await this.render();
    }
    if ((ev.key === 'm' || ev.key === '>') && entry.type === 'todo') {
      ev.preventDefault(); this.deferFor = entry.id; this.editingId = null; this.renderMain();
    }
    if ((ev.key === 'x' || ev.key === 'Delete') && (entry.type === 'cancelled' || entry.type === 'note' || entry.type === 'event')) {
      ev.preventDefault(); this.deleteEntry(entry.id);
    }
  }
}
