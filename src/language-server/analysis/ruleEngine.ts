import {
  Node,
  BlockNode,
  ConditionNode,
  RootNode,
  BlockType,
  BlockNodeBodyType,
} from "../ast/nodes";
import { generateItemFromBlock, FilterItem } from "./filterItem";

export interface RuleConflict {
  type: "empty-block" | "catch-all" | "unreachable" | "nested";
  message: string;
  node: Node;
  relatedNode?: Node;
  severity: "error" | "warning";
}

export class FilterRuleEngine {
  constructor(private ast: RootNode) {}

  /**
   * Flattens blocks with Continue into separate blocks
   * This is used to combine Continue blocks into blocks that matches the same item for the live preivew
   */
  private flattenBlocks(): BlockNode[] {
    const blocks = this.ast.children.filter(
      (n): n is BlockNode => n.type in BlockType
    );
    const flattenedBlocks: BlockNode[] = [];

    let inheritedBodyMap = new Map<string, BlockNodeBodyType>();

    for (const block of blocks) {
      let hasContinue = false;

      // Update the inherited body map with the current block's items
      for (const item of block.body) {
        let key: string;
        switch (item.type) {
          case "Condition":
            key = `${item.condition}`;
            break;
          case "Action":
            key = `${item.action}`;
            if (item.action === "Continue") {
              hasContinue = true;
            }
            break;
          default:
            continue;
        }
        inheritedBodyMap.set(key, item);
      }

      // TODO: Continue has a potential effect on the rules below it, so stopping the Continue inheritance when finding a new block is wrong, I think we need to evaluate all previous Continue blocks if they would match the current block to apply it this means generating an item
      // Also the are two rules in play here, the one without inheritance, and the one with

      // If current block does not have Continue, we need to remove the Continue items from the inherited body map
      if (!hasContinue) {
        inheritedBodyMap.delete("Continue");
      }

      // Create new block with combined and overridden items
      const combinedBlock: BlockNode = {
        ...block,
        body: Array.from(inheritedBodyMap.values()),
      };

      flattenedBlocks.push(combinedBlock);

      // If this block has Continue, store its body for the next block
      if (!hasContinue) {
        // Reset the inherited body map for the next block
        inheritedBodyMap = new Map<string, BlockNodeBodyType>();
      }
    }

    return flattenedBlocks;
  }

