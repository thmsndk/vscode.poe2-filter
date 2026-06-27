import * as fs from "fs";
import * as path from "path";
import {
  CompletionItem,
  CompletionItemKind,
  CompletionParams,
  Range,
  TextEdit,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { BlockType } from "../ast/nodes";
import { ConditionSyntaxMap, ConditionType } from "../ast/conditions";
import { ActionSyntaxMap, ActionType } from "../ast/actions";
import { ColorValue, RarityValue, ShapeValue } from "../ast/tokens";
import { GameDataService } from "../../services/gameDataService";

const SOUND_EXTENSIONS = new Set([".mp3", ".wav", ".ogg"]);
const FILTER_EXTENSIONS = new Set([".filter"]);

type CompletionContextKind = "import" | "sound";

/**
 * Provides completions for filter files:
 *  - file names inside `Import "..."` / `CustomAlertSound "..."` quotes,
 *  - block/condition/action keywords at the start of a line,
 *  - context-aware values (Rarity, booleans, colors, shapes, keyword literals,
 *    and game-data BaseType/Class names) after a keyword.
 */
export class CompletionProvider {
  constructor(private gameData?: GameDataService) {}

  public provideCompletions(
    document: TextDocument,
    params: CompletionParams
  ): CompletionItem[] {
    const position = params.position;
    const offset = document.offsetAt(position);
    const text = document.getText();
    const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
    const linePrefix = text.slice(lineStart, offset);

    // 1. File path completions inside Import/CustomAlertSound quotes.
    const fileKind = this.getContextKind(linePrefix);
    if (fileKind) {
      return this.getFilePathCompletions(document, position, linePrefix, fileKind);
    }

    const afterIndent = linePrefix.replace(/^\s*/, "");

    // Don't offer keyword/value completions inside comments or section headers.
    if (afterIndent.startsWith("#")) {
      return [];
    }

    // 2. Still typing the first token on the line -> keywords.
    if (/^[A-Za-z]*$/.test(afterIndent)) {
      return this.getKeywordCompletions();
    }

    // 3. Value completions based on the line's leading keyword.
    const keywordMatch = afterIndent.match(/^([A-Za-z]+)\b/);
    if (!keywordMatch) {
      return [];
    }

    return this.getValueCompletions(
      keywordMatch[1],
      afterIndent.slice(keywordMatch[0].length),
      linePrefix,
      position
    );
  }

  private getKeywordCompletions(): CompletionItem[] {
    const items: CompletionItem[] = [];

    for (const block of Object.values(BlockType)) {
      items.push({
        label: block,
        kind: CompletionItemKind.Keyword,
        detail: "Block",
        documentation: `Start a ${block} block`,
      });
    }

    for (const condition of Object.values(ConditionType)) {
      items.push({
        label: condition,
        kind: CompletionItemKind.Property,
        detail: "Condition",
        documentation: ConditionSyntaxMap[condition]?.description,
      });
    }

    for (const action of Object.values(ActionType)) {
      items.push({
        label: action,
        kind: CompletionItemKind.Function,
        detail: "Action",
        documentation: ActionSyntaxMap[action]?.description,
      });
    }

    return items;
  }

  private getValueCompletions(
    keyword: string,
    afterKeyword: string,
    linePrefix: string,
    position: { line: number; character: number }
  ): CompletionItem[] {
    if (keyword in ConditionType) {
      return this.getConditionValueCompletions(
        keyword as ConditionType,
        linePrefix,
        position
      );
    }

    if (keyword in ActionType) {
      return this.getActionValueCompletions(keyword as ActionType, afterKeyword);
    }

    return [];
  }

  private getConditionValueCompletions(
    condition: ConditionType,
    linePrefix: string,
    position: { line: number; character: number }
  ): CompletionItem[] {
    const syntax = ConditionSyntaxMap[condition];
    if (!syntax) {
      return [];
    }

    if (syntax.valueType === "rarity") {
      return this.enumItems(Object.values(RarityValue), CompletionItemKind.EnumMember);
    }

    if (syntax.valueType === "boolean") {
      return this.enumItems(["True", "False"], CompletionItemKind.Value);
    }

    if (condition === ConditionType.BaseType || condition === ConditionType.Class) {
      return this.getGameDataValueCompletions(condition, linePrefix, position);
    }

    return [];
  }

  private getActionValueCompletions(
    action: ActionType,
    afterKeyword: string
  ): CompletionItem[] {
    const syntax = ActionSyntaxMap[action];
    if (!syntax) {
      return [];
    }

    const parameter = syntax.parameters[this.valueIndex(afterKeyword)];
    if (!parameter) {
      return [];
    }

    switch (parameter.type) {
      case "color":
        return this.enumItems(Object.values(ColorValue), CompletionItemKind.Color);
      case "shape":
        return this.enumItems(Object.values(ShapeValue), CompletionItemKind.EnumMember);
      case "boolean":
        return this.enumItems(["True", "False"], CompletionItemKind.Value);
      case "keyword":
        return this.enumItems(
          parameter.allowedValues ?? [],
          CompletionItemKind.Keyword
        );
      default:
        return [];
    }
  }

  /**
   * Completes BaseType/Class names from game data. When the cursor is inside an
   * open quote only the name fragment is replaced; otherwise the name is
   * inserted wrapped in quotes.
   */
  private getGameDataValueCompletions(
    condition: ConditionType,
    linePrefix: string,
    position: { line: number; character: number }
  ): CompletionItem[] {
    if (!this.gameData) {
      return [];
    }

    const names =
      condition === ConditionType.BaseType
        ? this.gameData.baseItemTypes.map((item) => item.Name)
        : this.gameData.itemClasses.map((item) => item.Name);

    const uniqueNames = [...new Set(names)];
    const openQuote = /"([^"]*)$/.exec(linePrefix);
    const kind =
      condition === ConditionType.BaseType
        ? CompletionItemKind.Value
        : CompletionItemKind.Class;

    if (openQuote) {
      const fragment = openQuote[1];
      const replaceRange = Range.create(
        position.line,
        position.character - fragment.length,
        position.line,
        position.character
      );
      return uniqueNames.map((name) => ({
        label: name,
        kind,
        textEdit: TextEdit.replace(replaceRange, name),
      }));
    }

    return uniqueNames.map((name) => ({
      label: name,
      kind,
      insertText: `"${name}"`,
    }));
  }

  private enumItems(values: string[], kind: CompletionItemKind): CompletionItem[] {
    return values.map((value) => ({ label: value, kind }));
  }

  /**
   * Index of the value being typed after a keyword: the number of complete,
   * whitespace-separated tokens already entered (a trailing space starts a new
   * token).
   */
  private valueIndex(afterKeyword: string): number {
    if (afterKeyword.trim().length === 0) {
      return 0;
    }
    const tokens = afterKeyword.trim().split(/\s+/);
    return /\s$/.test(afterKeyword) ? tokens.length : tokens.length - 1;
  }

  private getFilePathCompletions(
    document: TextDocument,
    position: { line: number; character: number },
    linePrefix: string,
    kind: CompletionContextKind
  ): CompletionItem[] {
    // The partial path typed inside the still-open quote.
    const partial = linePrefix.match(/"([^"]*)$/)?.[1] ?? "";

    // Split the partial into the directory already typed and the fragment being
    // completed, so only the fragment is replaced.
    const slashIndex = Math.max(
      partial.lastIndexOf("/"),
      partial.lastIndexOf("\\")
    );
    const dirPart = slashIndex === -1 ? "" : partial.slice(0, slashIndex + 1);
    const fragment =
      slashIndex === -1 ? partial : partial.slice(slashIndex + 1);

    const replaceRange = Range.create(
      position.line,
      position.character - fragment.length,
      position.line,
      position.character
    );

    const baseDir = path.dirname(this.toFsPath(document.uri));
    const listDir = path.isAbsolute(dirPart)
      ? dirPart
      : path.join(baseDir, dirPart);

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(listDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const allowedExtensions =
      kind === "import" ? FILTER_EXTENSIONS : SOUND_EXTENSIONS;

    const items: CompletionItem[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        items.push({
          label: entry.name,
          kind: CompletionItemKind.Folder,
          textEdit: TextEdit.replace(replaceRange, entry.name + "/"),
          // Re-trigger so the user can keep drilling into folders.
          command: {
            command: "editor.action.triggerSuggest",
            title: "Suggest",
          },
        });
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }
      if (!allowedExtensions.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }

      items.push({
        label: entry.name,
        kind: CompletionItemKind.File,
        textEdit: TextEdit.replace(replaceRange, entry.name),
      });
    }

    return items;
  }

  private getContextKind(linePrefix: string): CompletionContextKind | null {
    // Cursor must be inside an unclosed quote on this line.
    if (!/"[^"]*$/.test(linePrefix)) {
      return null;
    }
    if (/^\s*Import\b/.test(linePrefix)) {
      return "import";
    }
    // CustomAlertSound supports several semicolon-separated quoted files, so it
    // is enough that we are inside an open quote on such a line.
    if (/^\s*(CustomAlertSound|CustomAlertSoundOptional)\b/.test(linePrefix)) {
      return "sound";
    }
    return null;
  }

  /**
   * Converts a document URI (e.g. `file:///c%3A/dir/filter.filter`) into a
   * filesystem path. Falls back to returning the input unchanged when it is
   * not a `file:` URI.
   */
  private toFsPath(uri: string): string {
    if (!uri.startsWith("file:")) {
      return uri;
    }

    let p = decodeURIComponent(uri.replace(/^file:\/\//, ""));
    if (/^\/[a-zA-Z]:/.test(p)) {
      p = p.slice(1);
    }
    return p;
  }
}
