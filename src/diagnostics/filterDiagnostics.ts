import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { checkRuleConflicts } from "./filterConflicts";
import { levenshteinDistance, findSimilarValues } from "../utils/stringUtils";
import { GameDataService } from "../services/gameDataService";
// TODO: Forgetting a hide/show function above conditions or actions, especially if there is a comment above it saying "Show" or "Hide"
// TODO: Suggest using == for comparison instead of = or not at all, as the game will validate the name
interface CommandPattern {
  name?: string;
  match?: string;
  captures?: Record<string, { name: string }>;
  begin?: string;
  beginCaptures?: Record<string, { name: string }>;
  patterns?: CommandPattern[];
}

interface CommandDefinition {
  paramSets: {
    params: {
      type: string;
      required: boolean;
      validValues?: string[] | RegExp;
      regex?: RegExp;
    }[];
  }[];
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
      paramSets: {
        params: {
          type: string;
          required: boolean;
          validValues?: string[] | RegExp;
          regex?: RegExp;
        }[];
      }[];
    } {
      let commands: string[] = [];
      let paramSets: {
        params: {
          type: string;
          required: boolean;
          validValues?: string[] | RegExp;
          regex?: RegExp;
        }[];
      }[] = [];

      // Handle simple commands (blocks and control flow)
      if (pattern.match && !pattern.begin) {
        console.log("Pattern match:", pattern.match);
        const unescapedPattern = pattern.match
          .replace(/\\b/g, "")
          .replace(/\\/g, "");
        const simpleMatch =
          unescapedPattern.match(/^\((.*?)\)/)?.[1] || // For block commands
          unescapedPattern.match(/\((.*?)\)/)?.[1] || // For parenthesized commands
          unescapedPattern.match(/^([A-Za-z]+)$/)?.[1]; // For simple word commands
        console.log("Extracted match:", simpleMatch);
        if (simpleMatch) {
          commands = simpleMatch.split("|");
          console.log("Commands:", commands);
          paramSets = [{ params: [] }];
        }
        return { commands, paramSets };
      }

      // For patterns with begin/beginCaptures
      if (pattern.begin && pattern.beginCaptures?.["1"]) {
        const beginMatch =
          pattern.begin.match(/\\b\(([^)]+)\)\\b/)?.[1] ||
          pattern.begin.match(/\\b(\w+)\\b/)?.[1];
        if (beginMatch) {
          commands = beginMatch.split("|");
          console.log("Processing command(s):", commands);
        }

        // Extract parameters from the patterns array
        if (pattern.patterns) {
          pattern.patterns.forEach((subPattern) => {
            if (subPattern.match && subPattern.captures) {
              const currentParams: {
                type: string;
                required: boolean;
                validValues?: string[] | RegExp;
                regex?: RegExp;
              }[] = [];

              // Extract capture groups and their corresponding regexes
              const matchStr = subPattern.match;
              console.log(
                "Processing pattern for command(s):",
                commands,
                "Pattern:",
                matchStr
              );

              Object.entries(subPattern.captures).forEach(
                ([index, capture]) => {
                  const paramType = getParamTypeFromScope(capture.name);
                  const groupNum = parseInt(index);
                  const captureRegex = extractCaptureGroupRegex(
                    matchStr,
                    groupNum
                  );
                  const isOptional = matchStr.includes(
                    `(${captureRegex.source})?`
                  );

                  console.log(`Parameter ${index}:`, {
                    type: paramType,
                    regex: captureRegex.source,
                    isOptional,
                  });

                  currentParams.push({
                    type: paramType,
                    required: !isOptional,
                    regex: captureRegex,
                  });
                }
              );

              if (currentParams.length > 0) {
                paramSets.push({ params: currentParams });
              }
            }
          });
        }
      }

      return { commands, paramSets };
    }

    function extractCaptureGroupRegex(
      pattern: string,
      groupNum: number
    ): RegExp {
      console.log(
        `Extracting regex for pattern: ${pattern}, group: ${groupNum}`
      );

      // Count opening parentheses to find the nth capture group
      let count = 0;
      let start = -1;
      let depth = 0;

      for (let i = 0; i < pattern.length; i++) {
        if (pattern[i] === "(" && pattern[i - 1] !== "\\") {
          depth++;
          if (depth === 1) {
            count++;
            if (count === groupNum) {
              start = i + 1;
            }
          }
        } else if (pattern[i] === ")" && pattern[i - 1] !== "\\") {
          if (depth === 1 && start !== -1) {
            const groupPattern = pattern.slice(start, i);
            console.log(`Extracted group pattern: ${groupPattern}`);

            // Handle quoted strings - allow multiple quoted strings with spaces
            if (groupPattern.includes('"')) {
              return /^(?:"[^"]*"(?:\s+"[^"]*")*|\S+)$/;
            }

            // Handle comparison operators
            if (groupPattern === "==|=") {
              return /^(?:==|=)$/;
            }

            // Handle other simple patterns (like numbers, enums)
            const cleanPattern = groupPattern
              .replace(/\\\\/g, "\\")
              .replace(/\(\?:/g, "")
              .replace(/\[\^/g, "[^")
              .replace(/\\b/g, "")
              .replace(/\s+/g, "\\s+");

            try {
              return new RegExp(`^${cleanPattern}$`);
            } catch (e) {
              console.error("Failed to create regex:", e);
              console.error("Pattern was:", cleanPattern);
              return /(?!)/;
            }
          }
          depth--;
        }
      }

      return /(?!)/;
    }

    // Process each section
    ["blocks", "controlFlow", "conditions", "actions"].forEach((section) => {
      (grammar.repository[section].patterns as CommandPattern[]).forEach(
        (pattern) => {
          const { commands: commandNames, paramSets } =
            extractCommandsAndParams(pattern);

          commandNames.forEach((cmd) => {
            if (!commands[cmd]) {
              commands[cmd] = { paramSets: [] };
            }
            commands[cmd].paramSets.push(...paramSets);

            // Add debug output here
            console.log(`Command ${cmd}:`, commands[cmd]);
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
  if (scope.includes("numeric.color")) {
    return "rgb-color";
  }
  if (scope.includes("numeric.sound-id")) {
    return "numeric-sound-id";
  }
  if (scope.includes("language.named-sound-id")) {
    return "named-sound-id";
  }
  if (scope.includes("numeric.volume")) {
    return "volume";
  }
  if (scope.includes("parameter.color")) {
    return "named-color";
  }
  if (scope.includes("parameter.shape")) {
    return "shape";
  }
  if (scope.includes("numeric.size")) {
    return "size";
  }
  if (scope.includes("operator.comparison")) {
    return "operator";
  }
  if (scope.includes("numeric")) {
    return "number";
  }
  if (scope.includes("string.quoted.double")) {
    return "string";
  }
  if (scope.includes("constant.language")) {
    return "enum";
  }
  return "unknown";
}

// Use the extracted commands
const VALID_COMMANDS = extractCommandsFromGrammar();

// TODO: detect nested blocks
// TODO: detect empty blocks
// TODO: detect definitions later that is being overriden earlier? e.g. doing something explicit later in the file, but a previous rule catches it instead
// TODO: PlayAlertSound|PlayAlertSoundPositional number volume with custom sound requires CustomAlertSound "file" volume

export function registerDiagnostics(
  context: vscode.ExtensionContext,
  gameData: GameDataService
) {
  const diagnostics =
    vscode.languages.createDiagnosticCollection("poe2-filter");
  context.subscriptions.push(diagnostics);

  // Validate on open
  if (vscode.window.activeTextEditor) {
    validateAndUpdateDiagnostics(
      vscode.window.activeTextEditor.document,
      diagnostics,
      gameData
    );
  }

  // Validate on editor change
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        validateAndUpdateDiagnostics(editor.document, diagnostics, gameData);
      }
    })
  );

  // Validate on document change
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === "poe2-filter") {
        validateAndUpdateDiagnostics(event.document, diagnostics, gameData);
      }
    })
  );
}

