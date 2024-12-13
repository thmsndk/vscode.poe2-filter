// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { FilterFormatter } from "./formatter/formatter";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log("POE2 Filter extension is now active");

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

  // Register color provider
  context.subscriptions.push(
    vscode.languages.registerColorProvider("poe2-filter", {
      provideDocumentColors(
        document: vscode.TextDocument
      ): vscode.ColorInformation[] {
        const colors: vscode.ColorInformation[] = [];

        for (let i = 0; i < document.lineCount; i++) {
          const line = document.lineAt(i);
          const colorMatch = line.text.match(
            /(SetTextColor|SetBorderColor|SetBackgroundColor)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(\d+))?/
          );

          if (colorMatch) {
            const [_, command, r, g, b, a] = colorMatch;
            const startPos = line.text.indexOf(command) + command.length;
            const endPos = line.text.length;

            colors.push(
              new vscode.ColorInformation(
                new vscode.Range(i, startPos, i, endPos),
                new vscode.Color(
                  parseInt(r) / 255,
                  parseInt(g) / 255,
                  parseInt(b) / 255,
                  a ? parseInt(a) / 255 : 1
                )
              )
            );
          }
        }

        return colors;
      },

      provideColorPresentations(
        color: vscode.Color
      ): vscode.ColorPresentation[] {
        const red = Math.round(color.red * 255);
        const green = Math.round(color.green * 255);
        const blue = Math.round(color.blue * 255);
        const alpha = Math.round(color.alpha * 255);

        return [
          new vscode.ColorPresentation(
            ` ${red} ${green} ${blue}${alpha !== 255 ? ` ${alpha}` : ""}`
          ),
        ];
      },
    })
  );

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
}

// This method is called when your extension is deactivated
export function deactivate() {}