  /**
   * Evaluates if an item matches all conditions in a block
   */
  private evaluateItemAgainstBlock(
    item: FilterItem,
    block: BlockNode
  ): boolean {
    const conditions = block.body.filter(
      (n) => n.type === "Condition"
    ) as ConditionNode[];

    return conditions.every((condition) => {
      switch (condition.condition) {
        case "BaseType":
        case "Class": {
          const prop = (condition.condition.charAt(0).toLowerCase() +
            condition.condition.slice(1)) as keyof FilterItem;

          if (!prop) {
            return false;
          }

          const itemValue = item[prop] as string;

          return condition.values.some((value) => value === itemValue);
        }
        case "Rarity": {
          if (!item.rarity) {
            return false;
          }
          const rarityLevels = ["Normal", "Magic", "Rare", "Unique"];
          const itemRarityIndex = rarityLevels.indexOf(item.rarity);
          const conditionRarityIndex = rarityLevels.indexOf(
            condition.values[0] as string
          );

          if (condition.operator) {
            switch (condition.operator) {
              case ">=":
                return itemRarityIndex >= conditionRarityIndex;
              case "<=":
                return itemRarityIndex <= conditionRarityIndex;
              case ">":
                return itemRarityIndex > conditionRarityIndex;
              case "<":
                return itemRarityIndex < conditionRarityIndex;
              case "==":
                return itemRarityIndex === conditionRarityIndex;
              default:
                return false;
            }
          }
          return condition.values.includes(item.rarity);
        }
        case "Quality":
        case "Sockets":
        case "StackSize":
        case "ItemLevel":
        case "DropLevel":
        case "AreaLevel":
        case "GemLevel":
        case "WaystoneTier":
        case "Height":
        case "Width":
        case "BaseArmour":
        case "BaseEnergyShield":
        case "BaseEvasion":
        case "BaseWard": {
          const prop =
            condition.condition.charAt(0).toLowerCase() +
            condition.condition.slice(1);
          const itemValue = item[prop as keyof FilterItem] as number;
          if (itemValue === undefined) {
            return false;
          }

          const conditionValue = Number(condition.values[0]);
          switch (condition.operator) {
            case ">=":
              return itemValue >= conditionValue;
            case "<=":
              return itemValue <= conditionValue;
            case ">":
              return itemValue > conditionValue;
            case "<":
              return itemValue < conditionValue;
            case "==":
              return itemValue === conditionValue;
            default:
              return false;
          }
        }
        case "FracturedItem":
        case "Mirrored":
        case "Corrupted":
        case "SynthesisedItem":
        case "AnyEnchantment":
        case "Identified": {
          const prop = condition.condition.replace(/Item$/, "").toLowerCase();
          return (
            item[prop as keyof FilterItem] === (condition.values[0] === "True")
          );
        }
        case "AlternateQuality":
        case "BlightedMap":
        case "UberBlightedMap":
        case "ElderItem":
        case "ElderMap":
        case "HasCruciblePassiveTree":
        case "HasEnchantment":
        case "Replica":
        case "Scourged":
        case "ShaperItem":
        case "ShapedMap":
        case "TransfiguredGem": {
          const prop =
            condition.condition.charAt(0).toLowerCase() +
            condition.condition.slice(1);
          return (
            item[prop as keyof FilterItem] === (condition.values[0] === "True")
          );
        }
        case "CorruptedMods":
        case "EnchantmentPassiveNum":
        case "HasEaterOfWorldsImplicit":
        case "HasSearingExarchImplicit":
        case "BaseDefencePercentile":
        case "BaseWard":
        case "LinkedSockets": {
          const prop =
            condition.condition.charAt(0).toLowerCase() +
            condition.condition.slice(1);
          const itemValue = item[prop as keyof FilterItem] as number;
          if (itemValue === undefined) {
            return false;
          }

          const conditionValue = Number(condition.values[0]);
          switch (condition.operator) {
            case ">=":
              return itemValue >= conditionValue;
            case "<=":
              return itemValue <= conditionValue;
            case ">":
              return itemValue > conditionValue;
            case "<":
              return itemValue < conditionValue;
            case "==":
              return itemValue === conditionValue;
            default:
              return false;
          }
        }
        case "ArchnemesisMod":
        case "EnchantmentPassiveNode":
        case "HasExplicitMod":
        case "HasImplicitMod":
        case "HasInfluence":
        case "GemQualityType": {
          //   const prop =
          //     condition.condition.charAt(0).toLowerCase() +
          //     condition.condition.slice(1);
          //   const itemValue = item[prop as keyof FilterItem] as string[];
          //   if (!itemValue) return false;
          //   return condition.values.some((value) => itemValue.includes(value));
          console.error(`${condition.condition} not implemented`);
          return false;
        }
        case "SocketGroup": {
          //   const itemValue = item.socketGroup;
          //   if (!itemValue) return false;
          //   return condition.values.some((value) => value === itemValue);
          console.error(`${condition.condition} not implemented`);
          return false;
        }
        default:
          //   const _exhaustiveCheck: never = condition.condition;
          console.error(`${condition.condition} not implemented`);
          return false;
      }
    });
  }

  /**
   * Detects potential rule conflicts
   */
  detectConflicts(): RuleConflict[] {
    const conflicts: RuleConflict[] = [];
    const blocks = this.flattenBlocks();

    // Check each block against previous blocks
    for (let i = 0; i < blocks.length; i++) {
      const currentBlock = blocks[i];

      // Check for empty blocks
      if (!currentBlock.body.some((n) => n.type === "Condition")) {
        conflicts.push({
          type: "empty-block",
          message: "Block has no conditions and will match everything",
          node: currentBlock,
          severity: "warning",
        });
        continue;
      }

      // Generate item from current block
      const currentItem = generateItemFromBlock(currentBlock);

      // Check against previous blocks
      for (let j = 0; j < i; j++) {
        const previousBlock = blocks[j];
        const hasPreviousBlockContinue = previousBlock.body.some(
          (n) => n.type === "Action" && n.action === "Continue"
        );

        if (hasPreviousBlockContinue) {
          // Previous block has Continue, so it can not conflict with the current block
          continue;
        }

        // First check: would previous block catch current item?
        if (!this.evaluateItemAgainstBlock(currentItem, previousBlock)) {
          continue;
        }

        // Check for mismatched conditions
        const currentConditions = currentBlock.body.filter(
          (n) => n.type === "Condition"
        ) as ConditionNode[];
        const previousConditions = previousBlock.body.filter(
          (n) => n.type === "Condition"
        ) as ConditionNode[];

        const currentTypes = new Set(currentConditions.map((c) => c.condition));
        const previousTypes = new Set(
          previousConditions.map((c) => c.condition)
        );

        const hasMismatchedConditions =
          [...currentTypes].some((type) => !previousTypes.has(type)) ||
          [...previousTypes].some((type) => !currentTypes.has(type));

        if (hasMismatchedConditions) {
          // Double-check: generate item from previous rule and test against current rule
          const previousItem = generateItemFromBlock(previousBlock);
          if (!this.evaluateItemAgainstBlock(previousItem, currentBlock)) {
            continue; // No real conflict if items don't match both ways
          }
        }

        // Check for overlapping conditions e.g. StackSize >= 1000 and StackSize >= 2000 is overlapping
        const allPreviousConditionsSatisfied = previousConditions.every(
          (prevCond) =>
            currentConditions.some(
              (currentCond) =>
                prevCond.condition === currentCond.condition &&
                this.doConditionsOverlap(prevCond, currentCond)
            )
        );

        if (!allPreviousConditionsSatisfied) {
          continue;
        }

        // We have a real conflict
        const message = this.generateConflictMessage(
          previousBlock,
          currentBlock
        );
        conflicts.push({
          type: "unreachable",
          message,
          node: currentBlock,
          relatedNode: previousBlock,
          severity: "warning",
        });
        break;
      }
    }

    return conflicts;
  }

