import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  type AgentSession,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import path from "node:path";

import { createCustomTools, createHermitTools } from "./agent-tools.js";
import { DEFAULT_THINKING_LEVEL, HERMIT_ROLE_ID, HERMIT_ROLE_ROOT } from "./constants.js";
import { resolveConfiguredModel } from "./model-auth.js";
import { resolveSessionModelPreferences, type ModelRoutingPurpose } from "./runtime-config.js";
import { normalizeProviderEnvironment } from "./provider-env.js";
import { PromptLibrary } from "./prompt-library.js";
import { resolveCommonAncestor, resolveFrameworkRoot, resolveSharedSkillDirectories, uniquePaths } from "./runtime-paths.js";
import { TelemetryRecorder } from "./telemetry-recorder.js";
import type { PromptContext, RoleDefinition, RoleSwitchRequest, SessionHistoryType, TelemetrySessionContext, WorkspaceInitializationState } from "./types.js";
import { ensureWorkspaceScaffold, getWorkspaceInitializationState } from "./workspace.js";

export { loadImageAttachments } from "./image-attachments.js";

export interface InteractiveChatSession {
  session: AgentSession;
  telemetry: TelemetryRecorder;
  workspaceState: WorkspaceInitializationState;
  activeRoleLabel: string;
  modelLabel: string;
  consumeRoleSwitchRequest: () => RoleSwitchRequest | undefined;
}

const HERMIT_INTERACTIVE_SESSION_DIRECTORY = path.join(".hermit", "sessions", "hermit");
const HERMIT_HEARTBEAT_SESSION_DIRECTORY = path.join(".hermit", "sessions", "hermit-heartbeat");

export function resolvePersistedSessionDirectory(
  role: RoleDefinition,
  historyType: SessionHistoryType = "interactive",
): string {
  if (historyType === "heartbeat") {
    return path.join(role.roleDir, ".role-agent", "heartbeat-sessions");
  }
  return role.sessionsDir;
}

export function resolveHermitSessionDirectory(root: string, historyType: SessionHistoryType = "interactive"): string {
  return path.join(
    root,
    historyType === "heartbeat" ? HERMIT_HEARTBEAT_SESSION_DIRECTORY : HERMIT_INTERACTIVE_SESSION_DIRECTORY,
  );
}

export function resolveRoleSkillPaths(role: RoleDefinition): string[] {
  return uniquePaths([...resolveSharedSkillDirectories(role.root, role.frameworkRoot), role.roleSkillsDir]);
}

export function resolveSharedSkillPaths(root: string, frameworkRoot = resolveFrameworkRoot()): string[] {
  return resolveSharedSkillDirectories(root, frameworkRoot);
}

interface BaseSessionOptions {
  root: string;
  promptContext: PromptContext;
  persist: boolean;
  continueRecent?: boolean;
  sessionHistoryType?: SessionHistoryType;
  telemetryCommandName?: string;
  telemetryContext?: Partial<TelemetrySessionContext>;
  onRoleSwitchRequest?: (request: RoleSwitchRequest) => void;
  modelRoutingPurpose?: ModelRoutingPurpose;
}

interface RoleSessionOptions extends BaseSessionOptions {
  role: RoleDefinition;
}

export interface HermitSessionOptions extends BaseSessionOptions {
  bootstrapMode?: boolean;
}

type SessionOptions =
  | ({ kind: "role" } & RoleSessionOptions)
  | ({ kind: "hermit" } & HermitSessionOptions);

interface PreparedSession {
  roleId: string;
  promptLibrary: PromptLibrary;
  workspaceState: WorkspaceInitializationState;
  systemPrompt: string;
  executionRoot: string;
  skillPaths: string[];
  sessionsDir: string;
  customTools: ToolDefinition<any>[];
}

function buildTelemetryContext(
  options: BaseSessionOptions,
  roleId: string,
): Omit<TelemetrySessionContext, "modelProvider" | "modelId"> {
  return {
    workspaceRoot: options.root,
    roleId,
    commandName: options.telemetryCommandName ?? "chat",
    persist: options.persist,
    ...(options.continueRecent !== undefined ? { continueRecent: options.continueRecent } : {}),
    ...options.telemetryContext,
  };
}

