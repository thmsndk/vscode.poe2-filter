import { Parser } from "../language-server/ast/parser";
import {
  RootNode,
  ConditionNode,
  ActionNode,
  isBlockNode,
} from "../language-server/ast/nodes";

type ConditionType =
  | "BaseType"
  | "Class"
  | "Sockets"
  | "Quality"
  | "ItemLevel"
  | "DropLevel"
  | "AreaLevel"
  | "GemLevel"
  | "MapTier"
  | "WaystoneTier"
  | "StackSize"
  | "Height"
  | "Width"
  | "BaseArmour"
  | "BaseEnergyShield"
  | "BaseEvasion"
  | "UnidentifiedItemTier"
  | "Rarity"
  | "FracturedItem"
  | "Mirrored"
  | "Corrupted"
  | "SynthesisedItem"
  | "AnyEnchantment"
  | "Identified"
  | "HasVaalUniqueMod"
  | "IsVaalUnique"
  | "TwiceCorrupted"
  | "AlwaysShow"
  | "HasExplicitMod";

type ActionType =
  | "SetFontSize"
  | "PlayAlertSound"
  | "MinimapIcon"
  | "PlayEffect"
  | "SetTextColor"
  | "SetBorderColor"
  | "SetBackgroundColor";

export interface FilterCondition {
  type: ConditionType;
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
  type: ActionType;
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
  unidentifiedItemTier?: number;
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
  hasVaalUniqueMod?: boolean;
  isVaalUnique?: boolean;
  twiceCorrupted?: boolean;
  alwaysShow?: boolean;
  // Explicit mod names a HasExplicitMod rule requires (string list, so it is
  // not part of NumericProps/boolean handling).
  explicitMods?: string[];
}
type NumericProps = Exclude<
  {
    [K in keyof FilterItem]: FilterItem[K] extends number | undefined
      ? K
      : never;
  }[keyof FilterItem],
  undefined
>;

/**
 * Returns true when the operator represents a "not equal" comparison.
 * PoE2 supports both "!" and "!=" as not-equal operators.
 */
function isNotEqualOperator(operator?: string): boolean {
  return operator === "!" || operator === "!=";
}

/**
 * Case-insensitive substring match used for "not equal" BaseType/Class
 * comparisons, mirroring how the game matches partial names (e.g. "Jade"
 * excludes "Jade Amulet").
 */
function partiallyMatchesAnyValue(
  itemValue: string | undefined,
  values: string[]
): boolean {
  if (!itemValue) {
    return false;
  }
  const target = itemValue.toLowerCase();
  return values.some((value) => target.includes(value.toLowerCase()));
}

/**
 * Resolves the boolean value a True/False condition expects, taking a
 * "not equal" operator (e.g. "Corrupted != True") into account.
 */
function expectedBoolean(condition: FilterCondition): boolean {
  const isTrue = condition.values[0] === "True";
  return isNotEqualOperator(condition.operator) ? !isTrue : isTrue;
}

