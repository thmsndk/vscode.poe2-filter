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

/**
 * Optional rendering hints mirroring VS Code's DiagnosticTag: "unnecessary"
 * fades the range (dead/unreachable code) and "deprecated" strikes it through.
 */
export type DiagnosticTagKind = "unnecessary" | "deprecated";

/**
 * Quick-fix metadata for an impossible Class/BaseType combination, carried on
 * the diagnostic's `data` so the code action provider can offer fixes without
 * re-deriving game data. Positions are 0-based (LSP) and ready to use directly.
 */
export interface ClassBaseTypeFixData {
  fix: "class-basetype-mismatch";
  /** The offending BaseType value (without quotes), e.g. "Adherent Cuffs". */
  baseType: string;
  /** The base's actual class name(s), e.g. ["Gloves"] - what to add to Class. */
  addClasses: string[];
  /** Where to insert the new class value (end of the last Class value). */
  classInsert: { line: number; character: number };
}

export interface SemanticDiagnostic {
  message: string;
  severity: "error" | "warning";
  line: number;
  columnStart: number;
  columnEnd: number;
  tags?: DiagnosticTagKind[];
  data?: ClassBaseTypeFixData;
}

/**
 * The set of values a single condition occurrence allows, used to reason about
 * duplicate conditions of the same type (which COMPOUND/AND in-game). Numeric
 * conditions are modelled as an interval; enum/boolean conditions as a small
 * discrete set of ordinals.
 */
type DupConstraint =
  | { kind: "interval"; lo: number; loEx: boolean; hi: number; hiEx: boolean }
  | { kind: "set"; values: Set<number> };

function intersectConstraint(a: DupConstraint, b: DupConstraint): DupConstraint {
  if (a.kind === "interval" && b.kind === "interval") {
    const lo = Math.max(a.lo, b.lo);
    const loEx = (a.lo === lo && a.loEx) || (b.lo === lo && b.loEx);
    const hi = Math.min(a.hi, b.hi);
    const hiEx = (a.hi === hi && a.hiEx) || (b.hi === hi && b.hiEx);
    return { kind: "interval", lo, loEx, hi, hiEx };
  }
  if (a.kind === "set" && b.kind === "set") {
    const values = new Set<number>();
    for (const v of a.values) {
      if (b.values.has(v)) {
        values.add(v);
      }
    }
    return { kind: "set", values };
  }
  // Mismatched kinds never occur (a group shares one condition type), but keep
  // the type checker happy by returning an empty set.
  return { kind: "set", values: new Set() };
}

function constraintIsEmpty(c: DupConstraint): boolean {
  if (c.kind === "interval") {
    return c.lo > c.hi || (c.lo === c.hi && (c.loEx || c.hiEx));
  }
  return c.values.size === 0;
}

