import * as vscode from "vscode";
import { GameDataService } from "../services/gameDataService";

export class FilterHoverProvider implements vscode.HoverProvider {
  constructor(private gameData: GameDataService) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Hover> {
    const line = document.lineAt(position.line);

    // Skip lines with exact matches
    if (line.text.includes("==")) {
      return null;
    }

    // Only process if line contains BaseType
    if (!line.text.includes("BaseType")) {
      return null;
    }

    // Find all quoted strings after BaseType
    const baseTypeIndex = line.text.indexOf("BaseType");
    const afterBaseType = line.text.slice(baseTypeIndex);
    const quotedStrings = afterBaseType.matchAll(/"([^"]+)"/g);

    // Check each match to see if we're hovering over it
    for (const match of quotedStrings) {
      const value = match[1];
      const matchStart = line.text.indexOf(match[0], baseTypeIndex);
      const valueStart = matchStart + 1; // +1 to skip opening quote
      const valueEnd = valueStart + value.length;

      // Check if hover position is within the value
      if (position.character >= valueStart && position.character <= valueEnd) {
        const matchingItems = this.gameData.findMatchingBaseTypes(value);

        // Only show tooltip if there are multiple matches
        if (matchingItems.length > 1) {
          const content = new vscode.MarkdownString();
          content.appendMarkdown(
            `### ${matchingItems.length} Matching Items\n\n`
          );
          matchingItems.slice(0, 10).map((m) => {
            content.appendMarkdown(`- ${m.Name}\n`);
          });
          if (matchingItems.length > 10) {
            content.appendMarkdown(
              `\n... and ${matchingItems.length - 10} more`
            );
          }
          return new vscode.Hover(content);
        }
      }
    }
    return null;
  }
}
