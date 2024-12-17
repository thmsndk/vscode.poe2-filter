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

      // Handle unknown command suggestions
      if (diagnostic.message.startsWith("Unknown command")) {
        this.handleUnknownCommand(diagnostic, document, actions);
      }

      // Handle invalid value suggestions
      if (diagnostic.message.startsWith("Invalid value")) {
        this.handleInvalidValue(diagnostic, document, actions);
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

  private handleUnknownCommand(
    diagnostic: vscode.Diagnostic,
    document: vscode.TextDocument,
    actions: vscode.CodeAction[]
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

  private handleInvalidValue(
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
