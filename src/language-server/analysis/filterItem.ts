import { BlockNode } from "../ast/nodes";

export interface FilterItem {
  // Numeric properties
  sockets?: number;
  quality?: number;
  itemLevel?: number;
  dropLevel?: number;
  areaLevel?: number;
  gemLevel?: number;
  mapTier?: number;
  waystoneTier?: number;
  stackSize?: number;
  height?: number;
  width?: number;
  baseArmour?: number;
  baseEnergyShield?: number;
  baseEvasion?: number;
  // String properties
  baseType?: string;
  class?: string;
  rarity?: string;
  name?: string;
  // Boolean properties
  fractured?: boolean;
  mirrored?: boolean;
  corrupted?: boolean;
  synthesised?: boolean;
  enchanted?: boolean;
  identified?: boolean;
}

type NumericProps = Exclude<
  {
    [K in keyof FilterItem]: FilterItem[K] extends number | undefined
      ? K
      : never;
  }[keyof FilterItem],
  undefined
>;

export function generateItemFromBlock(block: BlockNode): FilterItem {
  const item: FilterItem = {
    // Set default values
    stackSize: 1,
    itemLevel: 1,
    dropLevel: 1,
    areaLevel: 1,
    identified: false,
  };

  for (const node of block.body) {
    if (node.type !== "Condition") {
      continue;
    }

    switch (node.condition) {
      case "BaseType":
        item.baseType = node.values[0] as string;
        break;
      case "Class":
        item.class = node.values[0] as string;
        break;
      case "Rarity":
        item.rarity = node.values[0] as string;
        break;
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
      case "BaseEvasion": {
        const prop = (node.condition.charAt(0).toLowerCase() +
          node.condition.slice(1)) as NumericProps;

        if (prop) {
          const value = Number(node.values[0]);
          switch (node.operator) {
            case ">=":
            case "==":
              item[prop] = value;
              break;
            case ">":
              item[prop] = value + 1;
              break;
            case "<=":
              item[prop] = value;
              break;
            case "<":
              item[prop] = value - 1;
              break;
          }
        }
        break;
      }
    }
  }

  return item;
}
