import {
  SignatureHelp,
  SignatureInformation,
  ParameterInformation,
  MarkupKind,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ActionSyntax, ActionSyntaxMap, ActionType } from "../ast/actions";

type ActionParameter = ActionSyntax["parameters"][number];

/**
 * Provides signature help (parameter hints) for filter actions while typing,
 * e.g. `SetTextColor red green blue [alpha]` with the current parameter
 * highlighted. It reads the raw line text rather than the AST so it keeps
 * working while the line is incomplete/invalid.
 */
export class SignatureHelpProvider {
  public provideSignatureHelp(
    document: TextDocument,
    params: TextDocumentPositionParams
  ): SignatureHelp | null {
    const text = document.getText();
    const offset = document.offsetAt(params.position);
    const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
    const linePrefix = text.slice(lineStart, offset);

    // Action keyword at line start, allowing indentation and an optional `#`
    // marker for disabled lines.
    const match = linePrefix.match(/^\s*#?\s*([A-Za-z]+)\b/);
    if (!match) {
      return null;
    }

    const keyword = match[1];
    if (!(keyword in ActionType)) {
      return null;
    }

    const syntax = ActionSyntaxMap[keyword as ActionType];
    if (!syntax || syntax.parameters.length === 0) {
      return null;
    }

    const afterKeyword = linePrefix.slice(match[0].length);

    return {
      signatures: [this.buildSignature(syntax)],
      activeSignature: 0,
      activeParameter: this.getActiveParameter(
        afterKeyword,
        syntax.parameters.length
      ),
    };
  }

  private buildSignature(syntax: ActionSyntax): SignatureInformation {
    const parameters: ParameterInformation[] = syntax.parameters.map(
      (parameter) => ({
        label: this.parameterLabel(parameter),
        documentation: {
          kind: MarkupKind.Markdown,
          value: `${parameter.description}${this.constraintText(parameter)}`,
        },
      })
    );

    const label = `${syntax.type} ${syntax.parameters
      .map((parameter) => this.parameterLabel(parameter))
      .join(" ")}`;

    return {
      label,
      documentation: {
        kind: MarkupKind.Markdown,
        value: syntax.description,
      },
      parameters,
    };
  }

  private parameterLabel(parameter: ActionParameter): string {
    return parameter.required ? parameter.name : `[${parameter.name}]`;
  }

  private constraintText(parameter: ActionParameter): string {
    if (parameter.range) {
      return ` (${parameter.range.min}-${parameter.range.max})`;
    }
    if (parameter.allowedValues && parameter.allowedValues.length > 0) {
      return ` (${parameter.allowedValues.join(" | ")})`;
    }
    return "";
  }

  /**
   * Determines which parameter the cursor is on, based on how many whitespace
   * separated tokens have been typed after the action keyword. A trailing space
   * means a new (empty) token has begun.
   */
  private getActiveParameter(afterKeyword: string, paramCount: number): number {
    if (afterKeyword.trim().length === 0) {
      return 0;
    }

    const tokens = afterKeyword.trim().split(/\s+/);
    const endsWithSpace = /\s$/.test(afterKeyword);
    const index = endsWithSpace ? tokens.length : tokens.length - 1;

    return Math.min(index, Math.max(paramCount - 1, 0));
  }
}
