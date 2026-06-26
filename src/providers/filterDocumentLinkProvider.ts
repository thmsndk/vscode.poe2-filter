import path from "path";
import * as vscode from "vscode";

/**
 * Turns the file path in an `Import "file.filter"` statement (with or without
 * the trailing `Optional`) into a clickable link that opens the referenced
 * filter. Paths are resolved relative to the directory of the current document,
 * matching how the game loads imported filters.
 */
export class FilterDocumentLinkProvider
  implements vscode.DocumentLinkProvider
{
  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];
    const baseDir = path.dirname(document.uri.fsPath);

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);

      // Ignore anything after a comment so commented-out imports aren't linked.
      const commentIndex = line.text.indexOf("#");
      const code =
        commentIndex === -1 ? line.text : line.text.slice(0, commentIndex);

      const match = code.match(/^\s*Import\s+"([^"]+)"/i);
      if (!match) {
        continue;
      }

      const filePath = match[1];
      // Range covering the path inside the quotes.
      const startCol = code.indexOf(`"${filePath}"`) + 1;
      const range = new vscode.Range(i, startCol, i, startCol + filePath.length);

      const targetPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(baseDir, filePath);

      const link = new vscode.DocumentLink(range, vscode.Uri.file(targetPath));
      link.tooltip = "Open imported filter";
      links.push(link);
    }

    return links;
  }
}
