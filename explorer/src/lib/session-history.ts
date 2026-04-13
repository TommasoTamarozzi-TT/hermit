import { promises as fs } from "node:fs";
import path from "node:path";

import type { RoleDefinition } from "./workspace.js";

interface SessionHeaderEntry {
  type: "session";
  timestamp?: string;
  cwd?: string;
}

interface SessionModelChangeEntry {
  type: "model_change";
  timestamp?: string;
  provider?: string;
  modelId?: string;
}

interface SessionThinkingLevelChangeEntry {
  type: "thinking_level_change";
  timestamp?: string;
  thinkingLevel?: string;
}

interface SessionMessageEntry {
  type: "message";
  timestamp?: string;
  message?: {
    role?: string;
    content?: unknown;
    toolName?: string;
    details?: unknown;
    isError?: boolean;
    command?: string;
    output?: string;
    customType?: string;
    display?: boolean;
    provider?: string;
    model?: string;
  };
}

type SessionEntry = SessionHeaderEntry | SessionModelChangeEntry | SessionThinkingLevelChangeEntry | SessionMessageEntry | {
  type: string;
  timestamp?: string;
  [key: string]: unknown;
};

export interface ConversationPreview {
  text: string;
  summary: string;
}

export interface LatestRoleConversationSummary {
  roleId: string;
  roleName: string;
  roleDescription: string;
  agentHref: string;
  conversationHref: string;
  sessionPath?: string;
  sessionFileName?: string;
  startedAt?: string;
  lastUpdatedAt?: string;
  currentModel?: string;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  lastUserMessage?: ConversationPreview;
  lastAssistantMessage?: ConversationPreview;
}

export interface ConversationTimelineEntry {
  kind: "model-change" | "thinking-level-change" | "user" | "assistant" | "tool-result" | "bash-execution" | "custom" | "system";
  timestamp?: string;
  label: string;
  text?: string;
  preview?: string;
  toolCalls?: Array<{ name: string; argumentsText?: string }>;
  toolName?: string;
  detailsText?: string;
  command?: string;
  isError?: boolean;
  customType?: string;
}

export interface LatestRoleConversation extends LatestRoleConversationSummary {
  entries: ConversationTimelineEntry[];
}

function summarizeText(text: string, maxLength = 220): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function stringifyValue(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function extractTextContent(content: unknown, options: { includeThinking?: boolean } = {}): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }

  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }

    const type = (block as { type?: unknown }).type;
    if (type === "text") {
      const text = (block as { text?: unknown }).text;
      if (typeof text === "string" && text.trim().length > 0) {
        parts.push(text);
      }
      continue;
    }

    if (type === "image") {
      const mimeType = (block as { mimeType?: unknown }).mimeType;
      parts.push(typeof mimeType === "string" ? `[image: ${mimeType}]` : "[image]");
      continue;
    }

    if (type === "thinking" && options.includeThinking) {
      const thinking = (block as { thinking?: unknown }).thinking;
      if (typeof thinking === "string" && thinking.trim().length > 0) {
        parts.push(thinking);
      }
    }
  }

  return parts.join("\n\n").trim();
}

function extractToolCalls(content: unknown): Array<{ name: string; argumentsText?: string }> {
  if (!Array.isArray(content)) {
    return [];
  }

  return content
    .filter((block): block is { type: string; name?: string; arguments?: unknown } => Boolean(block) && typeof block === "object")
    .filter((block) => block.type === "toolCall" && typeof block.name === "string")
    .map((block) => ({
      name: block.name!,
      argumentsText: stringifyValue(block.arguments),
    }));
}

async function findLatestSessionPath(role: RoleDefinition): Promise<string | undefined> {
  try {
    const entries = await fs.readdir(role.sessionsDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => entry.name)
      .sort();

    const latest = files.at(-1);
    return latest ? path.join(role.sessionsDir, latest) : undefined;
  } catch {
    return undefined;
  }
}

async function readSessionEntries(sessionPath: string): Promise<SessionEntry[]> {
  const raw = await fs.readFile(sessionPath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as SessionEntry);
}

function toPreview(text: string | undefined): ConversationPreview | undefined {
  if (!text || text.trim().length === 0) {
    return undefined;
  }
  return {
    text,
    summary: summarizeText(text),
  };
}

