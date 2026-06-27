import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";

export interface BaseItemType {
  Id: string;
  Name: string;
  ItemClass: number;
  DropLevel: number;
}

export interface ItemClass {
  _index: number;
  Id: string;
  Name: string;
}

export interface Match<T> {
  item: T;
  matchedBy: string;
}

export class GameDataService {
  public baseItemTypes: BaseItemType[] = [];
  public itemClasses: ItemClass[] = [];
  private language: string = "English"; // Default to English

  // Lazily-built lowercase-name index for O(1) exact BaseType lookups. Without
  // it, exact BaseType validation scans the entire table (thousands of items)
  // on every value, which dominates validation time on large filters. The index
  // is rebuilt whenever `baseItemTypes` is replaced (loadData, or direct
  // assignment in tests), detected via the stored source reference.
  private baseItemTypeIndex?: Map<string, BaseItemType[]>;
  private baseItemTypeIndexSource?: BaseItemType[];

  private getBaseItemTypeIndex(): Map<string, BaseItemType[]> {
    if (
      !this.baseItemTypeIndex ||
      this.baseItemTypeIndexSource !== this.baseItemTypes
    ) {
      const index = new Map<string, BaseItemType[]>();
      for (const item of this.baseItemTypes) {
        const key = item.Name.toLowerCase();
        const bucket = index.get(key);
        if (bucket) {
          bucket.push(item);
        } else {
          index.set(key, [item]);
        }
      }
      this.baseItemTypeIndex = index;
      this.baseItemTypeIndexSource = this.baseItemTypes;
    }
    return this.baseItemTypeIndex;
  }

  // Language support could be implemented in several ways:
  // 1. VSCode Setting:
  //    - Add configuration in package.json: "poe2-filter.language"
  //    - Users can change it in settings
  //    - Watch for setting changes to reload data
  //    Example: vscode.workspace.getConfiguration().get("poe2-filter.language")

  // 2. Auto-detect from game installation:
  //    - Look for PoE installation path
  //    - Read language setting from production_Config.ini
  //    - Requires additional file system access

  // 3. Command Palette:
  //    - Add command to switch languages
  //    - Store selection in workspace/global state
  //    - Example: vscode.commands.registerCommand("poe2-filter.setLanguage", ...)

  // 4. Status Bar:
  //    - Add language selector in status bar
  //    - Quick access to change language
  //    - Example: vscode.window.createStatusBarItem()

  async loadData(dataPath: string) {
    try {
      const tablesPath = path.join(dataPath, "data", "tables", this.language);

      const [baseItemTypesData, itemClassesData] = await Promise.all([
        fs.readFile(path.join(tablesPath, "BaseItemTypes.json"), "utf-8"),
        fs.readFile(path.join(tablesPath, "ItemClasses.json"), "utf-8"),
      ]);

      this.baseItemTypes = JSON.parse(baseItemTypesData);
      this.itemClasses = JSON.parse(itemClassesData);
    } catch (error) {
      console.error(
        `Failed to load game data for language ${this.language}:`,
        error
      );
      throw error;
    }
  }

  findMatchingBaseTypes(partialName: string | string[]): Match<BaseItemType>[] {
    const searches = Array.isArray(partialName) ? partialName : [partialName];
    const lowerSearches = searches.map((s) => s.toLowerCase());

    const matches: Match<BaseItemType>[] = [];

    this.baseItemTypes.forEach((item) => {
      const itemNameLower = item.Name.toLowerCase();
      const matchingSearch = lowerSearches.find((search) =>
        itemNameLower.includes(search)
      );

      if (matchingSearch) {
        matches.push({
          item,
          matchedBy: searches[lowerSearches.indexOf(matchingSearch)],
        });
      }
    });

    return matches;
  }

  findExactBaseType(name: string | string[]): Match<BaseItemType>[] {
    const names = Array.isArray(name) ? name : [name];
    const index = this.getBaseItemTypeIndex();
    const matches: Match<BaseItemType>[] = [];

    for (const search of names) {
      const bucket = index.get(search.toLowerCase());
      if (bucket) {
        for (const item of bucket) {
          matches.push({ item, matchedBy: search });
        }
      }
    }

    return matches;
  }

  findMatchingClasses(partialName: string | string[]): Match<ItemClass>[] {
    const searches = Array.isArray(partialName) ? partialName : [partialName];
    const matches: Match<ItemClass>[] = [];

    this.itemClasses.forEach((cls) => {
      const clsNameLower = cls.Name.toLowerCase();

      for (const search of searches) {
        const isSingular = !search.endsWith("s");
        const searchPlural = isSingular ? search + "s" : search;
        const searchLower = search.toLowerCase();
        const searchPluralLower = searchPlural.toLowerCase();

        if (
          clsNameLower === searchLower ||
          clsNameLower.includes(searchLower) ||
          clsNameLower.includes(searchPluralLower)
        ) {
          matches.push({
            item: cls,
            matchedBy: search,
          });
        }
      }
    });

    return matches;
  }

  findExactClass(name: string | string[]): Match<ItemClass>[] {
    const names = Array.isArray(name) ? name : [name];
    const matches: Match<ItemClass>[] = [];

    this.itemClasses.forEach((cls) => {
      const clsNameLower = cls.Name.toLowerCase();

      for (const search of names) {
        const isSingular = !search.endsWith("s");
        const searchPlural = isSingular ? search + "s" : search;
        const searchLower = search.toLowerCase();
        const searchPluralLower = searchPlural.toLowerCase();

        if (
          clsNameLower === searchLower ||
          clsNameLower === searchPluralLower
        ) {
          matches.push({
            item: cls,
            matchedBy: search,
          });
          break;
        }
      }
    });

    return matches;
  }
}
