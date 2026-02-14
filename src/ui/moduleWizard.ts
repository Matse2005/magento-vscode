import * as vscode from 'vscode';
import { ModuleConfig, ModuleCreator } from '../services/moduleCreator';
import { MagentoModule } from '../domain/magentoModule';

/**
 * Wizard for creating a new Magento 2 module
 */
export class ModuleWizard {
  /**
   * Run the module creation wizard
   */
  public static async run(
    targetPath: string,
    availableModules: MagentoModule[]
  ): Promise<void> {
    try {
      // Step 1: Package Name
      const packageName = await this.promptPackageName();
      if (!packageName) {
        return; // User cancelled
      }

      // Step 2: Module Name
      const moduleName = await this.promptModuleName();
      if (!moduleName) {
        return; // User cancelled
      }

      // Step 3: Version
      const version = await this.promptVersion();
      if (!version) {
        return; // User cancelled
      }

      // Step 4: License(s)
      const licenses = await this.promptLicenses();
      if (!licenses || licenses.length === 0) {
        return; // User cancelled
      }

      // Step 5: Dependencies
      const dependencies = await this.promptDependencies(availableModules);
      if (dependencies === undefined) {
        return; // User cancelled
      }

      // Build dependency version map
      const dependencyVersions = new Map<string, string>();
      for (const depName of dependencies) {
        const module = availableModules.find(m => m.name === depName);
        if (module) {
          // Determine version constraint based on module version
          let versionConstraint = '*';
          if (module.version) {
            // Extract major.minor version and use wildcard for patch
            // e.g., "100.4.3" -> "100.4.*"
            const versionParts = module.version.split('.');
            if (versionParts.length >= 2) {
              versionConstraint = `${versionParts[0]}.${versionParts[1]}.*`;
            }
          }
          dependencyVersions.set(depName, versionConstraint);
        }
      }

      // Confirm creation
      const fullModuleName = `${packageName}_${moduleName}`;
      const confirm = await vscode.window.showInformationMessage(
        `Create module "${fullModuleName}"?`,
        { modal: true },
        'Create',
        'Cancel'
      );

      if (confirm !== 'Create') {
        return;
      }

      // Create the module
      const config: ModuleConfig = {
        packageName,
        moduleName,
        version,
        license: licenses,
        dependencies,
        dependencyVersions
      };

      const creator = new ModuleCreator();
      await creator.createModule(targetPath, config);

      vscode.window.showInformationMessage(
        `Module ${fullModuleName} created successfully!`
      );

      // Ask if user wants to open the module
      const openModule = await vscode.window.showInformationMessage(
        'Open module folder?',
        'Open',
        'Skip'
      );

      if (openModule === 'Open') {
        const modulePath = vscode.Uri.file(
          `${targetPath}/${packageName}/${moduleName}`
        );
        await vscode.commands.executeCommand('revealInExplorer', modulePath);
      }

    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to create module: ${error}`
      );
    }
  }

  /**
   * Prompt for package name (vendor)
   */
  private static async promptPackageName(): Promise<string | undefined> {
    return await vscode.window.showInputBox({
      prompt: 'Enter package name (vendor)',
      placeHolder: 'e.g., MyCompany, Acme, VendorName',
      validateInput: (value) => {
        if (!value || value.trim() === '') {
          return 'Package name is required';
        }
        if (!/^[A-Z][a-zA-Z0-9]*$/.test(value)) {
          return 'Package name must start with uppercase letter and contain only letters and numbers';
        }
        return null;
      }
    });
  }

  /**
   * Prompt for module name
   */
  private static async promptModuleName(): Promise<string | undefined> {
    return await vscode.window.showInputBox({
      prompt: 'Enter module name',
      placeHolder: 'e.g., CustomModule, Integration, Payment',
      validateInput: (value) => {
        if (!value || value.trim() === '') {
          return 'Module name is required';
        }
        if (!/^[A-Z][a-zA-Z0-9]*$/.test(value)) {
          return 'Module name must start with uppercase letter and contain only letters and numbers';
        }
        return null;
      }
    });
  }

  /**
   * Prompt for version
   */
  private static async promptVersion(): Promise<string | undefined> {
    return await vscode.window.showInputBox({
      prompt: 'Enter version',
      value: '1.0.0',
      placeHolder: 'e.g., 1.0.0, 0.1.0',
      validateInput: (value) => {
        if (!value || value.trim() === '') {
          return 'Version is required';
        }
        if (!/^\d+\.\d+\.\d+$/.test(value)) {
          return 'Version must be in format X.Y.Z (e.g., 1.0.0)';
        }
        return null;
      }
    });
  }

  /**
   * Prompt for license(s)
   */
  private static async promptLicenses(): Promise<string[] | undefined> {
    const licenses = await vscode.window.showQuickPick(
      ModuleCreator.COMMON_LICENSES,
      {
        title: 'Select license(s)',
        placeHolder: 'Choose one or more licenses',
        canPickMany: true,
        matchOnDetail: true
      }
    );

    if (!licenses || licenses.length === 0) {
      return undefined;
    }

    return licenses.map(l => l.label);
  }

  /**
   * Prompt for dependencies
   */
  private static async promptDependencies(
    availableModules: MagentoModule[]
  ): Promise<string[] | undefined> {
    if (availableModules.length === 0) {
      vscode.window.showInformationMessage('No modules found for dependencies');
      return [];
    }

    // Sort modules by name for easier selection
    const sortedModules = availableModules
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(module => ({
        label: module.name,
        description: module.type === 'custom' ? 'Custom' : 'Vendor',
        detail: module.version ? `v${module.version}` : undefined
      }));

    const selected = await vscode.window.showQuickPick(
      sortedModules,
      {
        title: 'Select module dependencies (optional)',
        placeHolder: 'Choose modules this module depends on',
        canPickMany: true,
        matchOnDescription: true,
        matchOnDetail: true
      }
    );

    if (selected === undefined) {
      return undefined; // User cancelled
    }

    return selected.map(s => s.label);
  }
}