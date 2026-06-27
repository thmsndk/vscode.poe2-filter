import {
  SemanticTokens,
  SemanticTokensBuilder,
  SemanticTokensLegend,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Lexer } from "../ast/lexer";
import { Node, RootNode, ConditionNode } from "../ast/nodes";

/**
 * Custom semantic token type used to recolor commented-out filter code (e.g.
 * `# Show`, `#    BaseType "Mirror"`) distinctly from prose comments. It is a
 * dedicated type so the shipped color rule only affects our tokens and does not
 * leak into other languages.
 */
const COMMENTED_CODE_TOKEN_TYPE = "commentedCode";

/** Maps each Rarity value to its own token type so it can wear its in-game color. */
const RARITY_TOKEN_TYPE: Record<string, string> = {
  Normal: "rarityNormal",
  Magic: "rarityMagic",
  Rare: "rarityRare",
  Unique: "rarityUnique",
};

const TOKEN_TYPES = [
  COMMENTED_CODE_TOKEN_TYPE,
  "rarityNormal",
  "rarityMagic",
  "rarityRare",
  "rarityUnique",
];

export const semanticTokensLegend: SemanticTokensLegend = {
  tokenTypes: TOKEN_TYPES,
  tokenModifiers: [],
};

const TOKEN_TYPE_INDEX = new Map(
  TOKEN_TYPES.map((type, index) => [type, index])
);

interface RawToken {
  line: number;
  char: number;
  length: number;
  typeIndex: number;
}

/**
 * Emits semantic tokens for two things:
 *  - commented-out code, so it can be themed differently from prose comments;
 *  - Rarity values (Normal/Magic/Rare/Unique), recolored to their in-game
 *    rarity colors.
 *
 * Commented-out code is detected straight from the lexer (a line whose first
 * token is a COMMENTED_BLOCK/CONDITION/ACTION). Rarity values come from the AST
 * so only genuine `Rarity` conditions are colored. Tokens from both sources are
 * collected, sorted, then pushed in document order (the builder requires it).
 */
export class SemanticTokensProvider {
  public provideSemanticTokens(
    document: TextDocument,
    ast?: RootNode
  ): SemanticTokens {
    const tokens: RawToken[] = [];
    this.collectCommentedTokens(document, tokens);
    if (ast) {
      this.collectRarityTokens(ast, tokens);
    }

    tokens.sort((a, b) => a.line - b.line || a.char - b.char);

    const builder = new SemanticTokensBuilder();
    for (const token of tokens) {
      builder.push(token.line, token.char, token.length, token.typeIndex, 0);
    }
    return builder.build();
  }

  private collectCommentedTokens(
    document: TextDocument,
    tokens: RawToken[]
  ): void {
    const lexer = new Lexer(document.getText());
    const typeIndex = TOKEN_TYPE_INDEX.get(COMMENTED_CODE_TOKEN_TYPE) ?? 0;

    let inCommentedStatement = false;
    let token = lexer.nextToken();

    while (token.type !== "EOF") {
      switch (token.type) {
        case "COMMENTED_BLOCK":
        case "COMMENTED_CONDITION":
        case "COMMENTED_ACTION":
          inCommentedStatement = true;
          this.add(tokens, token, typeIndex);
          break;
        case "NEWLINE":
          inCommentedStatement = false;
          break;
        case "INLINE_COMMENT":
          // The trailing comment on a disabled line stays a normal comment.
          break;
        default:
          if (inCommentedStatement) {
            this.add(tokens, token, typeIndex);
          }
      }

      token = lexer.nextToken();
    }
  }

  private collectRarityTokens(ast: RootNode, tokens: RawToken[]): void {
    this.walk(ast, (node) => {
      if (
        node.type !== "Condition" ||
        node.commented === true ||
        (node as ConditionNode).condition !== "Rarity"
      ) {
        return;
      }

      const conditionNode = node as ConditionNode;
      for (const value of conditionNode.values) {
        const typeName = RARITY_TOKEN_TYPE[String(value.value)];
        const typeIndex =
          typeName !== undefined ? TOKEN_TYPE_INDEX.get(typeName) : undefined;
        if (typeIndex === undefined) {
          continue;
        }

        const length = value.columnEnd - value.columnStart;
        if (length <= 0) {
          continue;
        }
        tokens.push({
          line: conditionNode.line - 1,
          char: value.columnStart - 1,
          length,
          typeIndex,
        });
      }
    });
  }

  private walk(node: Node, visit: (node: Node) => void): void {
    visit(node);
    if ("children" in node) {
      for (const child of node.children) {
        this.walk(child, visit);
      }
    }
    if ("body" in node) {
      for (const child of node.body) {
        this.walk(child, visit);
      }
    }
  }

  private add(
    tokens: RawToken[],
    token: { line: number; columnStart: number; columnEnd: number },
    typeIndex: number
  ): void {
    const length = token.columnEnd - token.columnStart;
    if (length <= 0) {
      return;
    }
    // Lexer positions are 1-based; LSP semantic tokens are 0-based.
    tokens.push({
      line: token.line - 1,
      char: token.columnStart - 1,
      length,
      typeIndex,
    });
  }
}
