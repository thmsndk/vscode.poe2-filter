import * as vscode from "vscode";
import { GameDataService } from "../services/gameDataService";

export class FilterDecorationProvider {
  private matchDecoration = vscode.window.createTextEditorDecorationType({
    before: {
      margin: "0 2px 0 0",
      color: new vscode.ThemeColor("editorCodeLens.foreground"),
      contentText: "hello",
      fontStyle: "italic",
    },
  });

  updateDecorations(editor: vscode.TextEditor, gameData: GameDataService) {
    const decorations: vscode.DecorationOptions[] = [];

    for (let i = 0; i < editor.document.lineCount; i++) {
      const line = editor.document.lineAt(i);
      if (line.text.includes("==")) {
        continue;
      }

      // Find "BaseType" first
      if (line.text.includes("BaseType")) {
        // Then find all quoted strings after "BaseType"
        const baseTypeIndex = line.text.indexOf("BaseType");
        const afterBaseType = line.text.slice(baseTypeIndex);
        const quotedStrings = afterBaseType.matchAll(/"([^"]+)"/g);

        for (const match of quotedStrings) {
          const value = match[1];
          const matchingItems = gameData.findMatchingBaseTypes(value);

          if (matchingItems.length > 1) {
            const quoteStart = line.text.indexOf(match[0], baseTypeIndex);
            // Position the decoration at the start of the quote
            decorations.push({
              range: new vscode.Range(
                line.lineNumber,
                quoteStart,
                line.lineNumber,
                quoteStart
              ),
              renderOptions: {
                before: {
                  contentText: `${matchingItems.length}·`,
                  color: new vscode.ThemeColor("editorCodeLens.foreground"),
                },
              },
            });
          }
        }
      }
    }

    editor.setDecorations(this.matchDecoration, decorations);
  }
}
