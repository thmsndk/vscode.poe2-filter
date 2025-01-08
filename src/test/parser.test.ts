import * as assert from "assert";
import { Parser } from "../language-server/ast/parser";
import { ActionType } from "../language-server/ast/actions";
import { ConditionType } from "../language-server/ast/conditions";
import {
  BlockNode,
  ConditionNode,
  ActionNode,
  ErrorNode,
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
    assert.deepStrictEqual(condition.values, ["Chaos Orb"]);

    const action = block.body[1] as ActionNode;
    assert.strictEqual(action.type, "Action");
    assert.strictEqual(action.action, ActionType.SetTextColor);
    assert.deepStrictEqual(action.values, [255, 0, 0]);
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
    assert.deepStrictEqual(condition.values, ["Unique"]);

    assert.strictEqual(action.type, "Action");
    assert.strictEqual(action.action, ActionType.MinimapIcon);
    assert.deepStrictEqual(action.values, [0, "Red", "Star"]);
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
      "Expected at least one value for condition",
      "Error should be about missing BaseType value"
    );
  });

  test("should parse Continue action correctly", () => {
    // TODO: What actually happens if we have a Continue in the middle of a block?
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
    assert.deepStrictEqual(activeCondition.values, ["Mirror"]);
    assert.strictEqual(activeCondition.commented, false);

    // Validate commented condition
    const commentedCondition = block.body[1] as ConditionNode;
    assert.strictEqual(commentedCondition.type, "Condition");
    assert.strictEqual(commentedCondition.condition, "BaseType");
    assert.deepStrictEqual(commentedCondition.values, ["Chaos"]);
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
    assert.deepStrictEqual(condition.values, ["Scroll"]);
    assert.strictEqual(condition.commented, true);
    assert.strictEqual(condition.inlineComment, "Part of commented block");

    // Validate commented action
    const action = commentedBlock.body[1] as ActionNode;
    assert.strictEqual(action.type, "Action");
    assert.strictEqual(action.action, "SetTextColor");
    assert.deepStrictEqual(action.values, [0, 0, 0]);
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
  test.skip("should associate all content between block statements with first block", () => {
    const input = `
Show # First block
    BaseType "Mirror"
    SetTextColor 255 0 0
    # Random comment
    #SetBackgroundColor 0 0 0

# Random comment between blocks
# Another comment

Show # Second block
    BaseType "Chaos Orb"
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    // TODO: This should result in 2 blocks seperated by two comments or headers

    assert.strictEqual(ast.children.length, 2, "Should have exactly 2 blocks");

    const block1 = ast.children[0] as BlockNode;
    assert.strictEqual(
      block1.body.length,
      5,
      "First block should include comments and all actions"
    );
    assert.strictEqual(block1.inlineComment, "First block");

    // Verify standalone comments are attached to first block
    const commentAction = block1.body[3] as ActionNode;
    assert.strictEqual(commentAction.type, "Comment");
    assert.strictEqual(commentAction.values[0], "Random comment");

    const block2 = ast.children[1] as BlockNode;
    assert.strictEqual(block2.body.length, 1);
    assert.strictEqual(block2.inlineComment, "Second block");
  });

  test("should handle empty lines and comments between blocks", () => {
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
    // TODO: This should result in 2 blocks seperated by two comments

    assert.strictEqual(ast.children.length, 2);
    const block1 = ast.children[0] as BlockNode;
    assert.strictEqual(
      block1.body.length,
      3,
      "Should include empty lines and comments"
    );
  });

  test.skip("should handle mixed commented and uncommented content between blocks", () => {
    const input = `
Show # Currency
    BaseType "Mirror"
    SetTextColor 255 0 0
    #SetBackgroundColor 0 0 0
    # Comment within block
    Continue

    # Floating comment
    #MinimapIcon 1 Yellow Diamond
    SetFontSize 45

Show # Weapons
    Class "Dagger"
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    assert.strictEqual(ast.children.length, 2);

    const block1 = ast.children[0] as BlockNode;
    assert.strictEqual(
      block1.body.length,
      8,
      "Should include all content until next Show"
    );

    // Verify the "floating" content is attached to first block
    const floatingComment = block1.body[6] as ActionNode;
    assert.strictEqual(floatingComment.type, "Comment");
    assert.strictEqual(floatingComment.values[0], "Floating comment");

    const floatingAction = block1.body[7] as ActionNode;
    assert.strictEqual(floatingAction.type, "Action");
    assert.strictEqual(floatingAction.action, ActionType.SetFontSize);
  });

  test.skip("should handle commented blocks with content between them", () => {
    const input = `
#Show # First
#    BaseType "Mirror"

    # Floating comment
    SetFontSize 45

#Show # Second
#    BaseType "Chaos"
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    assert.strictEqual(
      ast.children.length,
      2,
      "Should have two commented blocks"
    );

    const block1 = ast.children[0] as BlockNode;
    assert.strictEqual(block1.commented, true);
    assert.strictEqual(
      block1.body.length,
      3,
      "Should include floating content"
    );

    const block2 = ast.children[1] as BlockNode;
    assert.strictEqual(block2.commented, true);
    assert.strictEqual(block2.body.length, 1);
  });
});
