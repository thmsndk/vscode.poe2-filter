import * as assert from "assert";
import {
  parseRules,
  generateItemFromRule,
  wouldRuleMatchItem,
} from "../parser/filterRuleEngine";

suite("Preview Rule Engine (AST-backed)", () => {
  test("projects a Show block onto the preview rule model", () => {
    const rules = parseRules(
      [
        "Show",
        '    BaseType "Mirror" "Exalted Orb"',
        "    ItemLevel >= 50",
        "    Corrupted True",
        "    SetFontSize 40",
        "    SetTextColor 255 0 0",
      ].join("\n")
    );

    assert.strictEqual(rules.length, 1);
    const rule = rules[0];
    assert.strictEqual(rule.isShow, true);
    assert.strictEqual(rule.hasContinue, false);

    const baseType = rule.conditions.find((c) => c.type === "BaseType");
    assert.deepStrictEqual(baseType?.values, ["Mirror", "Exalted Orb"]);

    const itemLevel = rule.conditions.find((c) => c.type === "ItemLevel");
    assert.strictEqual(itemLevel?.operator, ">=");
    assert.deepStrictEqual(itemLevel?.values, ["50"]);

    const corrupted = rule.conditions.find((c) => c.type === "Corrupted");
    assert.deepStrictEqual(corrupted?.values, ["True"]);

    assert.deepStrictEqual(
      rule.actions.map((a) => a.type),
      ["SetFontSize", "SetTextColor"]
    );
  });

  test("flags Continue and treats Hide/Minimal visibility correctly", () => {
    const rules = parseRules(
      [
        "Show",
        '    BaseType "Gold"',
        "    Continue",
        "",
        "Hide",
        '    BaseType "Scroll"',
        "",
        "Minimal",
        '    BaseType "Wisdom"',
      ].join("\n")
    );

    assert.strictEqual(rules.length, 3);
    assert.strictEqual(rules[0].hasContinue, true);
    assert.strictEqual(rules[0].isShow, true);
    assert.strictEqual(rules[1].isShow, false); // Hide
    assert.strictEqual(rules[2].isShow, true); // Minimal still renders
  });

  test("skips conditions the preview engine does not model", () => {
    const rules = parseRules(
      ["Show", '    BaseType "Gold"', "    HasInfluence Shaper"].join("\n")
    );

    assert.strictEqual(rules.length, 1);
    assert.deepStrictEqual(
      rules[0].conditions.map((c) => c.type),
      ["BaseType"]
    );
  });

  test("generated representative item matches its own rule", () => {
    const rules = parseRules(
      ["Show", '    BaseType "Exalted Orb"', "    ItemLevel >= 10"].join("\n")
    );

    const item = generateItemFromRule(rules[0]);
    assert.strictEqual(wouldRuleMatchItem(rules[0], item), true);
  });
});
