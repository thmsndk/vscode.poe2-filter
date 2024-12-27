import { Lexer } from "./lexer";
import {
  ColorValue,
  RarityValue,
  ShapeValue,
  Token,
  TokenType,
} from "./tokens";
import {
  Node,
  RootNode,
  BlockNode,
  ConditionNode,
  ActionNode,
  CommentNode,
  HeaderNode,
  BlockType,
} from "./nodes";
import { ConditionType, ConditionSyntaxMap } from "./conditions";
import { ActionType, ActionSyntaxMap } from "./actions";

export interface ParserDiagnostic {
  message: string;
  severity: "error" | "warning";
  line: number;
  columnStart: number;
  columnEnd: number;
}

export class Parser {
  private lexer: Lexer;
  private currentToken: Token;
  private tokens: Token[] = [];
  private position: number = 0;
  public diagnostics: ParserDiagnostic[] = [];

  constructor(source: string) {
    this.lexer = new Lexer(source);
    this.currentToken = this.lexer.nextToken();
    this.tokens.push(this.currentToken);
  }

  private addError(message: string, token: Token) {
    this.diagnostics.push({
      message,
      severity: "error",
      line: token.line,
      columnStart: token.columnStart,
      columnEnd: token.columnEnd,
    });
  }

  public parse(): RootNode {
    const start = 0;
    const children: Node[] = [];

    while (this.currentToken.type !== "EOF") {
      switch (this.currentToken.type) {
        case "SHOW":
        case "HIDE":
        case "MINIMAL":
          children.push(this.parseBlock());
          break;
        case "COMMENTED_BLOCK":
          children.push(this.parseCommentedBlock());
          break;
        case "HEADER":
          children.push(this.parseHeader());
          break;
        case "COMMENT":
          children.push(this.parseComment());
          break;
        case "NEWLINE":
          // Skip newlines at root level
          this.advance();
          break;
        default:
          children.push({
            type: "Error",
            token: this.currentToken,
            start: this.currentToken.start,
            end: this.currentToken.end,
            line: this.currentToken.line,
            columnStart: this.currentToken.columnStart,
            columnEnd: this.currentToken.columnEnd,
          });
          this.addError(
            `Unexpected token at root level: ${this.currentToken.type}`,
            this.currentToken
          );
          this.advance();
      }
    }

    return {
      type: "Root",
      children,
      start,
      end: this.currentToken.start,
      line: 1,
      columnStart: 1,
      columnEnd: 1,
    };
  }

  private parseBlock(): BlockNode {
    const start = this.currentToken.start;
    const line = this.currentToken.line;
    const columnStart = this.currentToken.columnStart;
    const isCommented = this.currentToken.type === "COMMENTED_BLOCK";

    let blockType: BlockType;
    if (isCommented) {
      blockType = this.currentToken.value as BlockType;
    } else {
      switch (this.currentToken.type) {
        case "SHOW":
          blockType = BlockType.Show;
          break;
        case "HIDE":
          blockType = BlockType.Hide;
          break;
        case "MINIMAL":
          blockType = BlockType.Minimal;
          break;
        default:
          this.addError(
            `Unexpected block type: ${this.currentToken.type}`,
            this.currentToken
          );
          blockType = BlockType.Show; // Fallback for AST
      }
    }

    let inlineComment: string | undefined;

    this.advance(); // Consume block keyword or commented block

    // Check for inline comment on block declaration
    if (this.currentToken.type === "INLINE_COMMENT") {
      inlineComment = this.currentToken.value as string;
      this.advance();
    }

    const body: (ConditionNode | ActionNode | CommentNode)[] = [];

    parseBlock: while (this.currentToken.type !== "EOF") {
      switch (this.currentToken.type) {
        case "CONDITION":
        case "COMMENTED_CONDITION":
          body.push(this.parseCondition());
          break;
        case "ACTION":
        case "COMMENTED_ACTION":
          body.push(this.parseAction());
          break;
        case "COMMENT":
        case "INLINE_COMMENT":
          body.push(this.parseComment());
          break;
        case "SHOW":
        case "HIDE":
        case "MINIMAL":
        case "COMMENTED_BLOCK":
          // Break out of while loop when we hit another block
          break parseBlock;
        default:
          this.advance();
      }
    }

    return {
      type: blockType,
      body,
      inlineComment,
      commented: false,
      start,
      end: this.currentToken.start,
      line,
      columnStart,
      columnEnd: this.currentToken.columnEnd,
    };
  }

  private parseCommentedBlock(): BlockNode {
    const block = this.parseBlock();
    block.commented = true;
    return block;
  }

