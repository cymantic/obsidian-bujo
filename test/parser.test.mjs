import { parse, serialise } from './Parser.js';

// ── test runner ──────────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    console.error('Expected:', expected);
    console.error('Actual:  ', actual);
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ── round-trip test ──────────────────────────────────────────────────────────

const sampleMarkdown = `- o Finish [[ProjectAlpha]] writeup #work
- x Buy groceries
- - Call dentist — rescheduled
- > Plan weekend trip ↳ 2025-04-13
- . Library book due next Thursday #reminder
- , Coffee with Sam 10am`;

console.log('Testing Parser round-trip...\n');

// Step 1: Parse the markdown into BujoEntry[]
const entries = parse(sampleMarkdown);

console.log(`✓ Parsed ${entries.length} entries`);

// Verify we got all 6 entry types
assert(entries.length === 6, 'Should parse 6 entries');
assert(entries[0].type === 'todo', 'First entry should be todo');
assert(entries[1].type === 'done', 'Second entry should be done');
assert(entries[2].type === 'cancelled', 'Third entry should be cancelled');
assert(entries[3].type === 'migrate', 'Fourth entry should be migrate');
assert(entries[4].type === 'note', 'Fifth entry should be note');
assert(entries[5].type === 'event', 'Sixth entry should be event');

console.log('✓ All 6 entry types parsed correctly');

// Verify migration origin was extracted
assert(entries[3].fromDate === '2025-04-13', 'Migration origin should be extracted');

console.log('✓ Migration origin extracted correctly');

// Verify text content (fromDate should be stripped from text)
assert(entries[3].text === 'Plan weekend trip', 'Migration text should not include ↳ suffix');

console.log('✓ Migration text cleaned correctly');

// Step 2: Serialise back to markdown
const serialised = serialise(entries);

console.log(`✓ Serialised back to markdown\n`);

// Step 3: Compare
console.log('Original:');
console.log(sampleMarkdown);
console.log('\nSerialised:');
console.log(serialised);
console.log();

assertEquals(serialised, sampleMarkdown, 'Round-trip should be lossless');

console.log('✓ Round-trip is lossless!');
console.log('\n✅ All tests passed');
