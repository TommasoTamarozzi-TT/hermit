#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const workspaceRoot = process.cwd();
const statePath = path.join(workspaceRoot, '.hermit', 'state', 'last-5.4-strategic-review.txt');
const policyPath = path.join(workspaceRoot, '.hermit', 'policy.json');

function readPolicy() {
  try {
    return JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  } catch (e) {
    console.error('Failed to read policy file:', e.message);
    process.exit(1);
  }
}

function todayKey() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function readLastDate() {
  try {
    return fs.readFileSync(statePath, 'utf8').trim();
  } catch {
    return null;
  }
}

function writeLastDate(key: string) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, key + '\n', 'utf8');
}

async function main() {
  const policy = readPolicy();
  const allowed = policy.modelPolicy?.oneOffStrategicReviewModel || 'openai/gpt-5.4';
  const maxPerDay = policy.modelPolicy?.maxDaily5_4StrategicReviews ?? 1;
  const last = readLastDate();
  const today = todayKey();

  if (last === today && maxPerDay <= 1) {
    console.error('A GPT-5.4 strategic review has already been run today. Aborting per policy.');
    process.exit(2);
  }

  console.log('Allowed to run a GPT-5.4 strategic review now. Running...');
  try {
    // Export env to force model for strategic-review purpose for this run
    const cmd = `npm run -s cli -- heartbeat --role head-of-operations --no-git-checkpoints`;
    // Set ROLE_STRATEGIC_REVIEW_MODEL for this child process
    execSync(cmd, {
      stdio: 'inherit',
      env: {
        ...process.env,
        ROLE_STRATEGIC_REVIEW_MODEL: allowed,
      },
    });
    // log the 5.4 usage
    try {
      const logger = path.join(workspaceRoot, 'scripts', 'log-5.4-use.mjs');
      const logCmd = `node "${logger}" --model "${allowed}" --reason "strategic-review-guard" --command "${cmd.replace(/"/g, '\\"')}"`;
      execSync(logCmd, { stdio: 'inherit' });
    } catch (e) {
      console.error('Failed to write 5.4 usage log:', e.message || e);
    }

    writeLastDate(today);
    console.log('Strategic review completed; recorded last 5.4 strategic review date:', today);
  } catch (err) {
    console.error('Strategic review failed:', err.message || err);
    process.exit(1);
  }
}

main();
