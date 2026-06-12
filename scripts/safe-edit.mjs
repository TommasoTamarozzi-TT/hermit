#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
if (argv.length < 3) {
  console.error('Usage: safe-edit.mjs <file-path> <oldTextFile|inline> <newTextFile|inline>');
  process.exit(2);
}

const [filePath, oldSpec, newSpec] = argv;

function loadSpec(spec) {
  if (spec === 'inline') return null;
  try {
    return fs.readFileSync(spec, 'utf8');
  } catch {
    return null;
  }
}

const oldText = loadSpec(oldSpec) ?? oldSpec === 'inline' ? null : null;
const newText = loadSpec(newSpec) ?? newSpec === 'inline' ? null : null;

let content;
try {
  content = fs.readFileSync(filePath, 'utf8');
} catch (err) {
  console.error('Failed to read file', filePath, String(err));
  process.exit(3);
}

if (oldText === null) {
  console.error('Old text must be provided as a file path for safe-edit.mjs in this helper.');
  process.exit(4);
}

if (!content.includes(oldText)) {
  // write diagnostic
  const diagDir = path.join(process.cwd(), '.hermit', 'diagnostics');
  fs.mkdirSync(diagDir, { recursive: true });
  const out = {
    timestamp: new Date().toISOString(),
    file: filePath,
    reason: 'oldText_not_found',
    excerpt: content.slice(0, 2000),
  };
  const outPath = path.join(diagDir, `safe-edit-fail-${path.basename(filePath)}-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.error('Old text not found. Diagnostic written to', outPath);
  process.exit(5);
}

const replaced = content.replace(oldText, newText ?? '');
fs.writeFileSync(filePath, replaced, 'utf8');
console.log('Edit applied successfully to', filePath);
process.exit(0);
