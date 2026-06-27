// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { FilterFormatter } from "./formatter/formatter";
import { MinimapIconDecorator } from "./decorations/minimapIconDecorator";
import { FilterPreviewEditor } from "./preview/FilterPreviewEditor";

import { CodelensProvider } from "./CodelensProvider";
import { SoundPlayer } from "./utils/soundPlayer";
import path from "path";
import { GameDataService } from "./services/gameDataService";
import { FilterDecorationProvider } from "./providers/filterDecorationProvider";
import {
  LanguageClient,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  console.log("POE2 Filter extension is now active");

  // Initialize language server client
  const serverModule = context.asAbsolutePath(
    path.join("dist", "language-server", "server.js")
  );

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  client = new LanguageClient(
    "poeFilterLanguageServer",
    "PoE Filter Language Server",
    serverOptions,
    {
      documentSelector: [{ scheme: "file", language: "poe2-filter" }],
      initializationOptions: {
        extensionPath: context.extensionPath,
      },
    }
  );

  // Start the language server
  client.start();
  context.subscriptions.push(client);

  // Initialize game data service
  const gameData = new GameDataService();
  await gameData.loadData(context.extensionPath);

  // Hover (BaseType/Class matching items) is now provided by the language server.

  // Initialize and register decoration provider
  const decorationProvider = new FilterDecorationProvider();

  // Update decorations when active editor changes
  vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor && editor.document.languageId === "poe2-filter") {
        decorationProvider.updateDecorations(editor, gameData);
      }
    },
    null,
    context.subscriptions
  );

  // Update decorations when document changes
  vscode.workspace.onDidChangeTextDocument(
    (event) => {
      if (event.document.languageId === "poe2-filter") {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === event.document) {
          decorationProvider.updateDecorations(editor, gameData);
        }
      }
    },
    null,
    context.subscriptions
  );

  // Initial decoration update
  if (vscode.window.activeTextEditor) {
    decorationProvider.updateDecorations(
      vscode.window.activeTextEditor,
      gameData
    );
  }

  // Document symbols (outline/breadcrumbs) are now provided by the language server.

  // Clickable Import / CustomAlertSound path links are now provided by the
  // language server.

  // Path completion inside Import / CustomAlertSound quotes is now provided by
  // the language server.

  // Register the formatter
  const formatter = new FilterFormatter();
  const formattingProvider =
    vscode.languages.registerDocumentFormattingEditProvider("poe2-filter", {
      async provideDocumentFormattingEdits(
        document: vscode.TextDocument
      ): Promise<vscode.TextEdit[]> {
        const formattedText = await formatter.format(document);

        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length)
        );

        return [vscode.TextEdit.replace(fullRange, formattedText)];
      },
    });

  context.subscriptions.push(formattingProvider);

  // Create the minimap icon decorator (it will register itself with the context)
  new MinimapIconDecorator(context);

  // Color swatches/presentations for RGB color actions are now provided by the
  // language server.

  // Diagnostics (validation + rule-conflict detection) are now provided by the
  // language server (see src/language-server). The old client-side
  // registerDiagnostics/filterConflicts registration has been removed.

  // Code actions (quick fixes) are now provided by the language server.

  // Register code lens
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      "poe2-filter",
      new CodelensProvider()
    )
  );

  // Register command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "poe2-filter.playDefaultSound",
      async (sound, volume) => {
        const soundPath = vscode.Uri.joinPath(
          context.extensionUri,
          "sounds",
          `AlertSound${sound}.mp3`
        ).fsPath;

        SoundPlayer.play(soundPath, volume);
      }
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "poe2-filter.playCustomSound",
      async (sound, volume) => {
        const soundPath = vscode.Uri.joinPath(
          vscode.Uri.file(
            path.dirname(
              vscode.window.activeTextEditor?.document.uri.fsPath ||
                vscode.workspace.workspaceFolders![0].uri.fsPath
            )
          ),
          `${sound}`
        ).fsPath;

        SoundPlayer.play(soundPath, volume);
      }
    )
  );

  // Register the preview editor
  context.subscriptions.push(FilterPreviewEditor.register(context, gameData));

  // Add command to open preview (similar to Markdown preview)
  context.subscriptions.push(
    vscode.commands.registerCommand("poe2-filter.openPreview", async () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && activeEditor.document.languageId === "poe2-filter") {
        const uri = activeEditor.document.uri;

        // Open preview to the side
        await vscode.commands.executeCommand(
          "vscode.openWith",
          uri,
          "poe2Filter.preview",
          vscode.ViewColumn.Beside
        );
      }
    })
  );
}

// This method is called when your extension is deactivated
export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
