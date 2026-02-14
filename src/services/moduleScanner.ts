import * as vscode from 'vscode';
import * as path from 'path';
import { MagentoModule } from '../domain/magentoModule';

/**
 * Service responsible for scanning Magento modules within a project
 */
export class ModuleScanner {
  /**
   * Scan all modules in a Magento project (both vendor and custom)
   */
  public async scanModules(projectPath: string): Promise<MagentoModule[]> {
    const modules: MagentoModule[] = [];

    // Scan vendor modules
    const vendorModules = await this.scanVendorModules(projectPath);
    modules.push(...vendorModules);

    // Scan custom modules in app/code
    const customModules = await this.scanCustomModules(projectPath);
    modules.push(...customModules);

    // Sort modules by name for consistent ordering
    return modules.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Scan modules in vendor directory
   */
  private async scanVendorModules(projectPath: string): Promise<MagentoModule[]> {
    const modules: MagentoModule[] = [];
    const vendorPath = path.join(projectPath, 'vendor');

    try {
      const vendorUri = vscode.Uri.file(vendorPath);
      await vscode.workspace.fs.stat(vendorUri);
    } catch {
      // vendor directory doesn't exist
      return modules;
    }

    try {
      const vendorUri = vscode.Uri.file(vendorPath);
      const vendors = await vscode.workspace.fs.readDirectory(vendorUri);

      for (const [vendorName, vendorType] of vendors) {
        if (vendorType !== vscode.FileType.Directory || vendorName.startsWith('.')) {
          continue;
        }

        const vendorDir = path.join(vendorPath, vendorName);
        const vendorDirUri = vscode.Uri.file(vendorDir);

        try {
          const packages = await vscode.workspace.fs.readDirectory(vendorDirUri);

          for (const [packageName, packageType] of packages) {
            if (packageType !== vscode.FileType.Directory || packageName.startsWith('.')) {
              continue;
            }

            const packagePath = path.join(vendorDir, packageName);
            const module = await this.detectModule(packagePath, 'vendor');

            if (module) {
              modules.push(module);
            }
          }
        } catch (error) {
          console.warn(`Could not read vendor directory ${vendorDir}:`, error);
        }
      }
    } catch (error) {
      console.warn(`Could not read vendor directory ${vendorPath}:`, error);
    }

    return modules;
  }

  /**
   * Scan modules in app/code directory
   */
  private async scanCustomModules(projectPath: string): Promise<MagentoModule[]> {
    const modules: MagentoModule[] = [];
    const appCodePath = path.join(projectPath, 'app', 'code');

    try {
      const appCodeUri = vscode.Uri.file(appCodePath);
      await vscode.workspace.fs.stat(appCodeUri);
    } catch {
      // app/code directory doesn't exist
      return modules;
    }

    try {
      const appCodeUri = vscode.Uri.file(appCodePath);
      const vendors = await vscode.workspace.fs.readDirectory(appCodeUri);

      for (const [vendorName, vendorType] of vendors) {
        if (vendorType !== vscode.FileType.Directory || vendorName.startsWith('.')) {
          continue;
        }

        const vendorDir = path.join(appCodePath, vendorName);
        const vendorDirUri = vscode.Uri.file(vendorDir);

        try {
          const moduleNames = await vscode.workspace.fs.readDirectory(vendorDirUri);

          for (const [moduleName, moduleType] of moduleNames) {
            if (moduleType !== vscode.FileType.Directory || moduleName.startsWith('.')) {
              continue;
            }

            const modulePath = path.join(vendorDir, moduleName);
            const module = await this.detectModule(modulePath, 'custom');

            if (module) {
              modules.push(module);
            }
          }
        } catch (error) {
          console.warn(`Could not read vendor directory ${vendorDir}:`, error);
        }
      }
    } catch (error) {
      console.warn(`Could not read app/code directory ${appCodePath}:`, error);
    }

    return modules;
  }

  /**
   * Detect if a directory is a valid Magento module
   */
  private async detectModule(
    modulePath: string,
    type: 'vendor' | 'custom'
  ): Promise<MagentoModule | null> {
    try {
      // Check for registration.php (required for all Magento 2 modules)
      const registrationPath = path.join(modulePath, 'registration.php');
      const registrationUri = vscode.Uri.file(registrationPath);

      try {
        await vscode.workspace.fs.stat(registrationUri);
      } catch {
        // Not a valid module (no registration.php)
        return null;
      }

      // Check for etc/module.xml (alternative validation)
      const moduleXmlPath = path.join(modulePath, 'etc', 'module.xml');
      const moduleXmlUri = vscode.Uri.file(moduleXmlPath);

      try {
        await vscode.workspace.fs.stat(moduleXmlUri);
      } catch {
        // registration.php exists but no module.xml - still might be valid
        // Continue anyway
      }

      // Extract module name from registration.php
      const moduleName = await this.extractModuleName(registrationPath);
      if (!moduleName) {
        return null;
      }

      // Try to get version and composer name from composer.json
      const composerInfo = await this.extractComposerInfo(modulePath);

      return new MagentoModule(
        moduleName,
        modulePath,
        type,
        composerInfo.version,
        composerInfo.name
      );
    } catch (error) {
      console.warn(`Error detecting module in ${modulePath}:`, error);
      return null;
    }
  }

  /**
   * Extract module name from registration.php
   */
  private async extractModuleName(registrationPath: string): Promise<string | null> {
    try {
      const registrationUri = vscode.Uri.file(registrationPath);
      const registrationBytes = await vscode.workspace.fs.readFile(registrationUri);
      const content = Buffer.from(registrationBytes).toString('utf8');

      // Match pattern: ComponentRegistrar::register(ComponentRegistrar::MODULE, 'Vendor_Module', __DIR__);
      const match = content.match(/ComponentRegistrar::register\s*\(\s*ComponentRegistrar::MODULE\s*,\s*['"]([^'"]+)['"]/);

      if (match && match[1]) {
        return match[1];
      }

      return null;
    } catch (error) {
      console.warn(`Could not extract module name from ${registrationPath}:`, error);
      return null;
    }
  }

  /**
   * Extract composer package name and version from composer.json
   */
  private async extractComposerInfo(modulePath: string): Promise<{ name?: string, version?: string }> {
    try {
      const composerPath = path.join(modulePath, 'composer.json');
      const composerUri = vscode.Uri.file(composerPath);

      const composerBytes = await vscode.workspace.fs.readFile(composerUri);
      const content = Buffer.from(composerBytes).toString('utf8');
      const composer = JSON.parse(content);

      return {
        name: composer.name,
        version: composer.version
      };
    } catch {
      // composer.json doesn't exist or couldn't be parsed
      return {};
    }
  }
}