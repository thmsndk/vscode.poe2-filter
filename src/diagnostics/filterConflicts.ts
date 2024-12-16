import * as vscode from "vscode";
// TODO: make findRuleConflicts return an object with the conflicting conditions as well as the message for use in checkRuleConflict
interface FilterCondition {
  type: string; // Class, BaseType, MapTier, etc.
  operator?: string; // >=, <=, ==, etc.
  values: string[]; // For BaseType/Class can have multiple values
  lineNumber: number;
}

interface FilterRule {
  lineNumber: number;
  conditions: FilterCondition[];
  hasContinue: boolean;
  isShow: boolean; // true for Show, false for Hide
}

export function checkRuleConflicts(
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  const problems: vscode.Diagnostic[] = [];
  const rules = parseRules(document);

  // Compare each rule with previous rules
  for (let i = 0; i < rules.length; i++) {
    const currentRule = rules[i];

    // Generate item once for current rule
    const currentItem = generateItemFromRule(currentRule);

    // Check against previous rules
    for (let j = 0; j < i; j++) {
      const previousRule = rules[j];
      const conflict = findRuleConflict(currentItem, currentRule, previousRule);

      if (conflict) {
        const diagnostic = new vscode.Diagnostic(
          document.lineAt(currentRule.lineNumber).range,
          `This rule may never trigger because ${conflict}`,
          vscode.DiagnosticSeverity.Warning
        );

        diagnostic.relatedInformation = [
          new vscode.DiagnosticRelatedInformation(
            new vscode.Location(
              document.uri,
              document.lineAt(previousRule.lineNumber).range
            ),
            `Conflicting rule here`
          ),
        ];

        diagnostic.code = {
          value: `goto:${previousRule.lineNumber}`,
          target: document.uri.with({
            fragment: `L${previousRule.lineNumber + 1}`,
          }),
        };

        diagnostic.source = "poe2-filter";
        problems.push(diagnostic);
      }
    }
  }

  return problems;
}

function findRuleConflict(
  currentItem: FilterItem,
  currentRule: FilterRule,
  previous: FilterRule
): string | null {
  if (previous.hasContinue) {
    return null;
  }

  // If the current rule has fewer conditions than the previous rule,
  // it's more generic and should be allowed
  if (currentRule.conditions.length < previous.conditions.length) {
    return null;
  }

  // Check if previous rule would match this item
  if (!wouldRuleMatchItem(previous, currentItem)) {
    return null;
  }

  // Create detailed message about which conditions overlap
  const overlappingConditions = previous.conditions
    .map((cond) => {
      switch (cond.type) {
        case "Class":
        case "BaseType": {
          // Find overlapping BaseTypes between current and previous rule
          const currentBaseTypes =
            currentRule.conditions.find((c) => c.type === "BaseType")?.values ||
            [];
          const overlapping = cond.values.filter((type) =>
            currentBaseTypes.includes(type)
          );
          return overlapping.length > 0
            ? `basetype "${overlapping.join(", ")}"`
            : null;
        }
        case "Sockets":
        case "Quality":
        case "ItemLevel":
        case "AreaLevel":
          return `${cond.type.toLowerCase()} ${cond.operator} ${
            cond.values[0]
          }`;
        case "Rarity":
          return `rarity ${cond.values.join(" ")}`;
        default:
          return null;
      }
    })
    .filter(Boolean)
    .join(", ");

  return `it would be caught by an earlier rule with ${overlappingConditions} at line ${
    previous.lineNumber + 1
  }`;
}

interface FilterItem {
  // Numeric properties
  sockets: number;
  quality: number;
  itemLevel: number;
  dropLevel: number;
  areaLevel: number;
  gemLevel: number;
  mapTier: number;
  waystoneTier: number;
  stackSize: number;
  height: number;
  width: number;
  baseArmour: number;
  baseEnergyShield: number;
  baseEvasion: number;
  // String properties
  baseType?: string;
  class?: string;
  rarity?: string;
  // Boolean properties
  fractured: boolean;
  mirrored: boolean;
  corrupted: boolean;
  synthesised: boolean;
  enchanted: boolean;
  identified: boolean;
}

function generateItemFromRule(rule: FilterRule): FilterItem {
  const item: FilterItem = {
    // Numeric defaults
    sockets: 0,
    quality: 0,
    itemLevel: 1,
    dropLevel: 1,
    stackSize: 1,
    areaLevel: 1,
    gemLevel: 1,
    mapTier: 1,
    waystoneTier: 1,
    height: 1,
    width: 1,
    baseArmour: 0,
    baseEnergyShield: 0,
    baseEvasion: 0,
    // Boolean defaults
    fractured: false,
    mirrored: false,
    corrupted: false,
    synthesised: false,
    enchanted: false,
    identified: false,
  };

  for (const condition of rule.conditions) {
    switch (condition.type) {
      case "BaseType":
        item.baseType = condition.values[0];
        break;
      case "Class":
        item.class = condition.values[0];
        break;
      case "Sockets":
      case "Quality":
      case "ItemLevel":
      case "DropLevel":
      case "AreaLevel":
      case "GemLevel":
      case "MapTier":
      case "WaystoneTier":
      case "StackSize":
      case "Height":
      case "Width":
      case "BaseArmour":
      case "BaseEnergyShield":
      case "BaseEvasion":
        type NumericProps = {
          [K in keyof FilterItem]: FilterItem[K] extends number ? K : never;
        }[keyof FilterItem];
        const prop = (condition.type.charAt(0).toLowerCase() +
          condition.type.slice(1)) as NumericProps;
        if (prop && compareNumeric(item[prop], condition)) {
          item[prop] = Number(condition.values[0]);
        }
        break;
      case "Rarity":
        item.rarity = condition.values[0];
        break;
      case "FracturedItem":
        item.fractured = condition.values[0] === "True";
        break;
      case "Mirrored":
        item.mirrored = condition.values[0] === "True";
        break;
      case "Corrupted":
        item.corrupted = condition.values[0] === "True";
        break;
      case "SynthesisedItem":
        item.synthesised = condition.values[0] === "True";
        break;
      case "AnyEnchantment":
        item.enchanted = condition.values[0] === "True";
        break;
      case "Identified":
        item.identified = condition.values[0] === "True";
        break;
    }
  }

  return item;
}

