import * as assert from "assert";
import { Parser } from "../language-server/ast/parser";
import { SymbolProvider } from "../language-server/providers/symbolProvider";
import { DocumentSymbol } from "vscode-languageserver";

function collectSymbols(symbols: DocumentSymbol[]): DocumentSymbol[] {
  const all: DocumentSymbol[] = [];
  for (const symbol of symbols) {
    all.push(symbol);
    if (symbol.children) {
      all.push(...collectSymbols(symbol.children));
    }
  }
  return all;
}

suite("Symbol Provider Tests", () => {
  test("never emits a symbol with a falsy name (divider-only header + bare block)", () => {
    // Reproduces "Request textDocument/documentSymbol failed. Error: name must
    // not be falsy": a divider-only comment produces a header with empty text,
    // and a conditionless block produced a trailing "Show - " name.
    const input = `# =====================================================================
# =====================================================================

Show
    SetFontSize 32
`;

    const parser = new Parser(input);
    const ast = parser.parse();
    const provider = new SymbolProvider();
    const symbols = provider.provideDocumentSymbols(ast);

    const all = collectSymbols(symbols);
    assert.ok(all.length > 0, "expected at least one symbol");
    for (const symbol of all) {
      assert.ok(
        symbol.name && symbol.name.trim().length > 0,
        `symbol name must not be falsy, got: ${JSON.stringify(symbol.name)}`
      );
    }
  });

  test("uses block type as the name when the block has no description", () => {
    const input = `Show
    SetFontSize 32
`;

    const parser = new Parser(input);
    const ast = parser.parse();
    const provider = new SymbolProvider();
    const symbols = provider.provideDocumentSymbols(ast);

    assert.strictEqual(symbols[0].name, "Show");
  });
});
