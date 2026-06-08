#!/usr/bin/env node
import "dotenv/config";
import path from "node:path";
import { loadRole } from "../src/roles.js";
import { buildRolePromptContext } from "../src/cli-session.js";
import { runHeartbeatForRole } from "../src/cli-heartbeat.js";

async function main() {
  const root = path.join(process.cwd(), "workspace");
  const roleId = "head-of-operations";
  const role = await loadRole(root, roleId);
  console.log(`Running heartbeat for role ${roleId} (root=${root})`);
  const result = await runHeartbeatForRole({
    root,
    role,
    promptContext: buildRolePromptContext(root, role),
    continueRecent: false,
    gitCheckpointsEnabled: false,
    isCancelled: () => false,
    registerActiveAbort: () => {},
  });

  console.log(`Heartbeat result: ${JSON.stringify(result)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
