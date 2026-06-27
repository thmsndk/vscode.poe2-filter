import * as assert from "assert";
import { Parser } from "../language-server/ast/parser";
import { ActionType } from "../language-server/ast/actions";
import { ConditionType } from "../language-server/ast/conditions";
import {
  BlockNode,
  ConditionNode,
  ActionNode,
  ErrorNode,
  ImportNode,
} from "../language-server/ast/nodes";

suite("Parser Test Suite", () => {
  test("should parse a simple filter rule", () => {
    const input = `
Show # Basic currency
    BaseType "Chaos Orb"
    SetTextColor 255 0 0
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    assert.strictEqual(ast.type, "Root");
    assert.strictEqual(ast.children.length, 1);

    const block = ast.children[0] as BlockNode;
    assert.strictEqual(block.type, "Show");
    assert.strictEqual(block.inlineComment, "Basic currency");
    assert.strictEqual(block.body.length, 2);

    const condition = block.body[0] as ConditionNode;
    assert.strictEqual(condition.type, "Condition");
    assert.strictEqual(condition.condition, "BaseType");
    assert.deepStrictEqual(
      condition.values.map((v) => v.value),
      ["Chaos Orb"]
    );

    const action = block.body[1] as ActionNode;
    assert.strictEqual(action.type, "Action");
    assert.strictEqual(action.action, ActionType.SetTextColor);
    assert.deepStrictEqual(
      action.values.map((v) => v.value),
      [255, 0, 0]
    );
  });

  test("should parse special values correctly", () => {
    const input = `
Show
    Rarity Unique
    MinimapIcon 0 Red Star
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const block = ast.children[0] as BlockNode;
    const condition = block.body[0] as ConditionNode;
    const action = block.body[1] as ActionNode;

    assert.strictEqual(condition.type, "Condition");
    assert.strictEqual(condition.condition, "Rarity");
    assert.deepStrictEqual(
      condition.values.map((v) => v.value),
      ["Unique"]
    );

    assert.strictEqual(action.type, "Action");
    assert.strictEqual(action.action, ActionType.MinimapIcon);
    assert.deepStrictEqual(
      action.values.map((v) => v.value),
      [0, "Red", "Star"]
    );
  });

  test("should collect syntax errors", () => {
    const input = `
Show
    BaseType      # Missing value
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    assert.strictEqual(
      parser.diagnostics.length,
      1,
      "Expected exactly 1 error"
    );

    // Check error - BaseType missing value
    assert.strictEqual(parser.diagnostics[0].severity, "error");
    assert.strictEqual(
      parser.diagnostics[0].message,
      "Expected at least one value for condition BaseType",
      "Error should be about missing BaseType value"
    );
  });

  test("should accept numeric conditions without an operator (implicit ==)", () => {
    // PoE2 allows omitting the operator on numeric conditions; FilterBlade /
    // NeverSink filters use this form heavily (e.g. "GemLevel 19", "Sockets 0").
    const input = `
Show
    GemLevel 19
    Sockets 0
    Quality 0
    BaseArmour 0
    BaseEvasion 0
    BaseEnergyShield 0
    SetFontSize 18
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    assert.strictEqual(
      parser.diagnostics.length,
      0,
      "Operator-less numeric conditions should not produce diagnostics"
    );

    const block = ast.children[0] as BlockNode;
    const gemLevel = block.body[0] as ConditionNode;
    assert.strictEqual(gemLevel.condition, ConditionType.GemLevel);
    assert.strictEqual(gemLevel.operator, undefined);
    assert.strictEqual(gemLevel.values[0].value, 19);
  });

  test("should parse Continue action correctly", () => {
    const input = `
Show
    BaseType "Mirror"
    SetTextColor 255 0 0
    Continue    # Keep checking rules
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const block = ast.children[0] as BlockNode;
    assert.strictEqual(block.body.length, 3);

    const continueAction = block.body[2] as ActionNode;
    assert.strictEqual(continueAction.type, "Action");
    assert.strictEqual(continueAction.action, ActionType.Continue);
    assert.strictEqual(continueAction.values.length, 0);
    assert.strictEqual(continueAction.inlineComment, "Keep checking rules");
  });

  test("should parse a Continue in the middle of a block as its own action", () => {
    // A mid-block Continue is parsed without error; statements that follow it
    // are kept as separate nodes (the semantic validator flags them instead).
    const input = `
Show
    BaseType "Mirror"
    Continue
    SetFontSize 40
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    assert.strictEqual(parser.diagnostics.length, 0);

    const block = ast.children[0] as BlockNode;
    assert.deepStrictEqual(
      block.body.map((node) =>
        node.type === "Action"
          ? `Action:${(node as ActionNode).action}`
          : node.type === "Condition"
          ? `Condition:${(node as ConditionNode).condition}`
          : node.type
      ),
      ["Condition:BaseType", "Action:Continue", "Action:SetFontSize"]
    );
  });

  test("should error on Continue at root level", () => {
    const input = `
Continue
Show
    BaseType "Mirror"
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    assert.strictEqual(parser.diagnostics.length, 1);
    assert.strictEqual(
      parser.diagnostics[0].message,
      "Unexpected token at root level: ACTION"
    );
  });

  test("should create error node for invalid block keyword", () => {
    const input = `
Sho
    BaseType "Mirror"
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    // BaseType "Mirror" causes two additional errors because they are dangling
    assert.strictEqual(ast.children.length, 3);
    const errorNode = ast.children[0] as ErrorNode;
    assert.strictEqual(errorNode.type, "Error");
    assert.strictEqual(errorNode.token.type, "WORD");
    assert.strictEqual(errorNode.token.value, "Sho");
    assert.strictEqual(errorNode.line, 2);

    // Basic parser error without suggestions
    assert.strictEqual(parser.diagnostics.length, 3);
    assert.strictEqual(
      parser.diagnostics[0].message,
      "Unexpected token at root level: WORD"
    );
  });

  test("should parse inline commented conditions within active block", () => {
    const input = `
Show
    BaseType "Mirror"
    # BaseType "Chaos"    # Commented condition with inline comment`;

    const parser = new Parser(input);
    const ast = parser.parse();

    assert.strictEqual(
      parser.diagnostics.length,
      0,
      "Should have no parsing errors"
    );

    const block = ast.children[0] as BlockNode;
    assert.strictEqual(block.type, "Show");
    assert.strictEqual(block.commented, false);
    assert.strictEqual(block.body.length, 2);

    // Validate active condition
    const activeCondition = block.body[0] as ConditionNode;
    assert.strictEqual(activeCondition.type, "Condition");
    assert.strictEqual(activeCondition.condition, "BaseType");
    assert.deepStrictEqual(
      activeCondition.values.map((v) => v.value),
      ["Mirror"]
    );
    assert.strictEqual(activeCondition.commented, false);

    // Validate commented condition
    const commentedCondition = block.body[1] as ConditionNode;
    assert.strictEqual(commentedCondition.type, "Condition");
    assert.strictEqual(commentedCondition.condition, "BaseType");
    assert.deepStrictEqual(
      commentedCondition.values.map((v) => v.value),
      ["Chaos"]
    );
    assert.strictEqual(commentedCondition.commented, true);
    assert.strictEqual(
      commentedCondition.inlineComment,
      "Commented condition with inline comment"
    );
  });

  test("should parse fully commented blocks with nested comments", () => {
    const input = `
# Show                    # Commented block with inline comment
#     BaseType "Scroll"   # Part of commented block
#     SetTextColor 0 0 0  # Part of commented block`;

    const parser = new Parser(input);
    const ast = parser.parse();

    assert.strictEqual(
      parser.diagnostics.length,
      0,
      "Should have no parsing errors"
    );

    const commentedBlock = ast.children[0] as BlockNode;
    assert.strictEqual(commentedBlock.type, "Show");
    assert.strictEqual(commentedBlock.commented, true);
    assert.strictEqual(
      commentedBlock.inlineComment,
      "Commented block with inline comment"
    );

    // Validate nested commented statements
    assert.strictEqual(commentedBlock.body.length, 2);

    // Validate commented condition
    const condition = commentedBlock.body[0] as ConditionNode;
    assert.strictEqual(condition.type, "Condition");
    assert.strictEqual(condition.condition, "BaseType");
    assert.deepStrictEqual(
      condition.values.map((v) => v.value),
      ["Scroll"]
    );
    assert.strictEqual(condition.commented, true);
    assert.strictEqual(condition.inlineComment, "Part of commented block");

    // Validate commented action
    const action = commentedBlock.body[1] as ActionNode;
    assert.strictEqual(action.type, "Action");
    assert.strictEqual(action.action, "SetTextColor");
    assert.deepStrictEqual(
      action.values.map((v) => v.value),
      [0, 0, 0]
    );
    assert.strictEqual(action.commented, true);
    assert.strictEqual(action.inlineComment, "Part of commented block");
  });

  test("should detect missing values for conditions with correct line numbers", () => {
    const input = `
Show
    BaseType ==    # Missing value after operator
    SetFontSize 45
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    assert.strictEqual(
      parser.diagnostics.length,
      1,
      "Expected exactly 1 error"
    );

    // Check error - BaseType missing value
    const diagnostic = parser.diagnostics[0];
    assert.strictEqual(diagnostic.severity, "error");
    assert.strictEqual(
      diagnostic.message,
      "Expected at least one value for condition BaseType",
      "Error should be about missing BaseType value"
    );
    assert.strictEqual(
      diagnostic.line,
      3,
      "Error should point to the BaseType line"
    );
    assert.strictEqual(
      diagnostic.columnStart,
      14,
      "Error should point to the start of BaseType"
    );
  });
});

suite("Block Boundary Detection", () => {
  test("should keep comments between blocks out of the block bodies", () => {
    const input = `
Show
    BaseType "Mirror"


# Comment 1
# Comment 2

Show
    BaseType "Chaos"
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    // Comments between two blocks are their own top-level nodes (the blocks are
    // separated by the comments), not absorbed into the preceding block's body.
    const blocks = ast.children.filter(
      (c): c is BlockNode =>
        c.type === "Show" || c.type === "Hide" || c.type === "Minimal"
    );
    assert.strictEqual(blocks.length, 2, "Should have exactly 2 blocks");

    assert.strictEqual(
      blocks[0].body.length,
      1,
      "First block keeps only its own condition"
    );
    assert.strictEqual(
      blocks[1].body.length,
      1,
      "Second block keeps only its own condition"
    );

    assert.ok(
      ast.children.length > blocks.length,
      "Comments between blocks are preserved as top-level nodes"
    );
  });

});

