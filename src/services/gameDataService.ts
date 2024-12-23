import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";

interface BaseItemType {
  Id: string;
  Name: string;
  ItemClassesKey: string;
  DropLevel: number;
}

interface ItemClass {
  Id: string;
  Name: string;
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

  findExactBaseType(name: string | string[]): BaseItemType[] {
    const names = Array.isArray(name) ? name : [name];
    return this.baseItemTypes.filter((item) =>
      names.some((n) => item.Name === n)
    );
  }

  findMatchingBaseTypes(partialName: string | string[]): BaseItemType[] {
    const searches = Array.isArray(partialName) ? partialName : [partialName];

    const lowerSearches = searches.map((s) => s.toLowerCase());
    return this.baseItemTypes.filter((item) =>
      lowerSearches.some((search) => item.Name.toLowerCase().includes(search))
    );
  }

  findExactClass(name: string | string[]): ItemClass[] {
    const names = Array.isArray(name) ? name : [name];
    return this.itemClasses.filter((cls) =>
      names.some((n) => {
        const isSingular = !n.endsWith("s");
        const plural = isSingular ? n + "s" : n;
        return cls.Name === n || cls.Name === plural;
      })
    );
  }

  findMatchingClasses(partialName: string | string[]): ItemClass[] {
    const searches = Array.isArray(partialName) ? partialName : [partialName];

    const lowerSearches = searches.map((s) => s.toLowerCase());
    return this.itemClasses.filter((cls) =>
      lowerSearches.some((search) => cls.Name.toLowerCase().includes(search))
    );
  }
}
