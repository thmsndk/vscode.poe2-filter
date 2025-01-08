import { Position } from "vscode-languageserver";
import { Node, RootNode, ConditionNode, NodeValue } from "../ast/nodes";

export interface NodeAtPosition {
  node: Node;
  value?: NodeValue; // Optional value if hovering over a condition value
}

export function findNodeAtPosition(
  ast: RootNode,
  position: Position
): NodeAtPosition | null {
  return findInChildren(ast.children, position);
}

function findInChildren(
  nodes: Node[],
  position: Position
): NodeAtPosition | null {
  for (const node of nodes) {
    const found = findInNode(node, position);
    if (found) {
      return found;
    }
  }
  return null;
}

function findInNode(node: Node, position: Position): NodeAtPosition | null {
  // First check children/body if they exist
  if ("body" in node) {
    const found = findInChildren((node as any).body, position);
    if (found) {
      return found;
    }
  }

  // If no child matches, check if we're on the right line
  if (!isPositionOnLine(node, position)) {
    return null;
  }

  // For condition nodes, check if we're hovering over a value
  if (node.type === "Condition") {
    const value = findValueAtPosition(node as ConditionNode, position);
    if (value) {
      return { node, value };
    }
  }

  // Finally check if we're hovering over the node itself
  if (isPositionInNodeRange(node, position)) {
    return { node };
  }

  return null;
}

function isPositionOnLine(node: Node, position: Position): boolean {
  return position.line === node.line - 1; // Convert to 0-based
}

function isPositionInNodeRange(node: Node, position: Position): boolean {
  const nodeStart = node.columnStart - 1;
  const nodeEnd = node.columnEnd - 1;

  return position.character >= nodeStart && position.character <= nodeEnd;
}

function findValueAtPosition(
  node: ConditionNode,
  position: Position
): NodeValue | null {
  for (const value of node.values) {
    if (
      position.character >= value.columnStart - 1 &&
      position.character <= value.columnEnd - 1
    ) {
      return value;
    }
  }
  return null;
}
