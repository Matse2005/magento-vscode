#!/usr/bin/env node
/**
 * DEV TOOL — scaffold a new template folder under src/templates/.
 * Run this when you want to add a new wizard (e.g. plugin, observer, cron).
 *
 * Creates:
 *   src/templates/<id>/_meta.json
 *   src/templates/<id>/sources.ts
 *   src/templates/<id>/<file>.hbs  (one stub per file you specify)
 *
 * Then automatically runs sync-manifest to update package.json.
 *
 * Usage:
 *   npm run magento:create
 */

import { input, select, confirm, checkbox } from "@inquirer/prompts";
import { mkdir, writeFile } from "fs/promises";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TEMPLATES = join(ROOT, "src", "templates");

// ── Context menu depth presets ────────────────────────────────────────────────

const DEPTH_PRESETS = [
  {
    name: "app/code  —  module creation level",
    value:
      "explorerResourceIsFolder && resourcePath =~ /.*[/\\\\]app[/\\\\]code$/",
    group: "magento@1",
  },
  {
    name: "app/code/Vendor  —  vendor level",
    value:
      "explorerResourceIsFolder && resourcePath =~ /.*[/\\\\]app[/\\\\]code[/\\\\][^/\\\\]+$/",
    group: "magento@2",
  },
  {
    name: "app/code/Vendor/Module  —  inside an existing module",
    value:
      "explorerResourceIsFolder && resourcePath =~ /.*[/\\\\]app[/\\\\]code[/\\\\][^/\\\\]+[/\\\\][^/\\\\]+$/",
    group: "magento@3",
  },
  {
    name: "Any folder  —  manual override",
    value: "explorerResourceIsFolder",
    group: "magento@9",
  },
  {
    name: "Custom  —  I'll type my own when clause",
    value: "__custom__",
    group: "",
  },
];

const STEP_TYPES = ["input", "select", "multi-select"];
const VALIDATIONS = ["(none)", "pascal-case", "semver", "non-empty"];

// ── Templates ─────────────────────────────────────────────────────────────────

function metaJson(id, label, command, when, group, outputPath, steps) {
  return (
    JSON.stringify(
      { id, label, command, contextMenu: { when, group }, steps, outputPath },
      null,
      2,
    ) + "\n"
  );
}

function sourcesTs(steps) {
  const sourceIds = [
    ...new Set(
      steps
        .filter((s) => s.source && s.source !== "(none)")
        .map((s) => s.source),
    ),
  ];

  if (sourceIds.length === 0) {
    return `import type { SourceItem, SourceContext } from '../../services/templateRegistry';

// No sources defined for this template.
// Add exports here if you add select/multi-select steps later.
export default {};
`;
  }

  const exports = sourceIds
    .map(
      (id) => `
/**
 * Source: "${id}"
 * Return the items shown in the wizard QuickPick for this step.
 * Receives { targetPath, answers } — use them to build a dynamic list if needed.
 */
const ${id} = async ({ targetPath, answers }: SourceContext): Promise<SourceItem[]> => {
  // TODO: implement
  return [];
};`,
    )
    .join("\n");

  return `import type { SourceItem, SourceContext } from '../../services/templateRegistry';
${exports}

export default { ${sourceIds.join(", ")} };
`;
}

function stubHbs(templateId, filePath) {
  return `{{!-- ${templateId}/${filePath} --}}
{{!-- Available variables (from _meta.json steps + buildContext in extension.ts):
  General  : {{year}}
  Module   : {{packageName}} {{moduleName}} {{fullModuleName}} {{version}}
  Composer : {{packageNameLower}} {{moduleNameLower}}
  Deps     : {{#each dependencies}}{{this.moduleName}} {{this.composerName}}{{/each}}
  Helpers  : {{lowercase x}} {{uppercase x}} {{kebab x}} {{snake x}} {{join arr ", "}}
--}}

`;
}

// ── Prompt helpers ────────────────────────────────────────────────────────────

