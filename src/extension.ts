import * as vscode from 'vscode';
import * as path from 'path';
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
const log = vscode.window.createOutputChannel('Magento Debug');

export async function activate(context: vscode.ExtensionContext) {
	log.show();
	log.appendLine('=== Magento Extension activating ===');

	const scanner = new WorkspaceScanner();
	projectTreeProvider = new ProjectTreeProvider(scanner);

	const treeView = vscode.window.createTreeView('magentoProjects', {
		treeDataProvider: projectTreeProvider,
		showCollapseAll: true,
	});
	context.subscriptions.push(treeView);

	const refreshCommand = vscode.commands.registerCommand(
		'magento.refreshProjects',
		async () => {
			await projectTreeProvider.refresh();
			vscode.window.showInformationMessage('Magento projects refreshed');
		}
	);
	context.subscriptions.push(refreshCommand);

	const registry = await TemplateRegistry.load(context.extensionPath);
	const engine = new TemplateEngine();
	const writer = new VscodeFileWriter();

	log.appendLine(`Loaded ${registry.all().length} template(s)`);

	await projectTreeProvider.refresh();

	const projects = projectTreeProvider.getProjects();
	log.appendLine(`After initial scan: ${projects.length} project(s)`);
	for (const p of projects) {
		log.appendLine(`  Project: ${p.rootPath}`);
		log.appendLine(`    modules (${p.modules.length}): ${p.modules.map(m => m.name).join(', ') || '(none)'}`);
		log.appendLine(`    themes  (${p.themes.length}): ${p.themes.map(t => t.name).join(', ') || '(none)'}`);
	}

	for (const template of registry.all()) {
		const cmd = vscode.commands.registerCommand(
			template.command,
			async (uri: vscode.Uri) => {
				log.appendLine(`\n--- Command fired: ${template.command} ---`);
				log.appendLine(`  uri.fsPath: ${uri?.fsPath}`);

				if (!uri?.fsPath) {
					vscode.window.showErrorMessage('Use this command from the Explorer context menu.');
					return;
				}

				const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
				const workspaceRoot = workspaceFolder?.uri.fsPath;

				const currentProjects = projectTreeProvider.getProjects();
				const project = currentProjects.find(p =>
					workspaceRoot && (
						p.rootPath === workspaceRoot ||
						p.rootPath.startsWith(workspaceRoot) ||
						workspaceRoot.startsWith(p.rootPath)
					)
				);

				log.appendLine(`  Matched project: ${project ? project.rootPath : '(none)'}`);
				log.appendLine(`  modules: ${project?.modules.length ?? 0}`);
				log.appendLine(`  themes:  ${project?.themes.length ?? 0}`);

				const modules = project?.modules ?? [];
				const themes = project?.themes ?? [];

				const answers = await WizardRunner.run(template, uri.fsPath, modules, themes);
				if (!answers) {
					return;
				}

				const ctx = buildContext(answers);

				log.appendLine(`  ctx keys: ${Object.keys(ctx).join(', ')}`);
				log.appendLine(`  outputPath template: ${template.outputPath}`);

				const outputSubdir = engine.renderString(template.outputPath, ctx);

				log.appendLine(`  outputSubdir: ${outputSubdir}`);

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
}

export function deactivate() {
	log.appendLine('Magento Extension deactivated');
}

/**
 * Converts raw wizard answers into a template context.
 *
 * Every answer key is available as-is in templates (e.g. {{themeName}}).
 *
 * Automatic extras — computed from answers if the relevant keys exist:
 *   packageName + moduleName  → fullModuleName, moduleNameLower
 *   packageName + themeName   → fullThemeName,  themeNameLower
 *   packageName               → packageNameLower
 *   parentTheme (with "||")   → parentTheme (name part), parentThemeComposer
 *   dependencies (string[])   → dependencies[].moduleName / .composerName / .version
 *   year                      → always added
 *
 * To add a new template: just add steps to _meta.json. No code changes needed.
 */
function buildContext(answers: WizardAnswers): Record<string, unknown> {
	const ctx: Record<string, unknown> = { ...answers, year: new Date().getFullYear() };

	const pkg = str(answers['packageName']);
	const mod = str(answers['moduleName']);
	const theme = str(answers['themeName']);

	if (pkg) ctx['packageNameLower'] = pkg.toLowerCase();
	if (pkg && mod) {
		ctx['fullModuleName'] = `${pkg}_${mod}`;
		ctx['moduleNameLower'] = mod.toLowerCase();
	}
	if (pkg && theme) {
		ctx['fullThemeName'] = `${pkg}/${theme}`;
		ctx['themeNameLower'] = theme.toLowerCase();
	}

	// parentTheme may be encoded as "ThemeName||composer/name" by the theme source
	const parentRaw = str(answers['parentTheme']);
	if (parentRaw) {
		const [parentTheme, parentThemeComposer] = parentRaw.split('||');
		ctx['parentTheme'] = parentTheme;
		ctx['parentThemeComposer'] = parentThemeComposer;
	}

	// dependencies is a multi-select of module names — expand to objects
	const deps = answers['dependencies'];
	if (Array.isArray(deps)) {
		ctx['dependencies'] = deps.map(name => ({
			moduleName: name,
			composerName: toComposerName(name),
			version: '*',
		}));
	}

	return ctx;
}

function str(v: unknown): string {
	return typeof v === 'string' ? v : '';
}

function toComposerName(magentoName: string): string {
	const [vendor, mod] = magentoName.split('_');
	if (!mod) { return magentoName.toLowerCase(); }
	const kebab = mod.replace(/([A-Z])/g, (c, ch, i) => (i ? '-' : '') + ch.toLowerCase());
	return `${vendor.toLowerCase()}/module-${kebab}`;
}