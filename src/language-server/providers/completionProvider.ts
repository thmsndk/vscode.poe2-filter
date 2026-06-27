import * as fs from "fs";
import * as path from "path";
import {
  CompletionItem,
  CompletionItemKind,
  CompletionParams,
  Range,
  TextEdit,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

const SOUND_EXTENSIONS = new Set([".mp3", ".wav", ".ogg"]);
const FILTER_EXTENSIONS = new Set([".filter"]);

type CompletionContextKind = "import" | "sound";

/**
 * Completes file names inside quoted paths:
 *  - `Import "..."` suggests sibling `.filter` files.
 *  - `CustomAlertSound[Optional] "..."` suggests sibling sound files.
 *
 * Paths are resolved relative to the current document's directory (and any
 * sub-path already typed). Directories are offered too and re-trigger
 * completion so nested folders can be navigated.
 */
export class CompletionProvider {
  public provideCompletions(
    document: TextDocument,
    params: CompletionParams
  ): CompletionItem[] {
    const position = params.position;
    const offset = document.offsetAt(position);
    const text = document.getText();
    const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
    const linePrefix = text.slice(lineStart, offset);

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
    const fragment =
      slashIndex === -1 ? partial : partial.slice(slashIndex + 1);

    const replaceRange = Range.create(
      position.line,
      position.character - fragment.length,
      position.line,
      position.character
    );

    const baseDir = path.dirname(this.toFsPath(document.uri));
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

    const items: CompletionItem[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        items.push({
          label: entry.name,
          kind: CompletionItemKind.Folder,
          textEdit: TextEdit.replace(replaceRange, entry.name + "/"),
          // Re-trigger so the user can keep drilling into folders.
          command: {
            command: "editor.action.triggerSuggest",
            title: "Suggest",
          },
        });
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }
      if (!allowedExtensions.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }

      items.push({
        label: entry.name,
        kind: CompletionItemKind.File,
        textEdit: TextEdit.replace(replaceRange, entry.name),
      });
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

  /**
   * Converts a document URI (e.g. `file:///c%3A/dir/filter.filter`) into a
   * filesystem path. Falls back to returning the input unchanged when it is
   * not a `file:` URI.
   */
  private toFsPath(uri: string): string {
    if (!uri.startsWith("file:")) {
      return uri;
    }

    let p = decodeURIComponent(uri.replace(/^file:\/\//, ""));
    if (/^\/[a-zA-Z]:/.test(p)) {
      p = p.slice(1);
    }
    return p;
  }
}
