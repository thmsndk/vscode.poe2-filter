import * as assert from "assert";
import * as path from "path";
import { Parser } from "../language-server/ast/parser";
import { SemanticValidator } from "../language-server/validation/semanticValidator";
import { GameDataService } from "../services/gameDataService";

const mockGameData = new GameDataService();
// mockGameData.loadData("test/data");

suite("Semantic Validator Test Suite", () => {
  test("should suggest similar block keywords for misspellings", () => {
    const input = `
Sho
    BaseType "Mirror"
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      'Invalid block keyword "Sho". Did you mean: Show?'
    );
    assert.strictEqual(validator.diagnostics[0].line, 2);
  });

  test("should suggest similar condition keywords for misspellings", () => {
    const input = `
Show
    ItemLvel 68
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      'Unknown condition "ItemLvel". Did you mean: ItemLevel, GemLevel?'
    );
    assert.strictEqual(validator.diagnostics[0].line, 3);
  });

  test("should suggest similar action keywords for misspellings", () => {
    const input = `
Show
    SetBackgroundColr Brown
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      'Unknown action "SetBackgroundColr". Did you mean: SetBackgroundColor?'
    );
    assert.strictEqual(validator.diagnostics[0].line, 3);
  });

  test("should report unknown condition/action without suggestions", () => {
    const input = `
Show
    UnknownConditionOrAction
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      'Unknown keyword "UnknownConditionOrAction"'
    );
    assert.strictEqual(validator.diagnostics[0].line, 3);
  });

  test("should suggest both condition and action keywords when applicable", () => {
    const input = `
Show
    Size
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      'Unknown keyword "Size". Did you mean: StackSize, SetFontSize?'
    );
    assert.strictEqual(validator.diagnostics[0].line, 3);
  });

  test("should validate color values", () => {
    const input = `
Show
    SetTextColor 999 0 0  # Invalid color value
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      "Value 999 out of range [0,255] for parameter Red"
    );
    assert.strictEqual(validator.diagnostics[0].line, 3);
  });

  test("should report error for actions after Continue", () => {
    const mockGameData = new GameDataService();
    mockGameData.baseItemTypes = [
      { Name: "Mirror", Id: "Mirror", ItemClass: 1, DropLevel: 1 },
    ];

    const input = `
Show
    BaseType "Mirror"
    Continue
    SetBackgroundColor 0 0 0  # Should be invalid - no active block
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      "Action not allowed after Continue statement"
    );
    assert.strictEqual(validator.diagnostics[0].line, 5);
  });

  test("should report error for conditions after Continue", () => {
    const mockGameData = new GameDataService();
    mockGameData.baseItemTypes = [
      { Name: "Mirror", Id: "Mirror", ItemClass: 1, DropLevel: 1 },
    ];

    const input = `
Show
    BaseType "Mirror"
    Continue
    ItemLevel > 68  # Should be invalid - no active block
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      "Condition not allowed after Continue statement"
    );
    assert.strictEqual(validator.diagnostics[0].line, 5);
  });

  test("should correctly calculate positions for BaseType validation", () => {
    const input = `
Show
    BaseType == "Wrong Item" "Another Wrong"`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 2);

    // First value position
    assert.deepStrictEqual(
      {
        message: validator.diagnostics[0].message,
        line: 3,
        columnStart: 15,
        columnEnd: 26,
      },
      {
        message: 'BaseType "Wrong Item" not found',
        line: 3,
        columnStart: 15,
        columnEnd: 26,
      }
    );

    // Second value position
    assert.deepStrictEqual(
      {
        message: validator.diagnostics[1].message,
        line: 3,
        columnStart: 27,
        columnEnd: 41,
      },
      {
        message: 'BaseType "Another Wrong" not found',
        line: 3,
        columnStart: 27,
        columnEnd: 41,
      }
    );
  });

  test("should correctly calculate positions for Class validation", () => {
    const input = `
Show
    Class "Wrong Class" "Another Wrong Class"`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 2);

    // First value position
    assert.deepStrictEqual(
      {
        message: validator.diagnostics[0].message,
        line: 3,
        columnStart: 10,
        columnEnd: 22,
      },
      {
        message: 'Class "Wrong Class" not found',
        line: 3,
        columnStart: 10,
        columnEnd: 22,
      }
    );

    // Second value position
    assert.deepStrictEqual(
      {
        message: validator.diagnostics[1].message,
        line: 3,
        columnStart: 23,
        columnEnd: 43,
      },
      {
        message: 'Class "Another Wrong Class" not found',
        line: 3,
        columnStart: 23,
        columnEnd: 43,
      }
    );
  });

  test("should report duplicate values in Class condition", () => {
    const mockGameData = new GameDataService();
    mockGameData.itemClasses = [
      { Name: "Bow", _index: 0, Id: "Bow" },
      { Name: "Sword", _index: 1, Id: "Sword" },
    ];

    const input = `
Show
    Class "Bow" "Sword" "Bow"
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.deepStrictEqual(
      {
        message: validator.diagnostics[0].message,
        line: 3,
        columnStart: 23,
        columnEnd: 28,
      },
      {
        message: 'Duplicate value "Bow" in Class condition',
        line: 3,
        columnStart: 23,
        columnEnd: 28,
      }
    );
  });

  test("should report duplicate values in BaseType condition", () => {
    const mockGameData = new GameDataService();
    mockGameData.baseItemTypes = [
      { Name: "Mirror", Id: "Mirror", ItemClass: 1, DropLevel: 1 },
      { Name: "Mirror", Id: "Mirror", ItemClass: 1, DropLevel: 1 },
    ];

    const input = `
Show
    BaseType "Mirror" "Mirror"
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.deepStrictEqual(
      {
        message: validator.diagnostics[0].message,
        line: 3,
        columnStart: 21,
        columnEnd: 29,
      },
      {
        message: 'Duplicate value "Mirror" in BaseType condition',
        line: 3,
        columnStart: 21,
        columnEnd: 29,
      }
    );
  });
});

