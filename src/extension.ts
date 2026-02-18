import * as vscode from 'vscode';
import * as path from 'path';
import Handlebars from 'handlebars';
import { ProjectTreeProvider } from './ui/projectTreeProvider';
import { WorkspaceScanner } from './services/workspaceScanner';
import { TemplateRegistry } from './services/templateRegistry';
import { TemplateEngine } from './services/templateEngine';
import { WizardRunner, WizardAnswers } from './ui/wizardRunner';

class VscodeFileWriter {
	async write(filePath: string, content: string) {
		await vscode.workspace.fs.writeFile(
			vscode.Uri.file(filePath),
			Buffer.from(content, 'utf8')
		);
	}
	async mkdir(dirPath: string) {
		await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));
	}
}

let projectTreeProvider: ProjectTreeProvider;

export async function activate(context: vscode.ExtensionContext) {
	console.log('Magento Extension is now active');

	const scanner = new WorkspaceScanner();
	projectTreeProvider = new ProjectTreeProvider(scanner);

	// Register TreeView
	const treeView = vscode.window.createTreeView('magentoProjects', {
		treeDataProvider: projectTreeProvider,
		showCollapseAll: true,
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

	// ── Template-driven commands ──────────────────────────────────────────────

	const registry = await TemplateRegistry.load(context.extensionPath);
	const engine = new TemplateEngine();
	const writer = new VscodeFileWriter();

	for (const template of registry.all()) {
		const cmd = vscode.commands.registerCommand(
			template.command,
			async (uri: vscode.Uri) => {
				if (!uri?.fsPath) {
					vscode.window.showErrorMessage('Use this command from the Explorer context menu.');
					return;
				}

				// Resolve already-scanned modules for the dependency picker
				const projectPath = path.resolve(uri.fsPath, '..', '..');
				const project = projectTreeProvider.getProjects().find(p => p.rootPath === projectPath);
				const modules = project?.modules ?? [];

				const answers = await WizardRunner.run(template, uri.fsPath, modules);
				if (!answers) {
					return; // user cancelled
				}

				const ctx = buildContext(answers);
				const outputSubdir = Handlebars.compile(template.outputPath)(ctx);
				const outputDir = path.join(uri.fsPath, outputSubdir);

				const confirmed = await vscode.window.showInformationMessage(
					`Create "${outputSubdir}"?`,
					{ modal: true },
					'Create'
				);
				if (confirmed !== 'Create') {
					return;
				}

				try {
					const written = await engine.render(template.dir, outputDir, ctx, writer);

					vscode.window.showInformationMessage(
						`✔ Created ${written.length} file(s) in ${outputSubdir}`
					);

					const open = await vscode.window.showInformationMessage(
						'Open in Explorer?', 'Open', 'Skip'
					);
					if (open === 'Open') {
						vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(outputDir));
					}

					await projectTreeProvider.refresh();
				} catch (err) {
					vscode.window.showErrorMessage(`Failed to create files: ${err}`);
				}
			}
		);

		context.subscriptions.push(cmd);
	}

	// Initial scan
	await projectTreeProvider.refresh();
}

export function deactivate() {
	console.log('Magento Extension is now deactivated');
}

// ── Context builder ───────────────────────────────────────────────────────────

function buildContext(answers: WizardAnswers): Record<string, unknown> {
	const pkg = answers['packageName'] as string ?? '';
	const mod = answers['moduleName'] as string ?? '';

	const dependencies = (answers['dependencies'] as string[] ?? []).map(name => ({
		moduleName: name,
		composerName: toComposerName(name),
		version: '*',
	}));

	return {
		...answers,
		dependencies,
		fullModuleName: `${pkg}_${mod}`,
		packageNameLower: pkg.toLowerCase(),
		moduleNameLower: mod.toLowerCase(),
		year: new Date().getFullYear(),
	};
}

function toComposerName(magentoName: string): string {
	const [vendor, mod] = magentoName.split('_');
	if (!mod) {
		return magentoName.toLowerCase();
	}
	const kebab = mod.replace(/([A-Z])/g, (c, ch, i) => (i ? '-' : '') + ch.toLowerCase());
	return `${vendor.toLowerCase()}/module-${kebab}`;
}