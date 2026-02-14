import * as vscode from 'vscode';
import * as path from 'path';
import { MagentoProject } from '../domain/magentoProject';
import { ModuleScanner } from './moduleScanner';

/**
 * Service responsible for scanning workspace folders to detect Magento projects
 */
export class WorkspaceScanner {
  private moduleScanner: ModuleScanner;

  constructor() {
    this.moduleScanner = new ModuleScanner();
  }
  /**
   * Scan all workspace folders and return detected Magento projects
   */
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

  /**
   * Recursively scan a folder for Magento projects
   */
  private async scanFolder(folderPath: string, maxDepth: number = 5): Promise<MagentoProject[]> {
    const projects: MagentoProject[] = [];

    // Check if current folder is a Magento project
    const project = await this.detectMagentoProject(folderPath);
    if (project) {
      projects.push(project);
      // Don't scan subdirectories if we found a Magento project
      return projects;
    }

    // Scan subdirectories if we haven't reached max depth
    if (maxDepth <= 0) {
      return projects;
    }

    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(folderPath));

      for (const [name, type] of entries) {
        // Skip common directories that won't contain Magento projects
        if (this.shouldSkipDirectory(name)) {
          continue;
        }

        if (type === vscode.FileType.Directory) {
          const subPath = path.join(folderPath, name);
          const subProjects = await this.scanFolder(subPath, maxDepth - 1);
          projects.push(...subProjects);
        }
      }
    } catch (error) {
      // Silently skip directories we can't read
      console.warn(`Could not read directory ${folderPath}:`, error);
    }

    return projects;
  }

  /**
   * Detect if a folder is a Magento project
   */
  private async detectMagentoProject(folderPath: string): Promise<MagentoProject | null> {
    try {
      // Check for bin/magento
      const binMagentoPath = path.join(folderPath, 'bin', 'magento');
      const binMagentoUri = vscode.Uri.file(binMagentoPath);

      try {
        await vscode.workspace.fs.stat(binMagentoUri);
      } catch {
        // bin/magento doesn't exist
        return null;
      }

      // Check composer.json
      const composerPath = path.join(folderPath, 'composer.json');
      const composerUri = vscode.Uri.file(composerPath);

      let composerContent: string;
      try {
        const composerBytes = await vscode.workspace.fs.readFile(composerUri);
        composerContent = Buffer.from(composerBytes).toString('utf8');
      } catch {
        // composer.json doesn't exist
        return null;
      }

      // Parse composer.json and detect edition
      const edition = this.detectMagentoEdition(composerContent);
      if (!edition) {
        return null;
      }

      // Scan modules in the project
      const modules = await this.moduleScanner.scanModules(folderPath);

      return new MagentoProject(folderPath, edition, modules);
    } catch (error) {
      console.error(`Error detecting Magento project in ${folderPath}:`, error);
      return null;
    }
  }

  /**
   * Detect Magento edition from composer.json content
   */
  private detectMagentoEdition(composerContent: string): 'Community' | 'Enterprise' | null {
    try {
      const composer = JSON.parse(composerContent);
      const require = composer.require || {};

      if (require['magento/product-enterprise-edition']) {
        return 'Enterprise';
      }

      if (require['magento/product-community-edition']) {
        return 'Community';
      }

      return null;
    } catch (error) {
      console.error('Error parsing composer.json:', error);
      return null;
    }
  }

  /**
   * Check if a directory should be skipped during scanning
   */
  private shouldSkipDirectory(name: string): boolean {
    const skipDirs = [
      'node_modules',
      '.git',
      '.vscode',
      '.idea',
      'vendor',
      'var',
      'pub',
      'generated',
      'bin',
      'setup',
      'dev',
      '.github',
      'dist',
      'build',
      'out',
      'tmp',
      'temp'
    ];

    return skipDirs.includes(name) || name.startsWith('.');
  }
}