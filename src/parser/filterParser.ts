interface FilterRule {
  type: "Show" | "Hide";
  conditions: Condition[];
  actions: Action[];
}

interface Condition {
  type: string;
  operator?: string;
  values: string[];
}

interface Action {
  type: string;
  values: (string | number)[];
}

export function parseFilter(content: string): FilterRule[] {
  const lines = content.split("\n");
  const rules: FilterRule[] = [];
  let currentRule: FilterRule | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    // Start a new rule block
    if (trimmedLine === "Show" || trimmedLine === "Hide") {
      if (currentRule) rules.push(currentRule);
      currentRule = {
        type: trimmedLine as "Show" | "Hide",
        conditions: [],
        actions: [],
      };
      continue;
    }

    // Skip if we're not in a rule block
    if (!currentRule) continue;

    // Parse conditions and actions
    if (trimmedLine.startsWith("Set")) {
      // Parse action
      const [action, ...values] = trimmedLine.split(" ");
      currentRule.actions.push({
        type: action,
        values: values.map((v) => {
          const num = parseInt(v);
          return isNaN(num) ? v : num;
        }),
      });
    } else {
      // Parse condition
      const [condition, ...values] = trimmedLine.split(" ");
      currentRule.conditions.push({
        type: condition,
        values: values.map((v) => v.replace(/"/g, "")),
      });
    }
  }

  // Add the last rule if exists
  if (currentRule) rules.push(currentRule);

  return rules;
}
