import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticTag,
  Range,
  Position,
  TextDocumentPositionParams,
  Hover,
  Color,
  ColorInformation,
  ColorPresentation,
  DocumentColorParams,
  DocumentColorRequest,
  ColorPresentationParams,
  DocumentSymbol,
  SymbolKind,
  TextEdit,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Parser, ParserDiagnostic } from "./ast/parser";
import {
  SemanticValidator,
  SemanticDiagnostic,
} from "./validation/semanticValidator";
import { FilterRuleEngine, RuleConflict } from "./analysis/ruleEngine";
import { GameDataService } from "../services/gameDataService";
import {
  RootNode,
  ActionNode,
  BlockType,
  BlockNode,
  Node,
  isBlockNode,
} from "./ast/nodes";
import { HoverProvider } from "./providers/hoverProvider";
import {
  InlayHint,
  InlayHintParams,
  CodeActionParams,
} from "vscode-languageserver";
import { InlayHintsProvider } from "./providers/inlayHintsProvider";
import { ActionSyntaxMap, ActionType, ActionSyntax } from "./ast/actions";
import { SymbolProvider } from "./providers/symbolProvider";
import { CodeActionProvider } from "./providers/codeActionProvider";
import { CompletionProvider } from "./providers/completionProvider";
import { SignatureHelpProvider } from "./providers/signatureHelpProvider";
import {
  SemanticTokensProvider,
  semanticTokensLegend,
} from "./providers/semanticTokensProvider";
import {
  CompletionParams,
  SignatureHelpParams,
  DocumentLinkParams,
  DocumentFormattingParams,
} from "vscode-languageserver";
import { DocumentLinkProvider } from "./providers/documentLinkProvider";
import { CodeLensProvider } from "./providers/codeLensProvider";
import { CodeLensParams } from "vscode-languageserver";
import { FilterFormatter } from "../formatter/formatter";

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all);

// A language server must survive a single bad document: an unhandled rejection
// or stray exception would otherwise terminate the process, drop the
// connection, and exhaust the client's restart budget (the "connection got
// disposed" errors). Log and keep running instead.
process.on("unhandledRejection", (reason) => {
  connection.console.error(
    `Unhandled rejection: ${
      reason instanceof Error ? reason.stack ?? reason.message : String(reason)
    }`
  );
});
process.on("uncaughtException", (error) => {
  connection.console.error(
    `Uncaught exception: ${error.stack ?? error.message}`
  );
});

class FilterDocuments extends TextDocuments<TextDocument> {
  private documentAsts = new Map<string, RootNode>();
  private documentParseDiagnostics = new Map<string, ParserDiagnostic[]>();

  public getAst(uri: string): RootNode | undefined {
    return this.documentAsts.get(uri);
  }

  public setAst(uri: string, ast: RootNode): void {
    this.documentAsts.set(uri, ast);
  }

  public getParseDiagnostics(uri: string): ParserDiagnostic[] {
    return this.documentParseDiagnostics.get(uri) ?? [];
  }

  public parseDocument(document: TextDocument): RootNode {
    const parser = new Parser(document.getText());
    const ast = parser.parse();
    this.setAst(document.uri, ast);
    this.documentParseDiagnostics.set(document.uri, parser.diagnostics);
    return ast;
  }

  public deleteAst(uri: string): void {
    this.documentAsts.delete(uri);
    this.documentParseDiagnostics.delete(uri);
  }
}

const documents = new FilterDocuments(TextDocument);

// Initialize game data service
const gameData = new GameDataService();

const hoverProvider = new HoverProvider(gameData);
const inlayHintsProvider = new InlayHintsProvider(gameData);

connection.console.info("Starting PoE Filter Language Server...");

connection.onInitialize(
  async (params: InitializeParams): Promise<InitializeResult> => {
    // Get the extension path from the initialization params
    // This will be passed from the client (extension.ts)
    const extensionPath = params.initializationOptions?.extensionPath;

    if (!extensionPath) {
      connection.console.error("Extension path not provided!");
      throw new Error("Extension path not provided");
    }

    try {
      await gameData.loadData(extensionPath);
      connection.console.info("Game data loaded successfully!");
    } catch (error) {
      connection.console.error(`Failed to load game data: ${error}`);
    }

    connection.console.info("Language Server initialized!");

    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        hoverProvider: true,
        inlayHintProvider: {
          resolveProvider: false, // We can provide all info upfront
        },
        colorProvider: true,
        documentSymbolProvider: true,
        codeActionProvider: true,
        completionProvider: {
          triggerCharacters: ['"', "/"],
        },
        signatureHelpProvider: {
          triggerCharacters: [" "],
          retriggerCharacters: [" "],
        },
        documentLinkProvider: {
          resolveProvider: false,
        },
        documentFormattingProvider: true,
        codeLensProvider: {
          resolveProvider: false,
        },
        semanticTokensProvider: {
          legend: semanticTokensLegend,
          full: true,
        },
      },
    };
  }
);

