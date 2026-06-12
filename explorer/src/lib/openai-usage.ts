import path from "node:path";
import { promises as fs } from "node:fs";

export type UsageTotals = {
  cost: number;
  tokens: number;
  entries: number;
};

export function formatCurrency(amount: number): string {
  const digits = amount < 1 ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

async function listUsageSessionFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error) => {
    const code = error && typeof error === "object" && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") {
      return [] as fs.Dirent[];
    }
    throw error;
  });

  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listUsageSessionFiles(fullPath);
      }
      if (!entry.isFile() || !fullPath.endsWith(".jsonl")) {
        return [] as string[];
      }
      if (
        fullPath.includes(`${path.sep}.hermit${path.sep}sessions${path.sep}`) ||
        fullPath.includes(`${path.sep}.role-agent${path.sep}sessions${path.sep}`) ||
        fullPath.includes(`${path.sep}.role-agent${path.sep}heartbeat-sessions${path.sep}`)
      ) {
        return [fullPath];
      }
      return [] as string[];
    }),
  );

  return files.flat();
}

function extractUsageEntry(record: any): { timestamp: string; cost: number; tokens: number } | undefined {
  const usage =
    record?.message?.usage ??
    record?.usage ??
    (Array.isArray(record?.message?.content) ? record.message.content.find((part: any) => part?.usage)?.usage : undefined);
  if (!usage) {
    return undefined;
  }

  // Count spend from all billable model providers (OpenAI and Anthropic).
  // Local/free providers (e.g. Gemma) record zero cost, so they do not affect totals.
  const provider = String(record?.message?.provider ?? record?.provider ?? "").toLowerCase();
  const api = String(record?.message?.api ?? record?.api ?? "").toLowerCase();
  const billableProviders = ["openai", "anthropic"];
  const isBillable = billableProviders.some((name) => provider.includes(name) || api.includes(name));
  if (!isBillable) {
    return undefined;
  }

  const timestamp = record?.timestamp ?? record?.message?.timestamp;
  if (!timestamp) {
    return undefined;
  }

  return {
    timestamp,
    cost: Number(usage?.cost?.total ?? 0),
    tokens: Number(usage?.totalTokens ?? 0),
  };
}

export async function getUsageForPeriod(dir: string, startDate: Date, endDate: Date): Promise<UsageTotals> {
  const files = await listUsageSessionFiles(dir);
  const totals: UsageTotals = { cost: 0, tokens: 0, entries: 0 };

  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8").catch((error) => {
      const code = error && typeof error === "object" && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code === "ENOENT") {
        return "";
      }
      throw error;
    });

    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }

      try {
        const parsed = JSON.parse(line);
        const entry = extractUsageEntry(parsed);
        if (!entry) {
          continue;
        }
        const entryDate = new Date(entry.timestamp);
        if (entryDate < startDate || entryDate > endDate) {
          continue;
        }

        totals.cost += entry.cost;
        totals.tokens += entry.tokens;
        totals.entries += 1;
      } catch {
        // Ignore malformed lines and keep the page usable.
      }
    }
  }

  return totals;
}
