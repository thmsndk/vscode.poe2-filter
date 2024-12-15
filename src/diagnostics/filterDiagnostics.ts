import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

// Function to extract commands from the grammar file
function extractCommandsFromGrammar(): Record<
  string,
  { params: { type: string; required: boolean }[] }
> {
  try {
    // Read the grammar file
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

    // Extract block commands (Show/Hide/etc)
    const blocks = grammar.repository.blocks.patterns.find(
      (p: any) => p.name === "keyword.control.poe2filter"
    );
    if (blocks?.match) {
      // Extract just the command names from the pattern
      const blockCommandsMatch = blocks.match.match(/\((.*?)\)/)?.[1];
      if (blockCommandsMatch) {
        const blockCommands = blockCommandsMatch.split("|");
        blockCommands.forEach((cmd: string) => {
          commands[cmd] = { params: [] };
        });
      }
    }

    // Extract control flow commands (Continue)
    const controlFlow = grammar.repository.controlFlow.patterns.find(
      (p: any) => p.name === "keyword.control.poe2filter"
    );
    if (controlFlow?.match) {
      const flowCommandsMatch = controlFlow.match.match(/\\b(.*?)\\b/)?.[1];
      if (flowCommandsMatch) {
        const flowCommands = flowCommandsMatch.split("|");
        flowCommands.forEach((cmd: string) => {
          commands[cmd] = { params: [] };
        });
      }
    }

    // Log the extracted commands for debugging
    console.log("Extracted commands:", commands);

    // Extract conditions
    const conditions = grammar.repository.conditions.patterns.find(
      (p: any) => p.name === "support.function.poe2filter"
    );
    if (conditions?.match) {
      const conditionCommands = conditions.match
        .replace(/[()\\b]/g, "")
        .split("|");
      conditionCommands.forEach((cmd: string) => {
        commands[cmd] = {
          params: [{ type: "value", required: true }],
        };
      });
    }

    // Extract color commands
    const colorActions = grammar.repository.actions.patterns.find(
      (p: any) => p.name === "meta.color.poe2filter"
    );
    if (colorActions?.match) {
      // Extract just the command names from the pattern
      const colorCommandsMatch = colorActions.match.match(/\((.*?)\)/)?.[1];
      if (colorCommandsMatch) {
        const colorCommands = colorCommandsMatch.split("|");
        colorCommands.forEach((cmd: string) => {
          commands[cmd] = {
            params: [
              { type: "color", required: true },
              { type: "color", required: true },
              { type: "color", required: true },
              { type: "color", required: false }, // Alpha is optional
            ],
          };
        });
      }
    }

    // Extract other action commands
    const otherActions = grammar.repository.actions.patterns.find(
      (p: any) => p.name === "storage.type.poe2filter"
    );
    if (otherActions?.match) {
      // Extract just the command names from the pattern
      const actionCommandsMatch = otherActions.match.match(/\((.*?)\)/)?.[1];
      if (actionCommandsMatch) {
        const actionCommands = actionCommandsMatch.split("|");
        actionCommands.forEach((cmd: string) => {
          commands[cmd] = {
            params: [{ type: "number", required: true }],
          };
        });
      }
    }

    return commands;
  } catch (error) {
    console.error("Error loading grammar file:", error);
    return {};
  }
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
