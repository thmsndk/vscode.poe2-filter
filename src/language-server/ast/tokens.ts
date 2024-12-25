export type TokenType =
  // Comments & Headers
  | "HEADER"
  | "COMMENT" // Regular full line comment
  | "INLINE_COMMENT" // Comment after code
  | "COMMENTED_BLOCK" // Commented out Show/Hide/Continue
  | "COMMENTED_CONDITION" // Commented out condition
  | "COMMENTED_ACTION" // Commented out action

  // Structure
  | "NEWLINE"

  // Block Keywords
  | "SHOW"
  | "HIDE"
  | "CONTINUE"

  // Commands
  | "CONDITION" // BaseType, Class, ItemLevel, etc.
  | "ACTION" // SetTextColor, PlayAlertSound, etc.

  // Values
  | "QUOTED_STRING" // "Perfect Mirror"
  | "WORD" // Mirror, Divine (unquoted item names)
  | "NUMBER" // 255, 45
  | "BOOLEAN" // True, False

  // Special Values (for specific conditions/actions)
  | "RARITY" // Normal, Magic, Rare, Unique
  | "COLOR" // Red, Green, Blue, etc.
  | "SHAPE" // Circle, Diamond, Hexagon, etc.

  // Operators
  | "OPERATOR" // ==, >=, <=, <, >

  // Special
  | "EOF";

// Header metadata
export interface HeaderInfo {
  level: number; // 1,2,3... (section depth)
  text: string; // Header text content
  id?: number; // Optional section ID (for [[1000]] or [1005])
  style: {
    border?: string; // '=', '-', or '#'
    idStyle?: "single" | "double"; // '[1005]' vs '[[1000]]'
    isMarkdown: boolean;
  };
}

// Supported enums for special values
export enum RarityValue {
  Normal = "Normal",
  Magic = "Magic",
  Rare = "Rare",
  Unique = "Unique",
}

export enum ColorValue {
  Red = "Red",
  Green = "Green",
  Blue = "Blue",
  Brown = "Brown",
  White = "White",
  Yellow = "Yellow",
  Cyan = "Cyan",
  Grey = "Grey",
  Orange = "Orange",
  Pink = "Pink",
  Purple = "Purple",
}

export enum ShapeValue {
  Circle = "Circle",
  Diamond = "Diamond",
  Hexagon = "Hexagon",
  Square = "Square",
  Star = "Star",
  Triangle = "Triangle",
  Cross = "Cross",
  Moon = "Moon",
  Raindrop = "Raindrop",
  Kite = "Kite",
  Pentagon = "Pentagon",
  UpsideDownHouse = "UpsideDownHouse",
}

// Token interface
export interface Token {
  type: TokenType;
  value:
    | string
    | number
    | boolean
    | HeaderInfo
    | RarityValue
    | ColorValue
    | ShapeValue;
  start: number;
  end: number;
  line: number;
  column: number;
}