  private parseCondition(): ConditionNode {
    const start = this.currentToken.start;
    const line = this.currentToken.line;
    const columnStart = this.currentToken.columnStart;
    const columnEnd = this.currentToken.columnEnd;
    const isCommented = this.currentToken.type === "COMMENTED_CONDITION";

    if (!this.currentToken || !this.currentToken.value) {
      this.addError(
        "Expected condition type after condition marker",
        this.currentToken
      );
      return this.createErrorConditionNode(start, line, columnStart, columnEnd);
    }

    const condition = this.currentToken.value as ConditionType;
    const syntax = ConditionSyntaxMap[condition];
    if (!syntax) {
      this.addError(`Unknown condition: ${condition}`, this.currentToken);
    }

    this.advance(); // Consume condition type

    // Check for operator
    let operator: string | undefined;
    if (this.currentToken.type === "OPERATOR") {
      operator = this.currentToken.value as string;
      if (syntax?.operatorBehavior.allowed === false) {
        this.addError(
          `Operator not allowed for condition: ${condition}`,
          this.currentToken
        );
      } else if (
        syntax?.operatorBehavior.allowedOperators &&
        !syntax.operatorBehavior.allowedOperators.includes(operator)
      ) {
        this.addError(
          `Invalid operator ${operator} for condition: ${condition}`,
          this.currentToken
        );
      }
      this.advance();
    } else if (
      syntax?.operatorBehavior.allowed &&
      !syntax.operatorBehavior.optional
    ) {
      this.addError(
        `Operator required for condition: ${condition}`,
        this.currentToken
      );
    }

    const values: Array<
      string | number | boolean | RarityValue | ColorValue | ShapeValue
    > = [];
    let inlineComment: string | undefined;

    while (this.shouldContinueParsing()) {
      switch (this.currentToken.type) {
        case "NUMBER":
          this.validateTokenType(
            syntax?.valueType ?? "",
            "number",
            `condition ${condition}`,
            this.currentToken
          );
          const num = this.currentToken.value as number;
          values.push(num);
          break;

        case "BOOLEAN":
          this.validateTokenType(
            syntax?.valueType ?? "",
            "boolean",
            `condition ${condition}`,
            this.currentToken
          );
          values.push(this.currentToken.value as boolean);
          break;

        case "QUOTED_STRING":
        case "WORD":
          this.validateTokenType(
            syntax?.valueType ?? "",
            "string",
            `condition ${condition}`,
            this.currentToken
          );
          values.push(this.currentToken.value as string);
          break;

        case "RARITY":
        case "COLOR":
        case "SHAPE":
          this.validateTokenType(
            syntax?.valueType ?? "",
            this.currentToken.type.toLowerCase(),
            `condition ${condition}`,
            this.currentToken
          );
          values.push(
            this.currentToken.value as RarityValue | ColorValue | ShapeValue
          );
          break;

        case "INLINE_COMMENT":
          inlineComment = this.consumeInlineComment();
          continue;

        default:
          this.addError(
            `Unexpected token in condition: ${this.currentToken.type}`,
            this.currentToken
          );
      }
      this.advance();
    }

    if (values.length === 0) {
      this.addError(
        "Expected at least one value for condition",
        this.currentToken
      );
    }

    if (syntax?.valueSyntax.multiValue === false && values.length !== 1) {
      this.addError(
        `Expected exactly one value for condition: ${condition}`,
        this.currentToken
      );
    }

    return {
      type: "Condition",
      condition,
      operator,
      values,
      inlineComment,
      commented: isCommented,
      start,
      end: this.currentToken.start,
      line,
      columnStart,
      columnEnd: this.currentToken.columnEnd,
    };
  }

