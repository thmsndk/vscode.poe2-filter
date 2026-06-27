import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Diagnostic,
  DiagnosticTag,
  Position,
  Range,
  TextEdit,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Lexer } from "../ast/lexer";
import { ClassBaseTypeFixData } from "../validation/semanticValidator";

const SEMANTIC_SOURCE = "poe-filter-ls-semanticValidator";

/**
 * Provides quick fixes for the diagnostics emitted by the language server,
 * mirroring the old client-side FilterCodeActionProvider:
 *  - "Did you mean: ..." suggestions become replace edits.
 *  - The confusing boolean "!= True/False" form is simplified to its inverse.
 *  - "Remove dead code" deletes faded (unnecessary) dead statements.
 *  - "Uncomment" re-enables commented-out code (single line or whole block).
 */
export class CodeActionProvider {
  public provideCodeActions(
    document: TextDocument,
    params: CodeActionParams
  ): CodeAction[] {
    const actions: CodeAction[] = [];

    for (const diagnostic of params.context.diagnostics) {
      if (
        typeof diagnostic.source !== "string" ||
        !diagnostic.source.startsWith("poe-filter-ls")
      ) {
        continue;
      }

      // "Did you mean: X, Y?" style suggestions.
      const suggestions = this.extractSuggestions(diagnostic.message);
      const rangeText = document.getText(diagnostic.range);
      const wasQuoted = rangeText.startsWith('"') && rangeText.endsWith('"');

      for (const suggestion of suggestions) {
        const replacement = wasQuoted ? `"${suggestion}"` : suggestion;
        actions.push(
          this.makeReplaceAction(
            `Change to '${replacement}'`,
            document,
            diagnostic,
            replacement,
            false
          )
        );
      }

      // Confusing boolean form: "Corrupted != True" -> "Corrupted False".
      if (/is confusing\. Use ".*" instead\./.test(diagnostic.message)) {
        const inverted = this.invertBoolean(rangeText);
        if (inverted) {
          actions.push(
            this.makeReplaceAction(
              `Change to '${inverted}'`,
              document,
              diagnostic,
              inverted,
              true
            )
          );
        }
      }

      // "Remove dead code" for faded, statement-level unnecessary diagnostics.
      if (this.isRemovableDeadCode(document, diagnostic)) {
        actions.push(this.makeRemoveLineAction(document, diagnostic));
      }

      // Class/BaseType mismatch: offer to add the actual class or drop the value.
      const fixData = diagnostic.data as ClassBaseTypeFixData | undefined;
      if (fixData?.fix === "class-basetype-mismatch") {
        actions.push(...this.makeClassBaseTypeFixes(document, diagnostic, fixData));
      }
    }

    // "Uncomment" for commented-out code at the cursor/selection.
    actions.push(...this.makeUncommentActions(document, params));

    return actions;
  }

  /**
   * A diagnostic is removable dead code when it is one of our faded
   * (Unnecessary) semantic diagnostics that covers a whole statement - i.e. it
   * starts at the first non-whitespace character of its line. This excludes
   * value-level fades (e.g. one bad BaseType in a list) and multi-line conflict
   * diagnostics.
   */
  private isRemovableDeadCode(
    document: TextDocument,
    diagnostic: Diagnostic
  ): boolean {
    if (diagnostic.source !== SEMANTIC_SOURCE) {
      return false;
    }
    if (!diagnostic.tags?.includes(DiagnosticTag.Unnecessary)) {
      return false;
    }

    const line = diagnostic.range.start.line;
    const lineText = this.getLineText(document, line);
    const firstNonWhitespace = lineText.search(/\S/);
    return diagnostic.range.start.character === firstNonWhitespace;
  }

  private makeRemoveLineAction(
    document: TextDocument,
    diagnostic: Diagnostic
  ): CodeAction {
    const line = diagnostic.range.start.line;
    const start = Position.create(line, 0);
    const end = document.positionAt(
      document.offsetAt(Position.create(line + 1, 0))
    );

    return {
      title: "Remove dead code",
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      edit: {
        changes: {
          [document.uri]: [TextEdit.del(Range.create(start, end))],
        },
      },
    };
  }

  /**
   * Builds the two fixes for an impossible Class/BaseType combination:
   *  - add the base's actual class to the block's Class condition, or
   *  - remove the offending BaseType value.
   */
  private makeClassBaseTypeFixes(
    document: TextDocument,
    diagnostic: Diagnostic,
    data: ClassBaseTypeFixData
  ): CodeAction[] {
    const actions: CodeAction[] = [];

    if (data.addClasses.length > 0) {
      const label = data.addClasses.map((name) => `"${name}"`).join(", ");
      const insertText = data.addClasses
        .map((name) => ` "${name}"`)
        .join("");
      actions.push({
        title: `Add ${label} to Class`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        isPreferred: true,
        edit: {
          changes: {
            [document.uri]: [
              TextEdit.insert(
                Position.create(
                  data.classInsert.line,
                  data.classInsert.character
                ),
                insertText
              ),
            ],
          },
        },
      });
    }

    actions.push({
      title: `Remove BaseType "${data.baseType}"`,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      edit: {
        changes: {
          [document.uri]: [
            TextEdit.del(this.expandToAdjacentSpace(document, diagnostic.range)),
          ],
        },
      },
    });

    return actions;
  }

