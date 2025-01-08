// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { FilterFormatter } from "./formatter/formatter";
import { FilterSymbolProvider } from "./outline/filterSymbolProvider";
import {
  registerDiagnostics,
  validateDocument,
} from "./diagnostics/filterDiagnostics";
import { FilterCodeActionProvider } from "./diagnostics/filterCodeActions";
import { MinimapIconDecorator } from "./decorations/minimapIconDecorator";
import { FilterPreviewEditor } from "./preview/FilterPreviewEditor";

import { CodelensProvider } from "./CodelensProvider";
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

  // Register document symbol provider for outline
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      "poe2-filter",
      new FilterSymbolProvider()
    )
  );

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

  // TODO: figure out how to handle color decorations better when the document changes and so such
  // // Update decorations when the active editor changes
  // let activeEditor = vscode.window.activeTextEditor;
  // function updateDecorations() {
  //   if (!activeEditor) {
  //     return;
  //   }

  //   // const decorations: vscode.DecorationOptions[] = [];
  //   const text = activeEditor.document.getText();

  //   // regex to handle both RGB and RGBA, with RGBA preferred
  //   const colorRegex =
  //     /(SetTextColor|SetBorderColor|SetBackgroundColor)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(\d+))?/g;

  //   let match;
  //   while ((match = colorRegex.exec(text)) !== null) {
  //     const [fullMatch, command, r, g, b, a] = match;
  //     // const startPos = activeEditor.document.positionAt(
  //     //   match.index + (match[0].length - fullMatch.length)
  //     // );
  //     // const endPos = activeEditor.document.positionAt(colorRegex.lastIndex);
  //     const startPos = activeEditor.document.positionAt(
  //       match.index + fullMatch.indexOf(r)
  //     );
  //     const endPos = activeEditor.document.positionAt(
  //       match.index + fullMatch.length
  //     );

  //     // Default alpha to 1 if not provided
  //     const rgba = `rgba(${r}, ${g}, ${b}, ${a ? parseInt(a) / 255 : 1})`;

  //     const colorDecorationType = vscode.window.createTextEditorDecorationType({
  //       backgroundColor: rgba,
  //       // color: getColorContrast(rgba),
  //       border: `3px solid ${rgba}`,
  //       borderRadius: "3px",
  //     });

  //     // decorations.push({
  //     //   range: new vscode.Range(startPos, endPos),
  //     //   renderOptions: {
  //     //     // after: {
  //     //     //   backgroundColor: rgba,
  //     //     //   contentText: `${r} ${g} ${b}${a ? ` ${a}` : ""}`,
  //     //     //   color: "currentColor", // Use editor's text color
  //     //     // },
  //     //     decorationType,
  //     //   },
  //     // });
  //     activeEditor.setDecorations(colorDecorationType, [
  //       {
  //         range: new vscode.Range(startPos, endPos),
  //       },
  //     ]);
  //   }
  // }

  // // Update decorations on editor changes
  // vscode.window.onDidChangeActiveTextEditor(
  //   (editor) => {
  //     activeEditor = editor;
  //     if (editor) {
  //       updateDecorations();
  //     }
  //   },
  //   null,
  //   context.subscriptions
  // );

  // vscode.workspace.onDidChangeTextDocument(
  //   (event) => {
  //     if (activeEditor && event.document === activeEditor.document) {
  //       updateDecorations();
  //     }
  //   },
  //   null,
  //   context.subscriptions
  // );

  // // Initial update
  // if (activeEditor) {
  //   updateDecorations();
  // }

  // Register diagnostics
  registerDiagnostics(context, gameData);

  // Register code actions
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      "poe2-filter",
      new FilterCodeActionProvider(),
      {
        providedCodeActionKinds:
          FilterCodeActionProvider.providedCodeActionKinds,
      }
    )
  );

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
