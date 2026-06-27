import { Token } from "../ast/tokens";
import {
  RootNode,
  Node,
  ConditionNode,
  ActionNode,
  BlockNode,
  ErrorNode,
  ImportNode,
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

  /**
   * Returns the source column span of a value at `valueIndex` on a Condition or
   * Action node. Each parsed value carries its own column positions, so prefer
   * those over fragile offset arithmetic; fall back to the node's own span.
   */
  private valuePosition(
    node: Node,
    valueIndex: number
  ): { columnStart: number; columnEnd: number } {
    const nodeValue = (node as ActionNode | ConditionNode).values?.[valueIndex];
    return {
      columnStart: nodeValue?.columnStart ?? node.columnStart,
      columnEnd: nodeValue?.columnEnd ?? node.columnEnd,
    };
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
      const { columnStart, columnEnd } = this.valuePosition(node, valueIndex);

      this.diagnostics.push({
        message: `Value ${value} out of range [${min},${
          max ?? "∞"
        }] for ${context}`,
        severity: "error",
        line: node.line,
        columnStart,
        columnEnd,
      });
    }
  }

  private visitNode(node: Node, parent: Node | undefined): void {
    switch (node.type) {
      case "Show":
      case "Hide":
      case "Minimal": {
        // Visit all nodes in the block's body. Once a Continue is seen, the
        // block has handed control to later blocks, so any further conditions
        // or actions in this block can never apply.
        const blockNode = node as BlockNode;
        let afterContinue = false;
        for (const child of blockNode.body) {
          const isCommented =
            (child.type === "Condition" || child.type === "Action") &&
            (child as ConditionNode | ActionNode).commented === true;

          if (
            afterContinue &&
            !isCommented &&
            (child.type === "Condition" || child.type === "Action")
          ) {
            this.diagnostics.push({
              message: `${child.type} not allowed after Continue statement`,
              severity: "error",
              line: child.line,
              columnStart: child.columnStart,
              columnEnd: child.columnEnd,
            });
            continue;
          }

          if (
            !isCommented &&
            child.type === "Action" &&
            (child as ActionNode).action === "Continue"
          ) {
            afterContinue = true;
          }

          this.visitNode(child, node);
        }
        break;
      }
      case "Error":
        this.validateErrorNode(node as ErrorNode, parent);
        break;
      case "Condition":
        this.validateCondition(node as ConditionNode);
        break;
      case "Action":
        this.validateAction(node as ActionNode);
        break;
      case "Import":
        this.validateImport(node as ImportNode);
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

    if (syntax.valueType === "boolean") {
      this.validateBooleanNotEqual(node);
    }

    if (node.condition === "HasExplicitMod") {
      this.validateHasExplicitMod(node);
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

    // Actions such as PlayAlertSound/PlayEffect/MinimapIcon can be disabled
    // with a sentinel value ("None" or -1). When that sentinel is supplied the
    // action is disabled and its parameters are intentionally not validated.
    if (
      syntax.disabledValue !== undefined &&
      node.values.length >= 1 &&
      node.values[0].value === syntax.disabledValue
    ) {
      return;
    }

    // CustomAlertSound takes a file path (or "None" to disable, or a list of
    // semicolon-separated paths). Its existence check does not fit the generic
    // parameter loop, so it is handled separately.
    if (
      node.action === ActionType.CustomAlertSound ||
      node.action === ActionType.CustomAlertSoundOptional
    ) {
      this.validateCustomAlertSound(node);
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
        case "keyword":
          this.validateKeyword(value, parameter.allowedValues, node, index);
          break;
      }
    }
  }

  /**
   * Validates a `keyword` parameter (a fixed literal such as PlayEffect's
   * `Temp`): the value must be one of `allowedValues`.
   */
  private validateKeyword(
    value: string | number | boolean,
    allowedValues: string[] | undefined,
    node: ActionNode,
    valueIndex: number
  ): void {
    if (!allowedValues || allowedValues.length === 0) {
      return;
    }

    if (typeof value !== "string" || !allowedValues.includes(value)) {
      const { columnStart, columnEnd } = this.valuePosition(node, valueIndex);
      const expected = allowedValues.map((v) => `"${v}"`).join(", ");

      this.diagnostics.push({
        message: `Invalid value ${JSON.stringify(
          value
        )} for ${node.action}. Expected ${expected}`,
        severity: "error",
        line: node.line,
        columnStart,
        columnEnd,
      });
    }
  }

  private validateColor(
    value: string | number | boolean,
    node: Node,
    valueIndex: number
  ): void {
    if (typeof value !== "string") {
      const { columnStart, columnEnd } = this.valuePosition(node, valueIndex);

      this.diagnostics.push({
        message: `Invalid color value: expected a named color, got ${JSON.stringify(
          value
        )}`,
        severity: "error",
        line: node.line,
        columnStart,
        columnEnd,
      });

      return;
    }

    if (!(value in ColorValue)) {
      const { columnStart, columnEnd } = this.valuePosition(node, valueIndex);

      this.diagnostics.push({
        message: `Invalid color name: "${value}". Valid colors are: ${Object.values(
          ColorValue
        ).join(", ")}`,
        severity: "error",
        line: node.line,
        columnStart,
        columnEnd,
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
      const { columnStart, columnEnd } = this.valuePosition(node, valueIndex);

      this.diagnostics.push({
        message: `Invalid shape value: expected a shape name, got ${JSON.stringify(
          value
        )}`,
        severity: "error",
        line: node.line,
        columnStart,
        columnEnd,
      });
      return;
    }

    if (!(value in ShapeValue)) {
      const { columnStart, columnEnd } = this.valuePosition(node, valueIndex);

      this.diagnostics.push({
        message: `Invalid shape name: "${value}". Valid shapes are: ${Object.values(
          ShapeValue
        ).join(", ")}`,
        severity: "error",
        line: node.line,
        columnStart,
        columnEnd,
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
      const { columnStart, columnEnd } = this.valuePosition(node, valueIndex);

      this.diagnostics.push({
        message: `Invalid sound value: expected a sound name or number, got ${JSON.stringify(
          value
        )}`,
        severity: "error",
        line: node.line,
        columnStart,
        columnEnd,
      });
      return;
    }

    if (!(value in SoundNameValue)) {
      const { columnStart, columnEnd } = this.valuePosition(node, valueIndex);

      this.diagnostics.push({
        message: `Invalid sound name: "${value}". Valid sounds are: ${Object.values(
          SoundNameValue
        ).join(", ")}`,
        severity: "error",
        line: node.line,
        columnStart,
        columnEnd,
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
      const { columnStart, columnEnd } = this.valuePosition(node, valueIndex);

      this.diagnostics.push({
        message: `Invalid file path: expected a string, got ${JSON.stringify(
          value
        )}`,
        severity: "error",
        line: node.line,
        columnStart,
        columnEnd,
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
      const { columnStart, columnEnd } = this.valuePosition(node, valueIndex);

      const severity = isOptional ? "warning" : "error";
      const message = isOptional
        ? `Sound file not found: "${cleanPath}". File is optional but should exist when used.`
        : `Sound file not found: "${cleanPath}". File must exist for CustomAlertSound.`;

      this.diagnostics.push({
        message,
        severity,
        line: node.line,
        columnStart,
        columnEnd,
      });
    }
  }

  /**
   * Flags the confusing "BooleanCondition != True/False" form and suggests the
   * simpler inverted value (e.g. "Corrupted != True" -> "Corrupted False").
   */
  private validateBooleanNotEqual(node: ConditionNode): void {
    const operator = node.operator;
    if (operator !== "!" && operator !== "!=") {
      return;
    }

    const first = node.values[0];
    if (!first) {
      return;
    }

    const value = first.value;
    if (value !== "True" && value !== "False") {
      return;
    }

    const inverted = value === "True" ? "False" : "True";

    this.diagnostics.push({
      message: `"${node.condition} ${operator} ${value}" is confusing. Use "${node.condition} ${inverted}" instead.`,
      severity: "warning",
      line: node.line,
      columnStart: node.operatorColumnStart ?? node.columnStart,
      columnEnd: first.columnEnd,
    });
  }

  /**
   * HasExplicitMod has a bespoke syntax (confirmed in-game, issue #11):
   *   HasExplicitMod [<op><count> | True] <mod> [<mod> ...]
   * The operator/count is optional but, when present, must be glued to the
   * number ("HasExplicitMod >=6 ..."); the game rejects a space
   * ("HasExplicitMod >= 6 ..."). Mod names are matched partially and may be
   * unquoted, so the list itself isn't validated - we only flag the spacing.
   */
  private validateHasExplicitMod(node: ConditionNode): void {
    const operator = node.operator;
    if (
      !operator ||
      !["==", ">=", "<=", "<", ">"].includes(operator) ||
      node.operatorColumnEnd === undefined
    ) {
      return;
    }

    const first = node.values[0];
    if (
      !first ||
      typeof first.value !== "number" ||
      first.columnStart === node.operatorColumnEnd
    ) {
      return;
    }

    this.diagnostics.push({
      message: `HasExplicitMod requires no space between the operator and number. Use "${operator}${first.value}".`,
      severity: "error",
      line: node.line,
      columnStart: node.operatorColumnStart ?? node.columnStart,
      columnEnd: first.columnEnd,
    });
  }

  /**
   * Validates that the file(s) referenced by CustomAlertSound exist. "None"
   * disables the sound and is skipped; multiple files may be given as
   * semicolon-separated paths (the game plays a random one). Missing files are
   * an error for CustomAlertSound and a warning for CustomAlertSoundOptional.
   */
  private validateCustomAlertSound(node: ActionNode): void {
    if (!this.documentUri) {
      return;
    }

    const first = node.values[0];
    if (!first || typeof first.value !== "string" || first.value === "None") {
      return;
    }

    const isOptional = node.action === "CustomAlertSoundOptional";
    const documentPath = this.toFsPath(this.documentUri);

    const soundFiles = first.value.split(";").filter((f) => f.length > 0);
    for (const soundFile of soundFiles) {
      const cleanPath = soundFile.replace(/^"(.*)"$/, "$1");
      const possiblePaths = [
        cleanPath,
        path.join(path.dirname(documentPath), cleanPath),
      ];

      if (possiblePaths.some((p) => fs.existsSync(p))) {
        continue;
      }

      const message = isOptional
        ? `Sound file not found: ${cleanPath}. File is optional but should exist when used.`
        : `Sound file not found: ${cleanPath}. File must exist for CustomAlertSound (use CustomAlertSoundOptional if the file is optional)`;

      this.diagnostics.push({
        message,
        severity: isOptional ? "warning" : "error",
        line: node.line,
        columnStart: first.columnStart,
        columnEnd: first.columnEnd,
      });
    }
  }

  /**
   * Warns when a non-Optional `Import "file"` references a file that does not
   * exist (resolved relative to the current document, as the game does).
   * Optional imports are skipped because they are allowed to be absent.
   * Severity is a warning rather than an error since in-game imports may
   * resolve from the game's filter folder, which can differ from the edited
   * file's location.
   */
  private validateImport(node: ImportNode): void {
    if (node.optional) {
      return;
    }

    const filePath = node.path.value;
    if (typeof filePath !== "string" || filePath.length === 0) {
      return;
    }

    // Skip validation if we don't have document context
    if (!this.documentUri) {
      return;
    }

    const documentPath = this.toFsPath(this.documentUri);
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.join(path.dirname(documentPath), filePath);

    if (fs.existsSync(resolved)) {
      return;
    }

    this.diagnostics.push({
      message: `Imported filter not found: ${filePath}. Add "Optional" if the file may be absent.`,
      severity: "warning",
      line: node.line,
      columnStart: node.path.columnStart,
      columnEnd: node.path.columnEnd,
    });
  }

  /**
   * Converts a document URI (e.g. `file:///c%3A/dir/filter.filter`) into a
   * filesystem path. Falls back to returning the input unchanged when it is
   * not a `file:` URI.
   */
  private toFsPath(uri: string): string {
    if (!uri.startsWith("file:")) {
      return uri;
    }

    let p = decodeURIComponent(uri.replace(/^file:\/\//, ""));
    // Windows file URIs look like `/c:/dir/...`; drop the leading slash.
    if (/^\/[a-zA-Z]:/.test(p)) {
      p = p.slice(1);
    }
    return p;
  }

  private validateBaseTypeOrClass(
    values: NodeValue[],
    node: ConditionNode
  ): void {
    if (!this.gameData) {
      return;
    }

    const isExact = node.operator === "==";
    const seenValues = new Map<string, number>(); // value -> first column start

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

      // Check for duplicates
      if (seenValues.has(value)) {
        this.diagnostics.push({
          message: `Duplicate value "${value}" in ${node.condition} condition`,
          severity: "warning",
          line: node.line,
          columnStart: nodeValue.columnStart,
          columnEnd: nodeValue.columnEnd,
        });
        continue;
      }

      seenValues.set(value, nodeValue.columnStart);

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
