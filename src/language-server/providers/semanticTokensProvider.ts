import {
  SemanticTokens,
  SemanticTokensBuilder,
  SemanticTokensLegend,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Lexer } from "../ast/lexer";

/**
 * Custom semantic token type used to recolor commented-out filter code (e.g.
 * `# Show`, `#    BaseType "Mirror"`) distinctly from prose comments. It is a
 * dedicated type so the shipped color rule only affects our tokens and does not
 * leak into other languages.
 */
const COMMENTED_CODE_TOKEN_TYPE = "commentedCode";

export const semanticTokensLegend: SemanticTokensLegend = {
  tokenTypes: [COMMENTED_CODE_TOKEN_TYPE],
  tokenModifiers: [],
};

/**
 * Emits semantic tokens for commented-out code so it can be themed differently
 * from regular comments. Prose comments and section headers are left untouched
 * (TextMate keeps coloring them as comments).
 *
 * Tokens are produced straight from the lexer: a line whose first token is a
 * COMMENTED_BLOCK/CONDITION/ACTION is treated as commented-out code, and every
 * token on that line - except a trailing inline comment - is tagged.
 */
export class SemanticTokensProvider {
  public provideSemanticTokens(document: TextDocument): SemanticTokens {
    const builder = new SemanticTokensBuilder();
    const lexer = new Lexer(document.getText());

    let inCommentedStatement = false;
    let token = lexer.nextToken();

    while (token.type !== "EOF") {
      switch (token.type) {
        case "COMMENTED_BLOCK":
        case "COMMENTED_CONDITION":
        case "COMMENTED_ACTION":
          inCommentedStatement = true;
          this.push(builder, token);
          break;
        case "NEWLINE":
          inCommentedStatement = false;
          break;
        case "INLINE_COMMENT":
          // The trailing comment on a disabled line stays a normal comment.
          break;
        default:
          if (inCommentedStatement) {
            this.push(builder, token);
          }
      }

      token = lexer.nextToken();
    }

    return builder.build();
  }

  private push(
    builder: SemanticTokensBuilder,
    token: { line: number; columnStart: number; columnEnd: number }
  ): void {
    const length = token.columnEnd - token.columnStart;
    if (length <= 0) {
      return;
    }
    // Lexer positions are 1-based; LSP semantic tokens are 0-based.
    builder.push(token.line - 1, token.columnStart - 1, length, 0, 0);
  }
}
