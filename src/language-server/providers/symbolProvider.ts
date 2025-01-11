import {
  DocumentSymbol,
  SymbolKind,
  Range,
  Position,
} from "vscode-languageserver";
import {
  RootNode,
  BlockNode,
  ActionNode,
  Node,
  isBlockNode,
  isHeaderNode,
  ConditionNode,
} from "../ast/nodes";
import { ActionType } from "../ast/actions";

// List of symbols to be displayed in the outline
// https://code.visualstudio.com/api/references/icons-in-labels#icon-listing

interface HeaderInfo {
  symbol: DocumentSymbol;
  level: number;
}

export class SymbolProvider {
  public provideDocumentSymbols(ast: RootNode): DocumentSymbol[] {
    const symbols: DocumentSymbol[] = [];
    const headerStack: HeaderInfo[] = [];

    for (const node of ast.children) {
      if (isHeaderNode(node)) {
        const header = DocumentSymbol.create(
          node.text,
          "",
          SymbolKind.String,
          Range.create(
            Position.create(node.line - 1, node.columnStart - 1),
            Position.create(node.line - 1, node.columnEnd - 1)
          ),
          Range.create(
            Position.create(node.line - 1, node.columnStart - 1),
            Position.create(node.line - 1, node.columnEnd - 1)
          )
        );
        header.children = [];

        // Pop headers of same or higher level
        while (
          headerStack.length > 0 &&
          headerStack[headerStack.length - 1].level >= node.level
        ) {
          headerStack.pop();
        }

        // Add to parent header or root symbols
        if (headerStack.length > 0) {
          headerStack[headerStack.length - 1].symbol.children?.push(header);
        } else {
          symbols.push(header);
        }

        headerStack.push({ symbol: header, level: node.level });
      } else if (isBlockNode(node)) {
        const conditions = node.body.filter((n) => n.type === "Condition");
        const actions = node.body.filter((n) => n.type === "Action");

        const kind =
          node.type === "Show"
            ? SymbolKind.Class
            : node.type === "Hide"
            ? SymbolKind.Event
            : SymbolKind.Variable;

        const displayName = `${node.type} - ${this.getBlockDescription(
          node,
          conditions
        )}`;
        const detail = `${conditions.length} conditions, ${actions.length} actions`;

        const block = DocumentSymbol.create(
          displayName,
          detail,
          kind,
          Range.create(
            Position.create(node.line - 1, node.columnStart - 1),
            Position.create(node.line - 1, node.columnEnd - 1)
          ),
          Range.create(
            Position.create(node.line - 1, node.columnStart - 1),
            Position.create(node.line - 1, node.columnEnd - 1)
          )
        );

        // Add conditions folder
        if (conditions.length > 0) {
          const conditionsSymbol = this.createConditionsFolder(conditions);
          block.children = block.children || [];
          block.children.push(conditionsSymbol);
        }

        // Add actions folder
        if (actions.length > 0) {
          const actionsSymbol = this.createActionsFolder(
            actions as ActionNode[]
          );
          block.children = block.children || [];
          block.children.push(actionsSymbol);
        }

        // Add block to current header if exists, otherwise to root
        if (headerStack.length > 0) {
          headerStack[headerStack.length - 1].symbol.children?.push(block);
        } else {
          symbols.push(block);
        }
      }
    }

    return symbols;
  }

  private getBlockDescription(
    node: BlockNode,
    conditions: ConditionNode[]
  ): string {
    if (node.inlineComment) {
      return node.inlineComment;
    }

    // Take first two conditions for the main description, if there are more than two values, add "and more"
    let conditionsText = conditions
      .slice(0, 2)
      .map((c) => {
        const valueLimit = 2;

        let values = c.values
          .slice(0, valueLimit)
          .map((v) => v.value)
          .join(" ");

        if (c.values.length > valueLimit) {
          values += " and more";
        }

        // Format based on the operator
        // Clean up the operator
        const operator = c.operator?.trim();

        // Format based on operator type
        switch (operator) {
          case "==":
            return `${c.condition}: ${values}`;
          case "<=":
            return `${c.condition} ≤ ${values}`;
          case ">=":
            return `${c.condition} ≥ ${values}`;
          case "<":
            return `${c.condition} < ${values}`;
          case ">":
            return `${c.condition} > ${values}`;
          default:
            return `${c.condition} ${operator} ${values}`;
        }
      })
      .filter(Boolean)
      .join(", ");

    return conditionsText;
  }

  private createConditionsFolder(conditions: ConditionNode[]): DocumentSymbol {
    const firstCondition = conditions[0];
    return DocumentSymbol.create(
      "Conditions",
      `${conditions.length} items`,
      SymbolKind.Module,
      Range.create(
        Position.create(
          firstCondition.line - 1,
          firstCondition.columnStart - 1
        ),
        Position.create(firstCondition.line - 1, firstCondition.columnEnd - 1)
      ),
      Range.create(
        Position.create(
          firstCondition.line - 1,
          firstCondition.columnStart - 1
        ),
        Position.create(firstCondition.line - 1, firstCondition.columnEnd - 1)
      ),
      conditions.map((condition) =>
        DocumentSymbol.create(
          `${condition.condition}: ${condition.values
            .map((v) => v.value)
            .join(" ")}`,
          "",
          SymbolKind.Property,
          Range.create(
            Position.create(condition.line - 1, condition.columnStart - 1),
            Position.create(condition.line - 1, condition.columnEnd - 1)
          ),
          Range.create(
            Position.create(condition.line - 1, condition.columnStart - 1),
            Position.create(condition.line - 1, condition.columnEnd - 1)
          )
        )
      )
    );
  }

  private createActionsFolder(actions: ActionNode[]): DocumentSymbol {
    const firstAction = actions[0];
    return DocumentSymbol.create(
      "Actions",
      `${actions.length} items`,
      SymbolKind.Function,
      Range.create(
        Position.create(firstAction.line - 1, firstAction.columnStart - 1),
        Position.create(firstAction.line - 1, firstAction.columnEnd - 1)
      ),
      Range.create(
        Position.create(firstAction.line - 1, firstAction.columnStart - 1),
        Position.create(firstAction.line - 1, firstAction.columnEnd - 1)
      ),
      actions.map((action) => {
        return DocumentSymbol.create(
          `${action.action} ${action.values.map((v) => v.value).join(" ")}`,
          "",
          SymbolKind.Function,
          Range.create(
            Position.create(action.line - 1, action.columnStart - 1),
            Position.create(action.line - 1, action.columnEnd - 1)
          ),
          Range.create(
            Position.create(action.line - 1, action.columnStart - 1),
            Position.create(action.line - 1, action.columnEnd - 1)
          )
        );
      })
    );
  }
}
