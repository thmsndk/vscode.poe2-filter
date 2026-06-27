import * as assert from "assert";
import { TextDocument } from "vscode-languageserver-textdocument";
import { SemanticTokensProvider } from "../language-server/providers/semanticTokensProvider";

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