  /**
   * Checks if two conditions overlap in their matching criteria
   */
  private doConditionsOverlap(
    prev: ConditionNode,
    current: ConditionNode
  ): boolean {
    if (prev.condition !== current.condition) {
      return false;
    }

    // Special handling for Rarity
    if (prev.condition === "Rarity") {
      const rarityLevels = ["Normal", "Magic", "Rare", "Unique"];

      // Handle operator-based comparisons
      if (prev.operator || current.operator) {
        const prevRarity = prev.values[0] as string;
        const currentRarity = current.values[0] as string;
        const prevIndex = rarityLevels.indexOf(prevRarity);
        const currentIndex = rarityLevels.indexOf(currentRarity);

        if (prevIndex === -1 || currentIndex === -1) {
          return false;
        }

        if (prev.operator === "<" || prev.operator === "<=") {
          return currentIndex <= prevIndex;
        }
        if (current.operator === "<" || current.operator === "<=") {
          return prevIndex <= currentIndex;
        }
      }

      // Handle multiple values without operator
      return prev.values.some((value) => current.values.includes(value));
    }

    // For numeric comparisons
    if (prev.operator && current.operator) {
      const prevValue = Number(prev.values[0]);
      const currentValue = Number(current.values[0]);

      switch (prev.operator) {
        case ">=":
          return current.operator === ">="
            ? currentValue >= prevValue
            : current.operator === "<="
            ? currentValue >= prevValue
            : current.operator === ">"
            ? currentValue > prevValue
            : current.operator === "<"
            ? currentValue >= prevValue
            : false;
        case "<=":
          return current.operator === "<="
            ? currentValue <= prevValue
            : current.operator === ">="
            ? prevValue >= currentValue
            : current.operator === ">"
            ? prevValue >= currentValue
            : current.operator === "<"
            ? currentValue <= prevValue
            : false;
        case ">":
          return current.operator === ">"
            ? currentValue >= prevValue
            : current.operator === "<"
            ? false
            : current.operator === "<="
            ? false
            : current.operator === ">="
            ? currentValue > prevValue
            : false;
        case "<":
          return current.operator === "<"
            ? currentValue <= prevValue
            : current.operator === ">"
            ? false
            : current.operator === ">="
            ? false
            : current.operator === "<="
            ? currentValue < prevValue
            : false;
      }
    }

    // For exact matches (BaseType, Class, etc)
    return JSON.stringify(prev.values) === JSON.stringify(current.values);
  }

  private generateConflictMessage(
    previousBlock: BlockNode,
    currentBlock: BlockNode
  ): string {
    const conditions = previousBlock.body
      .filter((n) => n.type === "Condition")
      .map((condition) => {
        const node = condition as ConditionNode;
        switch (node.condition) {
          case "BaseType":
          case "Class": {
            // Find overlapping values between current and previous rule
            const currentCondition = currentBlock.body.find(
              (c) => c.type === "Condition" && c.condition === node.condition
            ) as ConditionNode;
            const currentValues = currentCondition?.values || [];

            const overlapping = node.values.filter((type) =>
              currentValues.includes(type)
            );

            return overlapping.length > 0
              ? `${node.condition} "${overlapping.join(", ")}"`
              : null;
          }
          case "Rarity":
            return `Rarity ${node.values.join(" ")}`;
          default:
            return `${node.condition} ${node.operator || ""} ${node.values[0]}`;
        }
      })
      .join(", ");

    return `Rule may never trigger because it would be caught by an earlier rule with ${conditions}`;
  }
}
