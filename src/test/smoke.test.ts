import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";

// End-to-end smoke test: drives the real providers through the VS Code command
// API so the full client <-> language-server round-trip is exercised (not the
// provider classes in isolation).

const repoRoot = path.join(__dirname, "..", "..");
const soundFilter = vscode.Uri.file(
  path.join(repoRoot, "examples", "sound-effects.filter")
);

async function waitFor<T>(
  produce: () => Thenable<T> | T,
  predicate: (value: T) => boolean,
  { timeout = 45000, interval = 500 } = {}
): Promise<T> {
  const start = Date.now();
  let last: T = await produce();
  while (!predicate(last)) {
    if (Date.now() - start > timeout) {
      return last;
    }
    await new Promise((r) => setTimeout(r, interval));
    last = await produce();
  }
  return last;
}

suite("Smoke Test (client + language server)", function () {
  this.timeout(90000);

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension("thmsn.poe2-filter");
    await ext?.activate();
    // Open the document so the server parses/validates it.
    const doc = await vscode.workspace.openTextDocument(soundFilter);
    await vscode.window.showTextDocument(doc);
    // Give the language client time to start and report something back.
    await waitFor(
      () =>
        vscode.commands.executeCommand<vscode.SymbolInformation[]>(
          "vscode.executeDocumentSymbolProvider",
          soundFilter
        ),
      (symbols) => Array.isArray(symbols) && symbols.length > 0
    );
  });

  test("language server provides document symbols", async () => {
    const symbols = await vscode.commands.executeCommand<
      vscode.DocumentSymbol[]
    >("vscode.executeDocumentSymbolProvider", soundFilter);
    assert.ok(symbols && symbols.length > 0, "expected document symbols");
  });

  test("language server provides sound 'Play' code lenses", async () => {
    const lenses = await waitFor(
      () =>
        vscode.commands.executeCommand<vscode.CodeLens[]>(
          "vscode.executeCodeLensProvider",
          soundFilter
        ),
      (l) => Array.isArray(l) && l.length > 0
    );

    assert.ok(lenses && lenses.length > 0, "expected code lenses");
    const playLens = lenses.find(
      (l) => l.command?.command === "poe2-filter.playDefaultSound"
    );
    assert.ok(playLens, "expected a playDefaultSound code lens");
    assert.deepStrictEqual(playLens!.command!.arguments, ["1", "300"]);
  });

  test("language server formats the document", async () => {
    const unformatted = vscode.Uri.file(
      path.join(repoRoot, "unformatted.filter")
    );
    const doc = await vscode.workspace.openTextDocument(unformatted);
    await vscode.window.showTextDocument(doc);

    const edits = await waitFor(
      () =>
        vscode.commands.executeCommand<vscode.TextEdit[]>(
          "vscode.executeFormatDocumentProvider",
          unformatted,
          { tabSize: 4, insertSpaces: true }
        ),
      (e) => Array.isArray(e) && e.length > 0
    );
    assert.ok(edits && edits.length > 0, "expected formatting edits");

    // Apply the server's edits in-memory (do not touch the file on disk) and
    // verify the result is correctly indented.
    let text = doc.getText();
    const sorted = [...edits].sort(
      (a, b) => doc.offsetAt(b.range.start) - doc.offsetAt(a.range.start)
    );
    for (const edit of sorted) {
      const start = doc.offsetAt(edit.range.start);
      const end = doc.offsetAt(edit.range.end);
      text = text.slice(0, start) + edit.newText + text.slice(end);
    }

    assert.ok(
      text.includes('    BaseType "Mirror of Kalandra" "Divine Orb"'),
      "expected the server formatter to indent block bodies"
    );
  });

  test("language server reports diagnostics for missing sound files", async () => {
    const diagnostics = await waitFor(
      () => vscode.languages.getDiagnostics(soundFilter),
      (d) => d.length > 0
    );
    assert.ok(
      diagnostics.some((d) => /drop-sound\.mp3/.test(d.message)),
      "expected a diagnostic about the missing CustomAlertSound file"
    );
  });

  test("language server provides color information", async () => {
    const colorDoc = vscode.Uri.file(
      path.join(repoRoot, "examples", "conditions-and-actions.filter")
    );
    await vscode.workspace.openTextDocument(colorDoc);
    const colors = await waitFor(
      () =>
        vscode.commands.executeCommand<vscode.ColorInformation[]>(
          "vscode.executeDocumentColorProvider",
          colorDoc
        ),
      (c) => Array.isArray(c) && c.length > 0
    );
    assert.ok(colors && colors.length > 0, "expected color swatches");
  });

  test("preview command is registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("poe2-filter.openPreview"),
      "expected openPreview command"
    );
  });
});
