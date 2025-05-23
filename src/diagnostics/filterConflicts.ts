import * as vscode from "vscode";
import {
  parseRules,
  generateItemFromRule,
  FilterItem,
  wouldRuleMatchItem,
  doConditionsOverlap,
  FilterRule,
} from "../parser/filterRuleEngine";
// TODO: make findRuleConflicts return an object with the conflicting conditions as well as the message for use in checkRuleConflict
// TODO: To solve NeverSinks Uncut Skill Gem rule conflict, if there is mismatch in conditions, we can try and generate an item based on the previous rule, and compare it with the current rule
// TODO: Show BaseType "Shard" Hide BaseType "Reagal Shard" should display a conflict
export function checkRuleConflicts(
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  const problems: vscode.Diagnostic[] = [];
  const rules = parseRules(document);

  // Compare each rule with previous rules
  for (let i = 0; i < rules.length; i++) {
    const currentRule = rules[i];

    // Generate item once for current rule
    const currentItem = generateItemFromRule(currentRule);

    // Check against previous rules
    for (let j = 0; j < i; j++) {
      const previousRule = rules[j];
      const conflict = findRuleConflict(currentItem, currentRule, previousRule);

      if (conflict) {
        const diagnostic = new vscode.Diagnostic(
          document.lineAt(currentRule.lineNumber).range,
          `This rule may never trigger because ${conflict}`,
          vscode.DiagnosticSeverity.Warning
        );

        diagnostic.relatedInformation = [
          new vscode.DiagnosticRelatedInformation(
            new vscode.Location(
              document.uri,
              document.lineAt(previousRule.lineNumber).range
            ),
            `Conflicting rule here`
          ),
        ];

        diagnostic.code = {
          value: `goto:${previousRule.lineNumber}`,
          target: document.uri.with({
            fragment: `L${previousRule.lineNumber + 1}`,
          }),
        };

        diagnostic.source = "poe2-filter";
        problems.push(diagnostic);
      }
    }
  }

  return problems;
}

function findRuleConflict(
  currentItem: FilterItem,
  currentRule: FilterRule,
  previous: FilterRule
): string | null {
  if (previous.hasContinue) {
    return null;
  }

  // Check if previous rule would match this item
  if (!wouldRuleMatchItem(previous, currentItem)) {
    return null;
  }

  // Get condition types for both rules
  const currentConditionTypes = new Set(
    currentRule.conditions.map((c) => c.type)
  );
  const previousConditionTypes = new Set(
    previous.conditions.map((c) => c.type)
  );

  // Check if there are mismatched conditions
  const hasMismatchedConditions =
    [...currentConditionTypes].some(
      (type) => !previousConditionTypes.has(type)
    ) ||
    [...previousConditionTypes].some(
      (type) => !currentConditionTypes.has(type)
    );

  if (hasMismatchedConditions) {
    // Double-check by generating an item from previous rule
    const previousItem = generateItemFromRule(previous);
    if (!wouldRuleMatchItem(currentRule, previousItem)) {
      return null; // No real conflict if the items don't match both ways
    }
  }

  // Rest of existing conflict check logic...
  const allPreviousConditionsSatisfied = previous.conditions.every((prevCond) =>
    currentRule.conditions.some(
      (currentCond) =>
        prevCond.type === currentCond.type &&
        doConditionsOverlap(prevCond, currentCond)
    )
  );

  if (!allPreviousConditionsSatisfied) {
    return null;
  }

  // Create detailed message about which conditions overlap
  const overlappingConditions = previous.conditions
    .map((cond) => {
      switch (cond.type) {
        case "Class":
        case "BaseType": {
          // Find overlapping BaseTypes between current and previous rule
          const currentBaseTypes =
            currentRule.conditions.find((c) => c.type === "BaseType")?.values ||
            [];
          const overlapping = cond.values.filter((type) =>
            currentBaseTypes.includes(type)
          );
          return overlapping.length > 0
            ? `basetype "${overlapping.join(", ")}"`
            : null;
        }
        case "Sockets":
        case "Quality":
        case "ItemLevel":
        case "AreaLevel":
          return `${cond.type.toLowerCase()} ${cond.operator} ${
            cond.values[0]
          }`;
        case "Rarity":
          return `rarity ${cond.values.join(" ")}`;
        default:
          return null;
      }
    })
    .filter(Boolean)
    .join(", ");

  return `it would be caught by an earlier rule with ${overlappingConditions} at line ${
    previous.lineNumber + 1
  }`;
}