suite("Import Statement", () => {
  test("should parse a top-level Import as an ImportNode", () => {
    const input = `Import "other.filter"\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    assert.strictEqual(ast.children.length, 1);
    const node = ast.children[0] as ImportNode;
    assert.strictEqual(node.type, "Import");
    assert.strictEqual(node.path.value, "other.filter");
    assert.strictEqual(node.optional, false);
    assert.strictEqual(
      parser.diagnostics.length,
      0,
      "Import should parse without diagnostics"
    );
  });

  test("should parse an Optional Import", () => {
    const input = `Import "maybe.filter" Optional\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const node = ast.children[0] as ImportNode;
    assert.strictEqual(node.type, "Import");
    assert.strictEqual(node.path.value, "maybe.filter");
    assert.strictEqual(node.optional, true);
    assert.strictEqual(parser.diagnostics.length, 0);
  });

  test("should error when Import has no path", () => {
    const input = `Import\n`;
    const parser = new Parser(input);
    parser.parse();

    assert.ok(
      parser.diagnostics.some((d) => /file path/i.test(d.message)),
      "Should report a missing file path"
    );
  });

  test("should keep parsing blocks after an Import", () => {
    const input = `Import "base.filter"\n\nShow\n    BaseType "Mirror"\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    assert.strictEqual(ast.children.length, 2);
    assert.strictEqual(ast.children[0].type, "Import");
    assert.strictEqual(ast.children[1].type, "Show");
  });
});