function constraintEquals(a: DupConstraint, b: DupConstraint): boolean {
  if (a.kind === "interval" && b.kind === "interval") {
    return (
      a.lo === b.lo && a.loEx === b.loEx && a.hi === b.hi && a.hiEx === b.hiEx
    );
  }
  if (a.kind === "set" && b.kind === "set") {
    if (a.values.size !== b.values.size) {
      return false;
    }
    for (const v of a.values) {
      if (!b.values.has(v)) {
        return false;
      }
    }
    return true;
  }
  return false;
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
        // Collect active (non-commented) conditions/actions per type.
        //
        // Conditions of the same type COMPOUND (AND) in-game - confirmed in
        // PoE2 and relied upon by FilterBlade filters, which routinely bracket
        // a numeric range with two conditions (e.g. `ItemLevel >= 65` plus
        // `ItemLevel <= 81`). So repeated conditions are only a problem when
        // they contradict each other (never match) or are redundant; that is
        // handled by validateDuplicateConditionGroup below.
        //
        // Actions of the same type behave differently: only the LAST one is
        // applied, so earlier duplicates are genuine dead code (see below).
        const firstConditionByType = new Map<string, ConditionNode>();
        const conditionsByType = new Map<ConditionType, ConditionNode[]>();
        const actionsByType = new Map<string, ActionNode[]>();
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
              tags: ["unnecessary"],
            });
            continue;
          }

          if (!isCommented && child.type === "Condition") {
            const conditionNode = child as ConditionNode;
            const occurrences =
              conditionsByType.get(conditionNode.condition) ?? [];
            occurrences.push(conditionNode);
            conditionsByType.set(conditionNode.condition, occurrences);
            if (!firstConditionByType.has(conditionNode.condition)) {
              firstConditionByType.set(conditionNode.condition, conditionNode);
            }
          }

          if (
            !isCommented &&
            child.type === "Action" &&
            (child as ActionNode).action === "Continue"
          ) {
            afterContinue = true;
          } else if (!isCommented && child.type === "Action") {
            const actionNode = child as ActionNode;
            const occurrences = actionsByType.get(actionNode.action) ?? [];
            occurrences.push(actionNode);
            actionsByType.set(actionNode.action, occurrences);
          }

          this.visitNode(child, node);
        }

        for (const occurrences of conditionsByType.values()) {
          if (occurrences.length > 1) {
            this.validateDuplicateConditionGroup(occurrences);
          }
        }

        this.validateClassBaseTypeCombination(firstConditionByType);
        this.validateDropLevelAgainstBaseType(firstConditionByType);

        // The last action of each type wins; warn on the overridden earlier ones.
        for (const occurrences of actionsByType.values()) {
          for (let index = 0; index < occurrences.length - 1; index++) {
            const overridden = occurrences[index];
            this.diagnostics.push({
              message: `Duplicate action "${overridden.action}": only the last ${overridden.action} in a block is applied`,
              severity: "warning",
              line: overridden.line,
              columnStart: overridden.columnStart,
              columnEnd: overridden.columnEnd,
              tags: ["unnecessary"],
            });
          }
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

  /**
   * Warns about repeated values in any list condition (e.g. a `BaseType` or
   * `Class` list that names the same value twice). Only string values are
   * considered, so numeric arguments such as a `HasExplicitMod` count are
   * ignored.
   */
  private validateDuplicateValues(node: ConditionNode): void {
    const seenValues = new Set<string>();
    for (const nodeValue of node.values) {
      const value = nodeValue.value;
      if (typeof value !== "string") {
        continue;
      }

      if (seenValues.has(value)) {
        this.diagnostics.push({
          message: `Duplicate value "${value}" in ${node.condition} condition`,
          severity: "warning",
          line: node.line,
          columnStart: nodeValue.columnStart,
          columnEnd: nodeValue.columnEnd,
        });
      } else {
        seenValues.add(value);
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

    this.validateDuplicateValues(node);

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

  /**
   * Analyses a group of same-type conditions in one block. Because conditions
   * compound (AND), repetition is idiomatic (range brackets). We only flag:
   *   - contradictions: the conditions can never be satisfied together, so the
   *     whole block can never match (error); and
   *   - redundancy: a condition that does not narrow the others at all (hint
   *     rendered as faded/unnecessary).
   */
  private validateDuplicateConditionGroup(occurrences: ConditionNode[]): void {
    const condition = occurrences[0].condition;
    const syntax = ConditionSyntaxMap[condition];
    if (!syntax) {
      return;
    }

    switch (syntax.valueType) {
      case "number":
        this.analyzeConstraintGroup(occurrences, (occ) =>
          this.numericConstraint(occ)
        );
        return;
      case "rarity":
        this.analyzeConstraintGroup(occurrences, (occ) =>
          this.rarityConstraint(occ, syntax.valueSyntax.enumValues)
        );
        return;
      case "boolean":
        this.analyzeConstraintGroup(occurrences, (occ) =>
          this.booleanConstraint(occ)
        );
        return;
      default:
        this.validateStringDuplicates(occurrences);
    }
  }

  /**
   * Generic contradiction/redundancy analysis over a group of conditions once
   * each has been reduced to the set of values it allows. Occurrences that
   * cannot be reduced (e.g. still being typed) are ignored.
   */
  private analyzeConstraintGroup(
    occurrences: ConditionNode[],
    toConstraint: (occ: ConditionNode) => DupConstraint | undefined
  ): void {
    const items: { occ: ConditionNode; constraint: DupConstraint }[] = [];
    for (const occ of occurrences) {
      const constraint = toConstraint(occ);
      if (constraint) {
        items.push({ occ, constraint });
      }
    }
    if (items.length < 2) {
      return;
    }

    const total = items
      .map((i) => i.constraint)
      .reduce((a, b) => intersectConstraint(a, b));
    if (constraintIsEmpty(total)) {
      this.reportContradiction(occurrences);
      return;
    }

    // Greedily drop conditions that do not narrow the rest; each such condition
    // is redundant. Doing it one at a time keeps a single member of an
    // identical pair (removing both would change the result).
    const active = items.slice();
    let removed = true;
    while (active.length > 1 && removed) {
      removed = false;
      for (let i = 0; i < active.length; i++) {
        const others = active
          .filter((_, j) => j !== i)
          .map((a) => a.constraint)
          .reduce((a, b) => intersectConstraint(a, b));
        const withCurrent = intersectConstraint(others, active[i].constraint);
        if (constraintEquals(others, withCurrent)) {
          this.reportRedundant(active[i].occ);
          active.splice(i, 1);
          removed = true;
          break;
        }
      }
    }
  }

  private numericConstraint(occ: ConditionNode): DupConstraint | undefined {
    const raw = occ.values[0]?.value;
    if (occ.values.length === 0) {
      return undefined;
    }
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(value)) {
      return undefined;
    }
    const op = occ.operator?.trim() || "==";
    switch (op) {
      case "==":
        return { kind: "interval", lo: value, loEx: false, hi: value, hiEx: false };
      case ">=":
        return { kind: "interval", lo: value, loEx: false, hi: Infinity, hiEx: false };
      case ">":
        return { kind: "interval", lo: value, loEx: true, hi: Infinity, hiEx: false };
      case "<=":
        return { kind: "interval", lo: -Infinity, loEx: false, hi: value, hiEx: false };
      case "<":
        return { kind: "interval", lo: -Infinity, loEx: false, hi: value, hiEx: true };
      default:
        return undefined;
    }
  }

  private rarityConstraint(
    occ: ConditionNode,
    enumValues: Record<string, number> | undefined
  ): DupConstraint | undefined {
    if (!enumValues || occ.values.length === 0) {
      return undefined;
    }
    const domain = Object.values(enumValues);
    const op = occ.operator?.trim();

    // No operator => space-separated list of exact rarities (OR).
    if (!op || op === "==") {
      const values = new Set<number>();
      for (const nodeValue of occ.values) {
        const ord = enumValues[String(nodeValue.value)];
        if (ord !== undefined) {
          values.add(ord);
        }
      }
      return values.size > 0 ? { kind: "set", values } : undefined;
    }

    const ord = enumValues[String(occ.values[0].value)];
    if (ord === undefined) {
      return undefined;
    }
    const values = new Set<number>();
    for (const d of domain) {
      const keep =
        (op === ">=" && d >= ord) ||
        (op === ">" && d > ord) ||
        (op === "<=" && d <= ord) ||
        (op === "<" && d < ord);
      if (keep) {
        values.add(d);
      }
    }
    return { kind: "set", values };
  }

  private booleanConstraint(occ: ConditionNode): DupConstraint | undefined {
    let value: boolean;
    if (occ.values.length === 0) {
      value = true; // a bare boolean condition (e.g. `Corrupted`) means True
    } else {
      const raw = occ.values[0].value;
      if (raw === true || raw === "True" || raw === "true") {
        value = true;
      } else if (raw === false || raw === "False" || raw === "false") {
        value = false;
      } else {
        return undefined;
      }
    }
    if (occ.negated) {
      value = !value;
    }
    return { kind: "set", values: new Set([value ? 1 : 0]) };
  }

  /**
   * String/list conditions (BaseType, Class, ...). They compound (AND), but
   * substring matching makes contradictions undecidable in general. We only
   * prove "never matches" for single-valued item properties (BaseType, Class)
   * matched exactly, and otherwise just flag identical repeats as redundant.
   */
  private validateStringDuplicates(occurrences: ConditionNode[]): void {
    const condition = occurrences[0].condition;

    const singleValued =
      condition === ConditionType.BaseType || condition === ConditionType.Class;
    const allExact = occurrences.every((o) => o.operator?.trim() === "==");
    if (singleValued && allExact) {
      let intersection: Set<string> | undefined;
      let usable = true;
      for (const occ of occurrences) {
        const set = new Set<string>();
        for (const nodeValue of occ.values) {
          if (typeof nodeValue.value === "string") {
            set.add(nodeValue.value);
          }
        }
        if (set.size === 0) {
          usable = false;
          break;
        }
        intersection = intersection
          ? new Set([...intersection].filter((v) => set.has(v)))
          : set;
      }
      if (usable && intersection && intersection.size === 0) {
        this.reportContradiction(occurrences);
        return;
      }
    }

    const seen = new Set<string>();
    for (const occ of occurrences) {
      const key =
        (occ.operator?.trim() ?? "") +
        "|" +
        occ.values.map((v) => String(v.value)).join("\u0000");
      if (seen.has(key)) {
        this.reportRedundant(occ);
      } else {
        seen.add(key);
      }
    }
  }

  private reportContradiction(occurrences: ConditionNode[]): void {
    const condition = occurrences[0].condition;
    const last = occurrences[occurrences.length - 1];
    this.diagnostics.push({
      message: `This block can never match: its ${condition} conditions contradict each other (no value satisfies all of them)`,
      severity: "error",
      line: last.line,
      columnStart: last.columnStart,
      columnEnd: last.columnEnd,
    });
  }

  private reportRedundant(occ: ConditionNode): void {
    this.diagnostics.push({
      message: `Redundant ${occ.condition} condition: another ${occ.condition} condition in this block already covers it`,
      severity: "warning",
      line: occ.line,
      columnStart: occ.columnStart,
      columnEnd: occ.columnEnd,
      tags: ["unnecessary"],
    });
  }

  /**
   * Warns about impossible Class/BaseType combinations within a block, e.g.
   * `Class "Currency"` together with `BaseType "Sapphire Ring"` (a ring), which
   * can never match any item. Only the first Class and first BaseType conditions
   * are considered (the others are reported as duplicates). Combinations are
   * skipped when either side is unknown (already reported as "not found") or
   * matches across classes.
   */
  private validateClassBaseTypeCombination(
    firstConditionByType: Map<string, ConditionNode>
  ): void {
    if (!this.gameData) {
      return;
    }

    const classNode = firstConditionByType.get("Class");
    const baseTypeNode = firstConditionByType.get("BaseType");
    if (!classNode || !baseTypeNode) {
      return;
    }

    const classValues = classNode.values
      .map((v) => v.value)
      .filter((v): v is string => typeof v === "string");

    const classMatches =
      classNode.operator === "=="
        ? this.gameData.findExactClass(classValues)
        : this.gameData.findMatchingClasses(classValues);

    const allowedClassIndices = new Set(
      classMatches.map((match) => match.item._index)
    );
    if (allowedClassIndices.size === 0) {
      // Unknown class - already reported as "not found".
      return;
    }

    const baseExact = baseTypeNode.operator === "==";

    for (const nodeValue of baseTypeNode.values) {
      const value = nodeValue.value;
      if (typeof value !== "string") {
        continue;
      }

      const baseMatches = baseExact
        ? this.gameData.findExactBaseType(value)
        : this.gameData.findMatchingBaseTypes(value);

      if (baseMatches.length === 0) {
        // Unknown base type - already reported as "not found".
        continue;
      }

      const matchesAllowedClass = baseMatches.some((match) =>
        allowedClassIndices.has(match.item.ItemClass)
      );
      if (matchesAllowedClass) {
        continue;
      }

      const actualClassNames = [
        ...new Set(
          baseMatches
            .map((match) => this.gameData?.findClassByIndex(match.item.ItemClass)?.Name)
            .filter((name): name is string => Boolean(name))
        ),
      ];
      const actualPart =
        actualClassNames.length > 0 ? ` (${actualClassNames.join(", ")})` : "";

      // Carry fix metadata so the code action provider can offer "add the
      // actual class" / "remove this BaseType" without re-querying game data.
      const lastClassValue = classNode.values[classNode.values.length - 1];
      const data: ClassBaseTypeFixData | undefined =
        lastClassValue && actualClassNames.length > 0
          ? {
              fix: "class-basetype-mismatch",
              baseType: value,
              addClasses: actualClassNames,
              classInsert: {
                line: classNode.line - 1,
                character: lastClassValue.columnEnd - 1,
              },
            }
          : undefined;

      this.diagnostics.push({
        message: `BaseType "${value}"${actualPart} does not match this block's Class condition`,
        severity: "warning",
        line: baseTypeNode.line,
        columnStart: nodeValue.columnStart,
        columnEnd: nodeValue.columnEnd,
        tags: ["unnecessary"],
        ...(data ? { data } : {}),
      });
    }
  }

  /**
   * Warns when a block's DropLevel constraint can never be satisfied by any of
   * the base types it also requires - e.g. `BaseType == "Mirror of Kalandra"`
   * together with `DropLevel < 50` when the Mirror's actual drop level is
   * higher. DropLevel is an intrinsic property of each base item, so for a
   * fixed BaseType set the combination is satisfiable only if at least one
   * matching base's drop level passes the comparison.
   *
   * Only the first BaseType and first DropLevel conditions are considered (the
   * others are reported as duplicates). The check is skipped when the BaseType
   * is unknown (already reported as "not found") or the DropLevel value is not
   * a number. A Class condition, if present, can only narrow the set further,
   * so a "never matches" verdict from the BaseType set alone still holds.
   */
  private validateDropLevelAgainstBaseType(
    firstConditionByType: Map<string, ConditionNode>
  ): void {
    if (!this.gameData) {
      return;
    }

    const baseTypeNode = firstConditionByType.get("BaseType");
    const dropLevelNode = firstConditionByType.get("DropLevel");
    if (!baseTypeNode || !dropLevelNode) {
      return;
    }

    const target = dropLevelNode.values[0];
    if (!target || typeof target.value !== "number") {
      return;
    }
    const targetLevel = target.value;
    // An omitted operator means exact equality in this filter dialect.
    const operator = dropLevelNode.operator ?? "==";

    const baseValues = baseTypeNode.values
      .map((v) => v.value)
      .filter((v): v is string => typeof v === "string");

    const matches =
      baseTypeNode.operator === "=="
        ? this.gameData.findExactBaseType(baseValues)
        : this.gameData.findMatchingBaseTypes(baseValues);

    if (matches.length === 0) {
      // Unknown base type - already reported as "not found".
      return;
    }

    const dropLevels = matches.map((match) => match.item.DropLevel);
    const satisfiable = dropLevels.some((level) =>
      this.satisfiesComparison(level, operator, targetLevel)
    );
    if (satisfiable) {
      return;
    }

    const min = Math.min(...dropLevels);
    const max = Math.max(...dropLevels);
    const actual = min === max ? `${min}` : `${min}-${max}`;
    const { columnStart, columnEnd } = this.valuePosition(dropLevelNode, 0);

    this.diagnostics.push({
      message: `DropLevel ${operator} ${targetLevel} never matches the block's BaseType: actual drop level ${actual}`,
      severity: "warning",
      line: dropLevelNode.line,
      columnStart,
      columnEnd,
      tags: ["unnecessary"],
    });
  }

  /** True when `value <operator> target` holds for a numeric filter comparison. */
  private satisfiesComparison(
    value: number,
    operator: string,
    target: number
  ): boolean {
    switch (operator) {
      case ">=":
        return value >= target;
      case "<=":
        return value <= target;
      case ">":
        return value > target;
      case "<":
        return value < target;
      case "!=":
        return value !== target;
      case "==":
      case "=":
      default:
        return value === target;
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
    // Skip re-validating repeated values; the duplicate itself is reported
    // generically by validateDuplicateValues.
    const seenValues = new Set<string>();

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

      if (seenValues.has(value)) {
        continue;
      }

      seenValues.add(value);

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
