import {
  Token,
  TokenType,
  HeaderInfo,
  RarityValue,
  ColorValue,
  ShapeValue,
} from "./tokens";
import { ConditionType } from "./conditions";
import { ActionType } from "./actions";
import { BlockType } from "./nodes";

export class Lexer {
  /** The full source text being lexed */
  private source: string;

  /** Current character position in the source text */
  private position: number = 0;

  /** Current line number (1-based) */
  private line: number = 1;

  /** Current column number (1-based, resets on newline) */
  private column: number = 1;

  constructor(source: string) {
    this.source = source;
  }

  public nextToken(): Token {
    this.skipWhitespace();

    if (this.position >= this.source.length) {
      return this.createToken("EOF", "");
    }

    const char = this.source[this.position];

    // Handle comments and headers
    if (char === "#") {
      return this.readCommentOrHeader();
    }

    // Handle quoted strings
    if (char === '"') {
      return this.readQuotedString();
    }

    // Handle numbers
    if (/[0-9]/.test(char)) {
      return this.readNumber();
    }

    // Handle words (keywords, identifiers, etc.)
    if (/[A-Za-z]/.test(char)) {
      return this.readWord();
    }

    // Handle operators
    if (/[=<>]/.test(char)) {
      return this.readOperator();
    }

    // Handle newlines
    if (char === "\r" || char === "\n") {
      let value: string;
      if (
        char === "\r" &&
        this.position + 1 < this.source.length &&
        this.source[this.position + 1] === "\n"
      ) {
        value = "\r\n";
        this.position += 2; // Skip both \r\n
      } else {
        value = char;
        this.position++; // Skip single \r or \n
      }
      this.line++;
      this.column = 1;
      return this.createToken("NEWLINE", value); // Keep original newline character(s)
    }

    // Handle any unexpected character
    this.position++;
    this.column++;
    return this.createToken("UNKNOWN", char);
  }

  private createToken(type: TokenType, value: any, length: number = 1): Token {
    return {
      type,
      value,
      start: this.position - length,
      end: this.position,
      line: this.line,
      columnStart: this.column - length,
      columnEnd: this.column,
    };
  }

  private skipWhitespace(): void {
    while (
      this.position < this.source.length &&
      /[ \t]/.test(this.source[this.position])
    ) {
      this.position++;
      this.column++;
    }
  }