  /**
   * Grows a value range to swallow one adjacent space, so removing an item from
   * a space-separated list does not leave a double space behind. Prefers the
   * leading space, falling back to a trailing one.
   */
  private expandToAdjacentSpace(document: TextDocument, range: Range): Range {
    const lineText = this.getLineText(document, range.start.line);
    const startChar = range.start.character;
    const endChar = range.end.character;

    if (startChar > 0 && lineText[startChar - 1] === " ") {
      return Range.create(range.start.line, startChar - 1, range.end.line, endChar);
    }
    if (lineText[endChar] === " ") {
      return Range.create(range.start.line, startChar, range.end.line, endChar + 1);
    }
    return range;
  }

  /**
   * Offers "Uncomment" actions when the selection starts on a commented-out
   * code line. Re-lexes the document so only genuine commented-out code (not
   * prose comments or headers) is offered, and uncomments by removing the
   * single leading `#`, preserving indentation.
   */
  private makeUncommentActions(
    document: TextDocument,
    params: CodeActionParams
  ): CodeAction[] {
    const commentedLines = this.collectCommentedCodeLines(document);
    const startLine = params.range.start.line;
    if (!commentedLines.has(startLine)) {
      return [];
    }

    // Extend up/down over the contiguous run of commented-out code lines.
    let top = startLine;
    while (commentedLines.has(top - 1)) {
      top--;
    }
    let bottom = startLine;
    while (commentedLines.has(bottom + 1)) {
      bottom++;
    }

    const actions: CodeAction[] = [
      this.makeUncommentAction(
        "Uncomment this line",
        document,
        [startLine],
        commentedLines
      ),
    ];

    if (bottom > top) {
      const blockLines: number[] = [];
      for (let line = top; line <= bottom; line++) {
        blockLines.push(line);
      }
      actions.push(
        this.makeUncommentAction(
          `Uncomment block (${blockLines.length} lines)`,
          document,
          blockLines,
          commentedLines
        )
      );
    }

    return actions;
  }

  private makeUncommentAction(
    title: string,
    document: TextDocument,
    lines: number[],
    hashColumnByLine: Map<number, number>
  ): CodeAction {
    const edits = lines.map((line) => {
      const hashColumn = hashColumnByLine.get(line) ?? 0;
      // Remove the `#` plus a single following space, so "# Show" becomes
      // "Show" while a deeper "#    SetFontSize" keeps its indentation.
      const lineText = this.getLineText(document, line);
      const removeLength = lineText[hashColumn + 1] === " " ? 2 : 1;
      return TextEdit.del(
        Range.create(line, hashColumn, line, hashColumn + removeLength)
      );
    });

    return {
      title,
      kind: CodeActionKind.QuickFix,
      edit: {
        changes: {
          [document.uri]: edits,
        },
      },
    };
  }

  /**
   * Maps each commented-out code line (0-based) to the 0-based column of its
   * leading `#`, by re-lexing and looking for commented block/condition/action
   * tokens.
   */
  private collectCommentedCodeLines(
    document: TextDocument
  ): Map<number, number> {
    const lexer = new Lexer(document.getText());
    const lines = new Map<number, number>();

    let token = lexer.nextToken();
    while (token.type !== "EOF") {
      if (
        token.type === "COMMENTED_BLOCK" ||
        token.type === "COMMENTED_CONDITION" ||
        token.type === "COMMENTED_ACTION"
      ) {
        lines.set(token.line - 1, token.columnStart - 1);
      }
      token = lexer.nextToken();
    }

    return lines;
  }

  private getLineText(document: TextDocument, line: number): string {
    const start = document.offsetAt(Position.create(line, 0));
    const end = document.offsetAt(Position.create(line + 1, 0));
    return document.getText().slice(start, end).replace(/\r?\n$/, "");
  }

  private makeReplaceAction(
    title: string,
    document: TextDocument,
    diagnostic: Diagnostic,
    replacement: string,
    isPreferred: boolean
  ): CodeAction {
    return {
      title,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      isPreferred,
      edit: {
        changes: {
          [document.uri]: [TextEdit.replace(diagnostic.range, replacement)],
        },
      },
    };
  }

  private extractSuggestions(message: string): string[] {
    const match = message.match(
      /Did you mean: (.*?)\?|Must be one of: (.*?)(?:\?|$)/
    );
    if (!match) {
      return [];
    }

    // The unmatched alternative's group is `undefined`, and a matched-but-empty
    // group is `""`; both should yield no suggestions rather than throwing.
    const captured = match[1] ?? match[2];
    if (!captured) {
      return [];
    }

    return captured
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.includes("^") && !s.includes("$"));
  }

  /**
   * Returns the inverse boolean keyword found in the given (operator + value)
   * text, i.e. the simpler value that should replace a "!= True/False" form.
   */
  private invertBoolean(text: string): string | undefined {
    if (/\bTrue\b/.test(text)) {
      return "False";
    }
    if (/\bFalse\b/.test(text)) {
      return "True";
    }
    return undefined;
  }
}
