import { Token } from "../ast/tokens";
import {
  RootNode,
  Node,
  ConditionNode,
  ActionNode,
  BlockNode,
} from "../ast/nodes";
import { ConditionSyntaxMap } from "../ast/conditions";
import { ActionSyntaxMap } from "../ast/actions";

export interface SemanticDiagnostic {
  message: string;
  severity: "error" | "warning";
  line: number;
  columnStart: number;
  columnEnd: number;
}

export class SemanticValidator {
  public diagnostics: SemanticDiagnostic[] = [];

  constructor() {}

  public validate(ast: RootNode): void {
    this.visitNode(ast);
  }

  private validateNumberValue(
    value: number,
    range: { min: number; max?: number },
    context: string,
    node: Node,
    valueIndex: number
  ): void {
    const { min, max } = range;
    if (value < min || (max !== undefined && value > max)) {
      let valueStart = node.start;
      const values = (node as ActionNode).values;

      for (let i = 0; i < valueIndex; i++) {
        valueStart += String(values[i]).length + 1;
      }

      const valueLength = String(value).length;

      this.diagnostics.push({
        message: `Value ${value} out of range [${min},${
          max ?? "∞"
        }] for ${context}`,
        severity: "error",
        line: node.line,
        columnStart: valueStart,
        columnEnd: valueStart + valueLength,
      });
    }
  }

  private visitNode(node: Node): void {
    switch (node.type) {
      case "Show":
      case "Hide":
      case "Minimal":
        // Visit all nodes in the block's body
        const blockNode = node as BlockNode;
        for (const child of blockNode.body) {
          this.visitNode(child);
        }
        break;
      case "Condition":
        this.validateCondition(node as ConditionNode);
        break;
      case "Action":
        this.validateAction(node as ActionNode);
        break;
      case "Root":
        // Visit all children of root node
        if ("children" in node) {
          for (const child of node.children) {
            this.visitNode(child);
          }
        }
        break;
    }
  }

  private validateCondition(node: ConditionNode): void {
    const syntax = ConditionSyntaxMap[node.condition];
    if (!syntax) {
      return;
    }

    // Validate number values against ranges
    if (syntax.valueType === "number" && syntax.valueSyntax.range) {
      for (let index = 0; index < node.values.length; index++) {
        const value = node.values[index];
        if (typeof value === "number") {
          this.validateNumberValue(
            value,
            syntax.valueSyntax.range,
            `condition ${node.condition}`,
            node,
            index
          );
        }
      }
    }
  }

  private validateAction(node: ActionNode): void {
    const syntax = ActionSyntaxMap[node.action];
    if (!syntax) {
      return;
    }

    for (let index = 0; index < node.values.length; index++) {
      const value = node.values[index];
      const parameter = syntax.parameters[index];
      if (!parameter) {
        continue;
      }

      switch (parameter.type) {
        case "number":
          if (parameter.range && typeof value === "number") {
            this.validateNumberValue(
              value,
              parameter.range,
              `parameter ${parameter.name}`,
              node,
              index
            );
          }
          break;
      }
    }
  }
}
