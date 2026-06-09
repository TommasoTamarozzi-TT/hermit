#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const params = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    const v = argv[i+1] && !argv[i+1].startsWith('--') ? argv[++i] : true;
    params[k] = v;
  }
}

const workspaceRoot = process.cwd();
const outDir = path.join(workspaceRoot, '.hermit', 'usage');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, '5.4-usage.log.jsonl');

const entry = {
  timestamp: new Date().toISOString(),
  model: params.model || process.env.ROLE_STRATEGIC_REVIEW_MODEL || 'openai/gpt-5.4',
  reason: params.reason || 'unspecified',
  command: params.command || null,
  user: params.user || null,
  session_id: params.session_id || null,
  extra: params.extra || null,
};

fs.appendFileSync(outPath, JSON.stringify(entry) + '\n', 'utf8');
console.log('Logged 5.4 usage:', entry);
