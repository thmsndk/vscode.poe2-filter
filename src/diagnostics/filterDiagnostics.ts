import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

// Function to extract commands from the grammar file
function extractCommandsFromGrammar(): Record<
  string,
  { params: { type: string; required: boolean }[] }
> {
  try {
    const grammarPath = path.join(
      __dirname,
      "..",
      "syntaxes",
      "poe2filter.tmLanguage.json"
    );
    const grammarContent = fs.readFileSync(grammarPath, "utf8");
    const grammar = JSON.parse(grammarContent);
    const commands: Record<
      string,
      { params: { type: string; required: boolean }[] }
    > = {};

    // Helper to extract command names from a pattern
    function extractCommands(pattern: any): string[] {
      // For patterns with storage.type name and direct word matches
      if (pattern.name?.includes("storage.type") && pattern.match) {
        const storageMatch = pattern.match.match(/\\b\(([^)]+)\)\\b/)?.[1];
        if (storageMatch) {
          return storageMatch.split("|");
        }
      }
      // For block commands that start with ^ (Show, Hide)
      else if (pattern.match?.startsWith("^")) {
        const blockMatch = pattern.match.match(/\^?\(([^)]+)\)/)?.[1];
        if (blockMatch) {
          return blockMatch.split("|");
        }
      }
      // For patterns with direct word matches (like Continue)
      else if (pattern.match?.includes("\\b") && !pattern.captures) {
        const wordMatch = pattern.match.match(/\\b(\w+)\\b/)?.[1];
        if (wordMatch) {
          return [wordMatch];
        }
      }
      // For patterns with explicit command names in first capture
      else if (pattern.captures?.["1"]) {
        // First try to get from the first word in the match pattern
        const firstWordMatch = pattern.match.match(/\\b(\w+)\\b/)?.[1];
        if (firstWordMatch) {
          return [firstWordMatch];
        }

        // Fallback to looking for parentheses groups
        const parenthesesMatch = pattern.match.match(/\(([^)]+)\)/)?.[1];
        if (parenthesesMatch) {
          return parenthesesMatch.split("|");
        }
      }
      // For patterns with direct command matches
      else if (pattern.match) {
        const directMatch = pattern.match.match(
          /\^?\(?([^\\()\s]+(?:\|[^\\()\s]+)*)\)?\\b/
        )?.[1];
        return directMatch ? directMatch.split("|") : [];
      }

      return [];
    }

    // Process each section
    ["blocks", "controlFlow", "conditions", "actions"].forEach((section) => {
      grammar.repository[section].patterns.forEach((pattern: any) => {
        const commandNames = extractCommands(pattern);

        commandNames.forEach((cmd) => {
          // Skip if we already have this command
          if (commands[cmd]) {
            return;
          }

          const params: { type: string; required: boolean }[] = [];

          // Add parameters if pattern has captures
          if (pattern.captures) {
            const captureKeys = Object.keys(pattern.captures)
              .map(Number)
              .filter((n) => n > 1) // Skip command name capture
              .sort();

            captureKeys.forEach((key) => {
              const capture = pattern.captures[key];
              const paramType = getParamTypeFromScope(capture.name);
              const isOptional =
                pattern.match.includes("?") &&
                pattern.match.indexOf("?") > pattern.match.indexOf(`${key}`);
              params.push({ type: paramType, required: !isOptional });
            });
          }

          commands[cmd] = { params };
        });
      });
    });

    console.log("Extracted commands:", Object.keys(commands)); // Debug output
    return commands;
  } catch (error) {
    console.error("Error loading grammar file:", error);
    return {};
  }
}

function getParamTypeFromScope(scope: string): string {
  if (!scope) {
    return "unknown";
  }
  if (scope.includes("numeric")) {
    return "number";
  }
  if (scope.includes("quoted.double")) {
    return "string";
  }
  if (scope.includes("operator")) {
    return "operator";
  }
  if (scope.includes("color")) {
    return "color";
  }
  if (scope.includes("shape")) {
    return "shape";
  }
  if (scope.includes("rarity")) {
    return "rarity";
  }
  if (scope.includes("language")) {
    return "constant";
  }
  return "unknown";
}

// Use the extracted commands
const VALID_COMMANDS = extractCommandsFromGrammar();

// TODO: detect nested blocks
// TODO: detect empty blocks
// TODO: detect definitions later that is being overriden earlier? e.g. doing something explicit later in the file, but a previous rule catches it instead
// TODO: PlayAlertSound|PlayAlertSoundPositional number volume with custom sound requires CustomAlertSound "file" volume

