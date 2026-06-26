import { execSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Generates a human-friendly, semantic diff of the PoE2 game data between two
 * states (typically the committed data on HEAD vs. the freshly synced working
 * tree).
 *
 * The raw JSON diffs are extremely noisy because:
 *   - Every row carries an `_index` that is reassigned whenever a table is
 *     re-exported, shifting nearly every line.
 *   - Foreign-key columns (e.g. `BaseItemTypes.ItemClass`) are stored as the
 *     numeric row index of the referenced table, so reordering one table
 *     cascades into spurious changes in tables that reference it.
 *
 * To produce a meaningful diff we:
 *   - Key every row by its stable `Id` field instead of `_index`.
 *   - Resolve foreign-key columns to the referenced row's `Id` so reordering
 *     no longer registers as a change.
 *   - Drop `_index` entirely before comparing.
 */

const dataDir = path.join(__dirname, "../data");
const configRelPath = "data/config.json";

interface TableConfig {
  name: string;
  columns: string[];
}

interface Config {
  patch: string;
  tables: TableConfig[];
  translations: string[];
}

type Row = Record<string, unknown>;

/**
 * Foreign-key columns that store the numeric `_index` of a row in another
 * table. These are resolved to the referenced row's `Id` so that index
 * reshuffling does not show up as a change.
 */
const REFERENCES: Record<string, Record<string, string>> = {
  BaseItemTypes: {
    ItemClass: "ItemClasses",
  },
};

interface CliOptions {
  base: string;
  head?: string;
  out?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { base: "HEAD" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base") {
      options.base = argv[++i];
    } else if (arg === "--head") {
      options.head = argv[++i];
    } else if (arg === "--out") {
      options.out = argv[++i];
    }
  }
  return options;
}

