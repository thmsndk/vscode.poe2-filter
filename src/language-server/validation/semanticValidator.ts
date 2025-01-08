import { Token } from "../ast/tokens";
import {
  RootNode,
  Node,
  ConditionNode,
  ActionNode,
  BlockNode,
  ErrorNode,
  BlockType,
  NodeValue,
} from "../ast/nodes";
import { ConditionSyntaxMap, ConditionType } from "../ast/conditions";
import { ActionSyntaxMap, ActionType } from "../ast/actions";
import { ColorValue, ShapeValue } from "../ast/tokens";
import { SoundNameValue } from "../ast/tokens";
import path from "path";
import fs from "fs";
import {
  findSimilarValues,
  levenshteinDistance,
} from "../../utils/stringUtils";
import { GameDataService } from "../../services/gameDataService";

export interface SemanticDiagnostic {
  message: string;
  severity: "error" | "warning";
  line: number;
  columnStart: number;
  columnEnd: number;
}

export class SemanticValidator {
  public diagnostics: SemanticDiagnostic[] = [];

  constructor(
    private gameData: GameDataService,
    private documentUri?: string
  ) {}

  public validate(ast: RootNode): void {
    this.visitNode(ast, undefined);
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

  private visitNode(node: Node, parent: Node | undefined): void {
    switch (node.type) {
      case "Show":
      case "Hide":
      case "Minimal":
        // Visit all nodes in the block's body
        const blockNode = node as BlockNode;
        for (const child of blockNode.body) {
          this.visitNode(child, node);
        }
        break;
      case "Error":
        this.validateErrorNode(node as ErrorNode, parent);
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
            this.visitNode(child, node);
          }
        }
        break;
    }
  }

  private isAtBlockPosition(node: Node, parent: Node | undefined): boolean {
    return node.columnStart === 1 && parent?.type === "Root";
  }

  private validateErrorNode(node: ErrorNode, parent: Node | undefined): void {
    if (node.token.type === "WORD") {
      if (this.isAtBlockPosition(node, parent)) {
        // Block keyword validation (existing code)
        const suggestions = findSimilarValues(
          node.token.value as string,
          Object.values(BlockType)
        );
        const suggestionText =
          suggestions.length > 0
            ? `. Did you mean: ${suggestions.join(", ")}?`
            : "";

        this.diagnostics.push({
          message: `Invalid block keyword "${node.token.value}"${suggestionText}`,
          severity: "error",
          line: node.line,
          columnStart: node.columnStart,
          columnEnd: node.columnEnd,
        });
      } else {
        // Could be either a condition or action
        const word = node.token.value as string;
        const conditionSuggestions = findSimilarValues(
          word,
          Object.values(ConditionType)
        );
        const actionSuggestions = findSimilarValues(
          word,
          Object.values(ActionType)
        );

        let message: string;
        if (conditionSuggestions.length > 0 || actionSuggestions.length > 0) {
          if (
            conditionSuggestions.length > 0 &&
            actionSuggestions.length === 0
          ) {
            message = `Unknown condition "${word}". Did you mean: ${conditionSuggestions.join(
              ", "
            )}?`;
          } else if (
            actionSuggestions.length > 0 &&
            conditionSuggestions.length === 0
          ) {
            message = `Unknown action "${word}". Did you mean: ${actionSuggestions.join(
              ", "
            )}?`;
          } else {
            // Combine and sort by Levenshtein distance, then take top 3
            const allSuggestions = [
              ...conditionSuggestions,
              ...actionSuggestions,
            ]
              .map((suggestion) => ({
                value: suggestion,
                distance: levenshteinDistance(word, suggestion),
              }))
              .sort((a, b) => a.distance - b.distance)
              .slice(0, 3)
              .map((s) => s.value);

            message = `Unknown keyword "${word}". Did you mean: ${allSuggestions.join(
              ", "
            )}?`;
          }
        } else {
          message = `Unknown keyword "${word}"`;
        }

        this.diagnostics.push({
          message,
          severity: "error",
          line: node.line,
          columnStart: node.columnStart,
          columnEnd: node.columnEnd,
        });
      }
    }
  }

  private validateCondition(node: ConditionNode): void {
    // Validate condition keyword exists
    const syntax = ConditionSyntaxMap[node.condition];
    if (!syntax) {
      const suggestions = findSimilarValues(
        node.condition,
        Object.values(ConditionType)
      );
      const suggestionText =
        suggestions.length > 0
          ? `. Did you mean: ${suggestions.join(", ")}?`
          : "";

      this.diagnostics.push({
        message: `Unknown condition: "${node.condition}"${suggestionText}`,
        severity: "error",
        line: node.line,
        columnStart: node.columnStart,
        columnEnd: node.columnEnd,
      });
      return;
    }

    switch (node.condition) {
      case "BaseType":
      case "Class":
        this.validateBaseTypeOrClass(node.values, node);
        break;
      default:
        // Handle number validation as before
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
  }

  private validateAction(node: ActionNode): void {
    const syntax = ActionSyntaxMap[node.action];
    if (!syntax) {
      return;
    }

    for (let index = 0; index < node.values.length; index++) {
      const value = node.values[index].value;
      const parameter = syntax.parameters[index];
      if (!parameter) {
        continue;
      }

      switch (parameter.type) {
        case "color":
          this.validateColor(value, node, index);
          break;
        case "shape":
          this.validateShape(value, node, index);
          break;
        case "sound-id":
          this.validateSound(value, parameter.range, node, index);
          break;
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
        case "filepath":
          this.validateFilePath(
            value,
            node,
            index,
            node.action === "CustomAlertSoundOptional"
          );
          break;
      }
    }
  }

  private validateColor(
    value: string | number | boolean,
    node: Node,
    valueIndex: number
  ): void {
    if (typeof value !== "string") {
      // works, but kinda does not make sense, our nodes should have children for values with correct column positions
      let valueStart = node.columnEnd + 1;
      const values = (node as ActionNode).values;

      for (let i = 0; i < valueIndex; i++) {
        valueStart += String(values[i]).length + 1;
      }

      const valueLength = String(value).length;

      this.diagnostics.push({
        message: `Invalid color value: expected a named color, got ${JSON.stringify(
          value
        )}`,
        severity: "error",
        line: node.line,
        columnStart: valueStart,
        columnEnd: valueStart + String(value).length,
      });

      return;
    }

    if (!(value in ColorValue)) {
      let valueStart = node.columnEnd + 1;
      const values = (node as ActionNode).values;

      for (let i = 0; i < valueIndex; i++) {
        valueStart += String(values[i]).length + 1;
      }

      this.diagnostics.push({
        message: `Invalid color name: "${value}". Valid colors are: ${Object.values(
          ColorValue
        ).join(", ")}`,
        severity: "error",
        line: node.line,
        columnStart: valueStart,
        columnEnd: valueStart + value.length,
      });
    }
  }

  private validateShape(
    value: string | number | boolean,
    node: Node,
    valueIndex: number
  ): void {
    // Only handle shape names
    if (typeof value !== "string") {
      let valueStart = node.columnEnd + 1;
      const values = (node as ActionNode).values;

      for (let i = 0; i < valueIndex; i++) {
        valueStart += String(values[i]).length + 1;
      }

      const valueLength = String(value).length;

      this.diagnostics.push({
        message: `Invalid shape value: expected a shape name, got ${JSON.stringify(
          value
        )}`,
        severity: "error",
        line: node.line,
        columnStart: valueStart,
        columnEnd: valueStart + valueLength,
      });
      return;
    }

    if (!(value in ShapeValue)) {
      let valueStart = node.columnEnd + 1;
      const values = (node as ActionNode).values;

      for (let i = 0; i < valueIndex; i++) {
        valueStart += String(values[i]).length + 1;
      }

      this.diagnostics.push({
        message: `Invalid shape name: "${value}". Valid shapes are: ${Object.values(
          ShapeValue
        ).join(", ")}`,
        severity: "error",
        line: node.line,
        columnStart: valueStart,
        columnEnd: valueStart + value.length,
      });
    }
  }

  private validateSound(
    value: string | number | boolean,
    range: { min: number; max?: number } | undefined,
    node: Node,
    valueIndex: number
  ): void {
    if (typeof value === "number" && range) {
      this.validateNumberValue(value, range, "sound ID", node, valueIndex);
      return;
    }

    if (typeof value !== "string") {
      let valueStart = node.start;
      const values = (node as ActionNode).values;

      for (let i = 0; i < valueIndex; i++) {
        valueStart += String(values[i]).length + 1;
      }

      const valueLength = String(value).length;

      this.diagnostics.push({
        message: `Invalid sound value: expected a sound name or number, got ${JSON.stringify(
          value
        )}`,
        severity: "error",
        line: node.line,
        columnStart: valueStart,
        columnEnd: valueStart + valueLength,
      });
      return;
    }

    if (!(value in SoundNameValue)) {
      let valueStart = node.start;
      const values = (node as ActionNode).values;

      for (let i = 0; i < valueIndex; i++) {
        valueStart += String(values[i]).length + 1;
      }

      this.diagnostics.push({
        message: `Invalid sound name: "${value}". Valid sounds are: ${Object.values(
          SoundNameValue
        ).join(", ")}`,
        severity: "error",
        line: node.line,
        columnStart: valueStart,
        columnEnd: valueStart + value.length,
      });
    }
  }

  private validateFilePath(
    value: string | number | boolean,
    node: Node,
    valueIndex: number,
    isOptional: boolean = false
  ): void {
    if (typeof value !== "string") {
      let valueStart = node.start;
      const values = (node as ActionNode).values;

      for (let i = 0; i < valueIndex; i++) {
        valueStart += String(values[i]).length + 1;
      }

      const valueLength = String(value).length;

      this.diagnostics.push({
        message: `Invalid file path: expected a string, got ${JSON.stringify(
          value
        )}`,
        severity: "error",
        line: node.line,
        columnStart: valueStart,
        columnEnd: valueStart + valueLength,
      });
      return;
    }

    // Skip validation if we don't have document context
    if (!this.documentUri) {
      return;
    }

    // Remove quotes from the file path
    const cleanPath = value.replace(/^"(.*)"$/, "$1");

    // Try different possible locations
    const possiblePaths = [
      cleanPath, // Direct path
      path.join(path.dirname(this.documentUri), cleanPath), // Relative to document
    ];

    const fileExists = possiblePaths.some((p) => fs.existsSync(p));

    if (!fileExists) {
      let valueStart = node.start;
      const values = (node as ActionNode).values;

      for (let i = 0; i < valueIndex; i++) {
        valueStart += String(values[i]).length + 1;
      }

      const severity = isOptional ? "warning" : "error";
      const message = isOptional
        ? `Sound file not found: "${cleanPath}". File is optional but should exist when used.`
        : `Sound file not found: "${cleanPath}". File must exist for CustomAlertSound.`;

      this.diagnostics.push({
        message,
        severity,
        line: node.line,
        columnStart: valueStart,
        columnEnd: valueStart + value.length,
      });
    }
  }

  private validateBaseTypeOrClass(
    values: NodeValue[],
    node: ConditionNode
  ): void {
    if (!this.gameData) {
      return;
    }

    const isExact = node.operator === "==";

    for (const nodeValue of values) {
      const value = nodeValue.value;
      if (!value) {
        continue;
      }

      if (typeof value !== "string") {
        this.diagnostics.push({
          message: `Invalid ${
            node.condition
          } value: expected a string, got ${JSON.stringify(value)}`,
          severity: "error",
          line: node.line,
          columnStart: nodeValue.columnStart,
          columnEnd: nodeValue.columnEnd,
        });
        continue;
      }

      let matches;
      switch (node.condition) {
        case "BaseType":
          matches = isExact
            ? this.gameData.findExactBaseType([value])
            : this.gameData.findMatchingBaseTypes([value]);
          break;
        case "Class":
          matches = isExact
            ? this.gameData.findExactClass([value])
            : this.gameData.findMatchingClasses([value]);
          break;
        default:
          throw new Error(`Unexpected condition: ${node.condition}`);
      }

      if (matches.length === 0) {
        const allValues =
          node.condition === "BaseType"
            ? this.gameData.baseItemTypes.map((i) => i.Name)
            : this.gameData.itemClasses.map((i) => i.Name);

        const suggestions = findSimilarValues(value, allValues);
        const suggestionText =
          suggestions.length > 0
            ? `. Did you mean: ${suggestions.join(", ")}?`
            : "";

        this.diagnostics.push({
          message: `${node.condition} "${value}" not found${suggestionText}`,
          severity: "error",
          line: node.line,
          columnStart: nodeValue.columnStart,
          columnEnd: nodeValue.columnEnd,
        });
      }
    }
  }
}
