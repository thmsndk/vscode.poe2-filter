import * as vscode from "vscode";

export class FilterSymbolProvider implements vscode.DocumentSymbolProvider {
  public provideDocumentSymbols(
    document: vscode.TextDocument
  ): vscode.DocumentSymbol[] {
    const symbols: vscode.DocumentSymbol[] = [];
    let currentBlock: vscode.DocumentSymbol | undefined;
    let blockConditions: string[] = [];
    let sectionStartLine: number | undefined;
    let sectionText: string | undefined;

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const trimmedText = line.text.trim();

      // Skip empty lines
      if (trimmedText === "") {
        // End of block detection
        if (currentBlock && blockConditions.length > 0) {
          currentBlock.detail = blockConditions.join(", ");
          blockConditions = [];
        }
        continue;
      }

      // Handle section headers
      if (trimmedText.startsWith("#")) {
        const isDecorative =
          trimmedText.startsWith("#--") || trimmedText === "#";

        if (!isDecorative) {
          const commentText = trimmedText.substring(1).trim();
          if (commentText) {
            if (!sectionStartLine) {
              sectionStartLine = i;
              sectionText = commentText;
            } else {
              // Only create a new section if this isn't part of a multi-line header
              if (i > sectionStartLine + 2) {
                sectionStartLine = i;
                sectionText = commentText;
              }
            }
          }
        } else if (sectionText && sectionStartLine !== undefined) {
          // Create section when we hit a decorative line or end of section
          currentBlock = new vscode.DocumentSymbol(
            sectionText,
            "", // Empty detail for sections
            vscode.SymbolKind.File,
            new vscode.Range(
              document.lineAt(sectionStartLine).range.start,
              line.range.end
            ),
            document.lineAt(sectionStartLine).range
          );
          currentBlock.children = [];
          symbols.push(currentBlock);
          sectionStartLine = undefined;
          sectionText = undefined;
        }
        continue;
      }

      // Handle Show/Hide blocks
      if (trimmedText === "Show" || trimmedText === "Hide") {
        // If we had a previous block, finalize its conditions
        if (currentBlock && blockConditions.length > 0) {
          currentBlock.detail = blockConditions.join(", ");
        }

        const blockRange = new vscode.Range(line.range.start, line.range.end);
        const block = new vscode.DocumentSymbol(
          trimmedText,
          "", // Detail will be filled when we process conditions
          vscode.SymbolKind.Class,
          blockRange,
          blockRange
        );

        if (currentBlock && currentBlock.kind === vscode.SymbolKind.File) {
          currentBlock.children.push(block);
        } else {
          symbols.push(block);
        }
        currentBlock = block;
        blockConditions = []; // Reset conditions for new block
        continue;
      }

      // Collect important conditions for the block detail
      if (currentBlock && !trimmedText.startsWith("#")) {
        const parts = trimmedText.split(" ");
        const command = parts[0];

        // Add rules as children of the current block
        const ruleRange = new vscode.Range(line.range.start, line.range.end);
        currentBlock.children.push(
          new vscode.DocumentSymbol(
            trimmedText,
            "", // No detail for individual rules
            vscode.SymbolKind.Property,
            ruleRange,
            ruleRange
          )
        );

        // Collect important conditions for the block name
        if (
          command === "BaseType" ||
          command === "Class" ||
          command === "ItemLevel"
        ) {
          blockConditions.push(trimmedText);
        }
      }
    }

    // Handle the last block's conditions
    if (currentBlock && blockConditions.length > 0) {
      currentBlock.detail = blockConditions.join(", ");
    }

    return symbols;
  }
}