/** Reads a JSON file from a git ref, returning null if it does not exist. */
function readJsonFromGit<T>(ref: string, relPath: string): T | null {
  try {
    const content = execSync(`git show ${ref}:${relPath}`, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 256,
    });
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/** Reads a JSON file from the working tree, returning null if it does not exist. */
function readJsonFromDisk<T>(relPath: string): T | null {
  try {
    const absPath = path.join(__dirname, "..", relPath);
    return JSON.parse(fs.readFileSync(absPath, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Loads a data state (config + all translation tables) for a given ref. When
 * `ref` is undefined the working tree is read from disk.
 */
function loadState(ref: string | undefined): {
  config: Config | null;
  tables: Map<string, Row[] | null>;
} {
  const readJson = <T>(relPath: string): T | null =>
    ref ? readJsonFromGit<T>(ref, relPath) : readJsonFromDisk<T>(relPath);

  const config = readJson<Config>(configRelPath);
  const tables = new Map<string, Row[] | null>();

  if (config) {
    for (const translation of config.translations) {
      for (const table of config.tables) {
        const relPath = `data/tables/${translation}/${table.name}.json`;
        tables.set(`${translation}/${table.name}`, readJson<Row[]>(relPath));
      }
    }
  }

  return { config, tables };
}

/** Builds a lookup of `_index` -> `Id` for a referenced table. */
function buildIndexToId(rows: Row[] | null | undefined): Map<number, string> {
  const map = new Map<number, string>();
  if (!rows) {
    return map;
  }
  for (const row of rows) {
    const index = row._index;
    const id = row.Id;
    if (typeof index === "number" && typeof id === "string") {
      map.set(index, id);
    }
  }
  return map;
}

/**
 * Returns a normalized copy of a row: `_index` removed and foreign-key columns
 * resolved to the referenced `Id`.
 */
function normalizeRow(
  tableName: string,
  row: Row,
  referencedTables: Map<string, Map<number, string>>
): Row {
  const normalized: Row = {};
  const refs = REFERENCES[tableName] ?? {};

  for (const [key, value] of Object.entries(row)) {
    if (key === "_index") {
      continue;
    }
    const referencedTable = refs[key];
    if (referencedTable && typeof value === "number") {
      const lookup = referencedTables.get(referencedTable);
      normalized[key] = lookup?.get(value) ?? `#${value}`;
    } else {
      normalized[key] = value;
    }
  }

  return normalized;
}

/** Keys rows by their stable `Id`, normalizing each row. */
function keyRowsById(
  tableName: string,
  rows: Row[] | null,
  referencedTables: Map<string, Map<number, string>>
): Map<string, Row> {
  const map = new Map<string, Row>();
  if (!rows) {
    return map;
  }
  for (const row of rows) {
    const id = row.Id;
    if (typeof id === "string") {
      map.set(id, normalizeRow(tableName, row, referencedTables));
    }
  }
  return map;
}

interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

interface ModifiedRow {
  id: string;
  name?: string;
  changes: FieldChange[];
}

interface TableDiff {
  table: string;
  added: { id: string; name?: string }[];
  removed: { id: string; name?: string }[];
  modified: ModifiedRow[];
}

function rowName(row: Row | undefined): string | undefined {
  if (row && typeof row.Name === "string" && row.Name.length > 0) {
    return row.Name;
  }
  return undefined;
}

/** Splits text into trimmed, non-empty lines, keeping any in-game markup. */
function rawTextLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Decides whether two field values represent a meaningful change. Text is
 * compared as an order-insensitive set of raw lines, so a pure reordering of
 * identical lines is ignored, while any real change — including styling/markup
 * such as a colour — still counts as a modification.
 */
function valuesDiffer(before: unknown, after: unknown): boolean {
  if (typeof before === "string" && typeof after === "string") {
    const a = rawTextLines(before).sort();
    const b = rawTextLines(after).sort();
    return a.length !== b.length || a.some((line, i) => line !== b[i]);
  }
  return JSON.stringify(before) !== JSON.stringify(after);
}

function diffTable(
  tableName: string,
  oldRows: Map<string, Row>,
  newRows: Map<string, Row>
): TableDiff {
  const diff: TableDiff = {
    table: tableName,
    added: [],
    removed: [],
    modified: [],
  };

  for (const [id, row] of newRows) {
    if (!oldRows.has(id)) {
      diff.added.push({ id, name: rowName(row) });
    }
  }

  for (const [id, row] of oldRows) {
    if (!newRows.has(id)) {
      diff.removed.push({ id, name: rowName(row) });
    }
  }

  for (const [id, newRow] of newRows) {
    const oldRow = oldRows.get(id);
    if (!oldRow) {
      continue;
    }
    const changes: FieldChange[] = [];
    const fields = new Set([...Object.keys(oldRow), ...Object.keys(newRow)]);
    for (const field of fields) {
      const before = oldRow[field];
      const after = newRow[field];
      if (valuesDiffer(before, after)) {
        changes.push({ field, before, after });
      }
    }
    if (changes.length > 0) {
      diff.modified.push({ id, name: rowName(newRow), changes });
    }
  }

  return diff;
}

const MAX_DETAIL_ROWS = 50;
const MAX_TEXT_LINES = 25;

/** Human-friendly labels for the fields we surface in modification diffs. */
const FIELD_LABELS: Record<string, string> = {
  ItemClass: "item class",
  DropLevel: "drop level",
  Name: "name",
};

/**
 * Strips PoE's in-game text markup so the result reads as plain prose. Game
 * text uses constructs like `<<Anchor>>`, `<rgb(r,g,b)>{text}`,
 * `<font:'fontin'>{text}` and `<italic>{text}`, often deeply nested. Humans
 * reviewing a data update care about the words, not the styling tags.
 */
function stripMarkup(text: string): string {
  let out = text.replace(/<<[^>]*>>/g, "");
  // Resolve `<tag>{content}` from the inside out until nothing is left to peel.
  let previous: string;
  do {
    previous = out;
    out = out.replace(/<[^<>]*>\{([^{}]*)\}/g, "$1");
  } while (out !== previous);
  // Resolve inline links `[Target|Display text]` to their display text, and
  // bare `[Term]` references to the term itself.
  out = out
    .replace(/\[[^\[\]|]*\|([^\[\]]*)\]/g, "$1")
    .replace(/\[([^\[\]]*)\]/g, "$1");
  // Drop any leftover stray tags or braces, then normalize whitespace and turn
  // line breaks into readable separators.
  out = out.replace(/<[^<>]*>/g, "").replace(/[{}]/g, "");
  return out
    .replace(/\r?\n+/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

/** Renders a human-readable label for a row, cleaned and truncated. */
function cleanLabel(text: string, max = 90): string {
  return truncate(stripMarkup(text), max);
}

/**
 * Splits multi-line game text into individual, markup-stripped lines. Many
 * values (notably mod descriptions) are several lines of text; splitting them
 * lets us render one readable, indented line per entry instead of a single
 * long run-on string.
 */
function textToLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => stripMarkup(line))
    .filter((line) => line.length > 0);
}

/** Cleans a scalar field value for display inside a diff line. */
function scalarText(value: unknown): string {
  if (value === undefined || value === "") {
    return "(none)";
  }
  if (typeof value === "string") {
    return stripMarkup(value);
  }
  return String(value);
}

/** Wraps lines in a GitHub `diff` fenced block so +/-/@@ get colorized. */
function diffFence(body: string[]): string[] {
  return ["```diff", ...body, "```"];
}

/**
 * Builds the +/- lines for an added or removed entry. Multi-line text (e.g. a
 * mod description) yields one prefixed line per line of text.
 */
function entryLines(
  entry: { id: string; name?: string },
  sign: "+" | "-"
): string[] {
  const textLines = entry.name ? textToLines(entry.name) : [entry.id];
  const out: string[] = [];
  for (const line of textLines.slice(0, MAX_TEXT_LINES)) {
    out.push(`${sign} ${truncate(line, 160)}`);
  }
  const overflow = textLines.length - MAX_TEXT_LINES;
  if (overflow > 0) {
    out.push(`${sign} …and ${overflow} more lines`);
  }
  return out;
}

/** Set-based line diff: lines only in old (`-`) then lines only in new (`+`). */
function lineDiff(oldLines: string[], newLines: string[]): string[] {
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const out: string[] = [];
  for (const line of oldLines) {
    if (!newSet.has(line)) {
      out.push(`- ${truncate(line, 160)}`);
    }
  }
  for (const line of newLines) {
    if (!oldSet.has(line)) {
      out.push(`+ ${truncate(line, 160)}`);
    }
  }
  return out;
}

/** Builds the diff lines for one modified row as a `@@ name @@` hunk. */
function modifiedHunk(m: ModifiedRow): string[] {
  const nameChange = m.changes.find((c) => c.field === "Name");
  const otherChanges = m.changes.filter((c) => c.field !== "Name");

  const oldLines = nameChange
    ? textToLines(String(nameChange.before ?? ""))
    : [];
  const newLines = nameChange
    ? textToLines(String(nameChange.after ?? ""))
    : [];

  const label = nameChange
    ? newLines[0] ?? oldLines[0] ?? m.id
    : m.name
      ? cleanLabel(m.name)
      : m.id;

  const out = [`@@ ${truncate(label, 90)} @@`];

  if (nameChange) {
    const before = String(nameChange.before ?? "");
    const after = String(nameChange.after ?? "");
    const textChanged = lineDiff(oldLines, newLines);
    if (textChanged.length > 0) {
      // The visible wording changed — show the clean, human-readable diff.
      out.push(...textChanged.slice(0, MAX_TEXT_LINES));
    } else {
      // Wording is unchanged, so the difference is styling/markup (e.g. a
      // colour). Show the raw line diff so the change is still visible.
      out.push(
        ...lineDiff(rawTextLines(before), rawTextLines(after)).slice(
          0,
          MAX_TEXT_LINES
        )
      );
    }
  }

  for (const c of otherChanges) {
    const fieldLabel = FIELD_LABELS[c.field] ?? c.field;
    out.push(`- ${fieldLabel}: ${scalarText(c.before)}`);
    out.push(`+ ${fieldLabel}: ${scalarText(c.after)}`);
  }

  return out;
}

/** Normalizes a color token to a form GitHub renders with a swatch. */
function normalizeColor(token: string): string {
  const rgb = token.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgb) {
    return `rgb(${rgb[1]}, ${rgb[2]}, ${rgb[3]})`;
  }
  return token.toLowerCase();
}

/** Extracts color tokens (`rgb(...)` / `#rrggbb`) from a line of game text. */
function extractColors(raw: string): string[] {
  const matches =
    raw.match(/rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|#[0-9a-fA-F]{6}\b/gi) ?? [];
  return matches.map(normalizeColor);
}

/** True when a modified row's only change is styling (wording unchanged). */
function isStyleOnlyMod(m: ModifiedRow): boolean {
  const nameChange = m.changes.find((c) => c.field === "Name");
  const other = m.changes.filter((c) => c.field !== "Name");
  if (!nameChange || other.length > 0) {
    return false;
  }
  const oldLines = textToLines(String(nameChange.before ?? ""));
  const newLines = textToLines(String(nameChange.after ?? ""));
  return lineDiff(oldLines, newLines).length === 0;
}

/**
 * Describes styling-only differences as indented sub-bullets. Color changes are
 * rendered with `rgb(...)`/`#hex` tokens in backticks so GitHub shows a swatch.
 */
function styleChangeLines(before: string, after: string): string[] {
  const oldByText = new Map<string, string>();
  for (const raw of rawTextLines(before)) {
    oldByText.set(stripMarkup(raw), raw);
  }
  const out: string[] = [];
  for (const raw of rawTextLines(after)) {
    if (out.length >= MAX_TEXT_LINES) {
      break;
    }
    const text = stripMarkup(raw);
    const oldRaw = oldByText.get(text);
    if (oldRaw === undefined || oldRaw === raw) {
      continue;
    }
    const oldColors = extractColors(oldRaw);
    const newColors = extractColors(raw);
    const colorsChanged =
      oldColors.length !== newColors.length ||
      oldColors.some((c, i) => c !== newColors[i]);
    if (colorsChanged && (oldColors.length > 0 || newColors.length > 0)) {
      const fmt = (cs: string[]): string =>
        cs.length > 0 ? cs.map((c) => `\`${c}\``).join(" ") : "_(none)_";
      out.push(
        `  - \`${truncate(text, 120)}\` — colour ${fmt(oldColors)} → ${fmt(newColors)}`
      );
    } else {
      out.push(`  - \`${truncate(text, 120)}\` — formatting changed`);
    }
  }
  return out;
}

/** Renders a styling-only modified row as a markdown list entry with swatches. */
function styleModEntry(m: ModifiedRow): string[] {
  const nameChange = m.changes.find((c) => c.field === "Name");
  const before = String(nameChange?.before ?? "");
  const after = String(nameChange?.after ?? "");
  const label = textToLines(after)[0] ?? textToLines(before)[0] ?? m.id;
  return [`- **${truncate(label, 90)}**`, ...styleChangeLines(before, after)];
}

function renderTableSection(diff: TableDiff): string {
  const lines: string[] = [
    `### ${diff.table} — ${diff.added.length} added, ${diff.removed.length} removed, ${diff.modified.length} modified`,
  ];

  if (diff.added.length + diff.removed.length + diff.modified.length === 0) {
    lines.push("", "_No meaningful changes (only internal reordering)._");
    return lines.join("\n");
  }

  const addBlock = (summary: string, body: string[]): void => {
    lines.push("", `<details><summary>${summary}</summary>`, "");
    lines.push(...diffFence(body));
    lines.push("", "</details>");
  };

  if (diff.added.length > 0) {
    const body: string[] = [];
    let first = true;
    for (const a of diff.added.slice(0, MAX_DETAIL_ROWS)) {
      const entry = entryLines(a, "+");
      if (!first && entry.length > 1) {
        body.push("");
      }
      body.push(...entry);
      first = false;
    }
    if (diff.added.length > MAX_DETAIL_ROWS) {
      body.push(`+ …and ${diff.added.length - MAX_DETAIL_ROWS} more`);
    }
    addBlock(`➕ Added (${diff.added.length})`, body);
  }

  if (diff.removed.length > 0) {
    const body: string[] = [];
    let first = true;
    for (const r of diff.removed.slice(0, MAX_DETAIL_ROWS)) {
      const entry = entryLines(r, "-");
      if (!first && entry.length > 1) {
        body.push("");
      }
      body.push(...entry);
      first = false;
    }
    if (diff.removed.length > MAX_DETAIL_ROWS) {
      body.push(`- …and ${diff.removed.length - MAX_DETAIL_ROWS} more`);
    }
    addBlock(`➖ Removed (${diff.removed.length})`, body);
  }

  if (diff.modified.length > 0) {
    // Styling-only changes are rendered as a markdown list (so GitHub can draw
    // color swatches); everything else goes in a diff code block.
    const styleMods = diff.modified.filter(isStyleOnlyMod);
    const textMods = diff.modified.filter((m) => !isStyleOnlyMod(m));

    lines.push(
      "",
      `<details><summary>✏️ Modified (${diff.modified.length})</summary>`,
      ""
    );

    if (textMods.length > 0) {
      const body: string[] = [];
      let first = true;
      for (const m of textMods.slice(0, MAX_DETAIL_ROWS)) {
        if (!first) {
          body.push("");
        }
        body.push(...modifiedHunk(m));
        first = false;
      }
      if (textMods.length > MAX_DETAIL_ROWS) {
        body.push("", `@@ …and ${textMods.length - MAX_DETAIL_ROWS} more @@`);
      }
      lines.push(...diffFence(body));
    }

    if (styleMods.length > 0) {
      if (textMods.length > 0) {
        lines.push("");
      }
      lines.push("**Styling changes**", "");
      for (const m of styleMods.slice(0, MAX_DETAIL_ROWS)) {
        lines.push(...styleModEntry(m));
      }
      if (styleMods.length > MAX_DETAIL_ROWS) {
        lines.push(`- _…and ${styleMods.length - MAX_DETAIL_ROWS} more_`);
      }
    }

    lines.push("", "</details>");
  }

  return lines.join("\n");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));

  const oldState = loadState(options.base);
  const newState = loadState(options.head);

  const oldVersion = oldState.config?.patch ?? "unknown";
  const newVersion = newState.config?.patch ?? "unknown";

  // Resolve referenced tables for each state so foreign keys map to Ids.
  const oldReferenced = new Map<string, Map<number, string>>();
  const newReferenced = new Map<string, Map<number, string>>();
  const translation = newState.config?.translations[0] ?? "English";
  for (const referencedName of new Set(
    Object.values(REFERENCES).flatMap((r) => Object.values(r))
  )) {
    oldReferenced.set(
      referencedName,
      buildIndexToId(oldState.tables.get(`${translation}/${referencedName}`))
    );
    newReferenced.set(
      referencedName,
      buildIndexToId(newState.tables.get(`${translation}/${referencedName}`))
    );
  }

  const tableNames = newState.config?.tables.map((t) => t.name) ?? [];
  const diffs: TableDiff[] = [];
  for (const tableName of tableNames) {
    const key = `${translation}/${tableName}`;
    const oldRows = keyRowsById(
      tableName,
      oldState.tables.get(key) ?? null,
      oldReferenced
    );
    const newRows = keyRowsById(
      tableName,
      newState.tables.get(key) ?? null,
      newReferenced
    );
    diffs.push(diffTable(tableName, oldRows, newRows));
  }

  const totals = diffs.reduce(
    (acc, d) => {
      acc.added += d.added.length;
      acc.removed += d.removed.length;
      acc.modified += d.modified.length;
      return acc;
    },
    { added: 0, removed: 0, modified: 0 }
  );
  const hasTableChanges =
    totals.added + totals.removed + totals.modified > 0;

  const lines: string[] = [];
  lines.push("## 📋 Game data update");
  lines.push("");
  if (oldVersion !== newVersion) {
    lines.push(
      `Patch version: \`${oldVersion}\` → \`${newVersion}\``
    );
  } else {
    lines.push(`Patch version: \`${newVersion}\` (unchanged)`);
  }
  lines.push("");

  if (!hasTableChanges) {
    lines.push(
      "> [!NOTE]",
      "> **Version bump only** — the patch version changed, but no items, classes or mods were added, removed or edited. This update can be merged automatically.",
      ""
    );
  } else {
    lines.push("### Summary");
    lines.push("");
    lines.push("| Table | Added | Removed | Modified |");
    lines.push("| --- | --: | --: | --: |");
    for (const d of diffs) {
      lines.push(
        `| ${d.table} | ${d.added.length} | ${d.removed.length} | ${d.modified.length} |`
      );
    }
    lines.push("");
    for (const d of diffs) {
      lines.push(renderTableSection(d));
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(
    "_🤖 Automatically generated by the data update workflow. Entries are matched by identity, so internal reordering is ignored — only real additions, removals and edits are listed._"
  );

  const markdown = lines.join("\n");

  if (options.out) {
    fs.writeFileSync(options.out, markdown);
  }

  // Expose results to GitHub Actions: the rendered body (multiline) and a flag
  // indicating whether any semantic (non-index) changes were detected. The flag
  // lets the workflow auto-merge pure version bumps even when index reshuffling
  // produced large but meaningless raw file diffs.
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    const delimiter = `BODY_EOF_${Date.now()}`;
    fs.appendFileSync(
      githubOutput,
      `has_semantic_changes=${hasTableChanges}\n` +
        `body<<${delimiter}\n${markdown}\n${delimiter}\n`
    );
  }

  // Always print to stdout so it can be inspected in CI logs.
  process.stdout.write(markdown + "\n");
}

main();
