import * as vscode from 'vscode';
import { ProjectTreeProvider } from './ui/projectTreeProvider';
import { WorkspaceScanner } from './services/workspaceScanner';

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

	// Initial scan
	await projectTreeProvider.refresh();
}

export function deactivate() {
	console.log('Magento Extension is now deactivated');
}