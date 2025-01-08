import { RarityValue } from "./tokens";

export enum ConditionType {
  AlternateQuality = "AlternateQuality",
  AnyEnchantment = "AnyEnchantment",
  ArchnemesisMod = "ArchnemesisMod",
  AreaLevel = "AreaLevel",
  BaseArmour = "BaseArmour",
  BaseDefencePercentile = "BaseDefencePercentile",
  BaseEnergyShield = "BaseEnergyShield",
  BaseEvasion = "BaseEvasion",
  BaseType = "BaseType",
  BaseWard = "BaseWard",
  BlightedMap = "BlightedMap",
  Class = "Class",
  Corrupted = "Corrupted",
  CorruptedMods = "CorruptedMods",
  DropLevel = "DropLevel",
  ElderItem = "ElderItem",
  ElderMap = "ElderMap",
  EnchantmentPassiveNode = "EnchantmentPassiveNode",
  EnchantmentPassiveNum = "EnchantmentPassiveNum",
  FracturedItem = "FracturedItem",
  GemLevel = "GemLevel",
  GemQualityType = "GemQualityType",
  HasCruciblePassiveTree = "HasCruciblePassiveTree",
  HasEaterOfWorldsImplicit = "HasEaterOfWorldsImplicit",
  HasEnchantment = "HasEnchantment",
  HasExplicitMod = "HasExplicitMod",
  HasImplicitMod = "HasImplicitMod",
  HasInfluence = "HasInfluence",
  HasSearingExarchImplicit = "HasSearingExarchImplicit",
  Height = "Height",
  Identified = "Identified",
  ItemLevel = "ItemLevel",
  LinkedSockets = "LinkedSockets",
  Mirrored = "Mirrored",
  Quality = "Quality",
  Rarity = "Rarity",
  Replica = "Replica",
  Scourged = "Scourged",
  ShapedMap = "ShapedMap",
  ShaperItem = "ShaperItem",
  SocketGroup = "SocketGroup",
  Sockets = "Sockets",
  StackSize = "StackSize",
  SynthesisedItem = "SynthesisedItem",
  TransfiguredGem = "TransfiguredGem",
  UberBlightedMap = "UberBlightedMap",
  Width = "Width",
  WaystoneTier = "WaystoneTier",
}

export interface ConditionSyntax {
  type: ConditionType;
  valueType: "string" | "number" | "boolean" | "array" | "rarity";
  operatorBehavior: {
    allowed: boolean;
    optional?: boolean; // If true, condition can be used with or without operator
    allowedOperators?: string[]; // List of allowed operators, if restricted
  };
  valueSyntax: {
    multiValue?: boolean; // Can accept multiple values
    allowSpaceSeparated?: boolean; // Values can be space-separated without quotes
    allowQuoted?: boolean; // Values can be quoted
    range?: { min: number; max?: number };
    enumValues?: Record<string, number>; // For ordinal enums like Rarity
  };
  description: string;
}

// Create ordinal mapping from RarityValue enum
const RarityOrdinal: Record<RarityValue, number> = {
  [RarityValue.Normal]: 0,
  [RarityValue.Magic]: 1,
  [RarityValue.Rare]: 2,
  [RarityValue.Unique]: 3,
};

