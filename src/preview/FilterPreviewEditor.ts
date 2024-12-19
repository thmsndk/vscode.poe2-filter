import * as vscode from "vscode";
import {
  FilterItem,
  FilterRule,
  wouldRuleMatchItem,
  generateItemFromRule,
  parseRules,
} from "../parser/filterRuleEngine";

export class FilterPreviewEditor
  implements vscode.CustomReadonlyEditorProvider
{
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      "poe2Filter.preview",
      new FilterPreviewEditor(context),
      {
        supportsMultipleEditorsPerDocument: false,
        webviewOptions: { retainContextWhenHidden: true },
      }
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(uri: vscode.Uri): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
      ],
    };

    // Get the filter content and parse it
    const filterContent = await vscode.workspace.fs.readFile(document.uri);
    const filterText = Buffer.from(filterContent).toString("utf8");
    const rules = parseRules(filterText);
    console.log("Parsed rules:", JSON.stringify(rules, null, 2)); // Debug log

    // Set up initial HTML content with the preview
    webviewPanel.webview.html = this._getPreviewHtml(
      webviewPanel.webview,
      rules
    );

    // Watch for changes in the original filter file
    const changeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        const updatedRules = parseRules(e.document.getText());
        console.log("Updated rules:", JSON.stringify(updatedRules, null, 2)); // Debug log
        this._updatePreview(webviewPanel.webview, updatedRules);
      }
    });

    // Handle messages from the webview
    webviewPanel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "refresh":
            const content = await vscode.workspace.fs.readFile(document.uri);
            const text = Buffer.from(content).toString("utf8");
            const refreshedRules = parseRules(text);
            this._updatePreview(webviewPanel.webview, refreshedRules);
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    webviewPanel.onDidDispose(() => {
      changeSubscription.dispose();
    });
  }

  private _getPreviewHtml(
    webview: vscode.Webview,
    rules: FilterRule[]
  ): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "preview.css")
    );

    // Generate initial items
    const sampleItems = this._generateSampleItems();
    const styledItems = this._applyFilterRules(sampleItems, rules);
    const initialItems = styledItems.map((item) => ({
      ...item,
      x: Math.random() * 800 + 100,
      y: Math.random() * 400 + 100,
    }));

    return `<!DOCTYPE html>
      <html>
        <head>
          <link href="${styleUri}" rel="stylesheet">
          <style>
            canvas {
              width: 100%;
              height: 100vh;
              background: #000;
            }
            .preview-container {
              height: 100vh;
              overflow: hidden;
            }
          </style>
        </head>
        <body>
          <div class="preview-container">
            <button id="refreshPreview">Refresh Preview</button>
            <canvas id="filterPreview"></canvas>
          </div>
          <script>
            const vscode = acquireVsCodeApi();
            const canvas = document.getElementById('filterPreview');
            const ctx = canvas.getContext('2d');
            
            let items = ${JSON.stringify(initialItems)};
            let camera = { x: 0, y: 0 };
            
            function resizeCanvas() {
              canvas.width = window.innerWidth;
              canvas.height = window.innerHeight;
            }
            
            function drawItem(item) {
              if (!item || item.hidden) return;
              
              const x = item.x - camera.x;
              const y = item.y - camera.y;
              
              ctx.save();
              
              // Draw item name
              ctx.font = \`\${item.fontSize || 32}px Arial\`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = \`rgb(\${item.textColor.join(',')})\`;
              ctx.fillText(item.name, x, y);
              
              ctx.restore();
            }
            
            function render() {
              // Clear canvas
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              
              // Draw grid
              ctx.strokeStyle = '#333';
              ctx.lineWidth = 0.5;
              
              for(let x = 0; x < canvas.width; x += 50) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
              }
              
              for(let y = 0; y < canvas.height; y += 50) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(canvas.width, y);
                ctx.stroke();
              }
              
              // Draw items
              items.forEach(drawItem);
              
              requestAnimationFrame(render);
            }
            
            // Handle panning
            let isDragging = false;
            let lastX = 0;
            let lastY = 0;
            
            canvas.addEventListener('mousedown', (e) => {
              isDragging = true;
              lastX = e.clientX;
              lastY = e.clientY;
              canvas.style.cursor = 'grabbing';
            });
            
            window.addEventListener('mousemove', (e) => {
              if (isDragging) {
                const dx = e.clientX - lastX;
                const dy = e.clientY - lastY;
                camera.x -= dx;
                camera.y -= dy;
                lastX = e.clientX;
                lastY = e.clientY;
              }
            });
            
            window.addEventListener('mouseup', () => {
              isDragging = false;
              canvas.style.cursor = 'grab';
            });
            
            // Handle window resize
            window.addEventListener('resize', resizeCanvas);
            
            // Initial setup
            resizeCanvas();
            canvas.style.cursor = 'grab';
            render();
            
            // Handle messages from extension
            window.addEventListener('message', event => {
              const message = event.data;
              switch (message.type) {
                case 'update':
                  items = message.items.map(item => ({
                    ...item,
                    x: Math.random() * (canvas.width * 0.6) + (canvas.width * 0.2),
                    y: Math.random() * (canvas.height * 0.6) + (canvas.height * 0.2)
                  }));
                  break;
              }
            });
            
            // Handle refresh button
            document.getElementById('refreshPreview').addEventListener('click', () => {
              vscode.postMessage({ command: 'refresh' });
            });
          </script>
        </body>
      </html>`;
  }

  private _updatePreview(webview: vscode.Webview, rules: FilterRule[]): void {
    const sampleItems = this._generateSampleItems();
    const styledItems = this._applyFilterRules(sampleItems, rules);

    webview.postMessage({
      type: "update",
      items: styledItems,
    });
  }

  // Helper methods for generating and styling items
  private _generateSampleItems(): FilterItem[] {
    return [
      // Currency Items
      {
        name: "Exalted Orb",
        baseType: "Exalted Orb",
        class: "Currency",
        rarity: "Currency",
        itemLevel: 1,
        width: 1,
        height: 1,
      },
      {
        name: "Regal Orb",
        baseType: "Regal Orb",
        class: "Currency",
        rarity: "Currency",
        itemLevel: 1,
        width: 1,
        height: 1,
      },
      // Waystone
      {
        name: "Waystone (Tier 1) of Penetration",
        baseType: "Waystone of Penetration",
        class: "Waystone",
        rarity: "Normal",
        waystoneTier: 1,
        width: 1,
        height: 1,
      },
      // Unique Item
      {
        name: "Djinn Barya",
        baseType: "Djinn Barya",
        class: "Unique",
        rarity: "Unique",
        itemLevel: 1,
        width: 2,
        height: 2,
      },
      // Ring
      {
        name: "Amethyst Ring",
        baseType: "Amethyst Ring",
        class: "Ring",
        rarity: "Normal",
        itemLevel: 1,
        width: 1,
        height: 1,
      },
      // Currency
      {
        name: "Scroll of Wisdom",
        baseType: "Scroll of Wisdom",
        class: "Currency",
        rarity: "Currency",
        itemLevel: 1,
        width: 1,
        height: 1,
      },
      // Rune
      {
        name: "Inspiration Rune",
        baseType: "Inspiration Rune",
        class: "Rune",
        rarity: "Normal",
        itemLevel: 1,
        width: 1,
        height: 1,
      },
    ];
  }

  private _applyFilterRules(items: FilterItem[], rules: FilterRule[]): any[] {
    console.log("Applying rules to items:", {
      items: JSON.stringify(items, null, 2),
      rules: JSON.stringify(rules, null, 2),
    });

    return items.map((item) => {
      // Find the first matching rule
      const matchingRule = rules.find((rule) => {
        const matches = wouldRuleMatchItem(rule, item);
        // console.log(`Rule match check for ${item.name}:`, {
        //   rule,
        //   matches,
        // });
        return matches;
      });

      if (!matchingRule) {
        console.log(`No matching rule for ${item.name}`, item);
        return {
          ...item,
          matched: false,
          hidden: false,
          textColor: [128, 128, 128], // Default gray
          fontSize: 32,
        };
      }

      console.log(`Found matching rule for ${item.name}:`, matchingRule);

      // Start with default styles
      const styles = {
        matched: true,
        hidden: !matchingRule.isShow,
        fontSize: 32,
        textColor: [200, 200, 200],
        borderColor: undefined,
        backgroundColor: undefined,
        beam: undefined,
        minimapIcon: undefined,
      };

      // Apply each action from the rule
      for (const action of matchingRule.actions) {
        console.log(`Applying action for ${item.name}:`, action);
        switch (action.type) {
          case "SetFontSize":
            styles.fontSize = parseInt(action.values[0] as string);
            break;
          case "SetTextColor":
            styles.textColor = action.values
              .slice(0, 4)
              .map((v) => parseInt(v as string));
            break;
          case "SetBorderColor":
            styles.borderColor = action.values
              .slice(0, 4)
              .map((v) => parseInt(v as string));
            break;
          case "SetBackgroundColor":
            styles.backgroundColor = action.values
              .slice(0, 4)
              .map((v) => parseInt(v as string));
            break;
          case "PlayEffect":
            styles.beam = {
              color: action.values[0] as string,
              temporary: action.values[1] === "Temp",
            };
            break;
        }
      }

      console.log(`Final styles for ${item.name}:`, styles);

      return {
        ...item,
        ...styles,
      };
    });
  }
}
