import * as assert from "assert";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  SemanticTokensProvider,
  semanticTokensLegend,
} from "../language-server/providers/semanticTokensProvider";
import { Parser } from "../language-server/ast/parser";

suite("Semantic Tokens Provider Test Suite", () => {
  const provider = new SemanticTokensProvider();

  /** Returns the source substrings that were emitted as semantic tokens. */
  const taggedSegments = (text: string): string[] => {
    const document = TextDocument.create(
      "file:///test.filter",
      "poe2-filter",
      1,
      text
    );
    const { data } = provider.provideSemanticTokens(document);
    const lines = text.split("\n");

    const segments: string[] = [];
    let line = 0;
    let char = 0;
    for (let i = 0; i < data.length; i += 5) {
      const deltaLine = data[i];
      const deltaChar = data[i + 1];
      const length = data[i + 2];
      line += deltaLine;
      char = deltaLine === 0 ? char + deltaChar : deltaChar;
      segments.push(lines[line].substr(char, length));
    }
    return segments;
  };

  test("tags commented-out blocks, conditions, and actions (with values)", () => {
    const segments = taggedSegments(
      ["#Show", '#    BaseType "Chaos"', "#    SetFontSize 40"].join("\n")
    );
    assert.deepStrictEqual(segments, [
      "#Show",
      "#    BaseType",
      '"Chaos"',
      "#    SetFontSize",
      "40",
    ]);
  });

  test("does not tag prose comments or section headers", () => {
    assert.deepStrictEqual(taggedSegments("# just a normal comment"), []);
    assert.deepStrictEqual(taggedSegments("#### Section Header ####"), []);
  });

  test("does not tag a trailing inline comment on a disabled line", () => {
    const segments = taggedSegments('#    BaseType "Chaos"   # why disabled');
    assert.deepStrictEqual(segments, ["#    BaseType", '"Chaos"']);
  });

  test("does not tag active (non-commented) code", () => {
    assert.deepStrictEqual(
      taggedSegments(['Show', '    BaseType "Mirror"'].join("\n")),
      []
    );
  });
});

suite("Semantic Tokens - Rarity coloring", () => {
  const provider = new SemanticTokensProvider();

  /** Returns each emitted token as its source substring and resolved type. */
  const tagged = (text: string): { text: string; type: string }[] => {
    const document = TextDocument.create(
      "file:///test.filter",
      "poe2-filter",
      1,
      text
    );
    const ast = new Parser(text).parse();
    const { data } = provider.provideSemanticTokens(document, ast);
    const lines = text.split("\n");

    const out: { text: string; type: string }[] = [];
    let line = 0;
    let char = 0;
    for (let i = 0; i < data.length; i += 5) {
      const deltaLine = data[i];
      line += deltaLine;
      char = deltaLine === 0 ? char + data[i + 1] : data[i + 1];
      out.push({
        text: lines[line].substr(char, data[i + 2]),
        type: semanticTokensLegend.tokenTypes[data[i + 3]],
      });
    }
    return out;
  };

  test("colors each Rarity value by its rarity type", () => {
    assert.deepStrictEqual(tagged("Show\n    Rarity Normal Magic Rare\n"), [
      { text: "Normal", type: "rarityNormal" },
      { text: "Magic", type: "rarityMagic" },
      { text: "Rare", type: "rarityRare" },
    ]);
  });

  test("colors a Rarity value used with an operator", () => {
    assert.deepStrictEqual(tagged("Show\n    Rarity <= Unique\n"), [
      { text: "Unique", type: "rarityUnique" },
    ]);
  });

  test("does not color rarity words outside a Rarity condition", () => {
    const result = tagged('Show\n    BaseType "Normal Boots"\n');
    assert.ok(!result.some((token) => token.type.startsWith("rarity")));
  });

  test("treats a commented-out Rarity line as commented code, not rarity", () => {
    const result = tagged("#    Rarity Rare\n");
    assert.ok(result.length > 0);
    assert.ok(result.every((token) => token.type === "commentedCode"));
  });
});
