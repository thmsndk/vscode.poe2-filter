import * as assert from "assert";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { TextEdit } from "vscode-languageserver";
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

  test("adds a trailing space and reopens suggest after a condition keyword", () => {
    const item = completeAtEnd("    Rar").find((i) => i.label === "Rarity");
    assert.strictEqual(item?.insertText, "Rarity ");
    assert.strictEqual(item?.command?.command, "editor.action.triggerSuggest");
  });

  test("does not add a trailing space after a parameterless action", () => {
    const item = completeAtEnd("    Cont").find((i) => i.label === "Continue");
    assert.ok(item);
    assert.strictEqual(item?.insertText, undefined);
    assert.strictEqual(item?.command, undefined);
  });

  test("ranks common keywords like BaseType above niche ones", () => {
    const items = completeAtEnd("    Bas");
    const baseItems = items.filter((item) => item.label.startsWith("Base"));
    const ordered = [...baseItems]
      .sort((a, b) => (a.sortText ?? "").localeCompare(b.sortText ?? ""))
      .map((item) => item.label);
    assert.ok(baseItems.length > 1, "expected several Base* keywords");
    assert.strictEqual(ordered[0], "BaseType");
  });

  test("suggests Rarity values", () => {
    assert.deepStrictEqual(labels("    Rarity "), [
      "Normal",
      "Magic",
      "Rare",
      "Unique",
    ]);
  });

  test("orders Rarity values by rarity via sortText", () => {
    const items = completeAtEnd("    Rarity ");
    const ordered = [...items]
      .sort((a, b) => (a.sortText ?? "").localeCompare(b.sortText ?? ""))
      .map((item) => item.label);
    assert.deepStrictEqual(ordered, ["Normal", "Magic", "Rare", "Unique"]);
  });

  test("omits Rarity values already present on the line", () => {
    assert.deepStrictEqual(labels("    Rarity Normal "), [
      "Magic",
      "Rare",
      "Unique",
    ]);
  });

  test("still suggests the Rarity value currently being typed", () => {
    // "Normal" is already present; "Rare" is mid-typing and must stay offered.
    assert.deepStrictEqual(labels("    Rarity Normal Rare"), [
      "Magic",
      "Rare",
      "Unique",
    ]);
  });

  test("suggests True/False for boolean conditions", () => {
    assert.deepStrictEqual(labels("    Corrupted "), ["True", "False"]);
  });

  test("suggests labelled sizes for MinimapIcon's first parameter", () => {
    assert.deepStrictEqual(labels("    MinimapIcon "), ["0", "1", "2"]);
    const first = completeAtEnd("    MinimapIcon ")[0];
    assert.strictEqual(first.detail, "Small");
    assert.strictEqual(first.insertText, "0 ");
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

  test("completes BaseType names inside a quote and closes it", () => {
    const items = completeAtEnd('    BaseType "Ex', buildGameData());
    const exalted = items.find((item) => item.label === "Exalted Orb");
    assert.ok(exalted);
    // The fragment is replaced and the value is closed with a trailing space so
    // the next value can be typed immediately.
    assert.strictEqual(exalted?.textEdit?.newText, 'Exalted Orb" ');
  });

  test("consumes an auto-inserted closing quote so the cursor ends after it", () => {
    const provider = new CompletionProvider(buildGameData());
    // `    BaseType "Ex"` with the cursor between `Ex` and the closing quote.
    const document = TextDocument.create(
      "file:///test.filter",
      "poe2-filter",
      1,
      '    BaseType "Ex"'
    );
    const items = provider.provideCompletions(document, {
      textDocument: { uri: "file:///test.filter" },
      position: { line: 0, character: 16 },
    });
    const exalted = items.find((item) => item.label === "Exalted Orb");
    assert.ok(exalted);
    assert.strictEqual(exalted?.textEdit?.newText, 'Exalted Orb" ');
    const range = (exalted?.textEdit as TextEdit).range;
    // Replace range starts at the fragment and consumes the closing quote.
    assert.strictEqual(range.start.character, 14);
    assert.strictEqual(range.end.character, 17);
  });

  test("omits BaseType values already present on the line", () => {
    const items = completeAtEnd('    BaseType "Exalted Orb" "', buildGameData());
    const result = items.map((item) => item.label);
    assert.ok(
      !result.includes("Exalted Orb"),
      "should not re-suggest an existing BaseType"
    );
    assert.ok(result.includes("Chaos Orb"));
  });

  test("wraps Class names in quotes when not already quoted", () => {
    const items = completeAtEnd("    Class ", buildGameData());
    const currency = items.find((item) => item.label === "Currency");
    assert.strictEqual(currency?.insertText, '"Currency" ');
  });

  test("offers no keyword/value completions inside comments", () => {
    assert.deepStrictEqual(labels("# just a comment "), []);
  });

  test("sound completions only list folders that actually contain sounds", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "poe2-snd-"));
    try {
      fs.mkdirSync(path.join(root, "sounds"));
      fs.writeFileSync(path.join(root, "sounds", "beep.wav"), "x");
      fs.mkdirSync(path.join(root, "empty"));
      fs.writeFileSync(path.join(root, "empty", "readme.txt"), "x");
      fs.mkdirSync(path.join(root, ".git"));
      fs.writeFileSync(path.join(root, ".git", "hook.wav"), "x");

      const fsPath = path.join(root, "test.filter");
      const uri = "file:///" + fsPath.replace(/\\/g, "/").replace(/^\//, "");
      const provider = new CompletionProvider();
      const line = 'CustomAlertSound "';
      const document = TextDocument.create(uri, "poe2-filter", 1, line);
      const names = provider
        .provideCompletions(document, {
          textDocument: { uri },
          position: { line: 0, character: line.length },
        })
        .map((item) => item.label);

      assert.ok(names.includes("sounds"), "lists folders containing sounds");
      assert.ok(!names.includes("empty"), "hides folders without sounds");
      assert.ok(!names.includes(".git"), "hides hidden folders");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