async function prepareSession(options: SessionOptions): Promise<PreparedSession> {
  if (options.kind === "role") {
    await ensureWorkspaceScaffold(options.root, options.role);

    const workspaceState = await getWorkspaceInitializationState(options.root, options.role);
    const promptLibrary = await PromptLibrary.load(options.role);
    const promptContext = enrichPromptContextWithCurrentTime(options.promptContext);

    return {
      roleId: options.role.id,
      promptLibrary,
      workspaceState,
      systemPrompt: await promptLibrary.renderSystemPrompt(promptContext),
      executionRoot: resolveCommonAncestor(options.role.frameworkRoot, options.root),
      skillPaths: resolveRoleSkillPaths(options.role),
      sessionsDir: resolvePersistedSessionDirectory(options.role, options.sessionHistoryType),
      customTools: createCustomTools(options.root, options.role, {
        ...(options.onRoleSwitchRequest ? { onRoleSwitchRequest: options.onRoleSwitchRequest } : {}),
      }),
    };
  }

  await ensureWorkspaceScaffold(options.root);

  const frameworkRoot = resolveFrameworkRoot();
  const workspaceState = await getWorkspaceInitializationState(options.root);
  const promptLibrary = await PromptLibrary.loadForWorkspace(options.root, "", frameworkRoot);
  const promptContext = enrichPromptContextWithCurrentTime({
    roleId: HERMIT_ROLE_ID,
    roleRoot: HERMIT_ROLE_ROOT,
    ...options.promptContext,
  });
  const baseSystemPrompt = await promptLibrary.renderSystemPrompt(promptContext);
  const bootstrapOverlay = options.bootstrapMode
    ? await promptLibrary.renderSharedPromptDirectory(BOOTSTRAP_PROMPTS_DIRECTORY, promptContext)
    : "";

  return {
    roleId: HERMIT_ROLE_ID,
    promptLibrary,
    workspaceState,
    systemPrompt: [baseSystemPrompt, bootstrapOverlay].filter(Boolean).join("\n\n"),
    executionRoot: resolveCommonAncestor(frameworkRoot, options.root),
    skillPaths: resolveSharedSkillPaths(options.root, frameworkRoot),
    sessionsDir: resolveHermitSessionDirectory(options.root, options.sessionHistoryType),
    customTools: createHermitTools(options.root, {
      ...(options.onRoleSwitchRequest ? { onRoleSwitchRequest: options.onRoleSwitchRequest } : {}),
    }),
  };
}

async function createSession(options: SessionOptions): Promise<{
  session: AgentSession;
  promptLibrary: PromptLibrary;
  workspaceState: WorkspaceInitializationState;
  telemetry: TelemetryRecorder;
  modelLabel: string;
}> {
  const prepared = await prepareSession(options);
  const { session, telemetry, modelLabel } = await createSessionCore({
    root: options.root,
    executionRoot: prepared.executionRoot,
    systemPrompt: prepared.systemPrompt,
    skillPaths: prepared.skillPaths,
    sessionsDir: prepared.sessionsDir,
    persist: options.persist,
    continueRecent: options.continueRecent,
    customTools: prepared.customTools,
    telemetryContext: buildTelemetryContext(options, prepared.roleId),
    ...(options.modelRoutingPurpose ? { modelRoutingPurpose: options.modelRoutingPurpose } : {}),
  });

  return {
    session,
    promptLibrary: prepared.promptLibrary,
    workspaceState: prepared.workspaceState,
    telemetry,
    modelLabel,
  };
}

const BOOTSTRAP_PROMPTS_DIRECTORY = "bootstrap";

function enrichPromptContextWithCurrentTime(promptContext: PromptContext): PromptContext {
  const now = new Date();
  const currentTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const currentLocalDateTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: currentTimeZone,
    dateStyle: "full",
    timeStyle: "long",
  }).format(now);

  return {
    ...promptContext,
    currentDateTimeIso: now.toISOString(),
    currentLocalDateTime,
    currentTimeZone,
  };
}

interface SessionCoreOptions {
  root: string;
  executionRoot: string;
  systemPrompt: string;
  skillPaths: string[];
  sessionsDir: string;
  persist: boolean;
  continueRecent?: boolean | undefined;
  customTools: ToolDefinition<any>[];
  telemetryContext: Omit<TelemetrySessionContext, "modelProvider" | "modelId">;
  modelRoutingPurpose?: ModelRoutingPurpose;
}

