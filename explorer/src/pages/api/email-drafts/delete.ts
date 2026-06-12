import { promises as fs } from "node:fs";
import path from "node:path";

import type { APIRoute } from "astro";

import { getWorkspaceRoot } from "../../../lib/workspace.js";

// Whitelisted delete targets. Each maps to the markdown file whose top-level
// "## <title>" sections can be removed one by one from the Explorer.
const DELETE_TARGETS: Record<string, { workItemId: string; fileName: string }> = {
  templates: {
    workItemId: "wi-set-up-operational-business-email-templates",
    fileName: "email-templates.md",
  },
  drafts: {
    workItemId: "wi-update-sales-pipeline-from-last-2-months-email-sweep",
    fileName: "email-drafts.md",
  },
};

function resolveTargetPath(target: string): string | undefined {
  const entry = DELETE_TARGETS[target];
  if (!entry) {
    return undefined;
  }
  return path.join(getWorkspaceRoot(), "entities", "work-items", entry.workItemId, entry.fileName);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    // Default to "templates" for backward compatibility with older clients.
    const target = typeof body?.target === "string" && body.target.trim() ? body.target.trim() : "templates";

    if (!title) {
      return new Response(JSON.stringify({ error: "Missing item title." }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const filePath = resolveTargetPath(target);
    if (!filePath) {
      return new Response(JSON.stringify({ error: `Unknown delete target: ${target}.` }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const markdown = await fs.readFile(filePath, "utf8");
    const lines = markdown.split("\n");
    const wanted = normalize(title);

    // An item is a top-level "## <title>" section. Remove from its heading up to
    // (but not including) the next "## " heading or the end of the file.
    let startIndex = -1;
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(/^##\s+(.+?)\s*$/);
      if (match && normalize(match[1]) === wanted) {
        startIndex = i;
        break;
      }
    }

    if (startIndex === -1) {
      return new Response(JSON.stringify({ error: "Section not found." }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    let endIndex = lines.length;
    for (let i = startIndex + 1; i < lines.length; i += 1) {
      if (/^##\s+/.test(lines[i])) {
        endIndex = i;
        break;
      }
    }

    const nextLines = [...lines.slice(0, startIndex), ...lines.slice(endIndex)];
    const nextMarkdown = `${nextLines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "")}\n`;

    await fs.writeFile(filePath, nextMarkdown, "utf8");

    return new Response(JSON.stringify({ ok: true, removedTitle: title, target }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
};
