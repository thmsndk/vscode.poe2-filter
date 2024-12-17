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
      if (diagnostic.source !== "poe2-filter") {
        return;
      }

      // Handle suggestions for both unknown commands and invalid values
      if (
        diagnostic.message.startsWith("Unknown command") ||
        diagnostic.message.startsWith("Invalid value")
      ) {
        this.handleSuggestions(diagnostic, document, actions);
      }

      // Handle rule conflicts
      if (
        typeof diagnostic.code === "object" &&
        typeof diagnostic.code.value === "string" &&
        diagnostic.code.value.startsWith("goto:")
      ) {
        this.handleRuleConflict(diagnostic, actions);
      }
    });

    return actions;
  }

  private handleSuggestions(
    diagnostic: vscode.Diagnostic,
    document: vscode.TextDocument,
    actions: vscode.CodeAction[]
  ) {
    const suggestions = this.extractSuggestions(diagnostic.message);

    suggestions.forEach((suggestion) => {
      const fix = new vscode.CodeAction(
        `Change to '${suggestion}'`,
        vscode.CodeActionKind.QuickFix
      );

      fix.edit = new vscode.WorkspaceEdit();
      fix.edit.replace(document.uri, diagnostic.range, suggestion);
      fix.diagnostics = [diagnostic];
      actions.push(fix);
    });
  }

  private handleRuleConflict(
    diagnostic: vscode.Diagnostic,
    actions: vscode.CodeAction[]
  ) {
    if (typeof diagnostic.code !== "object" || !("value" in diagnostic.code)) {
      return;
    }

    const lineNumber = parseInt(diagnostic.code.value.toString());
    const action = new vscode.CodeAction(
      `Go to conflicting rule (line ${lineNumber + 1})`,
      vscode.CodeActionKind.QuickFix
    );

    action.command = {
      command: "revealLine",
      title: "Go to conflicting rule",
      arguments: [{ lineNumber, at: "center" }],
    };

    action.diagnostics = [diagnostic];
    actions.push(action);
  }

  private extractSuggestions(message: string): string[] {
    // Update regex to handle both patterns
    const match = message.match(
      /Did you mean: (.*?)\?|Must be one of: (.*?)(?:\?|$)/
    );
    if (match) {
      // Return the first non-undefined capture group, split by commas and trim
      const suggestions = (match[1] || match[2])
        .split(",")
        .map((s) => s.trim());
      // Remove any regex patterns that might have leaked into the error message
      return suggestions.filter((s) => !s.includes("^") && !s.includes("$"));
    }
    return [];
  }
}
