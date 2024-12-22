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
    let lastLineWasEmpty = false;
    let insideBlock = false;
    let isCommentedBlock = false;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();

      // Skip empty lines but track them
      if (!line) {
        lastLineWasEmpty = true;
        i++;
        continue;
      }

      // Check for Type 1 section (bordered section)
      if (
        i + 2 < lines.length &&
        /^#(.)\1+$/.test(line) &&
        lines[i + 1].trim().startsWith("# ") &&
        /^#(.)\1+$/.test(lines[i + 2].trim())
      ) {
        // Add empty line before if we have content and last line wasn't empty
        if (result && !lastLineWasComment) {
          result += "\n";
        }
        // Add bordered section
        result += result ? "\n" + line : line;
        result += "\n" + lines[i + 1].trim();
        result += "\n" + lines[i + 2].trim();
        result += "\n"; // Add empty line after bordered section
        i += 3;
        lastLineWasBlock = false;
        lastLineWasComment = true;
        continue;
      }

      const isBlock = this.isBlockStart(line);
      const isComment = line.startsWith("#");
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : "";
      const isNextLineBlock = this.isBlockStart(nextLine);

      if (
        isBlock &&
        (!lastLineWasComment || isCommentedBlock || lastLineWasEmpty)
      ) {
        // If we encounter a new block we need to make sure there is a blank line before it
        result += "\n";
      }

      if (
        !isBlock &&
        isComment &&
        ((!insideBlock && !lastLineWasComment) || isNextLineBlock)
      ) {
        // If we encounter a new comment we need to make sure there is a blank line before it
        result += "\n";
      }

      // Update block state
      if (isBlock) {
        insideBlock = true;
        isCommentedBlock = isComment;
      } else if (line === "" || (isComment && !this.isInlineComment(line))) {
        insideBlock = false;
        isCommentedBlock = false;
      }

      // Normal line formatting
      const formattedLine = this.formatLine(
        line,
        insideBlock,
        isCommentedBlock,
        isNextLineBlock
      );

      if (line.includes("Continue")) {
        insideBlock = false;
        isCommentedBlock = false;
      }

      if (formattedLine === null) {
        i++;
        continue;
      }

      // Add the formatted line
      result += result ? "\n" + formattedLine : formattedLine;

      lastLineWasBlock = isBlock;
      lastLineWasComment = isComment;
      lastLineWasEmpty = false;
      i++;
    }

    // Ensure file ends with a newline
    return result + "\n";
  }

  private isInlineComment(line: string): boolean {
    return line.trim().startsWith("#") && line.trim().length > 1;
  }

  private formatLine(
    line: string,
    insideBlock: boolean,
    isCommentedBlock: boolean,
    isNextLineBlock: boolean
  ): string | null {
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

      // If this is a comment and next line is a block, treat it as a header
      if (isNextLineBlock) {
        return trimmed;
      }

      // For comments inside blocks
      if (insideBlock) {
        if (isCommentedBlock) {
          // For commented blocks, add indentation after the #
          if (this.isBlockStart(trimmed)) {
            return trimmed; // Don't indent the Show/Hide/Minimal line
          }

          return "#" + this.indentationString + trimmed.substring(1).trim();
        } else if (!this.isBlockSeparator(trimmed)) {
          return this.indentationString + trimmed.replace(/^#\s*/, "#");
        }
      }

      if (!isCommentedBlock) {
        // For all other comments, ensure exactly one space after #
        return trimmed.replace(/^#\s*/, "# ");
      }

      return trimmed;
    }

    if (!isCommentedBlock) {
      // inline comments, ensure exactly one space after #
      trimmed = trimmed.replace(/#\s*/, "# ");
    }

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

  private isBlockStart(line: string): boolean {
    return /^#?\s*(Show|Hide|Minimal)\b/.test(line.trim());
  }
}
