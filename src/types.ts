export type EntryType = 'todo' | 'done' | 'cancelled' | 'migrate' | 'note' | 'event';

export interface BujoEntry {
  id: string;
  type: EntryType;
  text: string;
  fromDate?: string; // ISO date string YYYY-MM-DD if migrated from another day
  toDate?: string;   // ISO date string YYYY-MM-DD if migrated to another day
}

export interface DailyNote {
  date: string;   // YYYY-MM-DD
  path: string;   // vault-relative path e.g. "journal/2025-04-14.md"
  entries: BujoEntry[];
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface TagMatch {
  note: DailyNote;
  entries: BujoEntry[];
}

// Settings stored in data.json
export interface BujoSettings {
  journalFolder: string;       // e.g. "journal"
  dateFormat: string;          // e.g. "YYYY-MM-DD"
  openOnStartup: boolean;
  workingDays: boolean[];      // [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
  useCustomFonts: boolean;     // Use custom BuJo fonts vs Obsidian defaults
  startOfWeek: number;         // 0=Sunday, 1=Monday, ..., 6=Saturday
}

export const DEFAULT_SETTINGS: BujoSettings = {
  journalFolder: 'journal',
  dateFormat: 'YYYY-MM-DD',
  openOnStartup: true,
  workingDays: [true, true, true, true, true, false, false], // Mon-Fri
  useCustomFonts: true, // Use nice BuJo fonts by default
  startOfWeek: 1, // Monday
};
