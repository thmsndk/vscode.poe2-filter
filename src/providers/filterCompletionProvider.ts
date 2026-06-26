import * as fs from "fs";
import path from "path";
import * as vscode from "vscode";

const SOUND_EXTENSIONS = new Set([".mp3", ".wav", ".ogg"]);
const FILTER_EXTENSIONS = new Set([".filter"]);

type CompletionContextKind = "import" | "sound";

/**
 * Completes file names inside quoted paths:
 *  - `Import "..."` suggests sibling `.filter` files.
 *  - `CustomAlertSound[Optional] "..."` suggests sibling sound files.
 *
 * Paths are resolved relative to the current document's directory (and any
 * sub-path already typed), matching how the game and the rest of the extension
 * resolve filter/sound files. Directories are offered too and re-trigger
 * completion so nested folders can be navigated.
 */
export class FilterCompletionProvider
  implements vscode.CompletionItemProvider
{
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] {
    const linePrefix = document
      .lineAt(position)
      .text.slice(0, position.character);

    const kind = this.getContextKind(linePrefix);
    if (!kind) {
      return [];
    }

    // The partial path typed inside the still-open quote.
    const partial = linePrefix.match(/"([^"]*)$/)?.[1] ?? "";

    // Split the partial into the directory already typed and the fragment being
    // completed, so only the fragment is replaced.
    const slashIndex = Math.max(
      partial.lastIndexOf("/"),
      partial.lastIndexOf("\\")
    );
    const dirPart = slashIndex === -1 ? "" : partial.slice(0, slashIndex + 1);
    const fragment = slashIndex === -1 ? partial : partial.slice(slashIndex + 1);

    // Replace only the fragment after the last slash. An explicit range avoids
    // odd behaviour from "." and "-" in file names being treated as word breaks.
    const replaceRange = new vscode.Range(
      position.line,
      position.character - fragment.length,
      position.line,
      position.character
    );

    const baseDir = path.dirname(document.uri.fsPath);
    const listDir = path.isAbsolute(dirPart)
      ? dirPart
      : path.join(baseDir, dirPart);

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(listDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const allowedExtensions =
      kind === "import" ? FILTER_EXTENSIONS : SOUND_EXTENSIONS;

    const items: vscode.CompletionItem[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const item = new vscode.CompletionItem(
          entry.name,
          vscode.CompletionItemKind.Folder
        );
        item.insertText = entry.name + "/";
        item.range = replaceRange;
        // Re-trigger so the user can keep drilling into folders.
        item.command = {
          command: "editor.action.triggerSuggest",
          title: "Suggest",
        };
        items.push(item);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }
      if (!allowedExtensions.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }

      const item = new vscode.CompletionItem(
        entry.name,
        vscode.CompletionItemKind.File
      );
      item.range = replaceRange;
      items.push(item);
    }

    return items;
  }

  private getContextKind(linePrefix: string): CompletionContextKind | null {
    // Cursor must be inside an unclosed quote on this line.
    if (!/"[^"]*$/.test(linePrefix)) {
      return null;
    }
    if (/^\s*Import\b/.test(linePrefix)) {
      return "import";
    }
    // CustomAlertSound supports several semicolon-separated quoted files, so it
    // is enough that we are inside an open quote on such a line.
    if (/^\s*(CustomAlertSound|CustomAlertSoundOptional)\b/.test(linePrefix)) {
      return "sound";
    }
    return null;
  }
}
