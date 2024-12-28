import * as assert from "assert";
import { levenshteinDistance } from "../utils/stringUtils";

suite("String Utils Test Suite", () => {
  test("levenshteinDistance should return 0 for identical strings", () => {
    assert.strictEqual(levenshteinDistance("ItemLevel", "ItemLevel"), 0);
  });

  test("levenshteinDistance should return 1 for single character difference", () => {
    assert.strictEqual(levenshteinDistance("ItemLvel", "ItemLevel"), 1);
    assert.strictEqual(levenshteinDistance("cat", "bat"), 1);
  });

  test("levenshteinDistance should handle different length strings", () => {
    assert.strictEqual(levenshteinDistance("ItemLeve", "ItemLevel"), 1);
    assert.strictEqual(levenshteinDistance("ItemLevel", "ItemLevell"), 1);
  });

  test("levenshteinDistance should return correct distance for different strings", () => {
    assert.strictEqual(levenshteinDistance("Show", "Hide"), 4); // S→H, h→i, o→d, w→e
    assert.strictEqual(levenshteinDistance("ItemLevel", "GemLevel"), 2); // I→G, delete t
  });

  test("levenshteinDistance should handle empty strings", () => {
    assert.strictEqual(levenshteinDistance("", ""), 0);
    assert.strictEqual(levenshteinDistance("", "abc"), 3);
    assert.strictEqual(levenshteinDistance("abc", ""), 3);
  });

  test("levenshteinDistance should count all necessary substitutions", () => {
    assert.strictEqual(levenshteinDistance("cat", "dog"), 3); // c→d, a→o, t→g
    assert.strictEqual(levenshteinDistance("sitting", "kitten"), 3); // 's'→'k', 'i'→'e', delete 'g'
  });
});
