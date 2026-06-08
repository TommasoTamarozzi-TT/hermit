#!/usr/bin/env -S node --import tsx
import path from "node:path";
import fs from "node:fs/promises";
import { runHeartbeatForRole } from "../src/cli-heartbeat";
import { loadRole } from "../src/roles";
import { buildRolePromptContext } from "../src/cli-session";

async function main() {
  const roleId = process.argv[2] || "head-of-operations";
  const root = path.resolve(process.cwd(), "workspace");
  console.log(`Running heartbeat for role ${roleId} in workspace ${root}`);
  const role = await loadRole(root, roleId);
  const promptContext = buildRolePromptContext(root, role);

  const result = await runHeartbeatForRole({
    root,
    role,
    promptContext,
    continueRecent: false,
    gitCheckpointsEnabled: false,
  });

  console.log('Heartbeat run result:', result);

  // find latest heartbeat session file
  const sessionsDir = role.sessionsDir; // resolvePersistedSessionDirectory used heartbeat sessions when sessionHistoryType=heartbeat
  try {
    const entries = await fs.readdir(sessionsDir, { withFileTypes: true });
    const files = entries.filter(e => e.isFile() && e.name.endsWith('.jsonl')).map(e => e.name).sort();
    if (files.length === 0) {
      console.log('No heartbeat session files found in', sessionsDir);
      return;
    }
    const latest = files.at(-1);
    const sessionPath = path.join(sessionsDir, latest!);
    console.log('Latest heartbeat session file:', sessionPath);
    const raw = await fs.readFile(sessionPath, 'utf8');
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length>0);
    // find last model_change
    let lastModelChange;
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'model_change') lastModelChange = obj;
      } catch {}
    }
    if (lastModelChange) {
      console.log('Model used in session (model_change):', `${lastModelChange.provider}/${lastModelChange.modelId}`);
    } else {
      // fallback: find assistant messages with provider/model
      for (let i = lines.length - 1; i >= 0; --i) {
        try {
          const obj = JSON.parse(lines[i]);
          if (obj.type === 'message' && obj.message && obj.message.role === 'assistant') {
            const prov = obj.message.provider;
            const mod = obj.message.model;
            if (prov && mod) {
              console.log('Model inferred from assistant message:', `${prov}/${mod}`);
              return;
            }
          }
        } catch {}
      }
      console.log('No model metadata found in session file.');
    }
  } catch (err) {
    console.error('Failed to inspect session dir', err);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
