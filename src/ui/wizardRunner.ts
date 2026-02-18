import * as vscode from 'vscode';
import { TemplateMeta, WizardStep, SourceItem, SourceContext } from '../services/templateRegistry';

export type WizardAnswers = Record<string, unknown>;

const VALIDATORS: Record<string, (v: string) => string | null> = {
  'pascal-case': v => /^[A-Z][a-zA-Z0-9]*$/.test(v)
    ? null : 'Must start with uppercase letter and contain only letters/numbers',
  'semver': v => /^\d+\.\d+\.\d+$/.test(v)
    ? null : 'Must be in format X.Y.Z (e.g. 1.0.0)',
  'non-empty': v => (v?.trim() ? null : 'Required'),
};

export class WizardRunner {
  static async run(
    meta: TemplateMeta,
    targetPath: string,
    modules: SourceContext['modules'] = [],
  ): Promise<WizardAnswers | undefined> {
    const answers: WizardAnswers = {};

    for (const step of meta.steps) {
      const result = await this.runStep(step, meta, targetPath, answers, modules);

      if (result === undefined && !step.optional) {
        return undefined; // user cancelled
      }
      answers[step.id] = result ?? [];
    }

    return answers;
  }

  private static async runStep(
    step: WizardStep,
    meta: TemplateMeta,
    targetPath: string,
    answers: WizardAnswers,
    modules: SourceContext['modules'],
  ): Promise<unknown> {
    switch (step.type) {
      case 'input':
        return vscode.window.showInputBox({
          title: step.label,
          placeHolder: step.placeholder,
          value: step.default,
          validateInput: step.validate ? VALIDATORS[step.validate] : undefined,
        });

      case 'select': {
        const items = await this.resolveSource(step, meta, targetPath, answers, modules);
        const picked = await vscode.window.showQuickPick(items, {
          title: step.label,
          matchOnDescription: true,
        });
        return picked?.label;
      }

      case 'multi-select': {
        const items = await this.resolveSource(step, meta, targetPath, answers, modules);
        const picked = await vscode.window.showQuickPick(items, {
          title: step.label,
          canPickMany: true,
          matchOnDescription: true,
          matchOnDetail: true,
        });
        if (picked === undefined) {
          return undefined;
        }
        return picked.map(p => p.label);
      }
    }
  }

  private static async resolveSource(
    step: WizardStep,
    meta: TemplateMeta,
    targetPath: string,
    answers: WizardAnswers,
    modules: SourceContext['modules'],
  ): Promise<vscode.QuickPickItem[]> {
    if (!step.source) {
      return [];
    }

    const source = meta.sources[step.source];
    if (!source) {
      console.warn(`[WizardRunner] No source "${step.source}" found in template "${meta.id}"`);
      return [];
    }

    const ctx: SourceContext = { targetPath, answers, modules };
    const items: SourceItem[] = typeof source === 'function'
      ? await source(ctx)
      : source;

    return items;
  }
}