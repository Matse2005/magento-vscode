import * as vscode from 'vscode';
import * as path from 'path';
import { MagentoProject } from '../domain/magentoProject';
import { ModuleScanner } from './moduleScanner';
import { ThemeScanner } from './themeScanner';

export class WorkspaceScanner {
  private moduleScanner = new ModuleScanner();
  private themeScanner = new ThemeScanner();

  public async scanWorkspace(): Promise<MagentoProject[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    const allProjects: MagentoProject[] = [];

    for (const folder of workspaceFolders) {
      const projects = await this.scanFolder(folder.uri.fsPath);
      allProjects.push(...projects);
    }

    return allProjects;
  }

  private async scanFolder(folderPath: string, maxDepth: number = 5): Promise<MagentoProject[]> {
    const projects: MagentoProject[] = [];

    const project = await this.detectMagentoProject(folderPath);
    if (project) {
      projects.push(project);
      return projects;
    }

    if (maxDepth <= 0) {
      return projects;
    }

    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(folderPath));

      for (const [name, type] of entries) {
        if (this.shouldSkipDirectory(name)) {
          continue;
        }

        if (type === vscode.FileType.Directory) {
          const subProjects = await this.scanFolder(path.join(folderPath, name), maxDepth - 1);
          projects.push(...subProjects);
        }
      }
    } catch (error) {
      console.warn(`Could not read directory ${folderPath}:`, error);
    }

    return projects;
  }

  private async detectMagentoProject(folderPath: string): Promise<MagentoProject | null> {
    try {
      // Must have bin/magento
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(path.join(folderPath, 'bin', 'magento')));
      } catch {
        return null;
      }

      // Must have composer.json with a recognised Magento edition
      let composerContent: string;
      try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(folderPath, 'composer.json')));
        composerContent = Buffer.from(bytes).toString('utf8');
      } catch {
        return null;
      }

      const edition = this.detectMagentoEdition(composerContent);
      if (!edition) {
        return null;
      }

      // Scan modules and themes in parallel
      const [modules, themes] = await Promise.all([
        this.moduleScanner.scanModules(folderPath),
        this.themeScanner.scanThemes(folderPath),
      ]);

      return new MagentoProject(folderPath, edition, modules, themes);
    } catch (error) {
      console.error(`Error detecting Magento project in ${folderPath}:`, error);
      return null;
    }
  }

  private detectMagentoEdition(composerContent: string): 'Community' | 'Enterprise' | null {
    try {
      const require = JSON.parse(composerContent).require ?? {};
      if (require['magento/product-enterprise-edition']) { return 'Enterprise'; }
      if (require['magento/product-community-edition']) { return 'Community'; }
      return null;
    } catch (error) {
      console.error('Error parsing composer.json:', error);
      return null;
    }
  }

  private shouldSkipDirectory(name: string): boolean {
    const skipDirs = [
      'node_modules', '.git', '.vscode', '.idea', 'vendor',
      'var', 'pub', 'generated', 'bin', 'setup', 'dev',
      '.github', 'dist', 'build', 'out', 'tmp', 'temp',
    ];
    return skipDirs.includes(name) || name.startsWith('.');
  }
}