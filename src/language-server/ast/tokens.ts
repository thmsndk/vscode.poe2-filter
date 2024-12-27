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
  | "MINIMAL"
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
  | "UNKNOWN"
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

// Add new enum for named sounds
export enum SoundNameValue {
  ShAlchemy = "ShAlchemy",
  ShBlessed = "ShBlessed",
  ShChaos = "ShChaos",
  ShDivine = "ShDivine",
  ShExalted = "ShExalted",
  ShFusing = "ShFusing",
  ShGeneral = "ShGeneral",
  ShMirror = "ShMirror",
  ShRegal = "ShRegal",
  ShVaal = "ShVaal",
}

/**
 * Represents a token in the source code with position information
 */
export interface Token {
  /** The type of token */
  type: TokenType;
  /**
   * The value of the token, which can be one of several types:
   * - string: Raw string value
   * - number: Numeric value
   * - boolean: Boolean value
   * - HeaderInfo: Header metadata
   * - RarityValue: Item rarity enum value
   * - ColorValue: Color name enum value
   * - ShapeValue: Shape name enum value
   */
  value:
    | string
    | number
    | boolean
    | HeaderInfo
    | RarityValue
    | ColorValue
    | ShapeValue;
  /** Absolute character offset from start of document */
  start: number;
  /** Absolute character offset from start of document */
  end: number;
  /** Position in line */
  line: number; // 1-based line number
  /** 1-based starting character position in line */
  columnStart: number;
  /** 1-based ending character position in line */
  columnEnd: number;
}
