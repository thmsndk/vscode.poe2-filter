import * as vscode from "vscode";

export class MinimapIconDecorator {
  private decorationTypes: Map<string, vscode.TextEditorDecorationType> =
    new Map();
  private disposables: vscode.Disposable[] = [];

  constructor(context: vscode.ExtensionContext) {
    // Create decoration types for each shape and color combination
    const colors = [
      "Red",
      "Green",
      "Blue",
      "Brown",
      "White",
      "Yellow",
      "Cyan",
      "Grey",
      "Orange",
      "Pink",
      "Purple",
    ];
    const shapes = [
      "Circle",
      "Diamond",
      "Hexagon",
      "Square",
      "Star",
      "Triangle",
      "Cross",
      "Moon",
      "Raindrop",
      "Kite",
      "Pentagon",
      "UpsideDownHouse",
    ];

    colors.forEach((color) => {
      shapes.forEach((shape) => {
        const key = `${color}-${shape}`;
        this.decorationTypes.set(key, this.createDecorationType(color, shape));
      });
    });

    // Register event handlers
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && editor.document.languageId === "poe2-filter") {
          this.updateDecorations(editor);
        }
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && event.document === activeEditor.document) {
          this.updateDecorations(activeEditor);
        }
      })
    );

    // Initial decoration
    if (vscode.window.activeTextEditor) {
      this.updateDecorations(vscode.window.activeTextEditor);
    }

    // Add to extension subscriptions
    context.subscriptions.push(this);
  }

  private createDecorationType(
    color: string,
    shape: string
  ): vscode.TextEditorDecorationType {
    const shapeChar = this.getShapeChar(shape);
    const cssColor = color.toLowerCase();

    return vscode.window.createTextEditorDecorationType({
      before: {
        contentText: shapeChar,
        color: cssColor,
        margin: "0 0.5em 0 0",
      },
    });
  }

  private getShapeChar(shape: string): string {
    // Unicode characters that roughly represent the shapes
    const shapeMap: { [key: string]: string } = {
      Circle: "●",
      Diamond: "◆",
      Hexagon: "⬡",
      Square: "■",
      Star: "★",
      Triangle: "▲",
      Cross: "✚",
      Moon: "☾",
      Raindrop: "💧",
      Kite: "◆",
      Pentagon: "⬟",
      UpsideDownHouse: "▼",
    };
    return shapeMap[shape] || "●";
  }

  public updateDecorations(editor: vscode.TextEditor) {
    const document = editor.document;
    const decorations: Map<string, vscode.DecorationOptions[]> = new Map();

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const minimapMatch = line.text.match(
        /\bMinimapIcon\s+\d+\s+(Red|Green|Blue|Brown|White|Yellow|Cyan|Grey|Orange|Pink|Purple)\s+(Circle|Diamond|Hexagon|Square|Star|Triangle|Cross|Moon|Raindrop|Kite|Pentagon|UpsideDownHouse)/
      );

      if (minimapMatch) {
        const [_, color, shape] = minimapMatch;
        const key = `${color}-${shape}`;
        const range = new vscode.Range(
          new vscode.Position(i, line.text.indexOf(shape)),
          new vscode.Position(i, line.text.indexOf(shape) + shape.length)
        );

        if (!decorations.has(key)) {
          decorations.set(key, []);
        }
        decorations.get(key)?.push({ range });
      }
    }

    // Apply decorations
    this.decorationTypes.forEach((decorationType, key) => {
      editor.setDecorations(decorationType, decorations.get(key) || []);
    });
  }

  public dispose() {
    this.decorationTypes.forEach((d) => d.dispose());
    this.disposables.forEach((d) => d.dispose());
  }
}