async function collectSteps() {
  const steps = [];
  let adding = true;

  console.log("\nDefine the wizard steps shown to the user.\n");

  while (adding) {
    const id = await input({
      message: "Step ID (camelCase)",
      validate: (v) =>
        /^[a-z][a-zA-Z0-9]+$/.test(v) || "camelCase only, e.g. packageName",
    });

    const label = await input({ message: "Label shown to the user" });

    const type = await select({
      message: "Input type",
      choices: STEP_TYPES.map((t) => ({ name: t, value: t })),
    });

    const step = { id, type, label };

    if (type === "input") {
      const placeholder = await input({
        message: "Placeholder (optional)",
        default: "",
      });
      const def = await input({
        message: "Default value (optional)",
        default: "",
      });
      const validation = await select({
        message: "Validation",
        choices: VALIDATIONS.map((v) => ({ name: v, value: v })),
      });
      if (placeholder) {
        step.placeholder = placeholder;
      }
      if (def) {
        step.default = def;
      }
      if (validation !== "(none)") {
        step.validate = validation;
      }
    } else {
      const source = await input({
        message: "Source key (must match an export in sources.ts)",
        validate: (v) => v.trim().length > 0 || "Required",
      });
      const optional = await confirm({
        message: "Is this step optional?",
        default: false,
      });
      step.source = source;
      if (optional) {
        step.optional = true;
      }
    }

    steps.push(step);
    adding = await confirm({ message: "Add another step?", default: true });
  }

  return steps;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🧱  Magento Extension — New Template Scaffolder\n");

  // 1. Identity
  const id = await input({
    message: "Template ID (lowercase, used as folder name)",
    validate: (v) =>
      /^[a-z][a-z0-9-]+$/.test(v) ||
      "Lowercase letters, numbers and hyphens only",
  });

  const targetDir = join(TEMPLATES, id);
  if (existsSync(targetDir)) {
    console.error(`\n✖  src/templates/${id}/ already exists. Aborting.\n`);
    process.exit(1);
  }

  const label = await input({
    message: "Context menu label",
    default: `Magento: Create ${id[0].toUpperCase()}${id.slice(1)}`,
  });

  const command = await input({
    message: "VSCode command ID",
    default: `magento.create${id[0].toUpperCase()}${id.slice(1)}`,
    validate: (v) =>
      /^[a-zA-Z][a-zA-Z0-9.]+$/.test(v) || "Must be a valid command ID",
  });

  // 2. Context menu depth
  const preset = await select({
    message: "Where should this appear in the Explorer context menu?",
    choices: DEPTH_PRESETS.map((p) => ({ name: p.name, value: p })),
  });

  let when = preset.value;
  let group = preset.group;

  if (when === "__custom__") {
    when = await input({
      message: 'Custom "when" clause',
      validate: (v) => v.trim().length > 0 || "Required",
    });
    group = await input({
      message: "Menu group (e.g. magento@2)",
      default: "magento@1",
      validate: (v) => /^[a-z]+@\d+$/.test(v) || "Format: word@number",
    });
  }

  // 3. Output path
  const outputPath = await input({
    message:
      "Output path template (Handlebars, relative to right-clicked folder)",
    default: "{{packageName}}/{{moduleName}}",
    validate: (v) => v.trim().length > 0 || "Required",
  });

  // 4. Wizard steps
  const steps = await collectSteps();

  // 5. Stub files
  const fileInput = await input({
    message:
      "Files to scaffold (comma-separated paths, e.g. registration.php,etc/module.xml)",
    validate: (v) => v.trim().length > 0 || "At least one file is required",
  });
  const files = fileInput
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  // 6. Write everything
  await mkdir(targetDir, { recursive: true });

  await writeFile(
    join(targetDir, "_meta.json"),
    metaJson(id, label, command, when, group, outputPath, steps),
  );
  console.log(`\n  ✔  src/templates/${id}/_meta.json`);

  await writeFile(join(targetDir, "sources.ts"), sourcesTs(steps));
  console.log(`  ✔  src/templates/${id}/sources.ts`);

  for (const file of files) {
    const hbsPath = join(targetDir, file + ".hbs");
    await mkdir(dirname(hbsPath), { recursive: true });
    await writeFile(hbsPath, stubHbs(id, file));
    console.log(`  ✔  src/templates/${id}/${file}.hbs`);
  }

  // 7. Sync package.json
  console.log("\n  ↻  Running sync-manifest…\n");
  try {
    execSync("node scripts/sync.mjs", { cwd: ROOT, stdio: "inherit" });
  } catch {
    console.error(
      "\n  ✖  sync manifest failed — run it manually: npm run magento:sync\n",
    );
    process.exit(1);
  }

  console.log("\nDone! Next steps:");
  console.log(`  1. Fill in src/templates/${id}/*.hbs`);
  console.log(`  2. Implement sources in src/templates/${id}/sources.ts`);
  console.log(`  3. git add src/templates/${id} package.json && git commit\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
