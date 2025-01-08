import * as assert from "assert";
import { Lexer } from "../language-server/ast/lexer";
import { HeaderInfo } from "../language-server/ast/tokens";

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

  // TODO: We want more explicit tests for commented code also this belongs in the Comment Handling suite
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
        "QUOTED_STRING",
        "INLINE_COMMENT",
        "NEWLINE",
        "COMMENTED_BLOCK",
        "INLINE_COMMENT",
        "NEWLINE",
        "COMMENTED_CONDITION",
        "QUOTED_STRING",
        "INLINE_COMMENT",
        "NEWLINE",
        "COMMENTED_ACTION",
        "NUMBER",
        "NUMBER",
        "NUMBER",
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

  test("should handle comments after section headers correctly", () => {
    const input = `## Scroll of Wisdom
Show # Scroll of Wisdom below lvl 10 is important
    BaseType "Mirror"`;

    const lexer = new Lexer(input);
    const tokens = [];
    let token;

    do {
      token = lexer.nextToken();
      tokens.push(token);
    } while (token.type !== "EOF");

    // First token should be a header
    assert.strictEqual(tokens[0].type, "HEADER");

    // Show token
    assert.strictEqual(tokens[1].type, "SHOW");

    // Comment after Show should be a regular comment
    const commentToken = tokens.find((t) => t.type === "INLINE_COMMENT");
    assert.strictEqual(
      commentToken?.value,
      "Scroll of Wisdom below lvl 10 is important"
    );
  });

  test("should handle border lines with markdown level indicators", () => {
    const input = `## ---------------
# Section Title
## ---------------
Show
    BaseType "Mirror"`;

    const lexer = new Lexer(input);
    const tokens = [];
    let token;

    do {
      token = lexer.nextToken();
      tokens.push(token);
    } while (token.type !== "EOF");

    assert.strictEqual(tokens[0].type, "HEADER");
    const header = tokens[0].value as HeaderInfo;
    assert.strictEqual(header.style.border, "-");
    assert.strictEqual(header.level, 2);
    assert.strictEqual(header.text, "Section Title");
  });
});

suite("Comment Handling Test Suite", () => {
  test("should handle single line comments as markdown headers", () => {
    const input = `# Just a comment`;
    const lexer = new Lexer(input);
    const tokens = [];
    let token;

    do {
      token = lexer.nextToken();
      tokens.push(token);
    } while (token.type !== "EOF");

    assert.deepStrictEqual(
      tokens.map((t) => t.type),
      ["HEADER", "EOF"]
    );
  });

  test("should handle Double commented comments in block", () => {
    const input = `
# Show                         # block comment
#     #SetFontSize 40          # Double commented action
#     SetBorderColor 0 150 0   # Single commented action within block
#     Continue                 # Block level comment
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
        "COMMENTED_BLOCK",
        "INLINE_COMMENT",
        "NEWLINE",
        "COMMENTED_ACTION",
        "NUMBER",
        "INLINE_COMMENT",
        "NEWLINE",
        "COMMENTED_ACTION",
        "NUMBER",
        "NUMBER",
        "NUMBER",
        "INLINE_COMMENT",
        "NEWLINE",
        "COMMENTED_ACTION",
        "INLINE_COMMENT",
        "NEWLINE",
        "EOF",
      ]
    );
  });

  test("should handle mixed active and commented blocks", () => {
    const input = `
Show
    BaseType "Mirror"
    # Show                     # Nested commented block
    #     BaseType "Chaos"    # Nested condition
    #     SetFontSize 40      # Nested action
    SetBackgroundColor 0 0 0   # This should still be part of the outer Show
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
        "COMMENTED_BLOCK",
        "INLINE_COMMENT",
        "NEWLINE",
        "COMMENTED_CONDITION",
        "QUOTED_STRING",
        "INLINE_COMMENT",
        "NEWLINE",
        "COMMENTED_ACTION",
        "NUMBER",
        "INLINE_COMMENT",
        "NEWLINE",
        "ACTION",
        "NUMBER",
        "NUMBER",
        "NUMBER",
        "INLINE_COMMENT",
        "NEWLINE",
        "EOF",
      ]
    );
  });

  test("should handle inline comments containing condition keywords", () => {
    const input = `Show # Salvageable Quality Normal items
    Quality > 0
    Rarity Normal
    SetBorderColor 200 200 200 255
    SetFontSize 30
    Continue
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
        "SHOW",
        "INLINE_COMMENT",
        "NEWLINE",
        "CONDITION",
        "OPERATOR",
        "NUMBER",
        "NEWLINE",
        "CONDITION",
        "RARITY",
        "NEWLINE",
        "ACTION",
        "NUMBER",
        "NUMBER",
        "NUMBER",
        "NUMBER",
        "NEWLINE",
        "ACTION",
        "NUMBER",
        "NEWLINE",
        "ACTION",
        "NEWLINE",
        "EOF",
      ]
    );

    // Verify the inline comment is preserved correctly
    const commentToken = tokens.find((t) => t.type === "INLINE_COMMENT");
    assert.strictEqual(commentToken?.value, "Salvageable Quality Normal items");
  });
});