  private parseAction(): ActionNode {
    const start = this.currentToken.start;
    const line = this.currentToken.line;
    const columnStart = this.currentToken.columnStart;
    const columnEnd = this.currentToken.columnEnd;
    const isCommented = this.currentToken.type === "COMMENTED_ACTION";

    if (!this.currentToken || !this.currentToken.value) {
      this.addError(
        "Expected action type after action marker",
        this.currentToken
      );
      return this.createErrorActionNode(start, line, columnStart, columnEnd);
    }

    const action = this.currentToken.value as ActionType;
    const syntax = ActionSyntaxMap[action];
    if (!syntax) {
      this.addError(`Unknown action: ${action}`, this.currentToken);
    }

    this.advance(); // Consume action type

    const values: Array<string | number | boolean | ColorValue | ShapeValue> =
      [];
    let parameterIndex = 0;
    let inlineComment: string | undefined;

    while (this.shouldContinueParsing()) {
      const parameter = syntax?.parameters[parameterIndex];

      switch (this.currentToken.type) {
        case "NUMBER":
          {
            let receivedType = "number";
            if (parameter?.type === "sound-id") {
              receivedType = "sound-id";
            }

            this.validateTokenType(
              parameter?.type ?? "",
              receivedType,
              `parameter ${parameter?.name}`,
              this.currentToken
            );
            const num = this.currentToken.value as number;
            values.push(num);
          }
          break;

        case "BOOLEAN":
          this.validateTokenType(
            parameter?.type ?? "",
            "boolean",
            `parameter ${parameter?.name}`,
            this.currentToken
          );
          values.push(this.currentToken.value as boolean);
          break;

        case "QUOTED_STRING":
          this.validateTokenType(
            parameter?.type ?? "",
            "string",
            `parameter ${parameter?.name}`,
            this.currentToken
          );
          values.push(this.currentToken.value as string);
          break;

        case "WORD":
          {
            let receivedType = "string";
            if (parameter?.type === "sound-id") {
              receivedType = "sound-id";
            }

            this.validateTokenType(
              parameter?.type ?? "",
              receivedType,
              `parameter ${parameter?.name}`,
              this.currentToken
            );
            values.push(this.currentToken.value as string);
          }
          break;

        case "COLOR":
          this.validateTokenType(
            parameter?.type ?? "",
            "color",
            `parameter ${parameter?.name}`,
            this.currentToken
          );
          values.push(this.currentToken.value as ColorValue);
          break;

        case "SHAPE":
          this.validateTokenType(
            parameter?.type ?? "",
            "shape",
            `parameter ${parameter?.name}`,
            this.currentToken
          );
          values.push(this.currentToken.value as ShapeValue);
          break;

        case "INLINE_COMMENT":
          inlineComment = this.consumeInlineComment();
          continue;

        default:
          this.addError(
            `Unexpected token in action: ${this.currentToken.type}`,
            this.currentToken
          );
      }

      this.advance();
      parameterIndex++;
    }

    // Validate required parameters
    const requiredCount =
      syntax?.parameters.filter((p) => p.required).length ?? 0;
    if (values.length < requiredCount) {
      this.addError(
        `Action ${action} requires at least ${requiredCount} parameters, got ${values.length}`,
        this.currentToken
      );
    }

    // Validate maximum parameters
    if (values.length > (syntax?.parameters.length ?? 0)) {
      this.addError(
        `Too many parameters for action ${action}. Expected ${syntax?.parameters.length}, got ${values.length}`,
        this.currentToken
      );
    }

    return {
      type: "Action",
      action,
      values,
      inlineComment,
      commented: isCommented,
      start,
      end: this.currentToken.start,
      line,
      columnStart,
      columnEnd,
    };
  }

  private parseComment(): CommentNode {
    const start = this.currentToken.start;
    const line = this.currentToken.line;
    const columnStart = this.currentToken.columnStart;
    const columnEnd = this.currentToken.columnEnd;
    const type =
      this.currentToken.type === "COMMENT" ? "Comment" : "InlineComment";
    const value = this.currentToken.value as string;

    this.advance(); // Consume comment

    return {
      type,
      value,
      start,
      end: this.currentToken.start,
      line,
      columnStart,
      columnEnd,
    };
  }

  private parseHeader(): HeaderNode {
    const start = this.currentToken.start;
    const line = this.currentToken.line;
    const columnStart = this.currentToken.columnStart;
    const columnEnd = this.currentToken.columnEnd;
    const headerInfo = this.currentToken.value as any;

    this.advance(); // Consume header

    return {
      type: "Header",
      level: headerInfo.level,
      text: headerInfo.text,
      id: headerInfo.id,
      style: headerInfo.style,
      start,
      end: this.currentToken.start,
      line,
      columnStart,
      columnEnd,
    };
  }

  private advance(): void {
    this.position++;
    if (this.position >= this.tokens.length) {
      this.currentToken = this.lexer.nextToken();
      this.tokens.push(this.currentToken);
    } else {
      this.currentToken = this.tokens[this.position];
    }
  }

  private createErrorConditionNode(
    start: number,
    line: number,
    columnStart: number,
    columnEnd: number
  ): ConditionNode {
    return {
      type: "Condition",
      condition: "Unknown" as ConditionType,
      values: [],
      start,
      end: this.currentToken.start,
      line,
      columnStart,
      columnEnd,
    };
  }

  private createErrorActionNode(
    start: number,
    line: number,
    columnStart: number,
    columnEnd: number
  ): ActionNode {
    return {
      type: "Action",
      action: "Unknown" as ActionType,
      values: [],
      start,
      end: this.currentToken.start,
      line,
      columnStart,
      columnEnd,
    };
  }

  private requiresValues(action: ActionType): boolean {
    // List actions that don't require values
    const noValueActions = ["DisableDropSound", "EnableDropSound"];
    return !noValueActions.includes(action);
  }

  private validateTokenType(
    expectedType: string,
    receivedType: string,
    context: string,
    token: Token
  ): void {
    if (expectedType !== receivedType) {
      this.addError(
        `Expected ${expectedType} but got ${receivedType} for ${context}`,
        token
      );
    }
  }

  private consumeInlineComment(): string | undefined {
    if (this.currentToken.type === "INLINE_COMMENT") {
      const comment = this.currentToken.value as string;
      this.advance();
      return comment;
    }
    return undefined;
  }

  private shouldContinueParsing(): boolean {
    return (
      this.currentToken.type !== "EOF" &&
      this.currentToken.type !== "NEWLINE" &&
      // TODO: What actually happens if we have a Continue in the middle of a block? i'd assume we have to keep parsing until we hit a new block or header
      !["CONDITION", "ACTION", "SHOW", "HIDE", "CONTINUE"].includes(
        this.currentToken.type
      )
    );
  }
}
