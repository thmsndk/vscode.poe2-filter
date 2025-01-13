import * as assert from "assert";
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
