import * as path from "path";
import { DocumentLink, Range } from "vscode-languageserver";
import { RootNode, ActionNode, isBlockNode, isImportNode } from "../ast/nodes";

/**
 * Turns referenced file paths into clickable links, resolved relative to the
 * directory of the current document (matching how the game loads files):
 *  - `Import "file.filter"` opens the imported filter.
 *  - `CustomAlertSound[Optional] "file"` opens the sound file.
 *
 * "None" and semicolon-separated path lists are skipped.
 */
export class DocumentLinkProvider {
  public provideDocumentLinks(
    ast: RootNode,
    documentUri: string
  ): DocumentLink[] {
    const links: DocumentLink[] = [];
    const baseDir = path.dirname(this.toFsPath(documentUri));

    const addLink = (
      value: string,
      line: number,
      columnStart: number,
      columnEnd: number,
      tooltip: string
    ): void => {
      if (!value || value === "None" || value.includes(";")) {
        return;
      }

      const targetPath = path.isAbsolute(value)
        ? value
        : path.join(baseDir, value);

      links.push({
        range: Range.create(line - 1, columnStart - 1, line - 1, columnEnd - 1),
        target: this.pathToUri(targetPath),
        tooltip,
      });
    };

    for (const node of ast.children) {
      if (isImportNode(node)) {
        const { value } = node.path;
        if (typeof value === "string") {
          addLink(
            value,
            node.line,
            node.path.columnStart,
            node.path.columnEnd,
            "Open imported filter"
          );
        }
      } else if (isBlockNode(node)) {
        for (const child of node.body) {
          if (
            child.type !== "Action" ||
            child.commented === true ||
            (child.action !== "CustomAlertSound" &&
              child.action !== "CustomAlertSoundOptional")
          ) {
            continue;
          }

          const value = (child as ActionNode).values[0];
          if (value && typeof value.value === "string") {
            addLink(
              value.value,
              child.line,
              value.columnStart,
              value.columnEnd,
              "Open sound file"
            );
          }
        }
      }
    }

    return links;
  }

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

  private pathToUri(p: string): string {
    let normalized = p.replace(/\\/g, "/");
    if (!normalized.startsWith("/")) {
      normalized = "/" + normalized;
    }
    return (
      "file://" +
      normalized
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")
    );
  }
}
