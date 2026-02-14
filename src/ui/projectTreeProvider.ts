import * as vscode from 'vscode';
import { MagentoProject } from '../domain/magentoProject';
import { WorkspaceScanner } from '../services/workspaceScanner';
import { MagentoModule } from '../domain/magentoModule';

/**
 * Tree item types for the TreeView
 */
type TreeElement = ProjectTreeItem | VendorGroupTreeItem | ModuleTreeItem;

/**
 * Tree item representing a Magento project in the TreeView
 */
export class ProjectTreeItem extends vscode.TreeItem {
  constructor(
    public readonly project: MagentoProject,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(project.getDisplayName(), collapsibleState);

    const vendorCount = project.modules.filter(m => m.type === 'vendor').length;
    const customCount = project.modules.filter(m => m.type === 'custom').length;

    this.tooltip = `${project.rootPath}\n${vendorCount} vendor modules, ${customCount} custom modules`;
    this.description = `${project.modules.length} modules`;
    this.contextValue = 'magentoProject';

    // Set icon based on edition
    this.iconPath = new vscode.ThemeIcon(
      project.edition === 'Enterprise' ? 'star-full' : 'package'
    );

    // Command to reveal project in explorer
    this.command = {
      command: 'revealInExplorer',
      title: 'Reveal in Explorer',
      arguments: [vscode.Uri.file(project.rootPath)]
    };
  }
}

/**
 * Tree item representing a vendor group (e.g., "Magento", "MyCompany")
 */
export class VendorGroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly vendorName: string,
    public readonly modules: MagentoModule[],
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(vendorName, collapsibleState);

    const vendorCount = modules.filter(m => m.type === 'vendor').length;
    const customCount = modules.filter(m => m.type === 'custom').length;

    // Build description showing mix of vendor/custom if applicable
    let description = `${modules.length} modules`;
    if (vendorCount > 0 && customCount > 0) {
      description = `${vendorCount} vendor, ${customCount} custom`;
    } else if (customCount > 0) {
      description = `${customCount} custom`;
    }

    this.tooltip = `${modules.length} modules`;
    this.description = description;
    this.contextValue = 'magentoVendorGroup';

    // Set icon for vendor folder
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

/**
 * Tree item representing a Magento module in the TreeView
 */
export class ModuleTreeItem extends vscode.TreeItem {
  constructor(
    public readonly module: MagentoModule,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    // Display only module name (without vendor prefix)
    const displayName = module.getModuleName();

    super(displayName, collapsibleState);

    const typeLabel = module.type === 'custom' ? 'Custom' : 'Vendor';
    const versionInfo = module.version ? ` • v${module.version}` : '';

    this.tooltip = `${module.name}\n${module.path}\nType: ${typeLabel}${versionInfo}`;
    this.description = `${typeLabel}${versionInfo}`;
    this.contextValue = `magentoModule.${module.type}`;

    // Set icon based on module type
    this.iconPath = new vscode.ThemeIcon(
      module.type === 'custom' ? 'file-code' : 'library'
    );

    // Command to open module directory
    this.command = {
      command: 'revealInExplorer',
      title: 'Reveal in Explorer',
      arguments: [vscode.Uri.file(module.path)]
    };
  }
}

/**
 * TreeDataProvider for displaying Magento projects in VS Code TreeView
 */
export class ProjectTreeProvider implements vscode.TreeDataProvider<TreeElement> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeElement | undefined | null | void> =
    new vscode.EventEmitter<TreeElement | undefined | null | void>();

  readonly onDidChangeTreeData: vscode.Event<TreeElement | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private projects: MagentoProject[] = [];

  constructor(private scanner: WorkspaceScanner) { }

  /**
   * Refresh the tree by rescanning the workspace
   */
  public async refresh(): Promise<void> {
    this.projects = await this.scanner.scanWorkspace();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item for a given element
   */
  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }

  /**
   * Get children of a tree element
   */
  getChildren(element?: TreeElement): Thenable<TreeElement[]> {
    if (!element) {
      // Root level: return all projects
      if (this.projects.length === 0) {
        return Promise.resolve([]);
      }

      const items = this.projects.map(project =>
        new ProjectTreeItem(
          project,
          project.modules.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None
        )
      );

      return Promise.resolve(items);
    }

    if (element instanceof ProjectTreeItem) {
      // Project level: return vendor groups (all modules grouped by vendor)
      const vendorMap = new Map<string, MagentoModule[]>();

      // Group all modules by vendor name (no distinction between vendor/custom)
      for (const module of element.project.modules) {
        const vendor = module.getVendor();
        if (!vendorMap.has(vendor)) {
          vendorMap.set(vendor, []);
        }
        vendorMap.get(vendor)!.push(module);
      }

      // Convert to tree items, sorted alphabetically
      const vendorGroups = Array.from(vendorMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([vendorName, modules]) =>
          new VendorGroupTreeItem(
            vendorName,
            modules,
            vscode.TreeItemCollapsibleState.Collapsed
          )
        );

      return Promise.resolve(vendorGroups);
    }

    if (element instanceof VendorGroupTreeItem) {
      // Vendor group level: return all modules for this vendor
      const modules = element.modules
        .sort((a, b) => a.getModuleName().localeCompare(b.getModuleName()))
        .map(module =>
          new ModuleTreeItem(module, vscode.TreeItemCollapsibleState.None)
        );

      return Promise.resolve(modules);
    }

    // Module level: no children
    return Promise.resolve([]);
  }

  /**
   * Get parent of a tree element
   */
  getParent(element: TreeElement): vscode.ProviderResult<TreeElement> {
    // Modules don't store their parent reference, so return null
    // In the future, we could maintain a parent map if needed
    return null;
  }
}