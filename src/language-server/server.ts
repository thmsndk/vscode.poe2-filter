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
  TextDocumentPositionParams,
  Hover,
  Color,
  ColorInformation,
  ColorPresentation,
  DocumentColorParams,
  DocumentColorRequest,
  ColorPresentationParams,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Parser, ParserDiagnostic } from "./ast/parser";
import {
  SemanticValidator,
  SemanticDiagnostic,
} from "./validation/semanticValidator";
import { FilterRuleEngine } from "./analysis/ruleEngine";
import { GameDataService } from "../services/gameDataService";
import { RootNode, ActionNode, BlockType, BlockNode, Node } from "./ast/nodes";
import { HoverProvider } from "./providers/hoverProvider";
import { InlayHint, InlayHintParams } from "vscode-languageserver";
import { InlayHintsProvider } from "./providers/inlayHintsProvider";
import { ActionSyntaxMap, ActionType, ActionSyntax } from "./ast/actions";

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all);

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
      },
    };
  }
);

// Parse document when content changes
documents.onDidChangeContent((change) => {
  connection.console.info("Document changed, validating...");
  documents.parseDocument(change.document);
  validateDocument(change.document);
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

function isBlockNode(node: Node): node is BlockNode {
  return node.type in BlockType;
}

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

documents.listen(connection);
connection.listen();