export function registerDiagnostics(context: vscode.ExtensionContext) {
  const diagnostics =
    vscode.languages.createDiagnosticCollection("poe2-filter");
  context.subscriptions.push(diagnostics);

  // Validate on open
  if (vscode.window.activeTextEditor) {
    validateAndUpdateDiagnostics(
      vscode.window.activeTextEditor.document,
      diagnostics
    );
  }

  // Validate on editor change
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        validateAndUpdateDiagnostics(editor.document, diagnostics);
      }
    })
  );

  // Validate on document change
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === "poe2-filter") {
        validateAndUpdateDiagnostics(event.document, diagnostics);
      }
    })
  );
}

function validateAndUpdateDiagnostics(
  document: vscode.TextDocument,
  diagnostics: vscode.DiagnosticCollection
) {
  if (document.languageId === "poe2-filter") {
    const problems = validateDocument(document);
    diagnostics.set(document.uri, problems);
  }
}

// Function to calculate Levenshtein distance between two strings
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) {
    return b.length;
  }

  if (b.length === 0) {
    return a.length;
  }

  const matrix = Array(b.length + 1)
    .fill(null)
    .map(() => Array(a.length + 1).fill(null));

  for (let i = 0; i <= a.length; i++) {
    matrix[0][i] = i;
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + substitutionCost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

// Function to find similar commands
function findSimilarCommands(
  command: string,
  validCommands: string[]
): string[] {
  const MAX_DISTANCE = 3; // Maximum edit distance to consider
  const MAX_SUGGESTIONS = 3; // Maximum number of suggestions to return

  return validCommands
    .map((valid) => ({
      command: valid,
      distance: levenshteinDistance(command.toLowerCase(), valid.toLowerCase()),
    }))
    .filter((result) => result.distance <= MAX_DISTANCE)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_SUGGESTIONS)
    .map((result) => result.command);
}

export function validateDocument(
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  const problems: vscode.Diagnostic[] = [];
  const validCommands = Object.keys(VALID_COMMANDS);

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const trimmedText = line.text.trim();

    // Skip empty lines and comments
    if (trimmedText === "" || trimmedText.startsWith("#")) {
      continue;
    }

    const parts = trimmedText.split(" ");
    const command = parts[0];

    if (!VALID_COMMANDS[command as keyof typeof VALID_COMMANDS]) {
      // Find similar commands
      const suggestions = findSimilarCommands(command, validCommands);

      const message =
        suggestions.length > 0
          ? `Unknown command "${command}". Did you mean: ${suggestions.join(
              ", "
            )}?`
          : `Unknown command "${command}"`;

      problems.push(
        createDiagnostic(
          new vscode.Range(
            line.range.start,
            line.range.start.translate(0, command.length)
          ),
          message,
          vscode.DiagnosticSeverity.Error
        )
      );
      continue;
    }

    // Validate commands and parameters
    if (command.endsWith("Color")) {
      validateColorParameters(line, parts, problems);
    }
    // Add more parameter validation as needed
  }

  return problems;
}

function validateColorParameters(
  line: vscode.TextLine,
  parts: string[],
  problems: vscode.Diagnostic[]
) {
  // Remove any comments from parts array
  const commandParts = parts
    .join(" ")
    .split("#")[0] // Split on comment and take first part
    .trim()
    .split(/\s+/);

  // Check minimum number of parameters (R G B)
  if (commandParts.length < 4) {
    problems.push(
      createDiagnostic(
        line.range,
        "Color commands require at least 3 parameters (R G B)",
        vscode.DiagnosticSeverity.Error
      )
    );
    return;
  }

  // Validate each color component (R G B [A])
  const colorComponents = commandParts.slice(1, 5); // Get up to 4 components
  colorComponents.forEach((value, index) => {
    // Skip if it's beyond RGB and no alpha value provided
    if (index === 3 && colorComponents.length < 5) {
      return;
    }

    const num = parseInt(value);
    if (isNaN(num)) {
      problems.push(
        createDiagnostic(
          new vscode.Range(
            line.range.start.translate(0, line.text.indexOf(value)),
            line.range.start.translate(
              0,
              line.text.indexOf(value) + value.length
            )
          ),
          "Color values must be numbers",
          vscode.DiagnosticSeverity.Error
        )
      );
    } else if (num < 0 || num > 255) {
      problems.push(
        createDiagnostic(
          new vscode.Range(
            line.range.start.translate(0, line.text.indexOf(value)),
            line.range.start.translate(
              0,
              line.text.indexOf(value) + value.length
            )
          ),
          "Color values must be between 0 and 255",
          vscode.DiagnosticSeverity.Error
        )
      );
    }
  });
}

function createDiagnostic(
  range: vscode.Range,
  message: string,
  severity: vscode.DiagnosticSeverity
): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(range, message, severity);
  diagnostic.source = "poe2-filter";
  return diagnostic;
}
