import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { checkRuleConflicts } from "./filterConflicts";
// TODO: forogetting a hide/show function above conditions or actions, especially if there is a comment above it saying "Show" or "Hide"
interface CommandPattern {
  name?: string;
  match?: string;
  captures?: Record<string, { name: string }>;
  begin?: string;
  beginCaptures?: Record<string, { name: string }>;
  patterns?: CommandPattern[];
}

interface CommandDefinition {
  params: { type: string; required: boolean }[];
}

function extractCommandsFromGrammar(): Record<string, CommandDefinition> {
  try {
    const grammarPath = path.join(
      __dirname,
      "..",
      "syntaxes",
      "poe2filter.tmLanguage.json"
    );
    const grammarContent = fs.readFileSync(grammarPath, "utf8");
    const grammar = JSON.parse(grammarContent);
    const commands: Record<string, CommandDefinition> = {};

    function extractCommandsAndParams(pattern: CommandPattern): {
      commands: string[];
      params: { type: string; required: boolean }[];
    } {
      let commands: string[] = [];
      let params: { type: string; required: boolean }[] = [];

      // For patterns with begin/beginCaptures
      if (pattern.begin && pattern.beginCaptures?.["1"]) {
        const beginMatch =
          pattern.begin.match(/\\b\(([^)]+)\)\\b/)?.[1] ||
          pattern.begin.match(/\\b(\w+)\\b/)?.[1];
        if (beginMatch) {
          commands = beginMatch.split("|");
        }

        // Extract parameters from the patterns array
        if (pattern.patterns) {
          pattern.patterns.forEach((subPattern) => {
            if (subPattern.captures) {
              Object.entries(subPattern.captures)
                .filter(([key]) => key !== "1") // Skip the command name capture
                .forEach(([_, capture]) => {
                  const paramType = getParamTypeFromScope(capture.name);
                  const isOptional = (subPattern.match || "").includes("?");
                  params.push({ type: paramType, required: !isOptional });
                });
            }
          });
        }
      }
      // For patterns with direct captures
      else if (pattern.captures) {
        const firstWordMatch = pattern.match?.match(/\\b(\w+)\\b/)?.[1];
        if (firstWordMatch) {
          commands = [firstWordMatch];
        }

        // Extract parameters from captures
        Object.entries(pattern.captures)
          .filter(([key]) => key !== "1") // Skip the command name capture
          .forEach(([_, capture]) => {
            const paramType = getParamTypeFromScope(capture.name);
            const isOptional = (pattern.match || "").includes("?");
            params.push({ type: paramType, required: !isOptional });
          });
      }
      // For simple command patterns
      else if (pattern.match) {
        if (pattern.match.startsWith("^")) {
          const blockMatch = pattern.match.match(/\^?\(([^)]+)\)/)?.[1];
          if (blockMatch) {
            commands = blockMatch.split("|");
          }
        } else if (pattern.name?.includes("storage.type")) {
          const storageMatch = pattern.match.match(/\\b\(([^)]+)\)\\b/)?.[1];
          if (storageMatch) {
            commands = storageMatch.split("|");
          }
        } else {
          const wordMatch = pattern.match.match(/\\b(\w+)\\b/)?.[1];
          if (wordMatch) {
            commands = [wordMatch];
          }
        }
      }

      return { commands, params };
    }

    // Process each section
    ["blocks", "controlFlow", "conditions", "actions"].forEach((section) => {
      (grammar.repository[section].patterns as CommandPattern[]).forEach(
        (pattern) => {
          const { commands: commandNames, params } =
            extractCommandsAndParams(pattern);

          commandNames.forEach((cmd) => {
            if (!commands[cmd]) {
              commands[cmd] = { params };
            }
          });
        }
      );
    });

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

function validateColorParameter(
  value: string,
  line: vscode.TextLine,
  problems: vscode.Diagnostic[]
) {
  const num = parseInt(value);
  if (isNaN(num)) {
    problems.push(
      createDiagnostic(
        new vscode.Range(
          line.range.start.translate(0, line.text.indexOf(value)),
          line.range.start.translate(0, line.text.indexOf(value) + value.length)
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
          line.range.start.translate(0, line.text.indexOf(value) + value.length)
        ),
        "Color values must be between 0 and 255",
        vscode.DiagnosticSeverity.Error
      )
    );
  }
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

    validateColorParameter(value, line, problems);
  });
}

export function validateDocument(
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  const problems: vscode.Diagnostic[] = [];
  const validCommands = Object.keys(VALID_COMMANDS);

  // Add rule conflict checks
  problems.push(...checkRuleConflicts(document));

  // Rest of the existing validation logic
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const trimmedText = line.text.trim();

    // Skip empty lines and comments
    if (trimmedText === "" || trimmedText.startsWith("#")) {
      continue;
    }

    // Split on comment and take first part, then split into parts
    const parts = trimmedText.split("#")[0].trim().split(/\s+/);
    const command = parts[0];
    const commandDef = VALID_COMMANDS[command];

    if (!commandDef) {
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

    // Special handling for color commands
    if (command.endsWith("Color")) {
      validateColorParameters(line, parts, problems);
      continue;
    }

    // Validate parameters based on command definition
    const params = parts.slice(1);
    commandDef.params.forEach((paramDef, index) => {
      if (paramDef.required && !params[index]) {
        problems.push(
          createDiagnostic(
            line.range,
            `Missing required parameter ${index + 1} of type ${paramDef.type}`,
            vscode.DiagnosticSeverity.Error
          )
        );
      } else if (params[index]) {
        // For numeric conditions, we need to handle both operator and value
        if (paramDef.type === "number") {
          // If first parameter is an operator, validate the next one
          if ([">=", "<=", "==", "=", "<", ">"].includes(params[index])) {
            if (params[index + 1]) {
              validateNumberParameter(params[index + 1], line, problems);
            }
          } else {
            validateNumberParameter(params[index], line, problems);
          }
        } else {
          // Other parameter type validations
          switch (paramDef.type) {
            case "color":
              validateColorParameter(params[index], line, problems);
              break;
            // Add more parameter type validations as needed
          }
        }
      }
    });
  }

  return problems;
}

// Add specific parameter validation functions
function validateNumberParameter(
  value: string,
  line: vscode.TextLine,
  problems: vscode.Diagnostic[]
) {
  // First check if it's an operator
  if ([">=", "<=", "==", "=", "<", ">"].includes(value)) {
    return; // Skip validation for operators
  }

  const num = parseInt(value);
  if (isNaN(num)) {
    problems.push(
      createDiagnostic(
        new vscode.Range(
          line.range.start.translate(0, line.text.indexOf(value)),
          line.range.start.translate(0, line.text.indexOf(value) + value.length)
        ),
        "Value must be a number",
        vscode.DiagnosticSeverity.Error
      )
    );
  }
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
