import { MagentoModule } from "./magentoModule";
import { MagentoTheme } from "./magentoTheme";

/**
 * Represents a Magento project detected in the workspace
 */
export class MagentoProject {
  /**
   * Absolute path to the project root
   */
  public readonly rootPath: string;

  /**
   * Magento edition: Community or Enterprise
   */
  public readonly edition: 'Community' | 'Enterprise';

  /**
   * List of modules in this project
   */
  public readonly modules: MagentoModule[];

  /**
 * List of modules in this project
 */
  public readonly themes: MagentoTheme[];

  constructor(
    rootPath: string,
    edition: 'Community' | 'Enterprise',
    modules: MagentoModule[] = [],
    themes: MagentoTheme[] = []
  ) {
    this.rootPath = rootPath;
    this.edition = edition;
    this.modules = modules;
    this.themes = themes;
  }

  /**
   * Get the project folder name (last segment of the path)
   */
  public getFolderName(): string {
    const parts = this.rootPath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || this.rootPath;
  }

  /**
   * Get display name for the project
   */
  public getDisplayName(): string {
    return `${this.getFolderName()} (${this.edition})`;
  }
}