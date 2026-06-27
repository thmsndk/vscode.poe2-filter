// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { MinimapIconDecorator } from "./decorations/minimapIconDecorator";
import { FilterPreviewEditor } from "./preview/FilterPreviewEditor";

import { SoundPlayer } from "./utils/soundPlayer";
import path from "path";
import { GameDataService } from "./services/gameDataService";
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

  // BaseType/Class match-count hints (the "N·" markers) are now provided by the
  // language server via inlay hints (see inlayHintsProvider); the old
  // client-side decoration provider has been removed to avoid duplicate UI.

  // Document symbols (outline/breadcrumbs) are now provided by the language server.

  // Clickable Import / CustomAlertSound path links are now provided by the
  // language server.

  // Path completion inside Import / CustomAlertSound quotes is now provided by
  // the language server.

  // Document formatting is now provided by the language server
  // (see src/language-server/server.ts onDocumentFormatting).

  // Create the minimap icon decorator (it will register itself with the context)
  new MinimapIconDecorator(context);

  // Color swatches/presentations for RGB color actions are now provided by the
  // language server.

  // Diagnostics (validation + rule-conflict detection) are now provided by the
  // language server (see src/language-server). The old client-side
  // registerDiagnostics/filterConflicts registration has been removed.

  // Code actions (quick fixes) are now provided by the language server.

  // Sound "Play" code lenses are now provided by the language server; the
  // commands they invoke (below) still run client-side where audio playback
  // and file-system access live.

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

  // Conflict "Shadows N later rules" code lenses (provided by the language
  // server) invoke this command, which opens a peek view listing every rule the
  // current rule makes unreachable. The lens passes plain JSON, so we rebuild
  // the vscode types here before delegating to the built-in references peek.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "poe2-filter.showConflicts",
      async (
        uri: string,
        position: { line: number; character: number },
        locations: {
          uri: string;
          range: {
            start: { line: number; character: number };
            end: { line: number; character: number };
          };
        }[]
      ) => {
        const targetUri = vscode.Uri.parse(uri);
        const targetPosition = new vscode.Position(
          position.line,
          position.character
        );
        const refs = locations.map(
          (loc) =>
            new vscode.Location(
              vscode.Uri.parse(loc.uri),
              new vscode.Range(
                loc.range.start.line,
                loc.range.start.character,
                loc.range.end.line,
                loc.range.end.character
              )
            )
        );

        await vscode.commands.executeCommand(
          "editor.action.showReferences",
          targetUri,
          targetPosition,
          refs
        );
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
