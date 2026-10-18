// Every page of the site has front matter Jekyll can read. A value with ": " or " #" in it that is
// not quoted is not YAML; Jekyll then logs an error, skips the page, and its address is a 404 with
// nothing else to show for it (the scripting and coating design pages went that way once).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');
const files = execFileSync('git', ['ls-files', '*.md', '*.html'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

// a plain (unquoted, unflowed) scalar may not contain ": " or " #", and may not start with a reserved sign
const badPlain = (v) => v !== '' && !/^["'[{|>]/.test(v) && !/^[-?:,\[\]{}#&*!|>'"%@`]/.test(v) && (/: /.test(v) || / #/.test(v) || /:$/.test(v));

test('every page has front matter Jekyll can read', () => {
  const bad = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (!text.startsWith('---\n')) continue;
    const end = text.indexOf('\n---', 4);
    if (end < 0) { bad.push(`${f}: front matter never closes`); continue; }
    for (const line of text.slice(4, end).split('\n')) {
      const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (m && badPlain(m[2].trim())) bad.push(`${f}: "${m[1]}" needs quoting: ${m[2].slice(0, 60)}`);
    }
  }
  assert.deepEqual(bad, []);
});
