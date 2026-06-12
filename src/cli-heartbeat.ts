import matter from "gray-matter";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import { isAbortError } from "./abort.js";
import {
  buildHermitPromptContext,
  buildRolePromptContext,
  runManagedOneShotCommand,
  type HeartbeatExecutionResult,
} from "./cli-session.js";
import { HERMIT_ROLE_ID, HERMIT_ROLE_ROOT } from "./constants.js";
import {
  createHeartbeatDaemonController,
  type HeartbeatDaemonController,
  formatHeartbeatDaemonDuration,
  planHeartbeatDaemonCycle,
  resolveDueHeartbeatRoles,
  resolveHeartbeatDaemonDelay,
  runHeartbeatCycle,
} from "./heartbeat-daemon.js";
import { listRoleIds, loadRole } from "./roles.js";
import { resolveHeartbeatSchedule, loadRuntimeConfig, resolveSessionModelPreferences } from "./runtime-config.js";
import {
  DEFAULT_HEARTBEAT_PROMPT,
  HERMIT_STRATEGIC_REVIEW_PROMPT,
  STRATEGIC_REVIEW_HEARTBEAT_PROMPT,
} from "./session-prompts.js";
import type { OneShotPromptRenderOptions } from "./session-loop.js";
import { createHermitSession, createRoleSession } from "./session-runtime.js";
import { formatWorkspaceTurnOwner, type WorkspaceTurnCoordinator, type WorkspaceTurnOwner } from "./turn-control.js";
import type { RoleDefinition } from "./types.js";
import { ensureWorkspaceScaffold } from "./workspace.js";

const STRATEGIC_REVIEW_INTERVAL_MS = 24 * 60 * 60 * 1000;
const HEARTBEAT_STATE_FILE = path.join(".hermit", "heartbeat", "state.json");

interface HeartbeatStateFile {
  roleLastCompletedAtMs?: Record<string, number>;
}