function validateAndUpdateDiagnostics(
  document: vscode.TextDocument,
  diagnostics: vscode.DiagnosticCollection,
  gameData: GameDataService
) {
  if (document.languageId === "poe2-filter") {
    const problems = validateDocument(document, gameData);
    diagnostics.set(document.uri, problems);
  }
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
): boolean {
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
    return false;
  }
  if (num < 0 || num > 255) {
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
    return false;
  }
  return true;
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

function validateSoundFile(
  filePath: string,
  line: vscode.TextLine,
  document: vscode.TextDocument,
  problems: vscode.Diagnostic[],
  isOptional: boolean
) {
  // Remove quotes from the file path
  const cleanPath = filePath.replace(/^"(.*)"$/, "$1");

  // Try different possible locations
  const possiblePaths = [
    cleanPath, // Direct path
    path.join(path.dirname(document.uri.fsPath), cleanPath), // Use document instead of line
    // You might want to add default PoE sound folder paths here
  ];

  const fileExists = possiblePaths.some((p) => fs.existsSync(p));

  if (!fileExists) {
    const severity = isOptional
      ? vscode.DiagnosticSeverity.Warning
      : vscode.DiagnosticSeverity.Error;

    const message = isOptional
      ? `Sound file not found: ${cleanPath}. File is optional but should exist when used.`
      : `Sound file not found: ${cleanPath}. File must exist for CustomAlertSound (use CustomAlertSoundOptional if the file is optional)`;

    problems.push(
      createDiagnostic(
        new vscode.Range(
          line.range.start.translate(0, line.text.indexOf(filePath)),
          line.range.start.translate(
            0,
            line.text.indexOf(filePath) + filePath.length
          )
        ),
        message,
        severity
      )
    );
  }
}

