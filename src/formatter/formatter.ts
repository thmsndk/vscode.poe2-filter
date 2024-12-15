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
    let insideBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines
      if (!line) {
        continue;
      }

      const formattedLine = this.formatLine(line, insideBlock);
      if (formattedLine === null) {
        continue;
      }

      const isBlock = /^(Show|Hide|Minimal)\b/.test(line);
      const isComment = line.startsWith("#");

      // Update block state
      if (isBlock) {
        insideBlock = true;
      } else if (line === "" || (isComment && !this.isInlineComment(line))) {
        insideBlock = false;
      }

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

  private isInlineComment(line: string): boolean {
    return line.trim().startsWith("#") && line.trim().length > 1;
  }

  private formatLine(line: string, insideBlock: boolean): string | null {
    if (!line.trim()) {
      return "";
    }

    let trimmed = line.trim();

    // Handle comments
    if (trimmed.startsWith("#")) {
      // Comment Section - If the character after # is repeated (like #---- or ####), keep as is
      if (/^#(.)\1+$/.test(trimmed)) {
        return trimmed;
      }

      // For comments inside blocks, apply indentation
      if (insideBlock && !this.isBlockSeparator(trimmed)) {
        return this.indentationString + trimmed.replace(/^#\s*/, "# ");
      }

      // For all other comments, ensure exactly one space after #
      return trimmed.replace(/^#\s*/, "# ");
    }

    // inline comments, ensure exactly one space after #
    trimmed = trimmed.replace(/#\s*/, "# ");

    // Handle block starts (Show/Hide/Minimal)
    if (/^(Show|Hide|Minimal)\b/.test(line)) {
      return trimmed;
    }

    // Handle conditions, actions and Continue (everything else)
    return this.indentationString + trimmed;
  }

  private isBlockSeparator(line: string): boolean {
    // Check if the line is a section separator (like #---- or ####)
    return /^#(.)\1+$/.test(line);
  }
}
