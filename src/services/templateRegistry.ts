import * as path from 'path';
import * as fs from 'fs/promises';
import type { Dirent } from 'fs'; // Dirent lives in 'fs', not 'fs/promises'

export type StepValidation = 'pascal-case' | 'semver' | 'non-empty';

export interface WizardStep {
  id: string;
  type: 'input' | 'select' | 'multi-select';
  label: string;
  placeholder?: string;
  default?: string;
  validate?: StepValidation;
  source?: string;
  optional?: boolean;
}

export interface TemplateMeta {
  id: string;
  label: string;
  command: string;
  contextMenu: {
    when: string;
    group: string;
  };
  steps: WizardStep[];
  outputPath: string;
  dir: string;
  sources: TemplateSourceMap;
}

export interface SourceItem {
  label: string;
  description?: string;
  detail?: string;
}

export type SourceFn = (ctx: SourceContext) => SourceItem[] | Promise<SourceItem[]>;
export type TemplateSourceMap = Record<string, SourceItem[] | SourceFn>;

export interface SourceContext {
  targetPath: string;
  answers: Record<string, unknown>;
  modules: { name: string; type: 'vendor' | 'custom'; version?: string; composerName?: string }[];
  themes: { name: string; area: 'frontend' | 'adminhtml'; type: 'vendor' | 'custom'; title?: string; composerName?: string; version?: string }[];
}

export class TemplateRegistry {
  private constructor(private templates: TemplateMeta[]) { }

  static async load(extensionRoot: string): Promise<TemplateRegistry> {
    const templatesRoot = path.join(extensionRoot, 'out', 'templates');

    let entries: Dirent[];

    try {
      entries = await fs.readdir(templatesRoot, { withFileTypes: true });
    } catch {
      return new TemplateRegistry([]);
    }

    const templates: TemplateMeta[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const dir = path.join(templatesRoot, entry.name);
      const metaPath = path.join(dir, '_meta.json');

      try {
        const raw = await fs.readFile(metaPath, 'utf8');
        const meta = JSON.parse(raw);

        let sources: TemplateSourceMap = {};
        try {
          const mod = await import(path.join(dir, 'sources.js'));
          sources = mod.default ?? mod;
        } catch {
          // No sources.ts — fine
        }

        templates.push({ ...meta, dir, sources });
      } catch {
        // No _meta.json — skip silently
      }
    }

    templates.sort((a, b) => a.contextMenu.group.localeCompare(b.contextMenu.group));
    return new TemplateRegistry(templates);
  }

  all(): TemplateMeta[] {
    return this.templates;
  }

  get(id: string): TemplateMeta | undefined {
    return this.templates.find(t => t.id === id);
  }
}