export function validateDocument(
  document: vscode.TextDocument,
  gameData: GameDataService
): vscode.Diagnostic[] {
  const problems: vscode.Diagnostic[] = [];
  const validCommands = Object.keys(VALID_COMMANDS);

  // Add rule conflict checks
  problems.push(...checkRuleConflicts(document));

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

    // Check BaseType and Class commands first
    if (command === "BaseType" || command === "Class") {
      const value = parts.slice(1).join(" ");
      validateBaseTypeOrClass(command, value, line, gameData, problems);
      continue;
    }

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
            line.range.start.translate(0, line.text.indexOf(command)),
            line.range.start.translate(
              0,
              line.text.indexOf(command) + command.length
            )
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

    // Special handling for sound commands
    if (
      command === "CustomAlertSound" ||
      command === "CustomAlertSoundOptional"
    ) {
      if (parts[1]) {
        validateSoundFile(
          parts[1],
          line,
          document,
          problems,
          command === "CustomAlertSoundOptional"
        );
      }
      continue;
    }

    // Validate parameters based on command definition
    validateCommandParams(command, parts.slice(1), line, problems);
  }

  return problems;
}

function validateCommandParams(
  command: string,
  values: string[],
  line: vscode.TextLine,
  problems: vscode.Diagnostic[]
) {
  const commandDef = VALID_COMMANDS[command];
  if (!commandDef) {
    return;
  }

  function getTypeMatchScore(
    paramType: string,
    value: string,
    regex?: RegExp
  ): number {
    switch (paramType) {
      case "numeric-sound-id":
      case "volume":
      case "size":
      case "number":
        return /^\d+$/.test(value) ? 1 : -1;

      case "named-sound-id":
      case "named-color":
      case "shape":
        // For named types, prefer exact matches over just starting with a letter
        const isExactMatch = regex?.test(value) ?? false;
        return isExactMatch ? 2 : /^[A-Za-z]/.test(value) ? 0 : -1;

      case "rgb-color":
        return /^\d{1,3}$/.test(value) && parseInt(value) <= 255 ? 1 : -1;

      case "string":
        return value.startsWith('"') && value.endsWith('"') ? 1 : -1;

      case "operator":
        return /^[=<>]=?$/.test(value) ? 1 : -1;

      case "enum":
        // For enums, prefer exact matches over just valid identifiers
        const isValidEnum = regex?.test(value) ?? false;
        return isValidEnum ? 2 : /^[A-Za-z][A-Za-z0-9]*$/.test(value) ? 0 : -1;

      default:
        return 0;
    }
  }

  // Preliminary matching to find the most appropriate parameter set
  let bestParamSet = commandDef.paramSets[0];
  let bestMatchScore = -Infinity;

  for (const paramSet of commandDef.paramSets) {
    let matchScore = 0;
    const providedValueCount = values.length;
    const requiredParamCount = paramSet.params.filter((p) => p.required).length;

    // Heavily penalize if we don't have enough required parameters
    if (providedValueCount < requiredParamCount) {
      matchScore -= 1000;
    }

    // Penalize if the first parameter is an operator but none was provided
    if (
      paramSet.params[0]?.type === "operator" &&
      !values[0]?.match(/^[=<>]/)
    ) {
      matchScore -= 500;
    }

    // Add scores for matching parameters
    for (let i = 0; i < Math.min(paramSet.params.length, values.length); i++) {
      const param = paramSet.params[i];
      const value = values[i];
      matchScore += getTypeMatchScore(param.type, value, param.regex);
    }

    // Slightly prefer parameter sets that match the exact number of provided values
    if (providedValueCount === paramSet.params.length) {
      matchScore += 0.5;
    }

    if (matchScore > bestMatchScore) {
      bestMatchScore = matchScore;
      bestParamSet = paramSet;
    }
  }

  // Validate using the best matching parameter set
  let isValid = true;
  const currentProblems: vscode.Diagnostic[] = [];

  for (let i = 0; i < bestParamSet.params.length; i++) {
    const paramDef = bestParamSet.params[i];
    const value = values[i];

    if (!value) {
      if (paramDef.required) {
        isValid = false;
        currentProblems.push(
          createDiagnostic(
            line.range,
            `Missing required parameter of type ${paramDef.type}`,
            vscode.DiagnosticSeverity.Error
          )
        );
      }
      break;
    }

    if (paramDef.regex) {
      // Ensure the entire pattern is grouped for the anchors
      const fullMatchRegex = new RegExp(
        `^(?:${paramDef.regex.source.replace(/^\^/, "").replace(/\$$/, "")})$`
      );

      if (!fullMatchRegex.test(value)) {
        isValid = false;
        const validValues = extractValidValuesFromRegex(paramDef.regex);
        let message: string;

        if (
          validValues.length > 0 &&
          value.length <= Math.max(...validValues.map((v) => v.length)) + 2
        ) {
          const suggestions = findSimilarValues(value, validValues);
          message =
            suggestions.length > 0
              ? `Invalid value for ${
                  paramDef.type
                }. Did you mean: ${suggestions.join(", ")}?`
              : `Invalid value for ${
                  paramDef.type
                }. Must be one of: ${validValues.join(", ")}`;
        } else {
          message = `Invalid value for ${paramDef.type}. Must match pattern: ${paramDef.regex.source}`;
        }

        currentProblems.push(
          createDiagnostic(
            new vscode.Range(
              line.range.start.translate(0, line.text.indexOf(value)),
              line.range.start.translate(
                0,
                line.text.indexOf(value) + value.length
              )
            ),
            message,
            vscode.DiagnosticSeverity.Error
          )
        );
      }
    }
  }

  if (!isValid) {
    problems.push(...currentProblems);
  }
}

