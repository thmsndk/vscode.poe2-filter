import * as assert from "assert";
import { TextDocument } from "vscode-languageserver-textdocument";
import { SignatureHelpProvider } from "../language-server/providers/signatureHelpProvider";

suite("Signature Help Provider Test Suite", () => {
  const provider = new SignatureHelpProvider();

  /** Returns signature help with the cursor placed at the end of `line`. */
  const helpAtEnd = (line: string) => {
    const document = TextDocument.create(
      "file:///test.filter",
      "poe2-filter",
      1,
      line
    );
    return provider.provideSignatureHelp(document, {
      textDocument: { uri: "file:///test.filter" },
      position: { line: 0, character: line.length },
    });
  };

  test("shows the SetTextColor signature with the first parameter active", () => {
    const help = helpAtEnd("    SetTextColor ");
    assert.ok(help);
    assert.strictEqual(
      help.signatures[0].label,
      "SetTextColor Red Green Blue [Alpha]"
    );
    assert.strictEqual(help.activeParameter, 0);
  });

  test("advances the active parameter as values are typed", () => {
    assert.strictEqual(helpAtEnd("    SetTextColor 255 ")?.activeParameter, 1);
    assert.strictEqual(
      helpAtEnd("    SetTextColor 255 0 0 ")?.activeParameter,
      3
    );
  });

  test("highlights the Shape parameter for MinimapIcon", () => {
    const help = helpAtEnd("    MinimapIcon 1 Red ");
    assert.ok(help);
    assert.strictEqual(help.signatures[0].label, "MinimapIcon Size Color Shape");
    assert.strictEqual(help.activeParameter, 2);
  });

  test("works on a disabled (commented) action line", () => {
    const help = helpAtEnd("    # SetFontSize ");
    assert.ok(help);
    assert.strictEqual(help.activeParameter, 0);
  });

  test("returns null for non-actions and parameterless actions", () => {
    assert.strictEqual(helpAtEnd('    BaseType "'), null);
    assert.strictEqual(helpAtEnd("    Continue"), null);
  });
});
