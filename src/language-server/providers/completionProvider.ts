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

/**
 * Re-opens the suggest widget right after an item is accepted, so chained
 * completions (keyword -> its value, size -> color, folder -> its contents)
 * appear without the user pressing Ctrl+Space.
 */
const TRIGGER_SUGGEST = {
  command: "editor.action.triggerSuggest",
  title: "Suggest",
};

type CompletionContextKind = "import" | "sound";

/**
 * Hand-picked ordering for the most commonly written keywords so they surface
 * first (e.g. `BaseType` above `BaseArmour`). Anything not listed falls back to
 * alphabetical order after these.
 */
const KEYWORD_PRIORITY: string[] = [
  // Blocks
  "Show",
  "Hide",
  "Minimal",
  // Common conditions
  "BaseType",
  "Class",
  "Rarity",
  "ItemLevel",
  "AreaLevel",
  "StackSize",
  "Quality",
  "Sockets",
  "WaystoneTier",
  // Common actions
  "SetTextColor",
  "SetBorderColor",
  "SetBackgroundColor",
  "SetFontSize",
  "PlayAlertSound",
  "MinimapIcon",
  "PlayEffect",
  "Continue",
];

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
    const nextNewline = text.indexOf("\n", offset);
    const lineSuffix = text.slice(
      offset,
      nextNewline === -1 ? text.length : nextNewline
    );

    // 1. File path completions inside Import/CustomAlertSound quotes.
    const fileKind = this.getContextKind(linePrefix);
    if (fileKind) {
      return this.getFilePathCompletions(
        document,
        position,
        linePrefix,
        lineSuffix,
        fileKind
      );
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
      lineSuffix,
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
        sortText: this.keywordSortText(block),
      });
    }

    for (const condition of Object.values(ConditionType)) {
      items.push({
        label: condition,
        kind: CompletionItemKind.Property,
        detail: "Condition",
        documentation: ConditionSyntaxMap[condition]?.description,
        sortText: this.keywordSortText(condition),
        ...this.conditionKeywordAffordance(condition),
      });
    }

    for (const action of Object.values(ActionType)) {
      items.push({
        label: action,
        kind: CompletionItemKind.Function,
        detail: "Action",
        documentation: ActionSyntaxMap[action]?.description,
        sortText: this.keywordSortText(action),
        ...this.actionKeywordAffordance(action),
      });
    }

    return items;
  }

  /**
   * How a condition keyword behaves once accepted. All conditions take a value,
   * so we always add the trailing space, but only reopen suggest when there is
   * an actual value list to show (Rarity values, True/False, BaseType/Class
   * names). For numeric conditions reopening would only surface document-word
   * noise, so we leave the cursor on the space for the user to type a number.
   */
  private conditionKeywordAffordance(
    condition: ConditionType
  ): Partial<CompletionItem> {
    const syntax = ConditionSyntaxMap[condition];
    const opensPicker =
      syntax?.valueType === "rarity" ||
      syntax?.valueType === "boolean" ||
      condition === ConditionType.BaseType ||
      condition === ConditionType.Class;
    return {
      insertText: `${condition} `,
      ...(opensPicker ? { command: TRIGGER_SUGGEST } : {}),
    };
  }

  /**
   * How an action keyword behaves once accepted:
   * - parameterless actions (Continue, ...) are inserted as-is;
   * - sound-path actions drop in a pair of quotes with the cursor between them
   *   and open the file/folder picker straight away;
   * - actions whose first parameter has a value list (colour, shape, boolean,
   *   keyword, MinimapIcon size) add the space and reopen suggest;
   * - everything else (numeric/sound-id params) just adds the space.
   */
  private actionKeywordAffordance(action: ActionType): Partial<CompletionItem> {
    const parameters = ActionSyntaxMap[action]?.parameters ?? [];
    if (parameters.length === 0) {
      return {};
    }

    if (
      action === ActionType.CustomAlertSound ||
      action === ActionType.CustomAlertSoundOptional
    ) {
      // Just add the space and reopen suggest (like Class). The file picker
      // inserts the quotes itself, so we don't pre-insert any quote here - a
      // pre-inserted quote both trips path-completion extensions and gets in
      // the way of the picker's own quote handling.
      return {
        insertText: `${action} `,
        command: TRIGGER_SUGGEST,
      };
    }

    const firstType = parameters[0]?.type;
    const opensPicker =
      action === ActionType.MinimapIcon ||
      firstType === "color" ||
      firstType === "shape" ||
      firstType === "boolean" ||
      firstType === "keyword";
    return {
      insertText: `${action} `,
      ...(opensPicker ? { command: TRIGGER_SUGGEST } : {}),
    };
  }

  /**
   * Sort key that floats hand-picked common keywords to the top (in their
   * listed order) and orders everything else alphabetically after them.
   */
  private keywordSortText(label: string): string {
    const priority = KEYWORD_PRIORITY.indexOf(label);
    if (priority !== -1) {
      return `0${String(priority).padStart(3, "0")}`;
    }
    return `1${label.toLowerCase()}`;
  }

  private getValueCompletions(
    keyword: string,
    afterKeyword: string,
    linePrefix: string,
    lineSuffix: string,
    position: { line: number; character: number }
  ): CompletionItem[] {
    if (keyword in ConditionType) {
      return this.getConditionValueCompletions(
        keyword as ConditionType,
        linePrefix,
        lineSuffix,
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
    lineSuffix: string,
    position: { line: number; character: number }
  ): CompletionItem[] {
    const syntax = ConditionSyntaxMap[condition];
    if (!syntax) {
      return [];
    }

    if (syntax.valueType === "rarity") {
      // Rarity accepts a list of values, so drop any already on the line.
      const present = this.otherValuesOnLine(linePrefix, lineSuffix);
      const available = Object.values(RarityValue).filter(
        (value) => !present.has(value)
      );
      // Rarity is a value list - reopen suggest so the next rarity can be added
      // straight away (already-present ones are filtered out above). Only chain
      // while more than one remains, otherwise picking the last value would
      // retrigger into an empty list and surface word-based noise.
      return this.enumItems(
        available,
        CompletionItemKind.EnumMember,
        available.length > 1
      );
    }

    if (syntax.valueType === "boolean") {
      // Single value - no chaining.
      return this.enumItems(["True", "False"], CompletionItemKind.Value);
    }

    if (condition === ConditionType.BaseType || condition === ConditionType.Class) {
      return this.getGameDataValueCompletions(
        condition,
        linePrefix,
        lineSuffix,
        position
      );
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

    const index = this.valueIndex(afterKeyword);
    const parameter = syntax.parameters[index];
    if (!parameter) {
      return [];
    }

    // MinimapIcon's size is a small fixed set, so offer a labelled dropdown
    // (the generic numeric branch below would offer nothing).
    if (action === ActionType.MinimapIcon && index === 0) {
      return this.minimapSizeItems();
    }

    // When more parameters follow, reopen suggest after a value is picked so the
    // next argument's dropdown (e.g. MinimapIcon colour -> shape) chains along.
    const hasNextParam = index < syntax.parameters.length - 1;

    switch (parameter.type) {
      case "color":
        return this.enumItems(
          Object.values(ColorValue),
          CompletionItemKind.Color,
          hasNextParam
        );
      case "shape":
        return this.enumItems(
          Object.values(ShapeValue),
          CompletionItemKind.EnumMember,
          hasNextParam
        );
      case "boolean":
        return this.enumItems(
          ["True", "False"],
          CompletionItemKind.Value,
          hasNextParam
        );
      case "keyword":
        return this.enumItems(
          parameter.allowedValues ?? [],
          CompletionItemKind.Keyword,
          hasNextParam
        );
      default:
        return [];
    }
  }

  /**
   * Completes BaseType/Class names from game data. When the cursor is inside an
   * open quote the name fragment (and any auto-inserted closing quote) is
   * replaced so the cursor ends up after the closing quote, ready for the next
   * value; otherwise the name is inserted wrapped in quotes.
   */
  private getGameDataValueCompletions(
    condition: ConditionType,
    linePrefix: string,
    lineSuffix: string,
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
    // Only treat the cursor as inside a quote when there is an UNCLOSED quote
    // (odd number of quotes so far). Otherwise the closing quote of a previous
    // value - e.g. `Class "Quarterstaves" |` - is mistaken for an opening one
    // and the next value gets inserted without its own opening quote.
    const insideQuote = (linePrefix.match(/"/g) ?? []).length % 2 === 1;
    const openQuote = insideQuote ? /"([^"]*)$/.exec(linePrefix) : null;
    // Don't re-suggest values already listed on the line (e.g. avoid
    // `BaseType "Exalted Orb" "Exalted Orb"`).
    const present = this.quotedValuesOnLine(
      linePrefix,
      lineSuffix,
      openQuote !== null
    );
    const availableNames = uniqueNames.filter((name) => !present.has(name));
    // Only chain to the next value while more than one remains, so picking the
    // final value doesn't retrigger into an empty list (word-based noise).
    const chain = availableNames.length > 1;
    const kind =
      condition === ConditionType.BaseType
        ? CompletionItemKind.Value
        : CompletionItemKind.Class;

    if (openQuote) {
      const fragment = openQuote[1];
      // Consume an existing closing quote (e.g. one auto-inserted by the
      // editor) so we don't leave the cursor trapped before it.
      const hasClosingQuote = lineSuffix.startsWith('"');
      const rest = hasClosingQuote ? lineSuffix.slice(1) : lineSuffix;
      // Leave a trailing space so the next value can be typed immediately,
      // unless one is already there.
      const trailingSpace = rest.startsWith(" ") ? "" : " ";
      const replaceRange = Range.create(
        position.line,
        position.character - fragment.length,
        position.line,
        position.character + (hasClosingQuote ? 1 : 0)
      );
      return availableNames.map((name) => ({
        label: name,
        kind,
        textEdit: TextEdit.replace(replaceRange, `${name}"${trailingSpace}`),
        // BaseType/Class accept a list, so reopen suggest for the next value.
        ...(chain ? { command: TRIGGER_SUGGEST } : {}),
      }));
    }

    return availableNames.map((name) => ({
      label: name,
      kind,
      insertText: `"${name}" `,
      // BaseType/Class accept a list, so reopen suggest for the next value.
      ...(chain ? { command: TRIGGER_SUGGEST } : {}),
    }));
  }

  /**
   * The fully-quoted values already present on the line. When the cursor sits
   * inside an open quote (`hasActiveQuote`), that value is excluded so the one
   * being edited is still offered.
   */
  private quotedValuesOnLine(
    linePrefix: string,
    lineSuffix: string,
    hasActiveQuote: boolean
  ): Set<string> {
    const fullLine = linePrefix + lineSuffix;

    let scan = fullLine;
    if (hasActiveQuote) {
      const activeOpen = linePrefix.lastIndexOf('"');
      const closeRel = lineSuffix.indexOf('"');
      const activeEnd =
        closeRel === -1 ? fullLine.length : linePrefix.length + closeRel + 1;
      scan = fullLine.slice(0, activeOpen) + fullLine.slice(activeEnd);
    }

    const values = new Set<string>();
    const quoted = /"([^"]*)"/g;
    let match: RegExpExecArray | null;
    while ((match = quoted.exec(scan)) !== null) {
      values.add(match[1]);
    }
    return values;
  }

  /**
   * The three usable MinimapIcon sizes, labelled and kept in size order. After
   * a size is picked, suggest reopens for the icon colour.
   */
  private minimapSizeItems(): CompletionItem[] {
    const sizes = [
      { value: "0", detail: "Small" },
      { value: "1", detail: "Medium" },
      { value: "2", detail: "Large" },
    ];
    return sizes.map((size, index) => ({
      label: size.value,
      detail: size.detail,
      kind: CompletionItemKind.Value,
      insertText: `${size.value} `,
      sortText: String(index).padStart(4, "0"),
      command: TRIGGER_SUGGEST,
    }));
  }

  /**
   * Builds value completions in their declared order (e.g. Rarity: Normal,
   * Magic, Rare, Unique) instead of letting the editor sort alphabetically.
   * Each value inserts a trailing space so the cursor advances past it; when
   * `retrigger` is set the suggest widget reopens for the next value/argument
   * (used for list conditions like Rarity and chained action parameters).
   */
  private enumItems(
    values: string[],
    kind: CompletionItemKind,
    retrigger = false
  ): CompletionItem[] {
    return values.map((value, index) => ({
      label: value,
      kind,
      insertText: `${value} `,
      sortText: String(index).padStart(4, "0"),
      ...(retrigger ? { command: TRIGGER_SUGGEST } : {}),
    }));
  }

  /**
   * The whitespace-separated values already present on the line, excluding the
   * token currently under the cursor (so a value being edited is still offered).
   */
  private otherValuesOnLine(linePrefix: string, lineSuffix: string): Set<string> {
    const activeLeft = /(\S*)$/.exec(linePrefix)?.[1] ?? "";
    const activeRight = /^(\S*)/.exec(lineSuffix)?.[1] ?? "";
    const rest =
      linePrefix.slice(0, linePrefix.length - activeLeft.length) +
      " " +
      lineSuffix.slice(activeRight.length);
    return new Set(rest.split(/\s+/).filter(Boolean));
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
    lineSuffix: string,
    kind: CompletionContextKind
  ): CompletionItem[] {
    // Inside an open quote we complete the path typed so far; with no quote yet
    // (triggered right after the keyword) the partial is the last token typed,
    // and we insert the opening quote ourselves.
    const hasOpenQuote = (linePrefix.match(/"/g) ?? []).length % 2 === 1;
    const partial = hasOpenQuote
      ? linePrefix.match(/"([^"]*)$/)?.[1] ?? ""
      : linePrefix.match(/(\S*)$/)?.[1] ?? "";
    const openPrefix = hasOpenQuote ? "" : '"';

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

    // For files we also close the quote and move the cursor past it (consuming
    // an existing closing quote if the editor auto-inserted one).
    const hasClosingQuote = lineSuffix.startsWith('"');
    const fileReplaceRange = Range.create(
      position.line,
      position.character - fragment.length,
      position.line,
      position.character + (hasClosingQuote ? 1 : 0)
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
        // Skip VCS/editor/dependency noise and folders that hold nothing
        // usable, so the picker only lists places worth drilling into.
        if (entry.name.startsWith(".") || entry.name === "node_modules") {
          continue;
        }
        if (
          !this.directoryHasMatchingFile(
            path.join(listDir, entry.name),
            allowedExtensions
          )
        ) {
          continue;
        }
        items.push({
          label: entry.name,
          kind: CompletionItemKind.Folder,
          textEdit: TextEdit.replace(replaceRange, `${openPrefix}${entry.name}/`),
          // Re-trigger so the user can keep drilling into folders.
          command: TRIGGER_SUGGEST,
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
        textEdit: TextEdit.replace(fileReplaceRange, `${openPrefix}${entry.name}"`),
      });
    }

    return items;
  }

  /**
   * Bounded search for any file with one of `extensions` somewhere under
   * `rootDir`. Used to hide folders with nothing usable (e.g. a sound picker
   * should not list `.git`). Skips hidden/`node_modules` dirs and caps how much
   * it scans so completion stays responsive on large trees.
   */
  private directoryHasMatchingFile(
    rootDir: string,
    extensions: Set<string>
  ): boolean {
    const MAX_DIRS = 400;
    const MAX_DEPTH = 6;
    const stack: { dir: string; depth: number }[] = [
      { dir: rootDir, depth: 0 },
    ];
    let scanned = 0;

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        break;
      }
      if (scanned++ > MAX_DIRS) {
        return false;
      }

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current.dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (entry.isFile()) {
          if (extensions.has(path.extname(entry.name).toLowerCase())) {
            return true;
          }
        } else if (
          entry.isDirectory() &&
          current.depth < MAX_DEPTH &&
          !entry.name.startsWith(".") &&
          entry.name !== "node_modules"
        ) {
          stack.push({
            dir: path.join(current.dir, entry.name),
            depth: current.depth + 1,
          });
        }
      }
    }

    return false;
  }

  private getContextKind(linePrefix: string): CompletionContextKind | null {
    // Work out the path kind from the line's leading keyword, but only once we
    // are in the value region (a space after the keyword) so typing the keyword
    // itself still completes to keywords.
    let kind: CompletionContextKind | null = null;
    if (/^\s*Import\s+/.test(linePrefix)) {
      kind = "import";
    } else if (
      /^\s*(CustomAlertSound|CustomAlertSoundOptional)\s+/.test(linePrefix)
    ) {
      kind = "sound";
    }
    if (!kind) {
      return null;
    }

    const quoteCount = (linePrefix.match(/"/g) ?? []).length;
    // Inside an open quote: complete the path (drill into folders).
    if (quoteCount % 2 === 1) {
      return kind;
    }
    // No quote yet: offer the first level (the picker inserts the opening quote
    // itself, so this works right after the keyword - like Class).
    if (quoteCount === 0) {
      return kind;
    }
    // After a finished "..." value: nothing more to complete.
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
