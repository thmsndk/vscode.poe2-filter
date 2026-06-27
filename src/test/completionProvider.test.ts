import * as assert from "assert";
import { TextDocument } from "vscode-languageserver-textdocument";
import { CompletionProvider } from "../language-server/providers/completionProvider";
import { GameDataService } from "../services/gameDataService";

suite("Completion Provider Test Suite", () => {
  const buildGameData = () => {
    const gameData = new GameDataService();
    gameData.itemClasses = [{ _index: 0, Id: "Currency", Name: "Currency" }];
    gameData.baseItemTypes = [
      { Id: "Exalted Orb", Name: "Exalted Orb", ItemClass: 0, DropLevel: 1 },
      { Id: "Chaos Orb", Name: "Chaos Orb", ItemClass: 0, DropLevel: 1 },
    ];
    return gameData;
  };

  const completeAtEnd = (line: string, gameData?: GameDataService) => {
    const provider = new CompletionProvider(gameData);
    const document = TextDocument.create(
      "file:///test.filter",
      "poe2-filter",
      1,
      line
    );
    return provider.provideCompletions(document, {
      textDocument: { uri: "file:///test.filter" },
      position: { line: 0, character: line.length },
    });
  };

  const labels = (line: string, gameData?: GameDataService) =>
    completeAtEnd(line, gameData).map((item) => item.label);

  test("suggests block, condition, and action keywords for the first token", () => {
    const result = labels("    Se");
    assert.ok(result.includes("Show"));
    assert.ok(result.includes("BaseType"));
    assert.ok(result.includes("SetTextColor"));
  });

  test("suggests Rarity values", () => {
    assert.deepStrictEqual(labels("    Rarity "), [
      "Normal",
      "Magic",
      "Rare",
      "Unique",
    ]);
  });

  test("suggests True/False for boolean conditions", () => {
    assert.deepStrictEqual(labels("    Corrupted "), ["True", "False"]);
  });

  test("suggests colors then shapes for MinimapIcon parameters", () => {
    assert.ok(labels("    MinimapIcon 1 ").includes("Red"));
    assert.ok(labels("    MinimapIcon 1 Red ").includes("Circle"));
  });

  test("suggests the Temp keyword for PlayEffect's second parameter", () => {
    assert.deepStrictEqual(labels("    PlayEffect Red "), ["Temp"]);
  });

  test("does not suggest values for numeric action parameters", () => {
    assert.deepStrictEqual(labels("    SetTextColor "), []);
  });

  test("completes BaseType names from game data inside a quote", () => {
    const items = completeAtEnd('    BaseType "Ex', buildGameData());
    const exalted = items.find((item) => item.label === "Exalted Orb");
    assert.ok(exalted);
    // Only the fragment after the quote is replaced.
    assert.strictEqual(exalted?.textEdit?.newText, "Exalted Orb");
  });

  test("wraps Class names in quotes when not already quoted", () => {
    const items = completeAtEnd("    Class ", buildGameData());
    const currency = items.find((item) => item.label === "Currency");
    assert.strictEqual(currency?.insertText, '"Currency"');
  });

  test("offers no keyword/value completions inside comments", () => {
    assert.deepStrictEqual(labels("# just a comment "), []);
  });
});
