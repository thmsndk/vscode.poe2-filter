import * as assert from "assert";
import { Parser } from "../language-server/ast/parser";
import { SemanticValidator } from "../language-server/validation/semanticValidator";

suite("Semantic Validator Test Suite", () => {
  test("should suggest similar block keywords for misspellings", () => {
    const input = `
Sho
    BaseType "Mirror"
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator();
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

    const validator = new SemanticValidator();
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

    const validator = new SemanticValidator();
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

    const validator = new SemanticValidator();
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

    const validator = new SemanticValidator();
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

    const validator = new SemanticValidator();
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      "Value 999 out of range [0,255] for parameter Red"
    );
    assert.strictEqual(validator.diagnostics[0].line, 3);
  });
});
