#!/usr/bin/env node
/**
 * Copies src/templates/ into out/templates/, skipping .ts files.
 * Pass --watch to re-copy on every change.
 */

import { readdir, copyFile, mkdir } from "fs/promises";
import { watch } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src", "templates");
const OUT = join(__dirname, "..", "out", "templates");

async function copy(src, out) {
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const outPath = join(out, entry.name);
    if (entry.isDirectory()) {
      await mkdir(outPath, { recursive: true });
      await copy(srcPath, outPath);
    } else if (!entry.name.endsWith(".ts")) {
      await mkdir(dirname(outPath), { recursive: true });
      await copyFile(srcPath, outPath);
    }
  }
}

await copy(SRC, OUT);
console.log("✔  Templates copied to out/templates/");

if (process.argv.includes("--watch")) {
  console.log("👀 Watching src/templates/ for changes...");
  let debounce;
  watch(SRC, { recursive: true }, (_, filename) => {
    if (filename?.endsWith(".ts")) {
      return;
    }
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      await copy(SRC, OUT);
      console.log(`✔  Copied (${filename})`);
    }, 100);
  });
}
