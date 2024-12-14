// Create a new file: src/diagnostics/filterCodeActions.ts
import * as vscode from "vscode";

export class FilterCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    context.diagnostics.forEach((diagnostic) => {
      if (
        diagnostic.source === "poe2-filter" &&
        diagnostic.message.startsWith("Unknown command")
      ) {
        const suggestions = this.extractSuggestions(diagnostic.message);
        const line = document.lineAt(diagnostic.range.start.line);
        const lineText = line.text;

        // Find the actual command start and end positions
        const commandStart = lineText.indexOf(lineText.trim());
        const commandEnd = lineText.indexOf(" ", commandStart);

        suggestions.forEach((suggestion) => {
          const fix = new vscode.CodeAction(
            `Change to '${suggestion}'`,
            vscode.CodeActionKind.QuickFix
          );

          const replaceRange = new vscode.Range(
            new vscode.Position(diagnostic.range.start.line, commandStart),
            commandEnd > -1
              ? new vscode.Position(diagnostic.range.start.line, commandEnd)
              : diagnostic.range.end
          );

          fix.edit = new vscode.WorkspaceEdit();
          fix.edit.replace(document.uri, replaceRange, suggestion);
          fix.diagnostics = [diagnostic];
          actions.push(fix);
        });
      }
    });

    return actions;
  }

  private extractSuggestions(message: string): string[] {
    const match = message.match(/Did you mean: (.*?)\?/);
    if (match) {
      return match[1].split(", ");
    }
    return [];
  }
}