function wouldRuleMatchItem(rule: FilterRule, item: FilterItem): boolean {
  for (const condition of rule.conditions) {
    switch (condition.type) {
      case "BaseType":
        if (!item.baseType || !condition.values.includes(item.baseType)) {
          return false;
        }
        break;
      case "Class":
        if (!item.class || !condition.values.includes(item.class)) {
          return false;
        }
        break;
      case "Sockets":
      case "Quality":
      case "ItemLevel":
      case "DropLevel":
      case "AreaLevel":
      case "GemLevel":
      case "MapTier":
      case "WaystoneTier":
      case "StackSize":
      case "Height":
      case "Width":
      case "BaseArmour":
      case "BaseEnergyShield":
      case "BaseEvasion":
        type NumericProps = {
          [K in keyof FilterItem]: FilterItem[K] extends number ? K : never;
        }[keyof FilterItem];
        const prop = (condition.type.charAt(0).toLowerCase() +
          condition.type.slice(1)) as NumericProps;
        if (
          !prop ||
          item[prop] === undefined ||
          !compareNumeric(item[prop], condition)
        ) {
          return false;
        }
        break;
      case "Rarity":
        if (!item.rarity || !condition.values.includes(item.rarity)) {
          return false;
        }
        break;
      case "FracturedItem":
        if (item.fractured !== (condition.values[0] === "True")) {
          return false;
        }
        break;
      case "Mirrored":
        if (item.mirrored !== (condition.values[0] === "True")) {
          return false;
        }
        break;
      case "Corrupted":
        if (item.corrupted !== (condition.values[0] === "True")) {
          return false;
        }
        break;
      case "SynthesisedItem":
        if (item.synthesised !== (condition.values[0] === "True")) {
          return false;
        }
        break;
      case "AnyEnchantment":
        if (item.enchanted !== (condition.values[0] === "True")) {
          return false;
        }
        break;
      case "Identified":
        if (item.identified !== (condition.values[0] === "True")) {
          return false;
        }
        break;
    }
  }
  return true;
}

function compareNumeric(value: number, condition: FilterCondition): boolean {
  const conditionValue = Number(condition.values[0]);
  switch (condition.operator) {
    case ">=":
      return value >= conditionValue;
    case "<=":
      return value <= conditionValue;
    case ">":
      return value > conditionValue;
    case "<":
      return value < conditionValue;
    case "==":
      return value === conditionValue;
    default:
      return false;
  }
}

function parseRules(document: vscode.TextDocument): FilterRule[] {
  const rules: FilterRule[] = [];
  let currentRule: FilterRule | null = null;

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const text = line.text.trim();

    if (text.startsWith("#") || text === "") continue;

    if (text.startsWith("Show") || text.startsWith("Hide")) {
      if (currentRule) rules.push(currentRule);
      currentRule = {
        lineNumber: i,
        conditions: [],
        hasContinue: false,
        isShow: text.startsWith("Show"),
      };
      continue;
    }

    if (!currentRule) continue;

    if (text === "Continue") {
      currentRule.hasContinue = true;
      continue;
    }

    const condition = parseCondition(text, i);
    if (condition) {
      currentRule.conditions.push(condition);
    }
  }

  if (currentRule) rules.push(currentRule);
  return rules;
}

function parseCondition(
  text: string,
  lineNumber: number
): FilterCondition | null {
  const parts = text.split(/\s+/);
  const type = parts[0];

  switch (type) {
    case "Class":
    case "BaseType": {
      // Match all quoted strings, preserving spaces within quotes
      const matches = text.match(/"([^"]+)"/g) || [];
      return {
        type,
        values: matches.map((m) => m.replace(/"/g, "")),
        lineNumber,
      };
    }
    case "MapTier":
    case "ItemLevel":
    case "DropLevel":
    case "Quality":
    case "AreaLevel":
    case "GemLevel":
    case "Sockets":
    case "WaystoneTier":
    case "StackSize":
    case "Height":
    case "Width":
      return {
        type,
        operator: parts[1]?.match(/[<>=]+/)?.[0],
        values: [parts[parts.length - 1]],
        lineNumber,
      };
    case "Rarity":
      return {
        type,
        values: parts
          .slice(1)
          .filter((p) => ["Normal", "Magic", "Rare", "Unique"].includes(p)),
        lineNumber,
      };
    case "FracturedItem":
    case "Mirrored":
    case "Corrupted":
    case "SynthesisedItem":
    case "AnyEnchantment":
    case "Identified":
      return {
        type,
        values: [parts[1]], // True/False
        lineNumber,
      };
    default:
      return null;
  }
}
