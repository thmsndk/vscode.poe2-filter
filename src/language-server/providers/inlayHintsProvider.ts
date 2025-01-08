import { InlayHint, Position } from "vscode-languageserver";
import { GameDataService } from "../../services/gameDataService";
import { ConditionNode, Node, RootNode } from "../ast/nodes";

export class InlayHintsProvider {
  constructor(private gameData: GameDataService) {}

  public provideInlayHints(ast: RootNode): InlayHint[] {
    const hints: InlayHint[] = [];

    // Visit all nodes
    const visitNode = (node: Node) => {
      if (node.type === "Condition") {
        const conditionNode = node as ConditionNode;
        if (conditionNode.operator === "==") {
          return;
        }

        // Check each value based on condition type
        for (const value of conditionNode.values) {
          let matches: any[] = [];

          switch (conditionNode.condition) {
            case "BaseType":
              matches = this.gameData.findMatchingBaseTypes(
                value.value as string
              );
              break;
            case "Class":
              matches = this.gameData.findMatchingClasses(
                value.value as string
              );
              break;
          }

          if (matches.length > 1) {
            hints.push({
              position: Position.create(node.line - 1, value.columnStart - 1),
              label: `${matches.length}·`,
              paddingLeft: true,
            });
          }
        }
      }

      // Visit children
      if ("body" in node) {
        (node as any).body.forEach(visitNode);
      }
    };

    ast.children.forEach(visitNode);
    return hints;
  }
}
