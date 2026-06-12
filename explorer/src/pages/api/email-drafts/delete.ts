import { promises as fs } from "node:fs";
import path from "node:path";

import type { APIRoute } from "astro";

import { getWorkspaceRoot } from "../../../lib/workspace.js";

const draftsPath = path.join(
  getWorkspaceRoot(),
  "entities",
  "work-items",
  "wi-set-up-operational-business-email-templates",
  "email-templates.md",
);

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim() : "";

    if (!title) {
      return new Response(JSON.stringify({ error: "Missing draft title." }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const markdown = await fs.readFile(draftsPath, "utf8");
    const lines = markdown.split("\n");
    const target = normalize(title);

    // A draft is a top-level "## <language>" section. Remove from its heading
    // up to (but not including) the next "## " heading or end of file.
    let startIndex = -1;
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(/^##\s+(.+?)\s*$/);
      if (match && normalize(match[1]) === target) {
        startIndex = i;
        break;
      }
    }

    if (startIndex === -1) {
      return new Response(JSON.stringify({ error: "Draft section not found." }), {
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

    await fs.writeFile(draftsPath, nextMarkdown, "utf8");

    return new Response(JSON.stringify({ ok: true, removedTitle: title }), {
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