export function appendLiveModelContext(systemPrompt: string, modelLabel: string, modelRoutingPurpose?: ModelRoutingPurpose): string {
  const purposeLabel = modelRoutingPurpose ?? "unspecified";
  const contextBlock = [
    "# Live Runtime Context",
    `- Current session model: ${modelLabel}`,
    `- Current session routing purpose: ${purposeLabel}`,
    "- Treat this as authoritative runtime metadata, not something you inferred.",
  ].join("\n");

  return `${systemPrompt.trimEnd()}\n\n${contextBlock}`;
}

async function createSessionCore(options: SessionCoreOptions): Promise<{
  session: AgentSession;
  telemetry: TelemetryRecorder;
  modelLabel: string;
}> {
  normalizeProviderEnvironment();
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const configuredPreferences = options.modelRoutingPurpose
    ? await resolveSessionModelPreferences(options.root, options.modelRoutingPurpose)
    : undefined;
  const { model } = resolveConfiguredModel(
    authStorage,
    modelRegistry,
    configuredPreferences?.preferredModel,
    configuredPreferences?.fallbackModels,
  );
  const modelLabel = `${model.provider}/${model.id}`;

  // Audit: if the resolved model is openai/gpt-5.4, record an explicit usage log so saved-session and doctor wrappers
  // are always auditable. This complements scripts/run-strategic-review-guard.ts which already logs strategic-review runs.
  const describeNonFatalError = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

  try {
    if (model.provider === "openai" && model.id && model.id.includes("gpt-5.4")) {
      // Use a best-effort, non-blocking child process call to the workspace logger script.
      // It is important this never throws and never blocks main flow.
      const { spawnSync } = await import("node:child_process");
      const scriptPath = "scripts/log-5.4-use.mjs";
      const args = [
        scriptPath,
        "--model",
        `${model.provider}/${model.id}`,
        "--reason",
        "session_create",
        "--command",
        options.telemetryContext.commandName || "unknown",
      ];
      try {
        spawnSync(process.execPath, args, {
          stdio: "ignore",
          cwd: options.executionRoot || process.cwd(),
          timeout: 2000,
        });
      } catch (error) {
        // ignore logging failures, but surface a debug message
        // eslint-disable-next-line no-console
        console.error("Failed to spawn 5.4 usage logger (non-fatal):", describeNonFatalError(error));
      }
    }
  } catch (error) {
    // Keep session creation robust: never fail on logging.
    // eslint-disable-next-line no-console
    console.error("Error while attempting to audit model usage (non-fatal):", describeNonFatalError(error));
  }

  const loader = new DefaultResourceLoader({
    cwd: options.executionRoot,
    agentDir: getAgentDir(),
    noExtensions: true,
    additionalSkillPaths: options.skillPaths,
    noPromptTemplates: true,
    noThemes: true,
    appendSystemPromptOverride: (base) => [
      ...base,
      appendLiveModelContext(options.systemPrompt, modelLabel, options.modelRoutingPurpose),
    ],
  });
  await loader.reload();

  const sessionManager = !options.persist
    ? SessionManager.inMemory(options.executionRoot)
    : options.continueRecent
      ? SessionManager.continueRecent(options.executionRoot, options.sessionsDir)
      : SessionManager.create(options.executionRoot, options.sessionsDir);

  const { session } = await createAgentSession({
    cwd: options.executionRoot,
    authStorage,
    modelRegistry,
    model,
    thinkingLevel: DEFAULT_THINKING_LEVEL,
    customTools: options.customTools,
    resourceLoader: loader,
    sessionManager,
  });

  const telemetry = await TelemetryRecorder.create({
    ...options.telemetryContext,
    modelProvider: model.provider,
    modelId: model.id,
  });

  return { session, telemetry, modelLabel };
}

export async function createRoleSession(options: RoleSessionOptions): Promise<{
  session: AgentSession;
  promptLibrary: PromptLibrary;
  workspaceState: WorkspaceInitializationState;
  telemetry: TelemetryRecorder;
  modelLabel: string;
}> {
  return createSession({ kind: "role", ...options });
}

export async function createHermitSession(options: HermitSessionOptions): Promise<{
  session: AgentSession;
  promptLibrary: PromptLibrary;
  workspaceState: WorkspaceInitializationState;
  telemetry: TelemetryRecorder;
  modelLabel: string;
}> {
  return createSession({ kind: "hermit", ...options });
}
