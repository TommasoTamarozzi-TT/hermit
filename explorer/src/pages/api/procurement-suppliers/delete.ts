import { promises as fs } from "node:fs";
import path from "node:path";

import type { APIRoute } from "astro";

import { getWorkspaceRoot } from "../../../lib/workspace.js";

const directoryPath = path.join(
  getWorkspaceRoot(),
  "entities",
  "work-items",
  "wi-build-supplier-directory-from-email-history",
  "artifacts",
  "supplier-directory.json",
);

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

interface Supplier {
  name?: string;
}

interface Section {
  id?: string;
  suppliers?: Supplier[];
}

interface Directory {
  generated_at?: string;
  sections?: Section[];
  [key: string]: unknown;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => null);
    const sectionId = typeof body?.sectionId === "string" ? body.sectionId.trim() : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!sectionId || !name) {
      return new Response(JSON.stringify({ error: "Missing section id or supplier name." }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const raw = await fs.readFile(directoryPath, "utf8");
    const directory = JSON.parse(raw) as Directory;
    const sections = Array.isArray(directory.sections) ? directory.sections : [];

    const target = normalize(name);
    let removed = false;

    for (const section of sections) {
      if (section?.id !== sectionId || !Array.isArray(section.suppliers)) {
        continue;
      }
      const before = section.suppliers.length;
      section.suppliers = section.suppliers.filter((supplier) => {
        if (!removed && supplier?.name && normalize(supplier.name) === target) {
          removed = true;
          return false;
        }
        return true;
      });
      if (section.suppliers.length !== before) {
        break;
      }
    }

    if (!removed) {
      return new Response(JSON.stringify({ error: "Supplier not found." }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    directory.generated_at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    await fs.writeFile(directoryPath, `${JSON.stringify(directory, null, 2)}\n`, "utf8");

    return new Response(JSON.stringify({ ok: true, removedName: name }), {
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
