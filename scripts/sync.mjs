#!/usr/bin/env node
/**
 * DEV TOOL — keeps package.json in sync with src/templates/.
 * Called automatically by create.mjs, or run manually after editing a _meta.json.
 *
 * Merges template-generated commands and menu items with any existing
 * non-template entries so hand-written commands are never removed.
 *
 * Usage:
 *   npm run magento:sync
 */

import { readdir, readFile, writeFile } from "fs/promises";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TEMPLATES = join(ROOT, "src", "templates");
const PKG_PATH = join(ROOT, "package.json");

// ── Validation ────────────────────────────────────────────────────────────────

function validate(meta, file) {
  const required = [
    "id",
    "label",
    "command",
    "contextMenu",
    "steps",
    "outputPath",
  ];
  const missing = required.filter((k) => !(k in meta));
  if (missing.length) {
    throw new Error(
      `${file} is missing required fields: ${missing.join(", ")}`,
    );
  }
  if (!meta.contextMenu.when) {
    throw new Error(`${file}: contextMenu.when is required`);
  }
  if (!meta.contextMenu.group) {
    throw new Error(`${file}: contextMenu.group is required`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const entries = await readdir(TEMPLATES, { withFileTypes: true });
  const metas = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const metaPath = join(TEMPLATES, entry.name, "_meta.json");
    if (!existsSync(metaPath)) {
      console.warn(`  ⚠  Skipping "${entry.name}" — no _meta.json found`);
      continue;
    }

    let meta;
    try {
      meta = JSON.parse(await readFile(metaPath, "utf8"));
    } catch {
      console.error(`  ✖  Failed to parse ${metaPath}`);
      process.exit(1);
    }

    try {
      validate(meta, metaPath);
    } catch (err) {
      console.error(`  ✖  ${err.message}`);
      process.exit(1);
    }

    metas.push(meta);
  }

  if (!metas.length) {
    console.error("No valid templates found in src/templates/");
    process.exit(1);
  }

  metas.sort((a, b) => a.contextMenu.group.localeCompare(b.contextMenu.group));

  const pkg = JSON.parse(await readFile(PKG_PATH, "utf8"));
  pkg.contributes ??= {};
  pkg.contributes.commands ??= [];
  pkg.contributes.menus ??= {};
  pkg.contributes.menus["explorer/context"] ??= [];

  // Collect command IDs generated from templates
  const templateCommandIds = new Set(metas.map((m) => m.command));

  // Keep existing commands that are NOT template-generated
  const manualCommands = pkg.contributes.commands.filter(
    (c) => !templateCommandIds.has(c.command),
  );

  // Keep existing menu items that are NOT template-generated
  const manualMenuItems = pkg.contributes.menus["explorer/context"].filter(
    (m) => !templateCommandIds.has(m.command),
  );

  // Merge: manual entries first, then template-generated ones
  pkg.contributes.commands = [
    ...manualCommands,
    ...metas.map((m) => ({ command: m.command, title: m.label })),
  ];

  pkg.contributes.menus["explorer/context"] = [
    ...manualMenuItems,
    ...metas.map((m) => ({
      command: m.command,
      when: m.contextMenu.when,
      group: m.contextMenu.group,
    })),
  ];

  await writeFile(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n", "utf8");

  console.log(`\n✔  Synced ${metas.length} template(s) into package.json\n`);
  for (const m of metas) {
    console.log(`   ${m.id.padEnd(16)} ${m.command}`);
  }
  console.log("\nCommit package.json alongside your template changes.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