export function wouldRuleMatchItem(
  rule: FilterRule,
  item: FilterItem
): boolean {
  for (const condition of rule.conditions) {
    switch (condition.type) {
      case "BaseType": {
        if (isNotEqualOperator(condition.operator)) {
          // Partial match so e.g. "Jade" excludes "Jade Amulet"
          if (partiallyMatchesAnyValue(item.baseType, condition.values)) {
            return false;
          }
        } else if (!item.baseType || !condition.values.includes(item.baseType)) {
          return false;
        }
        break;
      }
      case "Class": {
        if (isNotEqualOperator(condition.operator)) {
          if (partiallyMatchesAnyValue(item.class, condition.values)) {
            return false;
          }
        } else if (!item.class || !condition.values.includes(item.class)) {
          return false;
        }
        break;
      }
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
      case "UnidentifiedItemTier": {
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
      case "Rarity": {
        const inList = !!item.rarity && condition.values.includes(item.rarity);
        if (isNotEqualOperator(condition.operator) ? inList : !inList) {
          return false;
        }
        break;
      }
      case "FracturedItem":
        if (item.fractured !== expectedBoolean(condition)) {
          return false;
        }
        break;
      case "Mirrored":
        if (item.mirrored !== expectedBoolean(condition)) {
          return false;
        }
        break;
      case "Corrupted":
        if (item.corrupted !== expectedBoolean(condition)) {
          return false;
        }
        break;
      case "SynthesisedItem":
        if (item.synthesised !== expectedBoolean(condition)) {
          return false;
        }
        break;
      case "AnyEnchantment":
        if (item.enchanted !== expectedBoolean(condition)) {
          return false;
        }
        break;
      case "Identified":
        if (item.identified !== expectedBoolean(condition)) {
          return false;
        }
        break;
      case "HasVaalUniqueMod":
        if (item.hasVaalUniqueMod !== expectedBoolean(condition)) {
          return false;
        }
        break;
      case "IsVaalUnique":
        if (item.isVaalUnique !== expectedBoolean(condition)) {
          return false;
        }
        break;
      case "TwiceCorrupted":
        if (item.twiceCorrupted !== expectedBoolean(condition)) {
          return false;
        }
        break;
      case "AlwaysShow":
        if (item.alwaysShow !== expectedBoolean(condition)) {
          return false;
        }
        break;
      case "HasExplicitMod": {
        // The preview cannot simulate item mod rolls, so only an item that
        // explicitly carries the required mods matches (the rule's own
        // representative item does; sample items do not).
        const required = condition.values;
        const matches =
          !!item.explicitMods &&
          required.every((mod) => item.explicitMods!.includes(mod));
        if (isNotEqualOperator(condition.operator) ? matches : !matches) {
          return false;
        }
        break;
      }
      default: {
        const _exhaustiveCheck: never = condition.type;
        return false;
      }
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
    unidentifiedItemTier: 0,
    // Boolean defaults
    fractured: false,
    mirrored: false,
    corrupted: false,
    synthesised: false,
    enchanted: false,
    identified: false,
    hasVaalUniqueMod: false,
    isVaalUnique: false,
    twiceCorrupted: false,
    alwaysShow: false,
    // Fallback so a rule whose conditions don't determine a base item (e.g.
    // boolean-only rules) still renders with a label instead of "undefined".
    name: "Item",
  };

  let baseTypes: string[] = [];
  let classes: string[] = [];
  for (const condition of rule.conditions) {
    switch (condition.type) {
      case "BaseType":
        // For "not equal" we can't represent the rule with the excluded value,
        // so we leave baseType unset to avoid a self-contradicting item.
        if (!isNotEqualOperator(condition.operator)) {
          item.baseType = condition.values[0];
          baseTypes.push(condition.values[0]);
        }
        break;
      case "Class":
        if (!isNotEqualOperator(condition.operator)) {
          item.class = condition.values[0];
          classes.push(condition.values[0]);
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
      case "UnidentifiedItemTier": {
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
            case "=":
              item[prop] = value;
              break;
            case "!=":
            case "!":
              // Any value other than the excluded one satisfies "not equal".
              item[prop] = value + 1;
              break;
          }
        }
        break;
      }
      case "Rarity":
        if (isNotEqualOperator(condition.operator)) {
          item.rarity = ["Normal", "Magic", "Rare", "Unique"].find(
            (rarity) => !condition.values.includes(rarity)
          );
        } else {
          item.rarity = condition.values[0];
        }
        break;
      case "FracturedItem":
        item.fractured = expectedBoolean(condition);
        break;
      case "Mirrored":
        item.mirrored = expectedBoolean(condition);
        break;
      case "Corrupted":
        item.corrupted = expectedBoolean(condition);
        break;
      case "SynthesisedItem":
        item.synthesised = expectedBoolean(condition);
        break;
      case "AnyEnchantment":
        item.enchanted = expectedBoolean(condition);
        break;
      case "Identified":
        item.identified = expectedBoolean(condition);
        break;
      case "HasVaalUniqueMod":
        item.hasVaalUniqueMod = expectedBoolean(condition);
        break;
      case "IsVaalUnique":
        item.isVaalUnique = expectedBoolean(condition);
        break;
      case "TwiceCorrupted":
        item.twiceCorrupted = expectedBoolean(condition);
        break;
      case "AlwaysShow":
        item.alwaysShow = expectedBoolean(condition);
        break;
      case "HasExplicitMod":
        // Give the representative item the required mods so it matches itself.
        item.explicitMods = condition.values;
        break;
      default: {
        const _exhaustiveCheck: never = condition.type;
        break;
      }
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
    case "=":
      return value === conditionValue;
    case "!=":
    case "!":
      return value !== conditionValue;
    default:
      return false;
  }
}

// Condition keywords the preview's matching engine understands. Anything else
// (e.g. HasInfluence) is skipped, mirroring how the old line parser returned
// null for unknown conditions.
const SUPPORTED_CONDITIONS = new Set<ConditionType>([
  "BaseType",
  "Class",
  "Sockets",
  "Quality",
  "ItemLevel",
  "DropLevel",
  "AreaLevel",
  "GemLevel",
  "MapTier",
  "WaystoneTier",
  "StackSize",
  "Height",
  "Width",
  "BaseArmour",
  "BaseEnergyShield",
  "BaseEvasion",
  "UnidentifiedItemTier",
  "Rarity",
  "FracturedItem",
  "Mirrored",
  "Corrupted",
  "SynthesisedItem",
  "AnyEnchantment",
  "Identified",
  "HasVaalUniqueMod",
  "IsVaalUnique",
  "TwiceCorrupted",
  "AlwaysShow",
  "HasExplicitMod",
]);

// Action keywords the preview renders/considers. Others are ignored.
const SUPPORTED_ACTIONS = new Set<ActionType>([
  "SetFontSize",
  "PlayAlertSound",
  "MinimapIcon",
  "PlayEffect",
  "SetTextColor",
  "SetBorderColor",
  "SetBackgroundColor",
]);

/**
 * Parses filter text into the preview's rule model by reusing the shared
 * language-server AST parser, then projecting each Show/Hide/Minimal block onto
 * the {@link FilterRule} shape the preview engine expects.
 */
export function parseRules(input: string): FilterRule[] {
  const ast = new Parser(input).parse();
  return rulesFromAst(ast);
}

function rulesFromAst(ast: RootNode): FilterRule[] {
  const rules: FilterRule[] = [];

  for (const node of ast.children) {
    if (!isBlockNode(node)) {
      continue;
    }

    const rule: FilterRule = {
      // Keep the previous 0-based line index semantics used by "jump to rule".
      lineNumber: node.line - 1,
      conditions: [],
      actions: [],
      hasContinue: false,
      // Show and Minimal both render the item; only Hide hides it.
      isShow: node.type !== "Hide",
    };

    for (const child of node.body) {
      if (child.commented === true) {
        continue;
      }

      if (child.type === "Condition") {
        const condition = conditionFromNode(child);
        if (condition) {
          rule.conditions.push(condition);
        }
      } else if (child.type === "Action") {
        if (child.action === "Continue") {
          rule.hasContinue = true;
          continue;
        }
        const action = actionFromNode(child);
        if (action) {
          rule.actions.push(action);
        }
      }
    }

    rules.push(rule);
  }

  return rules;
}

function conditionFromNode(node: ConditionNode): FilterCondition | null {
  const type = node.condition as unknown as ConditionType;
  if (!SUPPORTED_CONDITIONS.has(type)) {
    return null;
  }

  const values = node.values.map((v) => String(v.value));
  const lineNumber = node.line - 1;

  // Rarity historically matched on membership only (the operator was dropped by
  // the line parser); preserve that to keep preview output stable.
  if (type === "Rarity") {
    return {
      type,
      values: values.filter((p) =>
        ["Normal", "Magic", "Rare", "Unique"].includes(p)
      ),
      lineNumber,
    };
  }

  if (type === "HasExplicitMod") {
    // Keep only the mod names (drop an optional "True" / count token).
    return {
      type,
      operator: node.operator,
      values: values.filter(
        (p) => p !== "True" && !/^(==|>=|<=|<|>)?\d+$/.test(p)
      ),
      lineNumber,
    };
  }

  return {
    type,
    operator: node.operator,
    values,
    lineNumber,
  };
}

function actionFromNode(node: ActionNode): FilterAction | null {
  const type = node.action as unknown as ActionType;
  if (!SUPPORTED_ACTIONS.has(type)) {
    return null;
  }

  return {
    type,
    values: node.values.map((v) => String(v.value)),
  };
}
