import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Position,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Parser, ParserDiagnostic } from "./ast/parser";
import {
  SemanticValidator,
  SemanticDiagnostic,
} from "./validation/semanticValidator";
import { FilterRuleEngine } from "./analysis/ruleEngine";

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all);

// Create a text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.console.info("Starting PoE Filter Language Server...");

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  connection.console.info("Language Server initialized!");
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
    },
  };
});

documents.onDidChangeContent((change) => {
  connection.console.info("Document changed, validating...");
  validateDocument(change.document);
});

function convertToLSPDiagnostic(
  diagnostic: ParserDiagnostic | SemanticDiagnostic,
  source: string = "poe-filter-ls"
): Diagnostic {
  try {
    return {
      severity:
        diagnostic.severity === "error"
          ? DiagnosticSeverity.Error
          : DiagnosticSeverity.Warning,
      range: Range.create(
        Position.create(
          Math.max(0, diagnostic.line - 1),
          Math.max(0, diagnostic.columnStart - 1)
        ),
        Position.create(
          Math.max(0, diagnostic.line - 1),
          Math.max(0, diagnostic.columnEnd - 1)
        )
      ),
      message: diagnostic.message,
      source: source,
    };
  } catch (error: any) {
    connection.console.error(
      `Failed to convert diagnostic: ${JSON.stringify(
        {
          diagnostic,
          error: error.message,
        },
        null,
        2
      )}`
    );

    // Return a fallback diagnostic at position 0,0
    return {
      severity: DiagnosticSeverity.Error,
      range: Range.create(diagnostic.line, 0, diagnostic.line, 0),
      message: `Internal error: ${error.message}`,
      source: source,
    };
  }
}

async function validateDocument(document: TextDocument): Promise<void> {
  const text = document.getText();
  const parser = new Parser(text);
  const ast = parser.parse();

  // Create and run semantic validator
  const semanticValidator = new SemanticValidator(document.uri);
  semanticValidator.validate(ast);

  // Create and run rule engine for conflict detection
  const ruleEngine = new FilterRuleEngine(ast);
  const conflicts = ruleEngine.detectConflicts();

  // Convert internal diagnostics to LSP diagnostics
  const diagnostics: Diagnostic[] = [
    ...parser.diagnostics.map((diagnostic) =>
      convertToLSPDiagnostic(diagnostic, "poe-filter-ls-parser")
    ),
    ...semanticValidator.diagnostics.map((diagnostic) =>
      convertToLSPDiagnostic(diagnostic, "poe-filter-ls-semanticValidator")
    ),
    ...conflicts.map((conflict) => ({
      severity:
        conflict.severity === "error"
          ? DiagnosticSeverity.Error
          : DiagnosticSeverity.Warning,
      range: Range.create(
        Position.create(conflict.node.line - 1, conflict.node.columnStart - 1),
        Position.create(conflict.node.line - 1, conflict.node.columnEnd - 1)
      ),
      message: conflict.message,
      source: "poe-filter-ls-conflicts",
    })),
  ];

  // Send the diagnostics to VSCode
  connection.sendDiagnostics({
    uri: document.uri,
    diagnostics,
  });
}

documents.listen(connection);
connection.listen();
