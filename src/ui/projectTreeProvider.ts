import * as vscode from 'vscode';
import { MagentoProject } from '../domain/magentoProject';
import { MagentoModule } from '../domain/magentoModule';
import { MagentoTheme } from '../domain/magentoTheme';
import { WorkspaceScanner } from '../services/workspaceScanner';

type TreeElement =
  | ProjectTreeItem
  | SectionTreeItem
  | VendorGroupTreeItem
  | ModuleTreeItem
  | ThemeTreeItem;

// ── Project ───────────────────────────────────────────────────────────────────

export class ProjectTreeItem extends vscode.TreeItem {
  constructor(
    public readonly project: MagentoProject,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(project.getDisplayName(), collapsibleState);

    const vendorCount = project.modules.filter(m => m.type === 'vendor').length;
    const customCount = project.modules.filter(m => m.type === 'custom').length;

    this.tooltip = `${project.rootPath}\n${vendorCount} vendor modules, ${customCount} custom modules`;
    this.description = `${project.modules.length} modules, ${project.themes.length} themes`;
    this.contextValue = 'magentoProject';
    this.iconPath = new vscode.ThemeIcon(project.edition === 'Enterprise' ? 'star-full' : 'package');
    // this.command = {
    //   command: 'revealInExplorer',
    //   title: 'Reveal in Explorer',
    //   arguments: [vscode.Uri.file(project.rootPath)],
    // };
  }
}

// ── Section (Modules / Themes) ────────────────────────────────────────────────

export class SectionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly kind: 'modules' | 'themes',
    public readonly project: MagentoProject,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    const label = kind === 'modules' ? 'Modules' : 'Themes';
    super(label, collapsibleState);

    this.description = kind === 'modules'
      ? `${project.modules.length}`
      : `${project.themes.length}`;
    this.contextValue = `magentoSection.${kind}`;
    this.iconPath = new vscode.ThemeIcon(kind === 'modules' ? 'extensions' : 'paintcan');
  }
}

// ── Vendor group ──────────────────────────────────────────────────────────────

export class VendorGroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly vendorName: string,
    public readonly modules: MagentoModule[],
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(vendorName, collapsibleState);

    const vendorCount = modules.filter(m => m.type === 'vendor').length;
    const customCount = modules.filter(m => m.type === 'custom').length;

    this.description = vendorCount > 0 && customCount > 0
      ? `${vendorCount} vendor, ${customCount} custom`
      : customCount > 0 ? `${customCount} custom` : `${modules.length} modules`;
    this.tooltip = `${modules.length} modules`;
    this.contextValue = 'magentoVendorGroup';
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

// ── Module ────────────────────────────────────────────────────────────────────

export class ModuleTreeItem extends vscode.TreeItem {
  constructor(
    public readonly module: MagentoModule,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(module.getModuleName(), collapsibleState);

    const typeLabel = module.type === 'custom' ? 'Custom' : 'Vendor';
    const versionInfo = module.version ? ` • v${module.version}` : '';

    this.tooltip = `${module.name}\n${module.path}\nType: ${typeLabel}${versionInfo}`;
    this.description = `${typeLabel}${versionInfo}`;
    this.contextValue = `magentoModule.${module.type}`;
    this.iconPath = new vscode.ThemeIcon(module.type === 'custom' ? 'file-code' : 'library');
    this.command = {
      command: 'revealInExplorer',
      title: 'Reveal in Explorer',
      arguments: [vscode.Uri.file(module.path)],
    };
  }
}

// ── Theme ─────────────────────────────────────────────────────────────────────

export class ThemeTreeItem extends vscode.TreeItem {
  constructor(public readonly theme: MagentoTheme) {
    super(theme.name, vscode.TreeItemCollapsibleState.None);

    const typeLabel = theme.type === 'custom' ? 'Custom' : 'Vendor';
    const versionInfo = theme.version ? ` • v${theme.version}` : '';

    this.tooltip = `${theme.name}\n${theme.path}\nArea: ${theme.area}\nType: ${typeLabel}${versionInfo}`;
    this.description = `${theme.area} — ${typeLabel}${versionInfo}`;
    this.contextValue = `magentoTheme.${theme.type}`;
    this.iconPath = new vscode.ThemeIcon(theme.type === 'custom' ? 'paintcan' : 'symbol-color');
    this.command = {
      command: 'revealInExplorer',
      title: 'Reveal in Explorer',
      arguments: [vscode.Uri.file(theme.path)],
    };
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class ProjectTreeProvider implements vscode.TreeDataProvider<TreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private projects: MagentoProject[] = [];

  constructor(private scanner: WorkspaceScanner) { }

  public getProjects(): MagentoProject[] {
    return this.projects;
  }

  public async refresh(): Promise<void> {
    this.projects = await this.scanner.scanWorkspace();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeElement): Thenable<TreeElement[]> {
    // Root — list projects
    if (!element) {
      return Promise.resolve(
        this.projects.map(p => new ProjectTreeItem(
          p,
          p.modules.length > 0 || p.themes.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None
        ))
      );
    }

    // Project — show Modules and Themes sections
    if (element instanceof ProjectTreeItem) {
      const sections: SectionTreeItem[] = [];
      if (element.project.modules.length > 0) {
        sections.push(new SectionTreeItem('modules', element.project, vscode.TreeItemCollapsibleState.Collapsed));
      }
      if (element.project.themes.length > 0) {
        sections.push(new SectionTreeItem('themes', element.project, vscode.TreeItemCollapsibleState.Collapsed));
      }
      return Promise.resolve(sections);
    }

    // Modules section — group by vendor
    if (element instanceof SectionTreeItem && element.kind === 'modules') {
      const vendorMap = new Map<string, MagentoModule[]>();
      for (const mod of element.project.modules) {
        const vendor = mod.getVendor();
        if (!vendorMap.has(vendor)) { vendorMap.set(vendor, []); }
        vendorMap.get(vendor)!.push(mod);
      }
      return Promise.resolve(
        Array.from(vendorMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([name, mods]) => new VendorGroupTreeItem(name, mods, vscode.TreeItemCollapsibleState.Collapsed))
      );
    }

    // Themes section — flat list sorted by area then name
    if (element instanceof SectionTreeItem && element.kind === 'themes') {
      return Promise.resolve(
        [...element.project.themes]
          .sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name))
          .map(t => new ThemeTreeItem(t))
      );
    }

    // Vendor group — list modules
    if (element instanceof VendorGroupTreeItem) {
      return Promise.resolve(
        [...element.modules]
          .sort((a, b) => a.getModuleName().localeCompare(b.getModuleName()))
          .map(m => new ModuleTreeItem(m, vscode.TreeItemCollapsibleState.None))
      );
    }

    return Promise.resolve([]);
  }

  getParent(_element: TreeElement): vscode.ProviderResult<TreeElement> {
    return null;
  }
}