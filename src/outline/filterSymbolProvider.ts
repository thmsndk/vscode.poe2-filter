import * as vscode from "vscode";

export class FilterSymbolProvider implements vscode.DocumentSymbolProvider {
  private isConditionProperty(property: string): boolean {
    return (
      !property.startsWith("Set") &&
      !property.startsWith("Play") &&
      !property.startsWith("Minimap")
    );
  }

  private formatCondition(
    property: string,
    operator: string | undefined,
    value: string
  ): string {
    if (!operator) return `${property}: ${value}`;

    // Clean up the operator
    operator = operator.trim();

    // Format based on operator type
    switch (operator) {
      case "==":
        return `${property}: ${value}`;
      case "<=":
        return `${property} ≤ ${value}`;
      case ">=":
        return `${property} ≥ ${value}`;
      case "<":
        return `${property} < ${value}`;
      case ">":
        return `${property} > ${value}`;
      default:
        return `${property} ${operator} ${value}`;
    }
  }

  private getBlockContent(
    document: vscode.TextDocument,
    startLine: number
  ): {
    description: string;
    conditions: { text: string; range: vscode.Range }[];
    actions: { text: string; range: vscode.Range }[];
  } {
    const conditions: { text: string; range: vscode.Range }[] = [];
    const actions: { text: string; range: vscode.Range }[] = [];

    for (
      let i = startLine + 1;
      i < Math.min(startLine + 20, document.lineCount);
      i++
    ) {
      const line = document.lineAt(i);
      const trimmedText = line.text.trim();

      if (
        trimmedText === "" ||
        trimmedText.match(/^#?\s*(Show|Hide)/) ||
        trimmedText.startsWith("###")
      ) {
        break;
      }

      // Match actions
      if (trimmedText.match(/^\s*Set|Play|Minimap/)) {
        actions.push({
          text: trimmedText.replace(/^\s*/, ""),
          range: line.range,
        });
        continue;
      }

      // Match conditions
      const conditionMatch = trimmedText.match(
        /^\s*(\w+)\s*([<=>]+)?\s*"?([^"\s]+[^"]*)"?/
      );
      if (conditionMatch) {
        const [, property, operator, value] = conditionMatch;
        if (property && value && this.isConditionProperty(property)) {
          conditions.push({
            text: this.formatCondition(property, operator, value),
            range: line.range,
          });
        }
      }
    }

    // Take first two conditions for the main description
    const description = conditions
      .map((c) => c.text)
      .slice(0, 2)
      .join(", ");

    return { description, conditions, actions };
  }

  public provideDocumentSymbols(
    document: vscode.TextDocument
  ): vscode.DocumentSymbol[] {
    const symbols: vscode.DocumentSymbol[] = [];
    const sectionStack: { section: vscode.DocumentSymbol; level: number }[] =
      [];
    let insideBlock = false;

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const trimmedText = line.text.trim();

      if (trimmedText === "") {
        insideBlock = false;
        continue;
      }

      // Detect start of Show/Hide block
      const blockMatch = trimmedText.match(/^#?\s*(Show|Hide)(\s+.*)?$/);
      if (blockMatch) {
        insideBlock = true;

        const blockType = blockMatch[1];
        let comment = blockMatch[2]?.trim() || "";

        // Get block content
        const { description, conditions, actions } = this.getBlockContent(
          document,
          i
        );
        if (!comment) {
          comment = description;
        }

        const displayName = comment ? `${blockType} - ${comment}` : blockType;
        const detail = `${conditions.length} conditions, ${actions.length} actions`;

        const block = new vscode.DocumentSymbol(
          displayName,
          detail,
          blockType === "Show"
            ? vscode.SymbolKind.Method
            : vscode.SymbolKind.Event,
          line.range,
          line.range
        );

        // Add conditions as children
        if (conditions.length > 0) {
          const conditionsFolder = new vscode.DocumentSymbol(
            "Conditions",
            `${conditions.length} items`,
            vscode.SymbolKind.Interface,
            conditions[0].range,
            conditions[0].range
          );

          conditions.forEach((condition) => {
            conditionsFolder.children.push(
              new vscode.DocumentSymbol(
                condition.text,
                "",
                vscode.SymbolKind.Property,
                condition.range,
                condition.range
              )
            );
          });

          block.children.push(conditionsFolder);
        }

        // Add actions as children
        if (actions.length > 0) {
          const actionsFolder = new vscode.DocumentSymbol(
            "Actions",
            `${actions.length} items`,
            vscode.SymbolKind.Module,
            actions[0].range,
            actions[0].range
          );

          actions.forEach((action) => {
            actionsFolder.children.push(
              new vscode.DocumentSymbol(
                action.text,
                "",
                vscode.SymbolKind.Function,
                action.range,
                action.range
              )
            );
          });

          block.children.push(actionsFolder);
        }

        // Add block to current parent if exists, otherwise to root
        if (sectionStack.length > 0) {
          sectionStack[sectionStack.length - 1].section.children.push(block);
        } else {
          symbols.push(block);
        }
        continue;
      }

      // Type 1: Section with borders (highest level - 0)
      // #--------------------------
      // # Socketables and Special Character Equipment
      // #--------------------------
      if (!insideBlock && trimmedText.match(/^#(.)\1+$/)) {
        if (i + 1 < document.lineCount && i + 2 < document.lineCount) {
          const titleLine = document.lineAt(i + 1).text.trim();
          const bottomBorder = document.lineAt(i + 2).text.trim();

          if (titleLine.startsWith("# ") && bottomBorder.match(/^#(.)\1+$/)) {
            const sectionName = titleLine.substring(2).trim();

            const fullRange = new vscode.Range(
              document.lineAt(i).range.start,
              document.lineAt(i + 2).range.end
            );
            const selectionRange = document.lineAt(i + 1).range;

            const section = new vscode.DocumentSymbol(
              sectionName,
              "",
              vscode.SymbolKind.File,
              fullRange,
              selectionRange
            );

            // Clear the stack and start a new top-level section
            sectionStack.length = 0;
            sectionStack.push({ section, level: 0 });
            symbols.push(section);
            i += 2;
          }
        }
        continue;
      }

      // Type 2: Section with surrounding characters (highest level - 0)
      // ######### Socketables and Special Character Equipment #########
      if (!insideBlock) {
        const surroundedMatch = trimmedText.match(/^(.)\1*\s+(.+?)\s+\1+$/);
        if (surroundedMatch) {
          const sectionName = surroundedMatch[2].trim();
          const range = line.range;

          const section = new vscode.DocumentSymbol(
            sectionName,
            "",
            vscode.SymbolKind.File,
            range,
            range
          );

          // Clear the stack and start a new top-level section
          sectionStack.length = 0;
          sectionStack.push({ section, level: 0 });
          symbols.push(section);
          continue;
        }
      }

      // Type 3: Markdown-style headers
      // # Currency Tier Mythic
      // ## Sub-section
      // ### Sub-sub-section
      if (!insideBlock) {
        const markdownMatch = trimmedText.match(/^(#+)\s+(.+)$/);
        if (
          markdownMatch &&
          !trimmedText.toLowerCase().includes("show") &&
          !trimmedText.toLowerCase().includes("hide")
        ) {
          const level = markdownMatch[1].length;
          const sectionName = markdownMatch[2].trim();

          const section = new vscode.DocumentSymbol(
            sectionName,
            "",
            vscode.SymbolKind.Field,
            line.range,
            line.range
          );

          // Pop items from stack if they're at the same or deeper level
          while (
            sectionStack.length > 0 &&
            sectionStack[sectionStack.length - 1].level >= level
          ) {
            sectionStack.pop();
          }

          if (sectionStack.length > 0) {
            // Add as child to the last item in stack
            sectionStack[sectionStack.length - 1].section.children.push(
              section
            );
          } else {
            // No parent, add to root
            symbols.push(section);
          }

          // Add this section to the stack
          sectionStack.push({ section, level });
        }
      }
    }

    return symbols;
  }
}
