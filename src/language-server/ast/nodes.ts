import { ColorValue, RarityValue, ShapeValue, Token } from "./tokens";
import { ConditionType } from "./conditions";
import { ActionType } from "./actions";

export type Node =
  | RootNode
  | BlockNode
  | ConditionNode
  | ActionNode
  | CommentNode
  | HeaderNode
  | ErrorNode;

export interface BaseNode {
  type: string;
  start: number;
  end: number;
  line: number;
  columnStart: number;
  columnEnd: number;
  inlineComment?: string;
  commented?: boolean;
}

// Root node represents the entire file
export interface RootNode extends BaseNode {
  type: "Root";
  children: Node[]; // All top-level nodes
}

// A section header with optional border
export interface HeaderNode extends BaseNode {
  type: "Header";
  level: number;
  text: string;
  id?: number;
  style: {
    border?: string;
    idStyle?: "single" | "double";
    isMarkdown: boolean;
  };
}

export enum BlockType {
  Show = "Show",
  Hide = "Hide",
  Minimal = "Minimal",
}

// A block statement (Show/Hide/Continue)
export interface BlockNode extends BaseNode {
  type: BlockType;
  body: (ConditionNode | ActionNode | CommentNode)[];
}

// A condition with its operator and values
export interface ConditionNode extends BaseNode {
  type: "Condition";
  condition: ConditionType;
  operator?: string;
  values: Array<
    string | number | boolean | RarityValue | ColorValue | ShapeValue
  >;
  negated?: boolean;
}

// An action with its values
export interface ActionNode extends BaseNode {
  type: "Action";
  action: ActionType;
  values: Array<string | number | boolean | ColorValue | ShapeValue>;
}

// A comment (either standalone or inline)
export interface CommentNode extends BaseNode {
  type: "Comment" | "InlineComment";
  value: string;
}

export interface ErrorNode extends BaseNode {
  type: "Error";
  token: Token;
}
