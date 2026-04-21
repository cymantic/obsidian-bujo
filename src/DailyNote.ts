import { App, TFile, normalizePath } from 'obsidian';
import { BujoEntry, BujoSettings, DailyNote } from './types';
import { parse, replaceEntryBlock, makeId } from './Parser';

// ── date utils ───────────────────────────────────────────────────────────────

export function todayIso(): string {
  const d = new Date();
  return localIso(d);
}

export function localIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Helper: convert JS day (0=Sun, 1=Mon, ..., 6=Sat) to workingDays index (0=Mon, ..., 6=Sun)
function isWorkingDay(date: Date, workingDays: boolean[]): boolean {
  const jsDay = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const wdIndex = (jsDay + 6) % 7; // Convert to 0=Mon, ..., 6=Sun
  return workingDays[wdIndex];
}

export function nextWorkingDay(from: Date | undefined, settings: BujoSettings): Date {
  const d = new Date(from ?? new Date());
  do { d.setDate(d.getDate() + 1); } while (!isWorkingDay(d, settings.workingDays));
  return d;
}

export function nextMonday(from?: Date): Date {
  const d = new Date(from ?? new Date());
  const dw = d.getDay();
  d.setDate(d.getDate() + (dw === 0 ? 1 : 8 - dw));
  return d;
}

export function nextWeekStart(from: Date | undefined, settings: BujoSettings): Date {
  const d = new Date(from ?? new Date());
  const current = d.getDay();
  const target = settings.startOfWeek;

  // Calculate days until next occurrence of target day
  let daysUntil = (target - current + 7) % 7;
  if (daysUntil === 0) daysUntil = 7; // If today is the start of week, go to next week

  d.setDate(d.getDate() + daysUntil);
  return d;
}

export function firstWorkingDayNextMonth(from: Date | undefined, settings: BujoSettings): Date {
  const d = new Date(from ?? new Date());
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  while (!isWorkingDay(next, settings.workingDays)) next.setDate(next.getDate() + 1);
  return next;
}

// ── path helpers ─────────────────────────────────────────────────────────────

export function notePathForDate(date: string, settings: BujoSettings): string {
  return normalizePath(`${settings.journalFolder}/${date}.md`);
}

/** Return markdown files inside the journal folder without scanning the entire vault. */
function journalFiles(app: App, settings: BujoSettings): TFile[] {
  const folder = app.vault.getFolderByPath(normalizePath(settings.journalFolder));
  if (!folder) return [];
  return folder.children.filter((f): f is TFile => f instanceof TFile && f.extension === 'md');
}

// ── load ─────────────────────────────────────────────────────────────────────

export async function loadDay(
  app: App,
  date: string,
  settings: BujoSettings,
): Promise<DailyNote> {
  const path = notePathForDate(date, settings);
  const file = app.vault.getAbstractFileByPath(path);

  if (file instanceof TFile) {
    const content = await app.vault.read(file);
    return { date, path, entries: parse(content) };
  }

  // File doesn't exist yet — return empty note (don't create file until first save)
  return { date, path, entries: [] };
}

// ── save ─────────────────────────────────────────────────────────────────────

export async function saveDay(
  app: App,
  note: DailyNote,
  settings: BujoSettings,
): Promise<void> {
  const path = notePathForDate(note.date, settings);
  const file = app.vault.getAbstractFileByPath(path);

  if (file instanceof TFile) {
    await app.vault.process(file, (content) =>
      replaceEntryBlock(content, note.entries, note.date)
    );
  } else {
    // Create file — ensure folder exists first
    const folder = settings.journalFolder;
    if (!app.vault.getAbstractFileByPath(folder)) {
      await app.vault.createFolder(folder);
    }
    const { replaceEntryBlock: reb } = await import('./Parser');
    const content = reb('', note.entries, note.date);
    await app.vault.create(path, content);
  }
}

// ── migrate all open todos from a day to today ───────────────────────────────

