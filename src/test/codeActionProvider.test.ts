import * as assert from "assert";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  CodeAction,
  CodeActionParams,
  Diagnostic,
  DiagnosticTag,
  Range,
  TextEdit,
} from "vscode-languageserver";
import { CodeActionProvider } from "../language-server/providers/codeActionProvider";

const URI = "file:///test.filter";

suite("Code Action Provider Test Suite", () => {
  const provider = new CodeActionProvider();

  const makeDocument = (text: string): TextDocument =>
    TextDocument.create(URI, "poe2-filter", 1, text);

  const getActions = (
    document: TextDocument,
    range: Range,
    diagnostics: Diagnostic[] = []
  ): CodeAction[] => {
    const params: CodeActionParams = {
      textDocument: { uri: URI },
      range,
      context: { diagnostics },
    };
    return provider.provideCodeActions(document, params);
  };

  /** Applies an action's edits to its document and returns the resulting text. */
  const applyAction = (document: TextDocument, action: CodeAction): string => {
    const edits = action.edit?.changes?.[URI] ?? [];
    return TextDocument.applyEdits(document, edits as TextEdit[]);
  };

  suite("Remove dead code", () => {
    const deadDiagnostic = (line: number, character: number): Diagnostic => ({
      source: "poe-filter-ls-semanticValidator",
      tags: [DiagnosticTag.Unnecessary],
      message: 'Duplicate action "SetFontSize": only the last is applied',
      range: Range.create(line, character, line, character + 11),
    });

    test("offers a removal that deletes the whole dead statement line", () => {
      const text = "Show\n    SetFontSize 30\n    SetFontSize 40\n";
      const document = makeDocument(text);
      const diagnostic = deadDiagnostic(1, 4);

      const actions = getActions(document, Range.create(1, 4, 1, 4), [
        diagnostic,
      ]);
      const remove = actions.find((a) => a.title === "Remove dead code");

      assert.ok(remove, "expected a 'Remove dead code' action");
      assert.strictEqual(
        applyAction(document, remove),
        "Show\n    SetFontSize 40\n"
      );
    });

    test("ignores value-level fades that do not start the line", () => {
      // Range starts mid-line (the BaseType value), not at the first token.
      const text = '    BaseType "Sapphire Ring"\n';
      const document = makeDocument(text);
      const diagnostic: Diagnostic = {
        source: "poe-filter-ls-semanticValidator",
        tags: [DiagnosticTag.Unnecessary],
        message: "Class/BaseType combination never matches",
        range: Range.create(0, 13, 0, 27),
      };

      const actions = getActions(document, Range.create(0, 13, 0, 13), [
        diagnostic,
      ]);
      assert.ok(!actions.some((a) => a.title === "Remove dead code"));
    });

    test("ignores diagnostics without the Unnecessary tag", () => {
      const text = "    SetFontSize 40\n";
      const document = makeDocument(text);
      const diagnostic: Diagnostic = {
        source: "poe-filter-ls-semanticValidator",
        message: "some other warning",
        range: Range.create(0, 4, 0, 15),
      };

      const actions = getActions(document, Range.create(0, 4, 0, 4), [
        diagnostic,
      ]);
      assert.ok(!actions.some((a) => a.title === "Remove dead code"));
    });
  });

  suite("Uncomment", () => {
    test("uncomments a single commented-out code line", () => {
      const text = "Show\n#    SetFontSize 40\n";
      const document = makeDocument(text);

      const actions = getActions(document, Range.create(1, 2, 1, 2));
      const uncomment = actions.find((a) => a.title === "Uncomment this line");

      assert.ok(uncomment, "expected an 'Uncomment this line' action");
      assert.strictEqual(
        applyAction(document, uncomment),
        "Show\n   SetFontSize 40\n"
      );
    });

    test("uncomments a contiguous commented-out block", () => {
      const text =
        "# Show\n#    BaseType \"Chaos Orb\"\n#    SetFontSize 40\n# a prose comment\n";
      const document = makeDocument(text);

      const actions = getActions(document, Range.create(1, 2, 1, 2));
      const block = actions.find((a) => a.title?.startsWith("Uncomment block"));

      assert.ok(block, "expected an 'Uncomment block' action");
      assert.strictEqual(block.title, "Uncomment block (3 lines)");
      assert.strictEqual(
        applyAction(document, block),
        'Show\n   BaseType "Chaos Orb"\n   SetFontSize 40\n# a prose comment\n'
      );
    });

    test("does not offer uncomment on prose comments", () => {
      const text = "# this is just a note\nShow\n";
      const document = makeDocument(text);

      const actions = getActions(document, Range.create(0, 2, 0, 2));
      assert.ok(!actions.some((a) => a.title?.startsWith("Uncomment")));
    });

    test("does not offer a block action for an isolated commented line", () => {
      const text = "Show\n#    SetFontSize 40\nHide\n";
      const document = makeDocument(text);

      const actions = getActions(document, Range.create(1, 2, 1, 2));
      assert.ok(!actions.some((a) => a.title?.startsWith("Uncomment block")));
      assert.ok(actions.some((a) => a.title === "Uncomment this line"));
    });
  });
});
