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

  async loadData(context: vscode.ExtensionContext) {
    try {
      const dataPath = path.join(
        context.extensionPath,
        "data",
        "tables",
        this.language
      );

      const [baseItemTypesData, itemClassesData] = await Promise.all([
        fs.readFile(path.join(dataPath, "BaseItemTypes.json"), "utf-8"),
        fs.readFile(path.join(dataPath, "ItemClasses.json"), "utf-8"),
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
    const matches: Match<BaseItemType>[] = [];

    this.baseItemTypes.forEach((item) => {
      const itemNameLower = item.Name.toLowerCase();
      const matchingName = names.find((n) => itemNameLower === n.toLowerCase());
      if (matchingName) {
        matches.push({
          item,
          matchedBy: matchingName,
        });
      }
    });

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