  private readCommentOrHeader(): Token {
    const start = this.position;
    // Check if this might be a header
    const startLine = this.line;
    const startColumn = this.column;

    // Read the rest of the line
    let line = this.peekLine().trim();

    const leadingCharacters = line.match(/^[#\s]+/)?.[0].length || 0;
    const trimmedLine = line.slice(leadingCharacters);

    const words = trimmedLine.split(/\s/);
    const firstWord = words[0];

    if (firstWord in BlockType) {
      const end = this.position + leadingCharacters + firstWord.length;
      this.advanceToPosition(end);

      return {
        type: "COMMENTED_BLOCK",
        value: firstWord,
        start,
        end,
        line: startLine,
        columnStart: startColumn,
        columnEnd: this.column,
      };
    } else if (this.isCondition(firstWord)) {
      const end = this.position + leadingCharacters + firstWord.length;
      this.advanceToPosition(end);

      return {
        type: "COMMENTED_CONDITION",
        value: firstWord,
        start,
        end,
        line: startLine,
        columnStart: startColumn,
        columnEnd: this.column,
      };
    } else if (this.isAction(firstWord)) {
      const end = this.position + leadingCharacters + firstWord.length;
      this.advanceToPosition(end);

      return {
        type: "COMMENTED_ACTION",
        value: firstWord,
        start,
        end,
        line: startLine,
        columnStart: startColumn,
        columnEnd: this.column,
      };
    }

    // Check if this might be a header
    if (startColumn === 1) {
      const headerInfo = this.tryReadHeader();
      if (headerInfo) {
        return {
          type: "HEADER",
          value: headerInfo,
          start,
          end: this.position,
          line: startLine,
          columnStart: startColumn,
          columnEnd: this.column,
        };
      }
    }

    // Skip the # character
    this.position++;
    this.column++;

    // If there's non-whitespace before this comment on the same line, it's an inline comment
    if (!this.isLineStart(start)) {
      let value = "";
      while (
        this.position < this.source.length &&
        this.source[this.position] !== "\n"
      ) {
        value += this.source[this.position];
        this.position++;
        this.column++;
      }
      return {
        type: "INLINE_COMMENT",
        value: value.trim(),
        start,
        end: this.position,
        line: startLine,
        columnStart: startColumn,
        columnEnd: this.column,
      };
    }

    // Skip whitespace after #
    this.skipWhitespace();

    // Read the rest of the line because we've skipped # and whitespace
    line = this.peekLine().trim();

    // Regular comment
    return {
      type: "COMMENT",
      value: line,
      start,
      end: this.advanceToEndOfLine(),
      line: startLine,
      columnStart: startColumn,
      columnEnd: this.column,
    };
  }

  private advanceToEndOfLine(): number {
    const start = this.position;
    while (
      this.position < this.source.length &&
      this.source[this.position] !== "\n"
    ) {
      this.position++;
      this.column++;
    }
    return this.position;
  }

  private tryReadHeader(): HeaderInfo | null {
    // first line does not contain #
    const firstLine = this.peekLine().trim();

    // Check for bordered sections first (higher priority)
    if (this.isBorderLine(firstLine)) {
      // Remove leading #s and trim to get the actual border character
      const withoutHashes = firstLine.trim().replace(/^#+/, "").trim();
      const border = withoutHashes[0];

      // Advance past the border line
      this.advanceToEndOfLine();
      this.position++; // Skip the newline
      this.line++;
      this.column = 1;

      /* 
        TODO: There is actually different strategies for determining the level
        markdown style is one, 
        using -- as the secondary border level is another, 
        and then there is the id in increments
      */
      let headerInfo: HeaderInfo = {
        level: (firstLine.match(/^#+/) || [""])[0].length || 1, // Count #s for level
        text: "",
        style: {
          border,
          isMarkdown: false,
        },
      };

      // Keep reading lines until we hit another border
      while (this.position < this.source.length) {
        const line = this.peekLine().trim();

        // Stop if line doesn't start with #
        if (!line.startsWith("#")) {
          break;
        }

        // remove the #
        const contentLine = line.slice(1).trim();
        this.position++;
        this.column++;

        // Stop if we hit another border
        if (this.isBorderLine(contentLine)) {
          // Consume the ending border without adding it to the text
          this.advanceToEndOfLine();
          this.position++; // Skip the newline after border
          this.line++;
          this.column = 1;
          break;
        }

        // Check for ID sections within the header: [[1000]] or [1005]
        const idMatch = contentLine.match(/^\[{1,2}(\d+)\]{1,2}\s*(.*)$/);

        if (idMatch) {
          const [, id, text] = idMatch;
          const doubleWrapped = contentLine.includes("[[");
          headerInfo.id = parseInt(id);
          headerInfo.text = text.trim();
          headerInfo.style = {
            ...headerInfo.style,
            idStyle: doubleWrapped ? "double" : "single",
          };
        } else {
          // Regular content, with newlines
          headerInfo.text += contentLine;
        }

        this.advanceToEndOfLine();
        this.position++; // Skip the newline
        this.line++;
        this.column = 1;
      }

      headerInfo.text = headerInfo.text.trim();
      return headerInfo;
    }

    // Fallback: Check for markdown headers
    const markdownLevel = this.countInitialHashes(firstLine);
    if (markdownLevel > 0) {
      this.advanceToEndOfLine();
      this.position++; // Skip the newline
      this.line++;
      this.column = 1;

      return {
        level: markdownLevel,
        text: firstLine.slice(markdownLevel).trim(),
        style: {
          isMarkdown: true,
        },
      };
    }

    return null;
  }

  private readWord(): Token {
    const value = this.readWhile((char) => /[A-Za-z0-9_]/.test(char));

    // Check for keywords
    switch (value) {
      case "Show":
        return this.createToken("SHOW", value, value.length);
      case "Hide":
        return this.createToken("HIDE", value, value.length);
      case "Minimal":
        return this.createToken("MINIMAL", value, value.length);
    }

    // Check for special values
    if (this.isRarityValue(value)) {
      return this.createToken("RARITY", value as RarityValue, value.length);
    }
    if (this.isColorValue(value)) {
      return this.createToken("COLOR", value as ColorValue, value.length);
    }
    if (this.isShapeValue(value)) {
      return this.createToken("SHAPE", value as ShapeValue, value.length);
    }

    // Check for conditions/actions
    if (this.isCondition(value)) {
      return this.createToken("CONDITION", value, value.length);
    }
    if (this.isAction(value)) {
      return this.createToken("ACTION", value, value.length);
    }

    // Booleans
    if (value === "True" || value === "False") {
      return this.createToken("BOOLEAN", value, value.length);
    }

    return this.createToken("WORD", value, value.length);
  }

  private isRarityValue(word: string): boolean {
    return Object.values(RarityValue).includes(word as RarityValue);
  }

  private isColorValue(word: string): boolean {
    return Object.values(ColorValue).includes(word as ColorValue);
  }

  private isShapeValue(word: string): boolean {
    return Object.values(ShapeValue).includes(word as ShapeValue);
  }

  private readQuotedString(): Token {
    const start = this.position;
    const startLine = this.line;
    const startColumn = this.column;

    // Skip opening quote
    this.position++;
    this.column++;

    let value = "";
    while (
      this.position < this.source.length &&
      this.source[this.position] !== '"'
    ) {
      value += this.source[this.position];
      this.position++;
      this.column++;
    }

    // Skip closing quote
    if (this.position < this.source.length) {
      this.position++;
      this.column++;
    }

    return {
      type: "QUOTED_STRING",
      value,
      start,
      end: this.position,
      line: startLine,
      columnStart: startColumn,
      columnEnd: this.column,
    };
  }

  private readNumber(): Token {
    let value = "";
    const start = this.position;
    const startLine = this.line;
    const startColumn = this.column;

    while (
      this.position < this.source.length &&
      /[0-9]/.test(this.source[this.position])
    ) {
      value += this.source[this.position];
      this.position++;
      this.column++;
    }

    return {
      type: "NUMBER",
      value: parseInt(value),
      start,
      end: this.position,
      line: startLine,
      columnStart: startColumn,
      columnEnd: this.column,
    };
  }

  private readOperator(): Token {
    const start = this.position;
    const startLine = this.line;
    const startColumn = this.column;

    let value = this.source[this.position];
    this.position++;
    this.column++;

    // Check for double character operators (==, >=, <=)
    if (
      this.position < this.source.length &&
      this.source[this.position] === "="
    ) {
      value += "=";
      this.position++;
      this.column++;
    }

    return {
      type: "OPERATOR",
      value,
      start,
      end: this.position,
      line: startLine,
      columnStart: startColumn,
      columnEnd: this.column,
    };
  }

  private isBorderLine(line: string): boolean {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return false;
    }

    // Remove leading #s and trim again
    const withoutHashes = trimmed.replace(/^#+/, "").trim();
    if (withoutHashes.length === 0) {
      return false;
    }

    // Get the first non-space character
    const firstChar = withoutHashes[0];
    // Check if all non-space characters are the same
    return withoutHashes.split("").every((c) => c === firstChar || c === " ");
  }

  private countInitialHashes(line: string): number {
    let count = 0;
    while (count < line.length && line[count] === "#") {
      count++;
    }
    // Only count if followed by space and not all #'s
    return line[count] === " " ? count : 0;
  }

  private peekLine(): string {
    const endOfLine = this.source.indexOf("\n", this.position);
    if (endOfLine === -1) {
      return this.source.slice(this.position);
    }
    return this.source.slice(this.position, endOfLine);
  }

  private isCondition(word: string): boolean {
    return Object.values(ConditionType).includes(word as ConditionType);
  }

  private isAction(word: string): boolean {
    return Object.values(ActionType).includes(word as ActionType);
  }

  private isLineStart(position: number): boolean {
    // Look backwards from the current position
    for (let i = position - 1; i >= 0; i--) {
      // If we hit a newline, everything before the comment was whitespace
      if (this.source[i] === "\n") {
        return true;
      }
      // If we hit any non-whitespace character, this is not a line start
      if (!/[ \t]/.test(this.source[i])) {
        return false;
      }
    }
    // If we get here, we're at the start of the file
    return true;
  }

  private readWhile(predicate: (char: string) => boolean): string {
    let value = "";
    while (
      this.position < this.source.length &&
      predicate(this.source[this.position])
    ) {
      value += this.source[this.position];
      this.position++;
      this.column++;
    }
    return value;
  }

  private advanceToPosition(newPosition: number): void {
    // Count columns we're advancing
    for (let i = this.position; i < newPosition; i++) {
      if (this.source[i] === "\n") {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
    }
    this.position = newPosition;
  }
}