import * as path from 'path';
import * as fs from 'fs/promises';
import type { Dirent } from 'fs';
import Handlebars from 'handlebars';

export type TemplateContext = Record<string, unknown>;

export interface FileWriter {
  write(filePath: string, content: string): Promise<void>;
  mkdir(dirPath: string): Promise<void>;
}

export class NodeFileWriter implements FileWriter {
  async write(filePath: string, content: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
  }
  async mkdir(dirPath: string) {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

export class TemplateEngine {
  private hbs = Handlebars.create();

  constructor() {
    this.hbs.registerHelper('lowercase', (s: string) => s?.toLowerCase());
    this.hbs.registerHelper('uppercase', (s: string) => s?.toUpperCase());
    this.hbs.registerHelper('kebab', (s: string) =>
      s?.replace(/([A-Z])/g, (m, c, i) => (i ? '-' : '') + c.toLowerCase())
    );
    this.hbs.registerHelper('snake', (s: string) =>
      s?.replace(/([A-Z])/g, (m, c, i) => (i ? '_' : '') + c.toLowerCase())
    );
    this.hbs.registerHelper('year', () => new Date().getFullYear());
    this.hbs.registerHelper('join', (arr: string[], sep: string) =>
      Array.isArray(arr) ? arr.join(typeof sep === 'string' ? sep : ', ') : arr
    );
  }

  async render(
    templateDir: string,
    outputDir: string,
    ctx: TemplateContext,
    writer: FileWriter
  ): Promise<string[]> {
    const written: string[] = [];
    await this.walk(templateDir, templateDir, outputDir, ctx, writer, written);
    return written;
  }

  private async walk(
    baseDir: string,
    currentDir: string,
    outputDir: string,
    ctx: TemplateContext,
    writer: FileWriter,
    written: string[]
  ) {
    const entries: Dirent[] = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const skipFiles = [
        "_meta.json",
        "sources.ts",
        "sources.js",
        "sources.js.map"
      ];

      if (skipFiles.includes(entry.name)) {
        continue;
      }

      const srcPath = path.join(currentDir, entry.name);
      const relPath = path.relative(baseDir, srcPath);
      const renderedRel = this.renderString(relPath.replace(/\.hbs$/, ''), ctx);
      const destPath = path.join(outputDir, renderedRel);

      if (entry.isDirectory()) {
        await writer.mkdir(destPath);
        await this.walk(baseDir, srcPath, outputDir, ctx, writer, written);
      } else if (entry.name.endsWith('.hbs')) {
        const raw = await fs.readFile(srcPath, 'utf8');
        console.log('RAW TEMPLATE:', raw);
        console.log('CTX themeName:', (ctx as any)['themeName']);
        const content = this.renderString(raw, ctx);
        console.log('RENDERED:', content);
        await writer.write(destPath, content);
        written.push(destPath);
      } else {
        const raw = await fs.readFile(srcPath);
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.writeFile(destPath, raw);
        written.push(destPath);
      }
    }
  }

  renderString(template: string, ctx: TemplateContext): string {
    return this.hbs.compile(template)(ctx);
  }
}