// Parse document when content changes
documents.onDidChangeContent((change) => {
  connection.console.info("Document changed, validating...");
  try {
    documents.parseDocument(change.document);
  } catch (error) {
    connection.console.error(
      `Failed to parse ${change.document.uri}: ${
        error instanceof Error ? error.stack ?? error.message : String(error)
      }`
    );
    return;
  }

  void validateDocument(change.document).catch((error) => {
    connection.console.error(
      `Failed to validate ${change.document.uri}: ${
        error instanceof Error ? error.stack ?? error.message : String(error)
      }`
    );
  });
});

// Clean up ASTs when documents are closed
documents.onDidClose((e) => {
  documents.deleteAst(e.document.uri);
});

function convertToLSPDiagnostic(
  diagnostic: ParserDiagnostic | SemanticDiagnostic,
  source: string = "poe-filter-ls"
): Diagnostic {
  try {
    const tags = diagnostic.tags?.map((tag) =>
      tag === "deprecated"
        ? DiagnosticTag.Deprecated
        : DiagnosticTag.Unnecessary
    );

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
      ...(tags && tags.length > 0 ? { tags } : {}),
      ...("data" in diagnostic && diagnostic.data
        ? { data: diagnostic.data }
        : {}),
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

/**
 * Builds an LSP {@link Range} spanning a single AST node (1-based internal
 * line/column to 0-based LSP positions).
 */
function rangeForNode(node: Node): Range {
  return Range.create(
    Position.create(node.line - 1, node.columnStart - 1),
    Position.create(node.line - 1, node.columnEnd - 1)
  );
}

/**
 * Converts rule conflicts into LSP diagnostics.
 *
 * Each conflict becomes a warning on the unreachable (later) rule, with related
 * information that links back to the earlier rule that shadows it (so it shows
 * up in the Problems panel and is navigable on hover). The *reverse* direction
 * - seeing, from the earlier rule, which later rules it shadows - is surfaced as
 * a CodeLens instead (see {@link CodeLensProvider}) to keep the Problems panel
 * free of duplicate, non-actionable entries.
 */
function buildConflictDiagnostics(
  conflicts: RuleConflict[],
  uri: string
): Diagnostic[] {
  return conflicts.map((conflict) => {
    const diagnostic: Diagnostic = {
      severity:
        conflict.severity === "error"
          ? DiagnosticSeverity.Error
          : DiagnosticSeverity.Warning,
      range: rangeForNode(conflict.node),
      message: conflict.message,
      source: "poe-filter-ls-conflicts",
    };

    // A fully shadowed rule can never be reached - fade it as dead code.
    if (conflict.type === "unreachable") {
      diagnostic.tags = [DiagnosticTag.Unnecessary];
    }

    // Point at the earlier conflicting rule so users can navigate to it
    // (parity with the old client "go to conflicting rule" code action).
    if (conflict.relatedNode) {
      diagnostic.relatedInformation = [
        {
          location: { uri, range: rangeForNode(conflict.relatedNode) },
          message: `Conflicting rule defined here (line ${conflict.relatedNode.line})`,
        },
      ];
    }

    return diagnostic;
  });
}

async function validateDocument(document: TextDocument): Promise<void> {
  const ast =
    documents.getAst(document.uri) ?? documents.parseDocument(document);

  // Create and run semantic validator
  const semanticValidator = new SemanticValidator(gameData, document.uri);
  semanticValidator.validate(ast);

  // Create and run rule engine for conflict detection
  const ruleEngine = new FilterRuleEngine(ast);
  const conflicts = ruleEngine.detectConflicts();

  // Convert internal diagnostics to LSP diagnostics
  const diagnostics: Diagnostic[] = [
    ...documents
      .getParseDiagnostics(document.uri)
      .map((d) => convertToLSPDiagnostic(d, "poe-filter-ls-parser")),
    ...semanticValidator.diagnostics.map((d) =>
      convertToLSPDiagnostic(d, "poe-filter-ls-semanticValidator")
    ),
    ...buildConflictDiagnostics(conflicts, document.uri),
  ];

  // Send the diagnostics to VSCode
  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  connection.console.info(`Hover ${JSON.stringify(params)}`);
  const ast = documents.getAst(params.textDocument.uri);
  if (!ast) {
    return null;
  }

  return hoverProvider.provideHover(ast, params);
});

connection.languages.inlayHint.on(
  (params: InlayHintParams): InlayHint[] | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }

    const ast = documents.getAst(document.uri);
    if (!ast) {
      return null;
    }

    return inlayHintsProvider.provideInlayHints(ast);
  }
);

