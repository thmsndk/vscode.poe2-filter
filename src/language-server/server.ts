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
  diagnostic: ParserDiagnostic | SemanticDiagnostic
): Diagnostic {
  return {
    severity:
      diagnostic.severity === "error"
        ? DiagnosticSeverity.Error
        : DiagnosticSeverity.Warning,
    range: Range.create(
      Position.create(diagnostic.line - 1, diagnostic.columnStart - 1),
      Position.create(diagnostic.line - 1, diagnostic.columnEnd - 1)
    ),
    message: diagnostic.message,
    source: "poe-filter-ls",
  };
}

async function validateDocument(document: TextDocument): Promise<void> {
  const text = document.getText();
  const parser = new Parser(text);
  const ast = parser.parse();

  // Create and run semantic validator
  const semanticValidator = new SemanticValidator();
  semanticValidator.validate(ast);

  // Convert internal diagnostics to LSP diagnostics
  const diagnostics: Diagnostic[] = [
    ...parser.diagnostics.map(convertToLSPDiagnostic),
    ...semanticValidator.diagnostics.map(convertToLSPDiagnostic),
  ];

  // Send the diagnostics to VSCode
  connection.sendDiagnostics({
    uri: document.uri,
    diagnostics,
  });
}

documents.listen(connection);
connection.listen();
