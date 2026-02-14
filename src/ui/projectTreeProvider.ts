import * as vscode from 'vscode';
import { MagentoProject } from '../domain/magentoProject';
import { WorkspaceScanner } from '../services/workspaceScanner';
import { MagentoModule } from '../domain/magentoModule';

/**
 * Tree item types for the TreeView
 */
type TreeElement = ProjectTreeItem | ModuleTreeItem;

/**
 * Tree item representing a Magento project in the TreeView
 */
export class ProjectTreeItem extends vscode.TreeItem {
  constructor(
    public readonly project: MagentoProject,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(project.getDisplayName(), collapsibleState);

    this.tooltip = `${project.rootPath}\n${project.modules.length} modules`;
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
 * Tree item representing a Magento module in the TreeView
 */
export class ModuleTreeItem extends vscode.TreeItem {
  constructor(
    public readonly module: MagentoModule,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(module.name, collapsibleState);

    const typeLabel = module.type === 'vendor' ? 'Vendor' : 'Custom';
    const versionInfo = module.version ? ` v${module.version}` : '';

    this.tooltip = `${module.path}\nType: ${typeLabel}${versionInfo}`;
    this.description = typeLabel;
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
      // Project level: return all modules
      const modules = element.project.modules.map(module =>
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