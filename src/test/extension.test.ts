import * as assert from "assert";
import * as vscode from "vscode";
import { FilterFormatter } from "../formatter/formatter";

suite("Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  test("Formatter Test - Basic Formatting", async () => {
    // Create a test document
    const document = await vscode.workspace.openTextDocument({
      content: 'Show\nBaseType "Mirror"\nSetTextColor 255 0 0 255\n',
      language: "poe2-filter",
    });

    const formatter = new FilterFormatter();
    const formatted = await formatter.format(document);

    // Expected format with default settings (4 spaces)
    const expected =
      "Show\n" + '    BaseType "Mirror"\n' + "    SetTextColor 255 0 0 255\n";

    assert.strictEqual(formatted, expected);
  });

  test("Formatter Test - Multiple Blocks", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: 'Show\nBaseType "Mirror"\n\nHide\nBaseType "Scroll"\n',
      language: "poe2-filter",
    });

    const formatter = new FilterFormatter();
    const formatted = await formatter.format(document);

    const expected =
      "Show\n" +
      '    BaseType "Mirror"\n' +
      "\n" +
      "Hide\n" +
      '    BaseType "Scroll"\n';

    assert.strictEqual(formatted, expected);
  });

  test("Formatter Test - Comments", async () => {
    const document = await vscode.workspace.openTextDocument({
      content:
        '#Currency\nShow\nBaseType "Mirror"\n# Currency\nShow\nBaseType "Mirror"\n',
      language: "poe2-filter",
    });

    const formatter = new FilterFormatter();
    const formatted = await formatter.format(document);

    const expected =
      "# Currency\n" +
      "Show\n" +
      '    BaseType "Mirror"\n' +
      "\n# Currency\n" +
      "Show\n" +
      '    BaseType "Mirror"\n';

    assert.strictEqual(formatted, expected);
  });

  test("formats inlinecomments correctly", async () => {
    const formatter = new FilterFormatter();
    const input = `
#Comment
Show
BaseType "Mirror of Kalandra"
Hide #Something
ItemLevel < 50 #inline comment
Hide # Something else
    ItemLevel < 50 # another inline comment
#--------------------------
# Test Section
#--------------------------`.trim();

    const expected =
      `
#Comment
Show
    BaseType "Mirror of Kalandra"

Hide # Something
    ItemLevel < 50 # inline comment

Hide # Something else
    ItemLevel < 50 # another inline comment

#--------------------------
# Test Section
#--------------------------`.trim() + "\n";

    const result = await formatter.format({
      getText: () => input,
    } as vscode.TextDocument);

    assert.strictEqual(result, expected);
  });
});
