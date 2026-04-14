import { BujoEntry, EntryType } from './types';

// ── symbol maps ──────────────────────────────────────────────────────────────

const TYPE_TO_SYM: Record<EntryType, string> = {
  todo:      'o',
  done:      'x',
  cancelled: '-',
  migrate:   '>',
  note:      '.',
  event:     ',',
};

const SYM_TO_TYPE: Record<string, EntryType> = {
  'o': 'todo',
  'x': 'done',
  '-': 'cancelled',
  '>': 'migrate',
  '.': 'note',
  ',': 'event',
};

// Migration tags: ↳ YYYY-MM-DD (from) and → YYYY-MM-DD (to)
const FROM_RE = /\s*↳\s*(\d{4}-\d{2}-\d{2})/;
const TO_RE = /\s*→\s*(\d{4}-\d{2}-\d{2})/;

// ── id generator ─────────────────────────────────────────────────────────────

let _seq = 0;
export function makeId(): string {
  return `${Date.now()}-${++_seq}`;
}

// ── parse ────────────────────────────────────────────────────────────────────

/**
 * Parse a daily note's markdown content into BujoEntry[].
 * Only lines matching `- <sym> <text>` are treated as BuJo entries.
 * Everything else (headings, blank lines, freeform prose) is ignored by the
 * entry list but preserved verbatim when we write back via serialise().
 */
export function parse(content: string): BujoEntry[] {
  const entries: BujoEntry[] = [];
  const lineRe = /^- ([ox\->.,]) (.+)$/;

  for (const line of content.split('\n')) {
    const m = line.match(lineRe);
    if (!m) continue;

    const [, sym, rest] = m;
    const type = SYM_TO_TYPE[sym];
    if (!type) continue;

    // extract ↳ fromDate and → toDate if present
    let text = rest;
    let fromDate: string | undefined;
    let toDate: string | undefined;

    const fromMatch = text.match(FROM_RE);
    if (fromMatch) {
      fromDate = fromMatch[1];
      text = text.replace(FROM_RE, '');
    }

    const toMatch = text.match(TO_RE);
    if (toMatch) {
      toDate = toMatch[1];
      text = text.replace(TO_RE, '');
    }

    text = text.trim();

    entries.push({ id: makeId(), type, text, fromDate, toDate });
  }

  return entries;
}

// ── serialise ────────────────────────────────────────────────────────────────

/**
 * Serialise BujoEntry[] back to markdown lines.
 * Called when writing a day's entries back to disk.
 * Returns just the entry block — the caller wraps it with a heading.
 */
export function serialise(entries: BujoEntry[]): string {
  return entries
    .map(e => {
      const sym = TYPE_TO_SYM[e.type];
      const from = e.fromDate ? ` ↳ ${e.fromDate}` : '';
      const to = e.toDate ? ` → ${e.toDate}` : '';
      return `- ${sym} ${e.text}${from}${to}`;
    })
    .join('\n');
}

// ── full file round-trip ─────────────────────────────────────────────────────

/**
 * Given the full markdown content of a daily note and a new entry list,
 * replace the entire content with just the entries.
 *
 * The filename already contains the date, so no heading is needed.
 */
export function replaceEntryBlock(
  original: string,
  entries: BujoEntry[],
  date: string,
): string {
  const newBlock = serialise(entries);
  return newBlock + '\n';
}

// ── tag extraction ────────────────────────────────────────────────────────────

const TAG_RE = /(^|\s)(#[a-zA-Z][a-zA-Z0-9_-]*)/g;

export function extractTags(text: string): string[] {
  const tags: string[] = [];
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text)) !== null) {
    tags.push(m[2]);
  }
  return tags;
}

export function entryHasTag(entry: BujoEntry, tag: string): boolean {
  TAG_RE.lastIndex = 0;
  return TAG_RE.test(entry.text) &&
    extractTags(entry.text).includes(tag);
}

/** Parse raw input text into an entry type and cleaned text. */
export function parseEntryType(raw: string): { type: BujoEntry['type']; text: string } {
  if (raw.startsWith('. ')) return { type: 'note', text: raw.slice(2) };
  if (raw.startsWith(', ')) return { type: 'event', text: raw.slice(2) };
  if (raw.startsWith('x ')) return { type: 'done', text: raw.slice(2) };
  return { type: 'todo', text: raw };
}