function buildConversationEntries(entries: SessionEntry[]): ConversationTimelineEntry[] {
  const timeline: ConversationTimelineEntry[] = [];

  for (const entry of entries) {
    if (entry.type === "model_change") {
      timeline.push({
        kind: "model-change",
        timestamp: entry.timestamp,
        label: "Model change",
        text: [entry.provider, entry.modelId].filter(Boolean).join("/"),
      });
      continue;
    }

    if (entry.type === "thinking_level_change") {
      timeline.push({
        kind: "thinking-level-change",
        timestamp: entry.timestamp,
        label: "Thinking level",
        text: entry.thinkingLevel,
      });
      continue;
    }

    if (entry.type !== "message" || !entry.message) {
      continue;
    }

    const { message } = entry;
    const role = message.role;

    if (role === "user") {
      const text = extractTextContent(message.content);
      timeline.push({
        kind: "user",
        timestamp: entry.timestamp,
        label: "User",
        text,
        preview: summarizeText(text),
      });
      continue;
    }

    if (role === "assistant") {
      const text = extractTextContent(message.content);
      const toolCalls = extractToolCalls(message.content);
      timeline.push({
        kind: "assistant",
        timestamp: entry.timestamp,
        label: "Assistant",
        text,
        preview: summarizeText(text || (toolCalls.length > 0 ? `Called ${toolCalls.length} tool${toolCalls.length === 1 ? "" : "s"}.` : "")),
        toolCalls,
      });
      continue;
    }

    if (role === "toolResult") {
      const text = extractTextContent(message.content);
      timeline.push({
        kind: "tool-result",
        timestamp: entry.timestamp,
        label: "Tool result",
        toolName: message.toolName,
        text,
        preview: summarizeText(text || `${message.toolName ?? "tool"} finished`),
        detailsText: stringifyValue(message.details),
        isError: Boolean(message.isError),
      });
      continue;
    }

    if (role === "bashExecution") {
      const text = typeof message.output === "string" ? message.output : extractTextContent(message.content);
      timeline.push({
        kind: "bash-execution",
        timestamp: entry.timestamp,
        label: "Bash execution",
        command: message.command,
        text,
        preview: summarizeText(message.command || text || "bash command"),
      });
      continue;
    }

    if (role === "custom") {
      const text = extractTextContent(message.content) || stringifyValue(message.content) || "";
      timeline.push({
        kind: "custom",
        timestamp: entry.timestamp,
        label: message.customType ? `Custom · ${message.customType}` : "Custom",
        customType: message.customType,
        text,
        preview: summarizeText(text || "Custom event"),
      });
      continue;
    }

    const text = extractTextContent(message.content);
    timeline.push({
      kind: "system",
      timestamp: entry.timestamp,
      label: role ? `Message · ${role}` : "Message",
      text,
      preview: summarizeText(text || "Event"),
    });
  }

  return timeline;
}

export async function loadLatestRoleConversation(role: RoleDefinition): Promise<LatestRoleConversation> {
  const sessionPath = await findLatestSessionPath(role);
  const baseSummary: LatestRoleConversationSummary = {
    roleId: role.id,
    roleName: role.name,
    roleDescription: role.description,
    agentHref: `/agents/${role.id}`,
    conversationHref: `/agents/${role.id}/conversation`,
    messageCount: 0,
    userMessageCount: 0,
    assistantMessageCount: 0,
  };

  if (!sessionPath) {
    return {
      ...baseSummary,
      entries: [],
    };
  }

  const rawEntries = await readSessionEntries(sessionPath);
  const entries = buildConversationEntries(rawEntries);
  const sessionHeader = rawEntries.find((entry): entry is SessionHeaderEntry => entry.type === "session");
  const modelChanges = rawEntries.filter((entry): entry is SessionModelChangeEntry => entry.type === "model_change");
  const assistantMessageEntries = rawEntries.filter(
    (entry): entry is SessionMessageEntry => entry.type === "message" && entry.message?.role === "assistant",
  );
  const userEntries = entries.filter((entry) => entry.kind === "user");
  const assistantEntries = entries.filter((entry) => entry.kind === "assistant");
  const lastEntryTimestamp = [...rawEntries].reverse().find((entry) => typeof entry.timestamp === "string")?.timestamp;
  const latestModelChange = modelChanges.at(-1);
  const lastAssistantModel = [...assistantMessageEntries]
    .reverse()
    .find((entry) => typeof entry.message?.provider === "string" && typeof entry.message?.model === "string");

  const currentModel = latestModelChange?.provider && latestModelChange.modelId
    ? `${latestModelChange.provider}/${latestModelChange.modelId}`
    : lastAssistantModel?.message?.provider && lastAssistantModel.message.model
      ? `${lastAssistantModel.message.provider}/${lastAssistantModel.message.model}`
      : undefined;

  return {
    ...baseSummary,
    sessionPath,
    sessionFileName: path.basename(sessionPath),
    startedAt: sessionHeader?.timestamp,
    lastUpdatedAt: lastEntryTimestamp,
    currentModel,
    messageCount: entries.filter((entry) => ["user", "assistant", "tool-result", "bash-execution", "custom"].includes(entry.kind)).length,
    userMessageCount: userEntries.length,
    assistantMessageCount: assistantEntries.length,
    lastUserMessage: toPreview(userEntries.at(-1)?.text),
    lastAssistantMessage: toPreview(assistantEntries.at(-1)?.text || assistantEntries.at(-1)?.preview),
    entries,
  };
}