export const ConditionSyntaxMap: Record<ConditionType, ConditionSyntax> = {
  [ConditionType.BaseType]: {
    type: ConditionType.BaseType,
    valueType: "string",
    operatorBehavior: {
      allowed: true,
      optional: true,
      allowedOperators: ["=="],
    },
    valueSyntax: {
      multiValue: true,
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Matches item's base type (e.g., 'Siege Axe', 'Leather Belt')",
  },
  [ConditionType.Class]: {
    type: ConditionType.Class,
    valueType: "string",
    operatorBehavior: {
      allowed: true,
      optional: true,
      allowedOperators: ["=="],
    },
    valueSyntax: {
      multiValue: true,
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Matches item's class (e.g., 'Bow', 'Ring', 'Map')",
  },
  [ConditionType.ItemLevel]: {
    type: ConditionType.ItemLevel,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {
      range: { min: 0 },
    },
    description: "Item's level (determines mod tiers that can roll)",
  },
  [ConditionType.Sockets]: {
    type: ConditionType.Sockets,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {
      range: { min: 0, max: 6 },
    },
    description: "Number of sockets in the item",
  },
  [ConditionType.LinkedSockets]: {
    type: ConditionType.LinkedSockets,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {
      range: { min: 0, max: 6 },
    },
    description: "Number of linked sockets in the item's largest link group",
  },
  [ConditionType.SocketGroup]: {
    type: ConditionType.SocketGroup,
    valueType: "string",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["=="],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Specific socket color combinations (e.g., 'RGB', 'WWWW')",
  },
  [ConditionType.Rarity]: {
    type: ConditionType.Rarity,
    valueType: "rarity",
    operatorBehavior: {
      allowed: true,
      optional: true,
      allowedOperators: ["==", "<", "<=", ">", ">="],
    },
    valueSyntax: {
      multiValue: true, // For space-separated list without operators
      allowSpaceSeparated: true,
      allowQuoted: true,
      enumValues: RarityOrdinal,
    },
    description:
      "Item's rarity (Normal < Magic < Rare < Unique). Can use comparison operators or space-separated list.",
  },
  [ConditionType.DropLevel]: {
    type: ConditionType.DropLevel,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {
      range: { min: 1, max: 100 },
    },
    description: "Required level to equip/use the item",
  },
  [ConditionType.Quality]: {
    type: ConditionType.Quality,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {
      range: { min: 0 },
    },
    description: "Item's quality percentage",
  },
  [ConditionType.GemLevel]: {
    type: ConditionType.GemLevel,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {
      range: { min: 1, max: 21 },
    },
    description: "Skill gem's level",
  },
  [ConditionType.StackSize]: {
    type: ConditionType.StackSize,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {},
    description: "Size of item stack (for currency, cards, etc.)",
  },
  [ConditionType.AreaLevel]: {
    type: ConditionType.AreaLevel,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {},
    description: "Current area's monster level",
  },
  [ConditionType.BaseDefencePercentile]: {
    type: ConditionType.BaseDefencePercentile,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {
      range: { min: 0, max: 100 },
    },
    description: "Percentile rank of item's base defence values",
  },
  [ConditionType.BaseArmour]: {
    type: ConditionType.BaseArmour,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {},
    description: "Item's base armour value",
  },
  [ConditionType.BaseEnergyShield]: {
    type: ConditionType.BaseEnergyShield,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {},
    description: "Item's base energy shield value",
  },
  [ConditionType.BaseEvasion]: {
    type: ConditionType.BaseEvasion,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {},
    description: "Item's base evasion value",
  },
  [ConditionType.BaseWard]: {
    type: ConditionType.BaseWard,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {},
    description: "Item's base ward value",
  },
  [ConditionType.Width]: {
    type: ConditionType.Width,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: true,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {
      range: { min: 1, max: 2 },
    },
    description: "Item's width in inventory slots",
  },
  [ConditionType.Height]: {
    type: ConditionType.Height,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: true,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {
      range: { min: 1, max: 4 },
    },
    description: "Item's height in inventory slots",
  },
  [ConditionType.AlternateQuality]: {
    type: ConditionType.AlternateQuality,
    valueType: "boolean",
    operatorBehavior: {
      allowed: false,
      optional: false,
      allowedOperators: [],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Item has alternate quality",
  },
  [ConditionType.AnyEnchantment]: {
    type: ConditionType.AnyEnchantment,
    valueType: "boolean",
    operatorBehavior: {
      allowed: false,
      optional: false,
      allowedOperators: [],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Item has any enchantment",
  },
  [ConditionType.ArchnemesisMod]: {
    type: ConditionType.ArchnemesisMod,
    valueType: "string",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["=="],
    },
    valueSyntax: {
      multiValue: true,
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Archnemesis modifier on the item",
  },
  [ConditionType.BlightedMap]: {
    type: ConditionType.BlightedMap,
    valueType: "boolean",
    operatorBehavior: {
      allowed: false,
      optional: false,
      allowedOperators: [],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Map is blighted",
  },
  [ConditionType.UberBlightedMap]: {
    type: ConditionType.UberBlightedMap,
    valueType: "boolean",
    operatorBehavior: {
      allowed: false,
      optional: false,
      allowedOperators: [],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Map is uber blighted",
  },
  [ConditionType.Corrupted]: {
    type: ConditionType.Corrupted,
    valueType: "boolean",
    operatorBehavior: {
      allowed: false,
      optional: false,
      allowedOperators: [],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Item is corrupted",
  },
  [ConditionType.CorruptedMods]: {
    type: ConditionType.CorruptedMods,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {},
    description: "Number of corrupted modifiers",
  },
  [ConditionType.ElderItem]: {
    type: ConditionType.ElderItem,
    valueType: "boolean",
    operatorBehavior: {
      allowed: false,
      optional: false,
      allowedOperators: [],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Item has Elder influence",
  },
  [ConditionType.ElderMap]: {
    type: ConditionType.ElderMap,
    valueType: "boolean",
    operatorBehavior: {
      allowed: false,
      optional: false,
      allowedOperators: [],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Map is influenced by the Elder",
  },
  [ConditionType.EnchantmentPassiveNode]: {
    type: ConditionType.EnchantmentPassiveNode,
    valueType: "string",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["=="],
    },
    valueSyntax: {
      multiValue: true,
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Specific passive skill granted by enchantment",
  },
  [ConditionType.EnchantmentPassiveNum]: {
    type: ConditionType.EnchantmentPassiveNum,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {},
    description: "Number of passive skills granted by enchantment",
  },
  [ConditionType.FracturedItem]: {
    type: ConditionType.FracturedItem,
    valueType: "boolean",
    operatorBehavior: {
      allowed: false,
      optional: false,
      allowedOperators: [],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Item has at least one fractured modifier",
  },
  [ConditionType.GemQualityType]: {
    type: ConditionType.GemQualityType,
    valueType: "string",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["=="],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description:
      "Gem's quality type (Superior, Anomalous, Divergent, Phantasmal)",
  },
  [ConditionType.HasCruciblePassiveTree]: {
    type: ConditionType.HasCruciblePassiveTree,
    valueType: "boolean",
    operatorBehavior: {
      allowed: false,
      optional: false,
      allowedOperators: [],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Item has Crucible passive tree",
  },
  [ConditionType.HasEaterOfWorldsImplicit]: {
    type: ConditionType.HasEaterOfWorldsImplicit,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {},
    description: "Number of Eater of Worlds implicit modifiers",
  },
  [ConditionType.HasEnchantment]: {
    type: ConditionType.HasEnchantment,
    valueType: "boolean",
    operatorBehavior: {
      allowed: false,
      optional: false,
      allowedOperators: [],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Item has a lab enchantment",
  },
  [ConditionType.HasExplicitMod]: {
    type: ConditionType.HasExplicitMod,
    valueType: "string",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["=="],
    },
    valueSyntax: {
      multiValue: true,
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Item has specific explicit modifier",
  },
  [ConditionType.HasImplicitMod]: {
    type: ConditionType.HasImplicitMod,
    valueType: "string",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["=="],
    },
    valueSyntax: {
      multiValue: true,
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Item has specific implicit modifier",
  },
  [ConditionType.HasInfluence]: {
    type: ConditionType.HasInfluence,
    valueType: "string",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["=="],
    },
    valueSyntax: {
      multiValue: true,
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description:
      "Item has influence type (Shaper, Elder, Crusader, Redeemer, Hunter, Warlord)",
  },
  [ConditionType.HasSearingExarchImplicit]: {
    type: ConditionType.HasSearingExarchImplicit,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: false,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {},
    description: "Number of Searing Exarch implicit modifiers",
  },
  [ConditionType.Identified]: {
    type: ConditionType.Identified,
    valueType: "boolean",
    operatorBehavior: {
      allowed: false,
      optional: false,
      allowedOperators: [],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Item is identified",
  },
  [ConditionType.Mirrored]: {
    type: ConditionType.Mirrored,
    valueType: "boolean",
    operatorBehavior: {
      allowed: false,
      optional: false,
      allowedOperators: [],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Item is mirrored",
  },
  [ConditionType.Replica]: {
    type: ConditionType.Replica,
    valueType: "boolean",
    operatorBehavior: {
      allowed: false,
      optional: false,
      allowedOperators: [],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Item is a Heist replica",
  },
  [ConditionType.Scourged]: {
    type: ConditionType.Scourged,
    valueType: "boolean",
    operatorBehavior: {
      allowed: false,
      optional: false,
      allowedOperators: [],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Item is scourged (corrupted in nightmare)",
  },
  [ConditionType.SynthesisedItem]: {
    type: ConditionType.SynthesisedItem,
    valueType: "boolean",
    operatorBehavior: {
      allowed: false,
      optional: false,
      allowedOperators: [],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Item is synthesised",
  },
  [ConditionType.ShaperItem]: {
    type: ConditionType.ShaperItem,
    valueType: "boolean",
    operatorBehavior: {
      allowed: false,
      optional: false,
      allowedOperators: [],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Item has Shaper influence",
  },
  [ConditionType.ShapedMap]: {
    type: ConditionType.ShapedMap,
    valueType: "boolean",
    operatorBehavior: {
      allowed: false,
      optional: false,
      allowedOperators: [],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Map is shaped",
  },
  [ConditionType.TransfiguredGem]: {
    type: ConditionType.TransfiguredGem,
    valueType: "boolean",
    operatorBehavior: {
      allowed: false,
      optional: false,
      allowedOperators: [],
    },
    valueSyntax: {
      allowSpaceSeparated: true,
      allowQuoted: true,
    },
    description: "Gem is transfigured (from Forbidden Sanctum)",
  },
  [ConditionType.WaystoneTier]: {
    type: ConditionType.WaystoneTier,
    valueType: "number",
    operatorBehavior: {
      allowed: true,
      optional: true,
      allowedOperators: ["==", "<=", ">=", "<", ">"],
    },
    valueSyntax: {
      range: { min: 1, max: 16 },
    },
    description: "Waystone's tier level",
  },
};
