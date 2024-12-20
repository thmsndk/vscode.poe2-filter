import * as vscode from "vscode";

export interface FilterCondition {
  type: string; // Class, BaseType, MapTier, etc.
  operator?: string; // >=, <=, ==, etc.
  values: string[]; // For BaseType/Class can have multiple values
  lineNumber: number;
}

export interface FilterRule {
  lineNumber: number;
  conditions: FilterCondition[];
  actions: FilterAction[];
  hasContinue: boolean;
  isShow: boolean;
}

export interface FilterAction {
  type: string;
  values: (string | number)[];
}

export interface FilterItem {
  // Numeric properties
  sockets?: number;
  quality?: number;
  itemLevel?: number;
  dropLevel?: number;
  areaLevel?: number;
  gemLevel?: number;
  mapTier?: number;
  waystoneTier?: number;
  stackSize?: number;
  height?: number;
  width?: number;
  baseArmour?: number;
  baseEnergyShield?: number;
  baseEvasion?: number;
  // String properties
  baseType?: string;
  class?: string;
  rarity?: string;
  name?: string;
  // Boolean properties
  fractured?: boolean;
  mirrored?: boolean;
  corrupted?: boolean;
  synthesised?: boolean;
  enchanted?: boolean;
  identified?: boolean;
}
type NumericProps = Exclude<
  {
    [K in keyof FilterItem]: FilterItem[K] extends number | undefined
      ? K
      : never;
  }[keyof FilterItem],
  undefined
>;

export function wouldRuleMatchItem(
  rule: FilterRule,
  item: FilterItem
): boolean {
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
      case "BaseEvasion": {
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
      }
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

export function doConditionsOverlap(
  prev: FilterCondition,
  current: FilterCondition
): boolean {
  if (prev.type !== current.type) {
    return false;
  }

  // Special handling for Rarity
  if (prev.type === "Rarity") {
    const rarityLevels = ["Normal", "Magic", "Rare", "Unique"];

    // Case 1: If either condition uses an operator (e.g., "Rarity <= Rare")
    if (prev.operator || current.operator) {
      const prevRarity = prev.values[0];
      const currentRarity = current.values[0];
      const prevIndex = rarityLevels.indexOf(prevRarity);
      const currentIndex = rarityLevels.indexOf(currentRarity);

      if (prevIndex === -1 || currentIndex === -1) {
        return false;
      }

      if (prev.operator === "<" || prev.operator === "<=") {
        return currentIndex <= prevIndex;
      }
      if (current.operator === "<" || current.operator === "<=") {
        return prevIndex <= currentIndex;
      }
    }

    // Case 2: Multiple values without operator (e.g., "Rarity Magic Rare")
    // Check if any value appears in both conditions
    return prev.values.some((value) => current.values.includes(value));
  }

  // For numeric comparisons
  if (prev.operator && current.operator) {
    const prevValue = Number(prev.values[0]);
    const currentValue = Number(current.values[0]);

    // Check if the ranges overlap
    switch (prev.operator) {
      case ">=":
        return current.operator === ">="
          ? currentValue >= prevValue
          : current.operator === "<="
          ? currentValue >= prevValue
          : current.operator === ">"
          ? currentValue > prevValue
          : current.operator === "<"
          ? currentValue >= prevValue
          : false;
      case "<=":
        return current.operator === "<="
          ? currentValue <= prevValue
          : current.operator === ">="
          ? prevValue >= currentValue
          : current.operator === ">"
          ? prevValue >= currentValue
          : current.operator === "<"
          ? currentValue <= prevValue
          : false;
      case ">":
        return current.operator === ">"
          ? currentValue >= prevValue
          : current.operator === "<"
          ? false
          : current.operator === "<="
          ? false
          : current.operator === ">="
          ? currentValue > prevValue
          : false;
      case "<":
        return current.operator === "<"
          ? currentValue <= prevValue
          : current.operator === ">"
          ? false
          : current.operator === ">="
          ? false
          : current.operator === "<="
          ? currentValue < prevValue
          : false;
    }
  }

  // For exact matches (BaseType, Class, etc)
  return JSON.stringify(prev.values) === JSON.stringify(current.values);
}

export function generateItemFromRule(rule: FilterRule): FilterItem {
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

  let baseTypes: string[] = [];
  let classes: string[] = [];
  for (const condition of rule.conditions) {
    switch (condition.type) {
      case "BaseType":
        item.baseType = condition.values[0];
        baseTypes.push(condition.values[0]);
        break;
      case "Class":
        item.class = condition.values[0];
        classes.push(condition.values[0]);
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
      case "BaseEvasion": {
        const prop = (condition.type.charAt(0).toLowerCase() +
          condition.type.slice(1)) as NumericProps;

        if (prop) {
          const value = Number(condition.values[0]);
          switch (condition.operator) {
            case ">=":
              item[prop] = value;
              break;
            case ">":
              item[prop] = value + 1;
              break;
            case "<=":
              item[prop] = value;
              break;
            case "<":
              item[prop] = value - 1;
              break;
            case "==":
              item[prop] = value;
              break;
          }
        }
        break;
      }
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

    // Generate a unique name for the item, preffering baseType over class, pickinga random name, as that is not important for rule validation
    if (baseTypes.length > 0) {
      item.name = baseTypes[Math.floor(Math.random() * baseTypes.length)];
    } else if (classes.length > 0) {
      item.name = classes[Math.floor(Math.random() * classes.length)];
    } else {
      item.name = "Item";
    }

    // Add stack size in front of the name if there is one
    if (item.stackSize && item.stackSize > 1) {
      item.name = `${item.stackSize}x ${item.name}`;
    }

    if (item.baseType === "Gold") {
      console.log("Gold", rule, item);
    }
  }

  return item;
}

export function compareNumeric(
  value: number,
  condition: FilterCondition
): boolean {
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

export function parseRules(input: vscode.TextDocument | string): FilterRule[] {
  const rules: FilterRule[] = [];
  let currentRule: FilterRule | null = null;

  // Convert input to lines whether it's a TextDocument or string
  const lines =
    typeof input === "string"
      ? input.split("\n")
      : Array.from({ length: input.lineCount }, (_, i) => input.lineAt(i).text);

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].trim();

    if (text.startsWith("#") || text === "") {
      continue;
    }

    if (text.startsWith("Show") || text.startsWith("Hide")) {
      if (currentRule) {
        rules.push(currentRule);
      }
      currentRule = {
        lineNumber: i,
        conditions: [],
        actions: [],
        hasContinue: false,
        isShow: text.startsWith("Show"),
      };
      continue;
    }

    if (!currentRule) {
      continue;
    }

    if (text === "Continue") {
      currentRule.hasContinue = true;
      continue;
    }

    const condition = parseCondition(text, i);
    if (condition) {
      currentRule.conditions.push(condition);
    } else {
      // If not a condition, try parsing as an action
      const action = parseAction(text);
      if (action) {
        currentRule.actions.push(action);
      }
    }
  }

  if (currentRule) {
    rules.push(currentRule);
  }

  return rules;
}

export function parseCondition(
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
    case "BaseArmour":
    case "BaseEnergyShield":
    case "BaseEvasion":
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

function parseAction(text: string): FilterAction | null {
  const parts = text.split(/\s+/);
  const type = parts[0];

  switch (type) {
    case "SetFontSize":
    case "PlayAlertSound":
    case "MinimapIcon":
    case "PlayEffect":
    case "SetTextColor":
    case "SetBorderColor":
    case "SetBackgroundColor":
      return {
        type,
        values: parts.slice(1),
      };
    default:
      return null;
  }
}