async function loadHeartbeatState(root: string): Promise<HeartbeatStateFile> {
  try {
    const raw = await fs.readFile(path.join(root, HEARTBEAT_STATE_FILE), "utf8");
    const parsed = JSON.parse(raw) as HeartbeatStateFile;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function saveHeartbeatState(root: string, state: HeartbeatStateFile): Promise<void> {
  const filePath = path.join(root, HEARTBEAT_STATE_FILE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function isStrategicReviewDueForRecord(recordPath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(recordPath, "utf-8");
    const { data } = matter(content);
    const lastReview = data.last_strategic_review;
    if (!lastReview) return true;
    const lastDate = new Date(lastReview);
    if (isNaN(lastDate.getTime())) return true;
    return Date.now() - lastDate.getTime() > STRATEGIC_REVIEW_INTERVAL_MS;
  } catch {
    return false;
  }
}

async function isStrategicReviewDue(role: RoleDefinition): Promise<boolean> {
  return isStrategicReviewDueForRecord(path.join(role.roleDir, "agent", "record.md"));
}

async function isHermitStrategicReviewDue(root: string): Promise<boolean> {
  return isStrategicReviewDueForRecord(path.join(root, HERMIT_ROLE_ROOT, "agent", "record.md"));
}

async function shouldRunStrategicReviewSweep(root: string, roles: RoleDefinition[]): Promise<boolean> {
  if (await isHermitStrategicReviewDue(root)) {
    return true;
  }

  for (const role of roles) {
    if (await isStrategicReviewDue(role)) {
      return true;
    }
  }

  return false;
}

interface HeartbeatRunOptions {
  continue?: boolean;
  prompt?: string;
  strategicReview?: boolean;
  automaticStrategicReview?: boolean;
}

async function resolveHeartbeatPrompt(role: RoleDefinition, options: HeartbeatRunOptions): Promise<string> {
  if (options.prompt) {
    return options.prompt;
  }
  if (options.strategicReview || options.automaticStrategicReview !== false && await isStrategicReviewDue(role)) {
    return STRATEGIC_REVIEW_HEARTBEAT_PROMPT;
  }
  return DEFAULT_HEARTBEAT_PROMPT;
}

export async function runHeartbeatForRole(options: {
  root: string;
  role: RoleDefinition;
  promptContext: {
    workspaceRoot: string;
    roleId: string;
    roleRoot: string;
  };
  continueRecent?: boolean;
  prompt?: string;
  strategicReview?: boolean;
  automaticStrategicReview?: boolean;
  gitCheckpointsEnabled?: boolean;
  isCancelled?: () => boolean;
  registerActiveAbort?: (abortActiveSession?: (() => Promise<void>) | undefined) => void;
  turnCoordinator?: WorkspaceTurnCoordinator;
  renderOptions?: OneShotPromptRenderOptions;
}): Promise<HeartbeatExecutionResult> {
  return runManagedOneShotCommand({
    root: options.root,
    commandName: "heartbeat",
    roleId: options.role.id,
    turnKind: "heartbeat",
    ...(options.turnCoordinator ? { turnCoordinator: options.turnCoordinator, turnMode: "skip" as const } : {}),
    ...(options.gitCheckpointsEnabled !== undefined ? { gitCheckpointsEnabled: options.gitCheckpointsEnabled } : {}),
    createSession: async (gitContext) => {
      const { session, telemetry, modelLabel } = await createRoleSession({
        root: options.root,
        role: options.role,
        persist: true,
        continueRecent: Boolean(options.continueRecent),
        sessionHistoryType: "heartbeat",
        telemetryCommandName: "heartbeat",
        telemetryContext: gitContext.telemetryContext,
        promptContext: {
          ...options.promptContext,
          ...gitContext.promptContext,
        },
        modelRoutingPurpose: "heartbeat",
      });

      return {
        session,
        telemetry,
        modelLabel,
        activeRoleLabel: options.role.id,
      };
    },
    resolvePrompt: () =>
      resolveHeartbeatPrompt(options.role, {
        ...(options.prompt !== undefined ? { prompt: options.prompt } : {}),
        ...(options.strategicReview !== undefined ? { strategicReview: options.strategicReview } : {}),
        ...(options.automaticStrategicReview !== undefined
          ? { automaticStrategicReview: options.automaticStrategicReview }
          : {}),
      }),
    ...(options.isCancelled ? { isCancelled: options.isCancelled } : {}),
    cancelMessage: "Heartbeat daemon aborted the active role session.",
    ...(options.registerActiveAbort ? { registerActiveAbort: options.registerActiveAbort } : {}),
    ...(options.renderOptions ? { renderOptions: options.renderOptions } : {}),
  });
}

async function runStrategicReviewForHermit(options: {
  root: string;
  continueRecent?: boolean;
  gitCheckpointsEnabled?: boolean;
  isCancelled?: () => boolean;
  registerActiveAbort?: (abortActiveSession?: (() => Promise<void>) | undefined) => void;
  turnCoordinator?: WorkspaceTurnCoordinator;
  renderOptions?: OneShotPromptRenderOptions;
}): Promise<HeartbeatExecutionResult> {
  return runManagedOneShotCommand({
    root: options.root,
    commandName: "heartbeat",
    roleId: HERMIT_ROLE_ID,
    turnKind: "heartbeat",
    ...(options.turnCoordinator ? { turnCoordinator: options.turnCoordinator, turnMode: "skip" as const } : {}),
    ...(options.gitCheckpointsEnabled !== undefined ? { gitCheckpointsEnabled: options.gitCheckpointsEnabled } : {}),
    createSession: async (gitContext) => {
      const { session, telemetry, modelLabel } = await createHermitSession({
        root: options.root,
        persist: true,
        continueRecent: Boolean(options.continueRecent),
        sessionHistoryType: "heartbeat",
        bootstrapMode: false,
        telemetryCommandName: "heartbeat",
        telemetryContext: gitContext.telemetryContext,
        promptContext: {
          ...buildHermitPromptContext(options.root),
          ...gitContext.promptContext,
        },
        modelRoutingPurpose: "strategic-review",
      });

      return {
        session,
        telemetry,
        modelLabel,
        activeRoleLabel: HERMIT_ROLE_ID,
      };
    },
    resolvePrompt: async () => HERMIT_STRATEGIC_REVIEW_PROMPT,
    ...(options.isCancelled ? { isCancelled: options.isCancelled } : {}),
    cancelMessage: "Heartbeat daemon aborted the active Hermit strategic-review session.",
    ...(options.registerActiveAbort ? { registerActiveAbort: options.registerActiveAbort } : {}),
    ...(options.renderOptions ? { renderOptions: options.renderOptions } : {}),
  });
}

function formatDaemonTimestamp(date = new Date()): string {
  return date.toISOString();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatSkippedHeartbeatMessage(
  targetLabel: string,
  owner: WorkspaceTurnOwner | undefined,
): string {
  return `Skipping ${targetLabel} because ${formatWorkspaceTurnOwner(owner)} is active.`;
}

async function sleepUntilNextHeartbeat(
  ms: number,
  isRunning: () => boolean,
  controller?: HeartbeatDaemonController,
): Promise<void> {
  if (ms <= 0 || !isRunning()) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onSignal = () => {
      cleanup();
      resolve();
    };

    const cleanup = () => {
      clearTimeout(timeout);
      unsubscribeStop?.();
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    };

    const unsubscribeStop = controller?.onStop(() => {
      cleanup();
      resolve();
    });

    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  });
}

function createHeartbeatLogger(
  writer: ((message: string) => void) | undefined,
  fallback: (...args: [message?: unknown, ...optionalParams: unknown[]]) => void,
): (message: string) => void {
  return (message: string) => {
    if (writer) {
      writer(`${message}\n`);
      return;
    }

    fallback(message);
  };
}

export async function runHeartbeatDaemonLoop(options: {
  root: string;
  intervalMs: number;
  initialDelayMs?: number;
  continueRecent?: boolean;
  gitCheckpointsEnabled?: boolean;
  controller?: HeartbeatDaemonController;
  handleSignals?: boolean;
  turnCoordinator?: WorkspaceTurnCoordinator;
  onInfo?: (message: string) => void;
  onError?: (message: string) => void;
  renderOptions?: OneShotPromptRenderOptions;
}): Promise<void> {
  const daemonController = options.controller ?? createHeartbeatDaemonController({
    onAbortError: (error) => {
      logError(`[${formatDaemonTimestamp()}] Failed to abort the active daemon session: ${getErrorMessage(error)}`);
    },
  });
  const handleSignals = options.handleSignals ?? true;
  const logInfo = createHeartbeatLogger(options.onInfo, console.log);
  const logError = createHeartbeatLogger(options.onError, console.error);
  let firstCycle = true;

  const stop = (signal: NodeJS.Signals) => {
    const stopResult = daemonController.stop();
    if (!stopResult.requested) {
      return;
    }
    logInfo(
      stopResult.abortedActiveSession
        ? `[${formatDaemonTimestamp()}] Received ${signal}. Aborting the active session and stopping heartbeat daemon.`
        : `[${formatDaemonTimestamp()}] Received ${signal}. Stopping heartbeat daemon.`,
    );
  };

  if (handleSignals) {
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  }

  try {
    logInfo(
      `[${formatDaemonTimestamp()}] Heartbeat daemon started. Running role heartbeats every ${formatHeartbeatDaemonDuration(options.intervalMs)} and a combined daily strategic-review sweep when due.${options.initialDelayMs !== undefined ? ` First cycle in ${formatHeartbeatDaemonDuration(options.initialDelayMs)}.` : ""}`,
    );

    // Ensure purpose-specific heartbeat routing from workspace runtime config is visible to
    // any child processes or internal resolution that rely on env vars. Prefer a concrete
    // purpose-specific model if available; fall back to exporting the configured tier.
    try {
      // If an explicit heartbeat model or tier already exists in env, do not override.
      if (!process.env.ROLE_HEARTBEAT_MODEL && !process.env.ROLE_HEARTBEAT_TIER) {
        const resolved = await resolveSessionModelPreferences(options.root, "heartbeat");
        if (resolved && resolved.preferredModel) {
          process.env.ROLE_HEARTBEAT_MODEL = resolved.preferredModel;
          if (resolved.fallbackModels && resolved.fallbackModels.length > 0) {
            process.env.ROLE_HEARTBEAT_FALLBACK_MODELS = resolved.fallbackModels.join(",");
          }
          logInfo(
            `[${formatDaemonTimestamp()}] Applied runtime-config heartbeat model override: ROLE_HEARTBEAT_MODEL=${process.env.ROLE_HEARTBEAT_MODEL}`,
          );
        } else {
          // If no concrete model resolved, fall back to exporting the runtime-config tier (if any)
          const runtimeCfg = await loadRuntimeConfig(options.root);
          const configuredHeartbeatTier = runtimeCfg.modelRouting?.defaults?.heartbeat;
          if (configuredHeartbeatTier) {
            process.env.ROLE_HEARTBEAT_TIER = configuredHeartbeatTier;
            logInfo(
              `[${formatDaemonTimestamp()}] Applied runtime-config heartbeat tier override: ROLE_HEARTBEAT_TIER=${configuredHeartbeatTier}`,
            );
          }
        }
      }
    } catch (err) {
      logInfo(`[${formatDaemonTimestamp()}] Warning: failed to read runtime config for heartbeat routing: ${String(err)}`);
    }

    while (daemonController.isRunning()) {
      if (options.initialDelayMs !== undefined && firstCycle) {
        logInfo(
          `[${formatDaemonTimestamp()}] Waiting ${formatHeartbeatDaemonDuration(options.initialDelayMs)} before the first daemon cycle.`,
        );
        await sleepUntilNextHeartbeat(options.initialDelayMs, () => daemonController.isRunning(), daemonController);
        if (!daemonController.isRunning()) {
          break;
        }
      }

      await ensureWorkspaceScaffold(options.root);
      const roleIds = await listRoleIds(options.root);
      const roles: RoleDefinition[] = [];
      for (const roleId of roleIds) {
        const role = await loadRole(options.root, roleId);
        await ensureWorkspaceScaffold(options.root, role);
        roles.push(role);
      }
      const strategicReviewSweepDue = await shouldRunStrategicReviewSweep(options.root, roles);
      const heartbeatSchedule = await resolveHeartbeatSchedule(options.root);
      const heartbeatState = await loadHeartbeatState(options.root);
      const dueHeartbeatRoles = resolveDueHeartbeatRoles({
        roleIds,
        defaultIntervalMs: options.intervalMs,
        roleIntervalsMs: heartbeatSchedule.roleIntervalsMs,
        ...(heartbeatState.roleLastCompletedAtMs
          ? { lastCompletedAtMsByRoleId: heartbeatState.roleLastCompletedAtMs }
          : {}),
      });
      const cyclePlan = planHeartbeatDaemonCycle(
        strategicReviewSweepDue ? roleIds : dueHeartbeatRoles.dueRoleIds,
        strategicReviewSweepDue,
      );
      const cycleLabel = cyclePlan.mode === "strategic-review" ? "strategic review" : "heartbeat";

      if (cyclePlan.mode === "wait") {
        const waitLabel = roleIds.length === 0
          ? firstCycle
            ? "No roles are configured. Monitoring Hermit strategic review only."
            : "No roles are currently configured. Monitoring Hermit strategic review only."
          : `No roles are due for heartbeat right now. Deferred by schedule: ${dueHeartbeatRoles.deferredRoleIds.join(", ")}.`;
        firstCycle = false;
        logInfo(
          `[${formatDaemonTimestamp()}] ${waitLabel} Waiting ${formatHeartbeatDaemonDuration(options.intervalMs)} before checking again.`,
        );
        await sleepUntilNextHeartbeat(options.intervalMs, () => daemonController.isRunning(), daemonController);
        continue;
      }

      firstCycle = false;
      if (!strategicReviewSweepDue && dueHeartbeatRoles.deferredRoleIds.length > 0) {
        logInfo(
          `[${formatDaemonTimestamp()}] Deferred by heartbeat schedule this cycle: ${dueHeartbeatRoles.deferredRoleIds.join(", ")}.`,
        );
      }
      logInfo(
        cyclePlan.mode === "strategic-review" && roleIds.length === 0
          ? `[${formatDaemonTimestamp()}] Starting Hermit strategic-review sweep with no configured roles.`
          : cyclePlan.mode === "strategic-review"
          ? `[${formatDaemonTimestamp()}] Starting combined strategic-review sweep for Hermit plus ${roleIds.length} role(s): ${roleIds.join(", ")}.`
          : `[${formatDaemonTimestamp()}] Starting heartbeat cycle for ${cyclePlan.targetIds.length} due role(s): ${cyclePlan.targetIds.join(", ")}.`,
      );

      const completedRoleIdsForState = new Set<string>();
      const cycle = await runHeartbeatCycle({
        roleIds: cyclePlan.targetIds,
        isCancelled: () => !daemonController.isRunning(),
        runRoleHeartbeat: async (roleId) => {
          if (roleId === HERMIT_ROLE_ID) {
            logInfo(`[${formatDaemonTimestamp()}] Running Hermit strategic review.`);
            const result = await runStrategicReviewForHermit({
              root: options.root,
              ...(options.continueRecent !== undefined ? { continueRecent: options.continueRecent } : {}),
              ...(options.gitCheckpointsEnabled !== undefined ? { gitCheckpointsEnabled: options.gitCheckpointsEnabled } : {}),
              isCancelled: () => !daemonController.isRunning(),
              registerActiveAbort: (abortActiveSession) => daemonController.setActiveAbort(abortActiveSession),
              ...(options.turnCoordinator ? { turnCoordinator: options.turnCoordinator } : {}),
              ...(options.renderOptions ? { renderOptions: options.renderOptions } : {}),
            });
            if (result.status === "skipped") {
              logInfo(
                `[${formatDaemonTimestamp()}] ${formatSkippedHeartbeatMessage("Hermit strategic review", result.activeTurnOwner)}`,
              );
              return "skipped";
            }
            logInfo(`[${formatDaemonTimestamp()}] Finished Hermit strategic review.`);
            return "success";
          }

          const role = roles.find((entry) => entry.id === roleId);
          if (!role) {
            throw new Error(`Failed to load role ${roleId} for daemon cycle.`);
          }
          logInfo(
            strategicReviewSweepDue
              ? `[${formatDaemonTimestamp()}] Running strategic review for ${roleId}.`
              : `[${formatDaemonTimestamp()}] Running heartbeat for ${roleId}.`,
          );
          // Enforce a per-role heartbeat timeout to avoid very long stuck turns.
          // If the run exceeds ROLE_HEARTBEAT_TIMEOUT_MS, request abort of the active session.
          const ROLE_HEARTBEAT_TIMEOUT_MS = 90_000; // 90s default, conservative guard
          let timeoutHandle: NodeJS.Timeout | undefined;
          try {
            timeoutHandle = setTimeout(() => {
              logError(
                `[${formatDaemonTimestamp()}] Heartbeat for ${roleId} exceeded ${ROLE_HEARTBEAT_TIMEOUT_MS}ms — requesting abort.`,
              );
              // Produce a lightweight diagnostic snapshot for later triage.
              try {
                const diagDir = path.join(options.root, ".hermit", "diagnostics");
                // synchronous write: this runs inside the daemon; keep it small and non-blocking.
                fs.mkdirSync(diagDir, { recursive: true });
                const snapshot = {
                  timestamp: new Date().toISOString(),
                  roleId,
                  reason: "heartbeat_timeout",
                  sessionPlan: cyclePlan.mode,
                };
                fs.writeFileSync(path.join(diagDir, `heartbeat-timeout-${roleId}-${Date.now()}.json`), JSON.stringify(snapshot, null, 2), "utf8");
                logInfo(`[${formatDaemonTimestamp()}] Wrote heartbeat timeout diagnostic for ${roleId} to .hermit/diagnostics`);
              } catch (err) {
                logError(`[${formatDaemonTimestamp()}] Failed to write heartbeat diagnostic: ${String(err)}`);
              }

              // Request abort of the active heartbeat session. This triggers the registered abort handler if set.
              daemonController.abortActiveSession();
            }, ROLE_HEARTBEAT_TIMEOUT_MS);

            const result = await runHeartbeatForRole({
              root: options.root,
              role,
              promptContext: buildRolePromptContext(options.root, role),
              ...(options.continueRecent !== undefined ? { continueRecent: options.continueRecent } : {}),
              automaticStrategicReview: false,
              ...(cyclePlan.mode === "strategic-review" ? { strategicReview: true } : {}),
              ...(options.gitCheckpointsEnabled !== undefined ? { gitCheckpointsEnabled: options.gitCheckpointsEnabled } : {}),
              isCancelled: () => !daemonController.isRunning(),
              registerActiveAbort: (abortActiveSession) => daemonController.setActiveAbort(abortActiveSession),
              ...(options.turnCoordinator ? { turnCoordinator: options.turnCoordinator } : {}),
              ...(options.renderOptions ? { renderOptions: options.renderOptions } : {}),
            });

            if (result.status === "skipped") {
              logInfo(
                `[${formatDaemonTimestamp()}] ${formatSkippedHeartbeatMessage(
                  strategicReviewSweepDue ? `strategic review for ${roleId}` : `heartbeat for ${roleId}`,
                  result.activeTurnOwner,
                )}`,
              );
              return "skipped";
            }

            logInfo(
              strategicReviewSweepDue
                ? `[${formatDaemonTimestamp()}] Finished strategic review for ${roleId}.`
                : `[${formatDaemonTimestamp()}] Finished heartbeat for ${roleId}.`,
            );
            completedRoleIdsForState.add(roleId);
            return "success";
          } finally {
            if (timeoutHandle) clearTimeout(timeoutHandle);
          }
        },
      });

      for (const failure of cycle.failures) {
        const targetLabel =
          failure.roleId === HERMIT_ROLE_ID
            ? "Hermit strategic review"
            : `${cycleLabel} for ${failure.roleId}`;
        if (isAbortError(failure.error)) {
          logInfo(`[${formatDaemonTimestamp()}] ${targetLabel} aborted.`);
          continue;
        }
        logError(
          `[${formatDaemonTimestamp()}] ${targetLabel} failed: ${getErrorMessage(failure.error)}`,
        );
      }

      if (completedRoleIdsForState.size > 0) {
        const nextState = {
          roleLastCompletedAtMs: {
            ...(heartbeatState.roleLastCompletedAtMs ?? {}),
          },
        };
        for (const roleId of completedRoleIdsForState) {
          nextState.roleLastCompletedAtMs[roleId] = cycle.completedAtMs;
        }
        await saveHeartbeatState(options.root, nextState);
      }

      if (!daemonController.isRunning()) {
        break;
      }

      const waitMs = resolveHeartbeatDaemonDelay(options.intervalMs, cycle.startedAtMs, cycle.completedAtMs);
      const completedCount = cycle.successfulRoleIds.length;
      const skippedCount = cycle.skippedRoleIds.length;
      const failedCount = cycle.failures.length;
      logInfo(
        `[${formatDaemonTimestamp()}] ${cyclePlan.mode === "strategic-review" ? "Strategic-review sweep" : "Heartbeat cycle"} finished in ${formatHeartbeatDaemonDuration(cycle.completedAtMs - cycle.startedAtMs)}. Completed ${completedCount} target(s), skipped ${skippedCount}, failed ${failedCount}. Next cycle in ${formatHeartbeatDaemonDuration(waitMs)}.`,
      );

      await sleepUntilNextHeartbeat(waitMs, () => daemonController.isRunning(), daemonController);
    }
  } finally {
    if (handleSignals) {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
    }
    logInfo(`[${formatDaemonTimestamp()}] Heartbeat daemon stopped.`);
  }
}
