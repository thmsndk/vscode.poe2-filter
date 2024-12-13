// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { FilterFormatter } from "./formatter/formatter";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log("POE2 Filter extension is now active");

  // Register the formatter
  const formatter = new FilterFormatter();
  const formattingProvider =
    vscode.languages.registerDocumentFormattingEditProvider("poe2-filter", {
      async provideDocumentFormattingEdits(
        document: vscode.TextDocument
      ): Promise<vscode.TextEdit[]> {
        const formattedText = await formatter.format(document);

        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length)
        );

        return [vscode.TextEdit.replace(fullRange, formattedText)];
      },
    });

  context.subscriptions.push(formattingProvider);
}

// This method is called when your extension is deactivated
export function deactivate() {}
