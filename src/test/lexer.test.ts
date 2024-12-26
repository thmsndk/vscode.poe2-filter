import * as assert from "assert";
import { Lexer } from "../language-server/ast/lexer";

suite("Lexer Test Suite", () => {
  test("should tokenize a simple filter rule", () => {
    const input = `
Show # Basic currency
    BaseType "Chaos Orb"
    SetTextColor 255 0 0
`;

    const lexer = new Lexer(input);
    const tokens = [];
    let token;

    do {
      token = lexer.nextToken();
      tokens.push(token);
    } while (token.type !== "EOF");

    assert.deepStrictEqual(
      tokens.map((t) => t.type),
      [
        "NEWLINE",
        "SHOW",
        "INLINE_COMMENT",
        "NEWLINE",
        "CONDITION",
        "QUOTED_STRING",
        "NEWLINE",
        "ACTION",
        "NUMBER",
        "NUMBER",
        "NUMBER",
        "NEWLINE",
        "EOF",
      ]
    );

    const quotedString = tokens.find((t) => t.type === "QUOTED_STRING");
    assert.strictEqual(quotedString?.value, "Chaos Orb");
  });

  test("should tokenize a section header", () => {
    const input = `
#===============================================================================================================
# [[1000]] Currency
#===============================================================================================================
`;

    const lexer = new Lexer(input);
    const tokens = [];
    let token;

    do {
      token = lexer.nextToken();
      tokens.push(token);
    } while (token.type !== "EOF");

    const headerTokens = tokens.filter((t) => t.type === "HEADER");
    assert.strictEqual(headerTokens.length, 1);
    assert.deepStrictEqual(headerTokens[0].value, {
      level: 1,
      text: "Currency",
      id: 1000,
      style: {
        border: "=",
        idStyle: "double",
        isMarkdown: false,
      },
    });
  });

  test("should tokenize commented code correctly", () => {
    const input = `
Show
    BaseType "Mirror"
    # BaseType "Chaos"    # Commented condition with inline comment
# Show                    # Commented block with inline comment
#     BaseType "Scroll"   # Part of commented block
#     SetTextColor 0 0 0  # Part of commented block
`;

    const lexer = new Lexer(input);
    const tokens = [];
    let token;

    do {
      token = lexer.nextToken();
      tokens.push(token);
    } while (token.type !== "EOF");

    assert.deepStrictEqual(
      tokens.map((t) => t.type),
      [
        "NEWLINE",
        "SHOW",
        "NEWLINE",
        "CONDITION",
        "QUOTED_STRING",
        "NEWLINE",
        "COMMENTED_CONDITION",
        "INLINE_COMMENT",
        "NEWLINE",
        "COMMENTED_BLOCK",
        "INLINE_COMMENT",
        "NEWLINE",
        "COMMENTED_CONDITION",
        "INLINE_COMMENT",
        "NEWLINE",
        "COMMENTED_ACTION",
        "INLINE_COMMENT",
        "NEWLINE",
        "EOF",
      ]
    );
  });

  test("should tokenize special values correctly", () => {
    const input = `
Show
    Rarity Unique
    MinimapIcon 0 Red Star
    MinimapIcon 1 Green Circle
    MinimapIcon 2 Blue Diamond
`;

    const lexer = new Lexer(input);
    const tokens = [];
    let token;

    do {
      token = lexer.nextToken();
      tokens.push(token);
    } while (token.type !== "EOF");

    assert.deepStrictEqual(
      tokens.map((t) => t.type),
      [
        "NEWLINE",
        "SHOW",
        "NEWLINE",
        "CONDITION",
        "RARITY",
        "NEWLINE",
        "ACTION",
        "NUMBER",
        "COLOR",
        "SHAPE",
        "NEWLINE",
        "ACTION",
        "NUMBER",
        "COLOR",
        "SHAPE",
        "NEWLINE",
        "ACTION",
        "NUMBER",
        "COLOR",
        "SHAPE",
        "NEWLINE",
        "EOF",
      ]
    );

    // Check specific values
    const rarityToken = tokens.find((t) => t.type === "RARITY");
    assert.strictEqual(rarityToken?.value, "Unique");

    const colorTokens = tokens.filter((t) => t.type === "COLOR");
    assert.deepStrictEqual(
      colorTokens.map((t) => t.value),
      ["Red", "Green", "Blue"]
    );

    const shapeTokens = tokens.filter((t) => t.type === "SHAPE");
    assert.deepStrictEqual(
      shapeTokens.map((t) => t.value),
      ["Star", "Circle", "Diamond"]
    );
  });
});
