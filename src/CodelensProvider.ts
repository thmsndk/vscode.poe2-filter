import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * CodelensProvider
 */
export class CodelensProvider implements vscode.CodeLensProvider {

	private codeLenses: vscode.CodeLens[] = [];

	public provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
		this.codeLenses = [];
		for (let i = 0; i < document.lineCount; i++) {
			const line = document.lineAt(i);
			const soundMatch = line.text.match(
				/\bPlayAlertSound\w*\s+(\w+)\s+(\d+)/
			);
			const customSoundMatch = line.text.match(
				/\bCustomAlertSound\w*\s+"([^"]+)"\s+(\d+)/
			);

			if (soundMatch) {
				const [x, sound, volume] = soundMatch;
				const range = new vscode.Range(
				new vscode.Position(i, line.text.indexOf(x)),
				new vscode.Position(i, line.text.indexOf(x) + x.length)
				);
				const cmd = {
					title: "Play sound",
					tooltip: "Play sound",
					command: "poe2-filter.playDefaultSound",
					arguments: [sound, volume]
				};
				this.codeLenses.push(new vscode.CodeLens(range, cmd));
			} else if (customSoundMatch) {
				const [x, sound, volume] = customSoundMatch;
				const range = new vscode.Range(
				new vscode.Position(i, line.text.indexOf(x)),
				new vscode.Position(i, line.text.indexOf(x) + x.length)
				);
				const cmd = {
					title: `Play ${sound}`,
					tooltip: `Play ${sound}`,
					command: "poe2-filter.playCustomSound",
					arguments: [sound, volume]
				};
				const currentDir = vscode.Uri.file(path.dirname(vscode.window.activeTextEditor?.document.uri.fsPath || vscode.workspace.workspaceFolders![0].uri.fsPath));
				if (fs.existsSync(path.join(currentDir.fsPath, sound)))
				{
					console.log(`Custom sound file exists: ${sound}`);
					this.codeLenses.push(new vscode.CodeLens(range, cmd));
				}
			}
		}
		return this.codeLenses;
	}
}

