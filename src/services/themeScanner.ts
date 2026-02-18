import * as vscode from 'vscode';
import * as path from 'path';
import { MagentoTheme } from '../domain/magentoTheme';

export class ThemeScanner {
  public async scanThemes(projectPath: string): Promise<MagentoTheme[]> {
    const [custom, vendor] = await Promise.all([
      this.scanAppDesign(projectPath),
      this.scanVendor(projectPath),
    ]);

    return [...custom, ...vendor].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * app/design/frontend|adminhtml/<Vendor>/<theme>/theme.xml
   */
  private async scanAppDesign(projectPath: string): Promise<MagentoTheme[]> {
    const themes: MagentoTheme[] = [];
    const designPath = path.join(projectPath, 'app', 'design');

    for (const area of ['frontend', 'adminhtml'] as const) {
      const areaPath = path.join(designPath, area);

      let vendors: [string, vscode.FileType][];
      try {
        vendors = await vscode.workspace.fs.readDirectory(vscode.Uri.file(areaPath));
      } catch {
        continue;
      }

      for (const [vendorName, vendorType] of vendors) {
        if (vendorType !== vscode.FileType.Directory || vendorName.startsWith('.')) {
          continue;
        }

        const vendorPath = path.join(areaPath, vendorName);
        let entries: [string, vscode.FileType][];
        try {
          entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(vendorPath));
        } catch {
          continue;
        }

        for (const [themeName, themeType] of entries) {
          if (themeType !== vscode.FileType.Directory || themeName.startsWith('.')) {
            continue;
          }

          const themePath = path.join(vendorPath, themeName);
          const theme = await this.detectTheme(themePath, `${vendorName}/${themeName}`, area, 'custom');
          if (theme) { themes.push(theme); }
        }
      }
    }

    return themes;
  }

  /**
   * vendor/<vendor>/<package>/theme.xml  (flat composer package structure)
   */
  private async scanVendor(projectPath: string): Promise<MagentoTheme[]> {
    const themes: MagentoTheme[] = [];
    const vendorPath = path.join(projectPath, 'vendor');

    let vendors: [string, vscode.FileType][];
    try {
      vendors = await vscode.workspace.fs.readDirectory(vscode.Uri.file(vendorPath));
    } catch {
      return themes;
    }

    for (const [vendorName, vendorType] of vendors) {
      if (vendorType !== vscode.FileType.Directory || vendorName.startsWith('.')) {
        continue;
      }

      const vendorDir = path.join(vendorPath, vendorName);
      let packages: [string, vscode.FileType][];
      try {
        packages = await vscode.workspace.fs.readDirectory(vscode.Uri.file(vendorDir));
      } catch {
        continue;
      }

      for (const [packageName, packageType] of packages) {
        if (packageType !== vscode.FileType.Directory || packageName.startsWith('.')) {
          continue;
        }

        const packagePath = path.join(vendorDir, packageName);

        // Determine area from theme.xml <area> or registration.php content
        const area = await this.detectArea(packagePath);
        if (!area) { continue; }

        // Use Vendor/package-name as the theme name
        const theme = await this.detectTheme(packagePath, `${vendorName}/${packageName}`, area, 'vendor');
        if (theme) { themes.push(theme); }
      }
    }

    return themes;
  }

  /**
   * Read area from theme.xml — returns null if not a theme at all
   */
  private async detectArea(themePath: string): Promise<'frontend' | 'adminhtml' | null> {
    const themeXmlPath = path.join(themePath, 'theme.xml');
    try {
      const xml = Buffer.from(
        await vscode.workspace.fs.readFile(vscode.Uri.file(themeXmlPath))
      ).toString('utf8');

      if (xml.includes('adminhtml')) { return 'adminhtml'; }
      return 'frontend'; // default area for themes
    } catch {
      return null; // no theme.xml — not a theme
    }
  }

  private async detectTheme(
    themePath: string,
    name: string,
    area: 'frontend' | 'adminhtml',
    type: 'vendor' | 'custom'
  ): Promise<MagentoTheme | null> {
    // Must have theme.xml
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(path.join(themePath, 'theme.xml')));
    } catch {
      return null;
    }

    // Read title from theme.xml
    let title: string | undefined;
    try {
      const xml = Buffer.from(
        await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(themePath, 'theme.xml')))
      ).toString('utf8');
      const match = xml.match(/<title>([^<]+)<\/title>/);
      if (match) { title = match[1]; }
    } catch {
      // Fine
    }

    // Read composer name and version
    let composerName: string | undefined;
    let version: string | undefined;
    try {
      const composer = JSON.parse(Buffer.from(
        await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(themePath, 'composer.json')))
      ).toString('utf8'));
      composerName = composer.name;
      version = composer.version;
    } catch {
      // Fine
    }

    return new MagentoTheme(name, themePath, area, type, title, composerName, version);
  }
}