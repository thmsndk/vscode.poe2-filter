import * as vscode from "vscode";

export class FilterFormatter {
  private indentationString: string;

  constructor() {
    // Get editor configuration for the current file
    const config = vscode.workspace.getConfiguration("editor");
    const insertSpaces = config.get<boolean>("insertSpaces", true);
    const tabSize = config.get<number>("tabSize", 4);

    // Use tabs or spaces based on editor configuration
    this.indentationString = insertSpaces ? " ".repeat(tabSize) : "\t";
  }

  async format(document: vscode.TextDocument): Promise<string> {
    const lines = document.getText().split("\n");
    let result = "";
    let lastLineWasBlock = false;
    let lastLineWasComment = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines
      if (!line) {
        continue;
      }

      const formattedLine = this.formatLine(line);
      if (formattedLine === null) {
        continue;
      }

      const isBlock = /^(Show|Hide|Minimal|Continue)\b/.test(formattedLine);
      const isComment = formattedLine.startsWith("#");

      // Add empty line if needed (before blocks or comments)
      if (
        result &&
        !lastLineWasComment &&
        (isBlock || isComment) &&
        !lastLineWasBlock
      ) {
        result += "\n";
      }

      // Add the formatted line
      result += result ? "\n" + formattedLine : formattedLine;

      lastLineWasBlock = isBlock;
      lastLineWasComment = isComment;
    }

    // Ensure file ends with a newline
    return result + "\n";
  }

  private formatLine(line: string): string | null {
    if (!line.trim()) {
      return "";
    }

    // Handle comments
    if (line.trim().startsWith("#")) {
      const trimmed = line.trim();

      // If the character after # is repeated (like #---- or ####), keep as is
      if (/^#(.)\1+$/.test(trimmed)) {
        return trimmed;
      }

      // For all other comments, ensure exactly one space after #
      return trimmed.replace(/^#\s*/, "# ");
    }

    // Handle block starts (Show/Hide/Minimal/Continue)
    if (/^(Show|Hide|Minimal|Continue)\b/.test(line)) {
      return line.trim();
    }

    // Handle conditions and actions (everything else)
    return this.indentationString + line.trim();
  }
}
