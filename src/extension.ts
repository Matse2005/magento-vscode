import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectTreeProvider } from './ui/projectTreeProvider';
import { WorkspaceScanner } from './services/workspaceScanner';
import { ModuleWizard } from './ui/moduleWizard';

let projectTreeProvider: ProjectTreeProvider;

export async function activate(context: vscode.ExtensionContext) {
	console.log('Magento Extension is now active');

	const scanner = new WorkspaceScanner();
	projectTreeProvider = new ProjectTreeProvider(scanner);

	// Register TreeView
	const treeView = vscode.window.createTreeView('magentoProjects', {
		treeDataProvider: projectTreeProvider,
		showCollapseAll: true
	});

	context.subscriptions.push(treeView);

	// Register refresh command
	const refreshCommand = vscode.commands.registerCommand(
		'magento.refreshProjects',
		async () => {
			await projectTreeProvider.refresh();
			vscode.window.showInformationMessage('Magento projects refreshed');
		}
	);

	context.subscriptions.push(refreshCommand);

	// Register create module command
	const createModuleCommand = vscode.commands.registerCommand(
		'magento.createModule',
		async (uri: vscode.Uri) => {
			// Get the target path from the context menu
			const targetPath = uri.fsPath;

			// Verify this is an app/code directory
			const isAppCode = targetPath.endsWith('app/code') ||
				targetPath.endsWith('app\\code');

			if (!isAppCode) {
				vscode.window.showErrorMessage(
					'Please right-click on an app/code directory'
				);
				return;
			}

			// Find the Magento project this app/code belongs to
			const projectPath = path.dirname(path.dirname(targetPath)); // Go up from app/code to project root
			const projects = projectTreeProvider.getProjects();
			const project = projects.find(p => p.rootPath === projectPath);

			if (!project) {
				vscode.window.showWarningMessage(
					'Could not find Magento project. Available modules list may be limited.'
				);
			}

			// Run the module creation wizard
			await ModuleWizard.run(
				targetPath,
				project ? project.modules : []
			);

			// Refresh the tree to show the new module
			await projectTreeProvider.refresh();
		}
	);

	context.subscriptions.push(createModuleCommand);

	// Initial scan
	await projectTreeProvider.refresh();
}

export function deactivate() {
	console.log('Magento Extension is now deactivated');
}