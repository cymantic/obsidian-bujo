// src/Parser.ts
var TYPE_TO_SYM = {
  todo: "o",
  done: "x",
  cancelled: "-",
  migrate: ">",
  note: ".",
  event: ","
};
var SYM_TO_TYPE = {
  "o": "todo",
  "x": "done",
  "-": "cancelled",
  ">": "migrate",
  ".": "note",
  ",": "event"
};
var FROM_RE = /\s*↳\s*(\d{4}-\d{2}-\d{2})/;
var TO_RE = /\s*→\s*(\d{4}-\d{2}-\d{2})/;
var _seq = 0;
function makeId() {
  return `${Date.now()}-${++_seq}`;
}
function parse(content) {
  const entries = [];
  const lineRe = /^- ([ox\->.,]) (.+)$/;
  for (const line of content.split("\n")) {
    const m = line.match(lineRe);
    if (!m)
      continue;
    const [, sym, rest] = m;
    const type = SYM_TO_TYPE[sym];
    if (!type)
      continue;
    let text = rest;
    let fromDate;
    let toDate;
    const fromMatch = text.match(FROM_RE);
    if (fromMatch) {
      fromDate = fromMatch[1];
      text = text.replace(FROM_RE, "");
    }
    const toMatch = text.match(TO_RE);
    if (toMatch) {
      toDate = toMatch[1];
      text = text.replace(TO_RE, "");
    }
    text = text.trim();
    entries.push({ id: makeId(), type, text, fromDate, toDate });
  }
  return entries;
}
function serialise(entries) {
  return entries.map((e) => {
    const sym = TYPE_TO_SYM[e.type];
    const from = e.fromDate ? ` \u21B3 ${e.fromDate}` : "";
    const to = e.toDate ? ` \u2192 ${e.toDate}` : "";
    return `- ${sym} ${e.text}${from}${to}`;
  }).join("\n");
}
function replaceEntryBlock(original, entries, date) {
  const newBlock = serialise(entries);
  return newBlock + "\n";
}
var TAG_RE = /(^|\s)(#[a-zA-Z][a-zA-Z0-9_-]*)/g;
function extractTags(text) {
  const tags = [];
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text)) !== null) {
    tags.push(m[2]);
  }
  return tags;
}
function entryHasTag(entry, tag) {
  TAG_RE.lastIndex = 0;
  return TAG_RE.test(entry.text) && extractTags(entry.text).includes(tag);
}
function parseEntryType(raw) {
  if (raw.startsWith(". "))
    return { type: "note", text: raw.slice(2) };
  if (raw.startsWith(", "))
    return { type: "event", text: raw.slice(2) };
  if (raw.startsWith("x "))
    return { type: "done", text: raw.slice(2) };
  return { type: "todo", text: raw };
}
export {
  entryHasTag,
  extractTags,
  makeId,
  parse,
  parseEntryType,
  replaceEntryBlock,
  serialise
};
