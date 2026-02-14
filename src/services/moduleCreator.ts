import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Configuration for creating a new Magento module
 */
export interface ModuleConfig {
  packageName: string;
  moduleName: string;
  version: string;
  license: string[];
  dependencies: ModuleDependency[];
}

/**
 * Module dependency with composer package info
 */
export interface ModuleDependency {
  moduleName: string;
  composerName: string;
  version: string;
}

/**
 * Service for creating new Magento 2 modules
 */
export class ModuleCreator {
  /**
   * Common open source licenses for Magento modules
   */
  public static readonly COMMON_LICENSES = [
    { label: 'OSL-3.0', detail: 'Open Software License 3.0 (Magento default)' },
    { label: 'MPL-2.0', detail: 'Mozilla Public License' },
    { label: 'MIT', detail: 'MIT License' },
    { label: 'LGPL-2.1', detail: 'GNU Lesser General Public License v2.1' },
    { label: 'LGPL-3.0', detail: 'GNU Lesser General Public License v3.0' },
    { label: 'GPL-2.0', detail: 'GNU General Public License v2.0' },
    { label: 'GPL-3.0', detail: 'GNU General Public License v3.0' },
    { label: 'BSD-2-Clause', detail: 'BSD 2-Clause License' },
    { label: 'BSD-3-Clause', detail: 'BSD 3-Clause License' },
    { label: 'AFL-3.0', detail: 'Academic Free License 3.0' },
    { label: 'Apache-2.0', detail: 'Apache License 2.0' },
    { label: 'Proprietary', detail: 'Proprietary/Commercial License' },
  ];

  /**
   * Create a new Magento 2 module
   */
  public async createModule(
    targetPath: string,
    config: ModuleConfig
  ): Promise<void> {
    const modulePath = path.join(targetPath, config.packageName, config.moduleName);

    // Create module directory structure
    await this.createDirectoryStructure(modulePath);

    // Create registration.php
    await this.createRegistrationFile(modulePath, config);

    // Create composer.json
    await this.createComposerFile(modulePath, config);

    // Create etc/module.xml
    await this.createModuleXmlFile(modulePath, config);

    // Create README.md
    await this.createReadmeFile(modulePath, config);
  }

  /**
   * Create the module directory structure
   */
  private async createDirectoryStructure(modulePath: string): Promise<void> {
    const directories = [
      '',
      'etc',
      'Block',
      'Controller',
      'Helper',
      'Model',
      'Setup',
      'view/frontend',
      'view/adminhtml'
    ];

    for (const dir of directories) {
      const dirPath = path.join(modulePath, dir);
      const dirUri = vscode.Uri.file(dirPath);
      try {
        await vscode.workspace.fs.createDirectory(dirUri);
      } catch (error) {
        console.error(`Failed to create directory ${dirPath}:`, error);
        throw error;
      }
    }
  }

  /**
   * Create registration.php
   */
  private async createRegistrationFile(
    modulePath: string,
    config: ModuleConfig
  ): Promise<void> {
    const fullModuleName = `${config.packageName}_${config.moduleName}`;
    const content = `<?php
/**
 * Copyright © ${new Date().getFullYear()} ${config.packageName}. All rights reserved.
 * See LICENSE.txt for license details.
 */

use Magento\\Framework\\Component\\ComponentRegistrar;

ComponentRegistrar::register(
    ComponentRegistrar::MODULE,
    '${fullModuleName}',
    __DIR__
);
`;

    await this.writeFile(modulePath, 'registration.php', content);
  }

  /**
   * Create composer.json
   */
  private async createComposerFile(
    modulePath: string,
    config: ModuleConfig
  ): Promise<void> {
    const packageNameLower = config.packageName.toLowerCase();
    const moduleNameLower = config.moduleName.toLowerCase();
    const fullModuleName = `${config.packageName}_${config.moduleName}`;

    // Build require object with module dependencies
    const require: Record<string, string> = {};

    // Add selected module dependencies with their composer names
    for (const dependency of config.dependencies) {
      require[dependency.composerName] = dependency.version;
    }

    const composerConfig = {
      name: `${packageNameLower}/module-${moduleNameLower}`,
      description: `${fullModuleName} module`,
      type: 'magento2-module',
      version: config.version,
      license: config.license,
      require,
      autoload: {
        files: ['registration.php'],
        'psr-4': {
          [`${config.packageName}\\${config.moduleName}\\`]: ''
        }
      }
    };

    const content = JSON.stringify(composerConfig, null, 2);
    await this.writeFile(modulePath, 'composer.json', content);
  }

  /**
   * Create etc/module.xml with dependencies
   */
  private async createModuleXmlFile(
    modulePath: string,
    config: ModuleConfig
  ): Promise<void> {
    const fullModuleName = `${config.packageName}_${config.moduleName}`;

    let sequenceXml = '';
    if (config.dependencies.length > 0) {
      const sequenceItems = config.dependencies
        .map(dep => `        <module name="${dep.moduleName}"/>`)
        .join('\n');
      sequenceXml = `\n        <sequence>\n${sequenceItems}\n        </sequence>`;
    }

    const content = `<?xml version="1.0"?>
<!--
/**
 * Copyright © ${new Date().getFullYear()} ${config.packageName}. All rights reserved.
 * See LICENSE.txt for license details.
 */
-->
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="urn:magento:framework:Module/etc/module.xsd">
    <module name="${fullModuleName}">${sequenceXml}
    </module>
</config>
`;

    await this.writeFile(path.join(modulePath, 'etc'), 'module.xml', content);
  }

  /**
   * Create README.md
   */
  private async createReadmeFile(
    modulePath: string,
    config: ModuleConfig
  ): Promise<void> {
    const fullModuleName = `${config.packageName}_${config.moduleName}`;

    const content = `# ${fullModuleName}

## Description
${fullModuleName} module for Magento 2

## Version
${config.version}

## License
${config.license.join(', ')}

## Installation

\`\`\`bash
# Copy module to app/code/${config.packageName}/${config.moduleName}
bin/magento module:enable ${fullModuleName}
bin/magento setup:upgrade
bin/magento cache:flush
\`\`\`

## Dependencies
${config.dependencies.length > 0 ? config.dependencies.map(dep => `- ${dep.moduleName} (${dep.composerName})`).join('\n') : 'None'}
`;

    await this.writeFile(modulePath, 'README.md', content);
  }

  /**
   * Write file to disk
   */
  private async writeFile(
    directory: string,
    filename: string,
    content: string
  ): Promise<void> {
    const filePath = path.join(directory, filename);
    const fileUri = vscode.Uri.file(filePath);
    const contentBytes = Buffer.from(content, 'utf8');

    try {
      await vscode.workspace.fs.writeFile(fileUri, contentBytes);
    } catch (error) {
      console.error(`Failed to write file ${filePath}:`, error);
      throw error;
    }
  }
}