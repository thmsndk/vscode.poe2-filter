import * as vscode from 'vscode';

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
				/\bPlayAlertSound\s+(\d+)\s+(\d+)/
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
					command: "poe2-filter.codelensAction",
					arguments: [sound, volume]
				};
				this.codeLenses.push(new vscode.CodeLens(range, cmd));
			}
		}
		return this.codeLenses;
	}
}