// Helper validation functions now return boolean for success/failure
function validateNumberParameter(
  value: string,
  line: vscode.TextLine,
  problems: vscode.Diagnostic[]
): boolean {
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
    return false;
  }
  return true;
}

function validateNamedColorParameter(
  value: string,
  line: vscode.TextLine,
  problems: vscode.Diagnostic[],
  validValues?: string[] | RegExp
): boolean {
  if (!validValues) {
    return true;
  } // If no valid values defined, assume valid

  const isValid = Array.isArray(validValues)
    ? validValues.includes(value)
    : validValues.test(value);

  if (!isValid) {
    const validValuesStr = Array.isArray(validValues)
      ? validValues.join(", ")
      : validValues.toString();
    problems.push(
      createDiagnostic(
        new vscode.Range(
          line.range.start.translate(0, line.text.indexOf(value)),
          line.range.start.translate(0, line.text.indexOf(value) + value.length)
        ),
        `Invalid color name. Expected one of: ${validValuesStr}`,
        vscode.DiagnosticSeverity.Error
      )
    );
    return false;
  }
  return true;
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

function validateVolumeParameter(
  value: string,
  line: vscode.TextLine,
  problems: vscode.Diagnostic[]
): boolean {
  const num = parseInt(value);
  if (isNaN(num)) {
    problems.push(
      createDiagnostic(
        new vscode.Range(
          line.range.start.translate(0, line.text.indexOf(value)),
          line.range.start.translate(0, line.text.indexOf(value) + value.length)
        ),
        "Volume must be a number",
        vscode.DiagnosticSeverity.Error
      )
    );
    return false;
  }
  if (num < 0 || num > 300) {
    problems.push(
      createDiagnostic(
        new vscode.Range(
          line.range.start.translate(0, line.text.indexOf(value)),
          line.range.start.translate(0, line.text.indexOf(value) + value.length)
        ),
        "Volume must be between 0 and 300",
        vscode.DiagnosticSeverity.Error
      )
    );
    return false;
  }
  return true;
}

function extractValidValuesFromRegex(regex: RegExp): string[] {
  const regexStr = regex.source
    .replace(/^\^/, "") // Remove start anchor
    .replace(/\$$/, "") // Remove end anchor
    .replace(/[()]/g, ""); // Remove parentheses

  // Only extract values if it's a pure OR pattern (no other regex operators)
  if (regexStr.includes("|") && !/[.*+?{}[\]\\]/.test(regexStr)) {
    return regexStr.split("|");
  }

  return [];
}

function validateBaseTypeOrClass(
  command: string,
  value: string,
  line: vscode.TextLine,
  gameData: GameDataService,
  problems: vscode.Diagnostic[]
) {
  const isBaseType = command === "BaseType";
  const isCommandClass = command === "Class";
  // Class always needs exact match, BaseType only when == is used
  const isExactMatch = isCommandClass || line.text.includes("==");

  // Split by quotes and filter out empty strings and operators
  const values =
    value
      .match(/"[^"]*"|[^\s"]+/g)
      ?.map((v) => v.replace(/^"(.*)"$/, "$1")) // Extract quoted strings or single words
      .filter((v) => !v.match(/^[=<>]=?$/)) || []; // Filter out operators

  if (isExactMatch) {
    // For exact matches (== or Class), validate that each value exists exactly
    const found = isBaseType
      ? gameData.findExactBaseType(values)
      : gameData.findExactClass(values);

    const invalidValues = values.filter((v) => {
      if (isCommandClass) {
        const isSingular = !v.endsWith("s");
        const plural = isSingular ? v + "s" : v;
        return !found.some((f) => f.Name === v || f.Name === plural);
      }

      return !found.some((f) => f.Name === v);
    });

    if (invalidValues.length > 0) {
      for (const missingValue of invalidValues) {
        const allValues = isBaseType
          ? gameData.baseItemTypes.map((i) => i.Name)
          : gameData.itemClasses.map((i) => i.Name);

        const suggestions = findSimilarValues(missingValue, allValues);

        const message =
          suggestions.length > 0
            ? `${command} "${missingValue}" not found. Did you mean: ${suggestions.join(
                ", "
              )}?`
            : `${command} "${missingValue}" not found`;

        problems.push(
          createDiagnostic(
            new vscode.Range(
              line.range.start.translate(0, line.text.indexOf(missingValue)),
              line.range.start.translate(
                0,
                line.text.indexOf(missingValue) + missingValue.length
              )
            ),
            message,
            vscode.DiagnosticSeverity.Error
          )
        );
      }
    }
  } else {
    // Only BaseType can do partial matches
    for (const searchValue of values) {
      const matches = gameData.findMatchingBaseTypes(searchValue);

      if (matches.length === 0) {
        problems.push(
          createDiagnostic(
            new vscode.Range(
              line.range.start.translate(0, line.text.indexOf(searchValue)),
              line.range.start.translate(
                0,
                line.text.indexOf(searchValue) + searchValue.length
              )
            ),
            `BaseType "${searchValue}" not found`,
            vscode.DiagnosticSeverity.Error
          )
        );
      }
    }
  }
}