suite("Import Validation", () => {
  test("warns when a non-Optional import is missing", () => {
    const input = `Import "definitely-missing-xyz.filter"\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData, __filename);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.match(
      validator.diagnostics[0].message,
      /Imported filter not found/
    );
    assert.strictEqual(validator.diagnostics[0].severity, "warning");
  });

  test("does not warn for Optional imports", () => {
    const input = `Import "definitely-missing-xyz.filter" Optional\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData, __filename);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 0);
  });

  test("does not warn when the imported file exists", () => {
    const input = `Import "${path.basename(__filename)}"\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData, __filename);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 0);
  });
});

suite("Boolean Condition Hints", () => {
  test('suggests the simpler form for "Corrupted != True"', () => {
    const input = `\nShow\n    Corrupted != True\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      '"Corrupted != True" is confusing. Use "Corrupted False" instead.'
    );
    assert.strictEqual(validator.diagnostics[0].severity, "warning");
  });

  test('suggests the simpler form for "Mirrored ! False"', () => {
    const input = `\nShow\n    Mirrored ! False\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      '"Mirrored ! False" is confusing. Use "Mirrored True" instead.'
    );
  });

  test("does not warn for the plain boolean form", () => {
    const input = `\nShow\n    Corrupted True\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 0);
  });
});

suite("HasExplicitMod Validation", () => {
  test("flags a space between the operator and count", () => {
    const input = `\nShow\n    HasExplicitMod >= 6 "Mod"\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      'HasExplicitMod requires no space between the operator and number. Use ">=6".'
    );
    assert.strictEqual(validator.diagnostics[0].severity, "error");
  });

  test("accepts the glued operator/count form", () => {
    const input = `\nShow\n    HasExplicitMod >=6 "Mod"\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 0);
    assert.strictEqual(parser.diagnostics.length, 0);
  });

  test("accepts a mod list with no count", () => {
    const input = `\nShow\n    HasExplicitMod "Mod A" "Mod B"\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 0);
    assert.strictEqual(parser.diagnostics.length, 0);
  });
});

suite("Disabled-value Actions", () => {
  test('does not validate parameters for "PlayAlertSound None"', () => {
    const input = `\nShow\n    PlayAlertSound None\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 0);
  });

  test('does not validate parameters for "PlayEffect None"', () => {
    const input = `\nShow\n    PlayEffect None\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 0);
  });
});

suite("CustomAlertSound Validation", () => {
  test("errors when a CustomAlertSound file is missing", () => {
    const input = `\nShow\n    CustomAlertSound "definitely-missing-xyz.wav"\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData, __filename);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.match(validator.diagnostics[0].message, /Sound file not found/);
    assert.strictEqual(validator.diagnostics[0].severity, "error");
  });

  test("warns (not errors) for a missing CustomAlertSoundOptional file", () => {
    const input = `\nShow\n    CustomAlertSoundOptional "definitely-missing-xyz.wav"\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData, __filename);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(validator.diagnostics[0].severity, "warning");
  });

  test('skips validation when the sound is disabled with "None"', () => {
    const input = `\nShow\n    CustomAlertSound None\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData, __filename);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 0);
  });

  test("does not warn when the sound file exists", () => {
    const input = `\nShow\n    CustomAlertSound "${path.basename(__filename)}"\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData, __filename);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 0);
  });

  suite("PlayEffect Temp keyword", () => {
    const validate = (line: string) => {
      const ast = new Parser(`\nShow\n    ${line}\n`).parse();
      const validator = new SemanticValidator(mockGameData);
      validator.validate(ast);
      return validator.diagnostics;
    };

    test("accepts the literal Temp keyword", () => {
      assert.deepStrictEqual(validate("PlayEffect Red Temp"), []);
    });

    test("accepts PlayEffect without the optional Temp keyword", () => {
      assert.deepStrictEqual(validate("PlayEffect Red"), []);
    });

    test("rejects any other word in place of Temp", () => {
      const diagnostics = validate("PlayEffect Red Foo");
      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(
        diagnostics[0].message,
        'Invalid value "Foo" for PlayEffect. Expected "Temp"'
      );
    });
  });
});
