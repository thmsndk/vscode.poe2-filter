import {
  Hover,
  Position,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { GameDataService } from "../../services/gameDataService";
import { ConditionNode, Node, RootNode } from "../ast/nodes";
import { findNodeAtPosition } from "../utils/astUtils";

export class HoverProvider {
  constructor(private gameData: GameDataService) {}

  public provideHover(
    ast: RootNode,
    params: TextDocumentPositionParams
  ): Hover | null {
    const found = findNodeAtPosition(ast, params.position);
    if (!found) {
      return null;
    }

    if (found.node.type === "Condition") {
      const conditionNode = found.node as ConditionNode;
      if (found.value && found.node.operator !== "==") {
        // Hovering over a value
        switch (conditionNode.condition) {
          case "BaseType":
            return this.handleBaseTypeValueHover(found.value.value as string);
          case "Class":
            return this.handleClassValueHover(found.value.value as string);
          default:
            return null;
        }
      }
    }

    return null;
  }

  private handleBaseTypeValueHover(value: string): Hover | null {
    const matches = this.gameData.findMatchingBaseTypes(value);
    if (matches.length <= 1) {
      return null;
    }
    return this.createMatchingItemsHover(matches, "BaseType");
  }

  private handleClassValueHover(value: string): Hover | null {
    const matches = this.gameData.findMatchingClasses(value);
    if (matches.length <= 1) {
      return null;
    }
    return this.createMatchingItemsHover(matches, "Class");
  }

  private createMatchingItemsHover(matches: any[], type: string): Hover {
    return {
      contents: {
        kind: "markdown",
        value: [
          `### ${matches.length} Matching ${type}\n`,
          ...matches.slice(0, 10).map((m) => `- ${m.item.Name}`),
          matches.length > 10 ? `\n... and ${matches.length - 10} more` : "",
        ].join("\n"),
      },
    };
  }
}