export async function migrateToToday(
  app: App,
  fromDate: string,
  settings: BujoSettings,
): Promise<{ migrated: number }> {
  const today = todayIso();
  if (fromDate === today) return { migrated: 0 };

  const source = await loadDay(app, fromDate, settings);
  const target = await loadDay(app, today, settings);

  const openTodos = source.entries.filter(e => e.type === 'todo');
  if (openTodos.length === 0) return { migrated: 0 };

  // stamp source entries as migrated with toDate
  source.entries = source.entries.map(e =>
    e.type === 'todo' ? { ...e, type: 'migrate' as const, toDate: today } : e
  );

  // prepend to today with fromDate tag
  const incoming: BujoEntry[] = openTodos.map(e => ({
    id: makeId(),
    type: 'todo' as const,
    text: e.text,
    fromDate: fromDate,
  }));
  target.entries = [...incoming, ...target.entries];

  await saveDay(app, source, settings);
  await saveDay(app, target, settings);

  return { migrated: openTodos.length };
}

// ── migrate a single entry to a target date ──────────────────────────────────

export async function migrateEntry(
  app: App,
  entry: BujoEntry,
  fromDate: string,
  toDate: string,
  settings: BujoSettings,
): Promise<void> {
  const source = await loadDay(app, fromDate, settings);
  const target = await loadDay(app, toDate, settings);

  // mark as migrated in source with toDate (preserve existing fromDate if present)
  // Match by text+type since IDs are regenerated on each parse
  let matched = false;
  source.entries = source.entries.map(e => {
    if (!matched && e.type === entry.type && e.text === entry.text) {
      matched = true;
      return { ...e, type: 'migrate' as const, toDate };
    }
    return e;
  });

  // add to target with origin tag (preserve original fromDate if entry was already migrated)
  const originalDate = entry.fromDate || fromDate;
  target.entries = [
    { id: makeId(), type: 'todo', text: entry.text, fromDate: originalDate },
    ...target.entries,
  ];

  await saveDay(app, source, settings);
  await saveDay(app, target, settings);
}

// ── load recent days for sidebar ─────────────────────────────────────────────

export async function loadRecentDays(
  app: App,
  settings: BujoSettings,
  limit = 3,
): Promise<DailyNote[]> {
  const today = todayIso();

  // find all date-named .md files in the journal folder
  const files = journalFiles(app, settings)
    .filter(f => /\d{4}-\d{2}-\d{2}\.md$/.test(f.name))
    .sort((a, b) => b.name.localeCompare(a.name)); // desc

  const notes: DailyNote[] = [];
  for (const file of files) {
    const date = file.name.replace('.md', '');
    if (date >= today) continue; // skip today and future
    const content = await app.vault.read(file);
    const entries = parse(content);
    if (entries.some(e => e.type === 'todo')) {
      notes.push({ date, path: file.path, entries });
      if (notes.length >= limit) break;
    }
  }

  return notes;
}

// ── tag index across all journal notes ───────────────────────────────────────

export async function buildTagIndex(
  app: App,
  settings: BujoSettings,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const tagRe = /(^|\s)(#[a-zA-Z][a-zA-Z0-9_-]*)/g;

  const files = journalFiles(app, settings);

  for (const file of files) {
    const content = await app.vault.read(file);
    let m: RegExpExecArray | null;
    tagRe.lastIndex = 0;
    while ((m = tagRe.exec(content)) !== null) {
      const tag = m[2];
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return counts;
}

// ── search entries by tag across all notes ───────────────────────────────────

export async function searchByTag(
  app: App,
  tag: string,
  settings: BujoSettings,
): Promise<Array<{ date: string; entries: BujoEntry[] }>> {
  const files = journalFiles(app, settings)
    .filter(f => /\d{4}-\d{2}-\d{2}\.md$/.test(f.name))
    .sort((a, b) => b.name.localeCompare(a.name));

  const results: Array<{ date: string; entries: BujoEntry[] }> = [];
  const tagRe = new RegExp(`(^|\\s)(${tag.replace('#', '\\#')})(\\b|$)`);

  for (const file of files) {
    const date = file.name.replace('.md', '');
    const content = await app.vault.read(file);
    const entries = parse(content).filter(e => tagRe.test(e.text));
    if (entries.length > 0) results.push({ date, entries });
  }

  return results;
}
