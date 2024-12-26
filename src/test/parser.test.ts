import * as assert from "assert";
import { Parser } from "../language-server/ast/parser";
import { ActionType } from "../language-server/ast/actions";
import { ConditionType } from "../language-server/ast/conditions";
import {
  BlockNode,
  ConditionNode,
  ActionNode,
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

  test("should parse commented blocks and statements", () => {
    const input = `
Show
    BaseType "Mirror"
    # BaseType "Chaos"    # Commented condition with inline comment
# Show                    # Commented block with inline comment
#     BaseType "Scroll"   # Part of commented block
#     SetTextColor 0 0 0  # Part of commented block
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    assert.strictEqual(ast.children.length, 2); // One regular block, one commented block

    const regularBlock = ast.children[0] as BlockNode;
    assert.strictEqual(regularBlock.type, "Show");
    assert.strictEqual(regularBlock.commented, false);
    assert.strictEqual(regularBlock.body.length, 2);

    const commentedCondition = regularBlock.body[1] as ConditionNode;
    assert.strictEqual(commentedCondition.type, "Condition");
    assert.strictEqual(commentedCondition.commented, true);
    assert.strictEqual(
      commentedCondition.inlineComment,
      "Commented condition with inline comment"
    );

    const commentedBlock = ast.children[1] as BlockNode;
    assert.strictEqual(commentedBlock.type, "Show");
    assert.strictEqual(commentedBlock.commented, true);
    assert.strictEqual(
      commentedBlock.inlineComment,
      "Commented block with inline comment"
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
    assert.deepStrictEqual(condition.values, ["Unique"]);

    assert.strictEqual(action.type, "Action");
    assert.strictEqual(action.action, ActionType.MinimapIcon);
    assert.deepStrictEqual(action.values, [0, "Red", "Star"]);
  });

  test("should collect syntax errors", () => {
    const input = `
Show
    BaseType      # Missing value
    SetTextColor 999 0 0  # Invalid color value
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    assert.strictEqual(parser.diagnostics.length, 2);
    assert.strictEqual(parser.diagnostics[0].severity, "error");
    assert.strictEqual(parser.diagnostics[1].severity, "error");
  });
});