// Helper to identify color actions
function isColorAction(actionType: ActionType): boolean {
  const syntax = ActionSyntaxMap[actionType];
  if (!syntax) return false;

  // Check if first 3 parameters are RGB values
  const [r, g, b] = syntax.parameters;
  const hasRGB =
    r?.type === "number" &&
    r.range?.max === 255 &&
    g?.type === "number" &&
    g.range?.max === 255 &&
    b?.type === "number" &&
    b.range?.max === 255;

  // Check if fourth parameter is optional Alpha
  const alpha = syntax.parameters[3];
  const hasValidAlpha =
    !alpha ||
    (alpha.type === "number" && alpha.range?.max === 255 && !alpha.required);

  return hasRGB && hasValidAlpha;
}

// Visitor function type
type NodeVisitor = (node: ActionNode) => void;

function visitActions(ast: RootNode, visitor: NodeVisitor) {
  for (const node of ast.children) {
    if (isBlockNode(node)) {
      for (const bodyNode of node.body) {
        if (bodyNode.type === "Action") {
          visitor(bodyNode);
        }
      }
    }
  }
}

// Add color provider handlers
connection.onRequest(
  DocumentColorRequest.type,
  (params: DocumentColorParams): ColorInformation[] => {
    const ast = documents.getAst(params.textDocument.uri);
    if (!ast) {
      return [];
    }

    const colors: ColorInformation[] = [];

    visitActions(ast, (action) => {
      if (isColorAction(action.action)) {
        const syntax = ActionSyntaxMap[action.action];
        const values = action.values;

        if (values.length >= 3) {
          const [r, g, b] = values.map((v) => parseInt(v.value.toString()));
          // Use alpha if provided, otherwise use default value from syntax or 255
          const a = values[3]
            ? parseInt(values[3].value.toString())
            : syntax.parameters[3]?.defaultValue ?? 255;

          // Use first value's start and last value's end for the range
          const lastValueIndex = values[3] ? 3 : 2;
          colors.push({
            range: {
              start: {
                line: action.line - 1,
                character: values[0].columnStart - 1,
              },
              end: {
                line: action.line - 1,
                character: values[lastValueIndex].columnEnd - 1,
              },
            },
            color: {
              red: Number(r) / 255,
              green: Number(g) / 255,
              blue: Number(b) / 255,
              alpha: Number(a) / 255,
            },
          });
        }
      }
    });

    return colors;
  }
);

connection.onColorPresentation(
  (params: ColorPresentationParams): ColorPresentation[] => {
    const color = params.color;
    const red = Math.round(color.red * 255);
    const green = Math.round(color.green * 255);
    const blue = Math.round(color.blue * 255);
    const alpha = Math.round(color.alpha * 255);

    return [
      {
        label: ` ${red} ${green} ${blue}${alpha !== 255 ? ` ${alpha}` : ""}`,
      },
    ];
  }
);

const symbolProvider = new SymbolProvider();

connection.onDocumentSymbol((params) => {
  const ast = documents.getAst(params.textDocument.uri);
  if (!ast) {
    return [];
  }
  return symbolProvider.provideDocumentSymbols(ast);
});

const codeActionProvider = new CodeActionProvider();

connection.onCodeAction((params: CodeActionParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }
  return codeActionProvider.provideCodeActions(document, params);
});

const completionProvider = new CompletionProvider(gameData);

connection.onCompletion((params: CompletionParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }
  return completionProvider.provideCompletions(document, params);
});

const signatureHelpProvider = new SignatureHelpProvider();

connection.onSignatureHelp((params: SignatureHelpParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  return signatureHelpProvider.provideSignatureHelp(document, params);
});

const semanticTokensProvider = new SemanticTokensProvider();

connection.languages.semanticTokens.on((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return { data: [] };
  }
  const ast = documents.getAst(params.textDocument.uri);
  return semanticTokensProvider.provideSemanticTokens(document, ast);
});

const documentLinkProvider = new DocumentLinkProvider();

connection.onDocumentLinks((params: DocumentLinkParams) => {
  const ast = documents.getAst(params.textDocument.uri);
  if (!ast) {
    return [];
  }
  return documentLinkProvider.provideDocumentLinks(ast, params.textDocument.uri);
});

const codeLensProvider = new CodeLensProvider();

connection.onCodeLens((params: CodeLensParams) => {
  const ast = documents.getAst(params.textDocument.uri);
  if (!ast) {
    return [];
  }
  return codeLensProvider.provideCodeLenses(ast, params.textDocument.uri);
});

connection.onDocumentFormatting(
  async (params: DocumentFormattingParams): Promise<TextEdit[]> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    const formatter = new FilterFormatter({
      insertSpaces: params.options.insertSpaces,
      tabSize: params.options.tabSize,
    });
    const formattedText = await formatter.format(document);

    // Replace the whole document with the formatted text.
    const fullRange = Range.create(
      Position.create(0, 0),
      document.positionAt(document.getText().length)
    );

    return [TextEdit.replace(fullRange, formattedText)];
  }
);

documents.listen(connection);
connection.listen();
