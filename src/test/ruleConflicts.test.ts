import * as assert from "assert";
import { Parser } from "../language-server/ast/parser";
import { FilterRuleEngine } from "../language-server/analysis/ruleEngine";
import { BlockNode } from "../language-server/ast/nodes";

suite("Rule Conflict Detection Tests", () => {
  test("should detect basic rule conflict with identical conditions and overlapping conditions", () => {
    const input = `
Show
    BaseType "Gold"
    StackSize >= 1000
    SetFontSize 45

Show
    BaseType "Gold"
    StackSize >= 2000
    SetFontSize 45`;

    const parser = new Parser(input);
    const ast = parser.parse();
    const engine = new FilterRuleEngine(ast);
    const conflicts = engine.detectConflicts();

    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(
      conflicts[0].message,
      'Rule may never trigger because it would be caught by an earlier rule with BaseType "Gold", StackSize >= 1000'
    );
    assert.strictEqual((conflicts[0].node as BlockNode).line, 7);
  });

  test("should detect conflicts with area level conditions", () => {
    const input = `
Show
    Class "Currency"
    BaseType "Scroll of Wisdom"
    AreaLevel > 10
    SetFontSize 15

Hide
    Class "Currency"
    BaseType "Scroll of Wisdom"
    AreaLevel > 15`;

    const parser = new Parser(input);
    const ast = parser.parse();
    const engine = new FilterRuleEngine(ast);
    const conflicts = engine.detectConflicts();

    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(
      conflicts[0].message,
      'Rule may never trigger because it would be caught by an earlier rule with Class "Currency", BaseType "Scroll of Wisdom", AreaLevel > 10'
    );
  });

  test("Rarity Normal Magic should conflict with Rarity Normal", () => {
    const input = `
Show
    Rarity Normal
    SetFontSize 45

Show
    Rarity Normal Magic
    SetFontSize 40`;

    const parser = new Parser(input);
    const ast = parser.parse();
    const engine = new FilterRuleEngine(ast);
    const conflicts = engine.detectConflicts();

    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(
      conflicts[0].message,
      "Rule may never trigger because it would be caught by an earlier rule with Rarity Normal"
    );
  });

  test("should not detect conflict when numeric conditions cover different ranges >=", () => {
    const input = `
Show
    ItemLevel >= 65
    Rarity Normal
    Class "Body Armours"
    SetBorderColor 100 100 100 150

Show
    Rarity Normal
    Class "Body Armours"
    SetBorderColor 100 100 100 150`;

    const parser = new Parser(input);
    const ast = parser.parse();
    const engine = new FilterRuleEngine(ast);
    const conflicts = engine.detectConflicts();

    assert.strictEqual(
      conflicts.length,
      0,
      "First rule matches ItemLevel >= 65 and second rule matches ItemLevel < 65"
    );
  });

  test("should not detect conflict when numeric conditions cover different ranges <", () => {
    const input = `
Show
    ItemLevel < 65
    Rarity Normal
    Class "Body Armours"
    SetBorderColor 100 100 100 150

Show
    Rarity Normal
    Class "Body Armours"
    SetBorderColor 100 100 100 150`;

    const parser = new Parser(input);
    const ast = parser.parse();
    const engine = new FilterRuleEngine(ast);
    const conflicts = engine.detectConflicts();

    assert.strictEqual(
      conflicts.length,
      0,
      "First rule matches ItemLevel < 65 and second rule matches ItemLevel >= 65"
    );
  });
});

suite("Rule Conflict Detection - Continue Blocks", () => {
  test("should not report conflict when Continue is present", () => {
    const input = `
Show
    BaseType "Chaos Orb"
    SetFontSize 45
    Continue

Show
    BaseType "Chaos Orb"
    SetFontSize 40`;

    const parser = new Parser(input);
    const ast = parser.parse();
    const engine = new FilterRuleEngine(ast);
    const conflicts = engine.detectConflicts();

    assert.strictEqual(conflicts.length, 0);
  });

  test("should not report conflict when rules properly chain with Continue", () => {
    const input = `
Show
    BaseType "Chaos Orb"
    Continue

Show
    Rarity Rare
    SetFontSize 40

Show
    ItemLevel >= 75
    SetFontSize 45`;

    const parser = new Parser(input);
    const ast = parser.parse();
    const engine = new FilterRuleEngine(ast);
    const conflicts = engine.detectConflicts();

    assert.strictEqual(conflicts.length, 0);
  });

  test("should detect conflict where third rule is caught by second rule after Continue", () => {
    const input = `
Show
    BaseType "Chaos Orb"
    Continue

Show
    ItemLevel >= 60
    SetFontSize 45

Show # This should conflict as it's caught by the previous rule
    ItemLevel >= 75
    SetFontSize 40`;

    const parser = new Parser(input);
    const ast = parser.parse();
    const engine = new FilterRuleEngine(ast);
    const conflicts = engine.detectConflicts();

    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(
      conflicts[0].message,
      "Rule may never trigger because it would be caught by an earlier rule with ItemLevel >= 60"
    );
  });

  test("should detect conflict with combined conditions from Continue", () => {
    const input = `
Show
    BaseType "Chaos Orb"
    Continue

Show
    ItemLevel >= 60
    SetFontSize 45

Show # This should conflict as it matches both previous conditions
    BaseType "Chaos Orb"
    ItemLevel >= 75
    SetFontSize 40`;

    const parser = new Parser(input);
    const ast = parser.parse();
    const engine = new FilterRuleEngine(ast);
    const conflicts = engine.detectConflicts();

    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(
      conflicts[0].message,
      'Rule may never trigger because it would be caught by an earlier rule with BaseType "Chaos Orb", ItemLevel >= 60'
    );
  });

  // This test needs in-game validation
  test("should handle Show/Hide interaction with Continue", () => {
    const input = `
Show
    BaseType "Chaos Orb"
    Continue

Hide
    ItemLevel < 50
    SetFontSize 45

Show
    BaseType "Chaos Orb"
    ItemLevel >= 60
    SetFontSize 40`;

    const parser = new Parser(input);
    const ast = parser.parse();
    const engine = new FilterRuleEngine(ast);
    const conflicts = engine.detectConflicts();

    // TODO: Validate this behavior in-game
    // Currently marking as pending until we confirm the correct behavior
    assert.strictEqual(conflicts.length, 0);
  });
});
