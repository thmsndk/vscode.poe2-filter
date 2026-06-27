import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Diagnostic,
  TextEdit,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

/**
 * Provides quick fixes for the diagnostics emitted by the language server,
 * mirroring the old client-side FilterCodeActionProvider:
 *  - "Did you mean: ..." suggestions become replace edits.
 *  - The confusing boolean "!= True/False" form is simplified to its inverse.
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
    }

    return actions;
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
