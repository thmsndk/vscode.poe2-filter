import * as vscode from "vscode";
import { parseFilter } from "../parser/filterParser";

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
    const rules = parseFilter(filterText);

    // Set up initial HTML content with the preview
    webviewPanel.webview.html = this._getPreviewHtml(
      webviewPanel.webview,
      rules
    );

    // Watch for changes in the original filter file
    const changeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        const updatedRules = parseFilter(e.document.getText());
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
            const refreshedRules = parseFilter(text);
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

  private _getPreviewHtml(webview: vscode.Webview, rules: any[]): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "preview.css")
    );

    // Generate initial items
    const sampleItems = this._generateSampleItems();
    const styledItems = this._applyFilterRules(sampleItems, rules);
    const initialItems = styledItems.map((item) => ({
      ...item,
      x: Math.random() * 800 + 100, // Initial positions
      y: Math.random() * 400 + 100,
    }));

    return `<!DOCTYPE html>
      <html>
        <head>
          <link href="${styleUri}" rel="stylesheet">
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
            
            // Initialize items
            let items = ${JSON.stringify(initialItems)};
            
            function resizeCanvas() {
              canvas.width = window.innerWidth;
              canvas.height = window.innerHeight;
            }
            
            function drawItem(item) {
              if (!item || item.hidden) return;
              
              ctx.save();
              
              // Draw beam if item matches filter
              if (item.matched) {
                const gradient = ctx.createLinearGradient(
                  item.x, 
                  item.y + 100, 
                  item.x, 
                  item.y
                );
                gradient.addColorStop(0, \`rgba(\${item.textColor.join(',')}, 0.1)\`);
                gradient.addColorStop(1, \`rgba(\${item.textColor.join(',')}, 0.4)\`);
                
                ctx.fillStyle = gradient;
                ctx.fillRect(item.x - 2, item.y, 4, 100);
              }
              
              // Draw item name
              ctx.font = \`\${item.fontSize || 32}px Fontin, Arial\`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              // Draw text shadow/glow
              if (item.matched) {
                ctx.shadowColor = \`rgba(\${item.textColor.join(',')}, 0.5)\`;
                ctx.shadowBlur = 10;
              }
              
              ctx.fillStyle = \`rgb(\${item.textColor.join(',')})\`;
              ctx.fillText(item.name, item.x, item.y);
              
              // Draw border if specified
              if (item.borderColor) {
                ctx.strokeStyle = \`rgb(\${item.borderColor.join(',')})\`;
                ctx.lineWidth = 2;
                const metrics = ctx.measureText(item.name);
                const padding = 5;
                ctx.strokeRect(
                  item.x - metrics.width/2 - padding,
                  item.y - item.fontSize/2 - padding,
                  metrics.width + padding * 2,
                  item.fontSize + padding * 2
                );
              }
              
              ctx.restore();
            }
            
            function render() {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              
              // Draw floor grid
              ctx.save();
              ctx.strokeStyle = '#333';
              ctx.lineWidth = 0.5;
              
              // Simple grid for now
              for(let i = 0; i < canvas.width; i += 50) {
                ctx.beginPath();
                ctx.moveTo(i, 0);
                ctx.lineTo(i, canvas.height);
                ctx.stroke();
              }
              for(let i = 0; i < canvas.height; i += 50) {
                ctx.beginPath();
                ctx.moveTo(0, i);
                ctx.lineTo(canvas.width, i);
                ctx.stroke();
              }
              ctx.restore();
              
              // Draw all items
              items.forEach(drawItem);
              
              requestAnimationFrame(render);
            }
            
            // Handle window resize
            window.addEventListener('resize', resizeCanvas);
            resizeCanvas();
            
            // Start render loop
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

            // Debug log to check if items are present
            console.log('Initial items:', items);
          </script>
        </body>
      </html>`;
  }

  private _updatePreview(webview: vscode.Webview, rules: any[]): void {
    const sampleItems = this._generateSampleItems();
    const styledItems = this._applyFilterRules(sampleItems, rules);

    webview.postMessage({
      type: "update",
      items: styledItems,
    });
  }

  // Helper methods for generating and styling items
  private _generateSampleItems() {
    return [
      // Currency Items
      {
        name: "Divine Orb",
        baseType: "Divine Orb",
        class: "Currency",
        rarity: "Currency",
        itemLevel: 84,
      },
      {
        name: "Chaos Orb",
        baseType: "Chaos Orb",
        class: "Currency",
        rarity: "Currency",
        itemLevel: 75,
      },
      // Equipment
      {
        name: "Astral Plate",
        baseType: "Astral Plate",
        class: "Body Armour",
        rarity: "Rare",
        itemLevel: 86,
        sockets: "6",
        linkedSockets: "6",
      },
      {
        name: "Vaal Regalia",
        baseType: "Vaal Regalia",
        class: "Body Armour",
        rarity: "Normal",
        itemLevel: 86,
      },
      // Gems
      {
        name: "Awakened Multistrike Support",
        baseType: "Awakened Multistrike Support",
        class: "Gem",
        rarity: "Gem",
        quality: 20,
        gemLevel: 5,
      },
      {
        name: "Fireball",
        baseType: "Fireball",
        class: "Gem",
        rarity: "Gem",
        quality: 0,
        gemLevel: 1,
      },
      // Maps
      {
        name: "Crimson Temple Map",
        baseType: "Crimson Temple Map",
        class: "Maps",
        rarity: "Magic",
        mapTier: 16,
      },
    ];
  }

  private _renderItem(item: any): string {
    const style = this._getItemStyle(item);
    const beam = item.matched ? `<div class="beam"></div>` : "";

    return `
      <div class="item-label" style="left: ${this._getRandomPosition()}%; top: ${this._getRandomPosition()}%">
        ${beam}
        <div class="item-name" style="${style}">
          ${item.name}
        </div>
      </div>
    `;
  }

  private _getItemStyle(item: any): string {
    const baseStyle = `
      color: rgb(${item.textColor?.join(", ") || "200, 200, 200"});
      text-shadow: 0 0 10px rgba(${
        item.textColor?.join(", ") || "200, 200, 200"
      }, 0.5);
      font-size: ${item.fontSize || 32}px;
      ${item.hidden ? "display: none;" : ""}
    `;

    if (item.matched && item.borderColor) {
      return `${baseStyle}
        border: 2px solid rgb(${item.borderColor.join(", ")});
        box-shadow: 0 0 10px rgba(${item.borderColor.join(", ")}, 0.5);
      `;
    }

    return baseStyle;
  }

  private _getRandomPosition(): number {
    return 20 + Math.random() * 60; // Returns a number between 20 and 80
  }

  private _applyFilterRules(items: any[], rules: any[]): any[] {
    return items.map((item) => {
      // Find the first matching rule
      const matchingRule = rules.find((rule) =>
        this._itemMatchesRule(item, rule)
      );

      if (!matchingRule) {
        return {
          ...item,
          matched: false,
          hidden: false,
          textColor: [128, 128, 128], // Default gray
          fontSize: 32,
        };
      }

      // Apply the matching rule's styles
      const styles = {
        matched: true,
        hidden: matchingRule.type === "Hide",
        fontSize: 32, // Default size
        textColor: [200, 200, 200], // Default color
        borderColor: undefined,
        backgroundColor: undefined,
        beam: undefined,
      };

      // Apply each action from the rule
      matchingRule.actions.forEach((action) => {
        switch (action.type) {
          case "SetFontSize":
            styles.fontSize = parseInt(action.values[0]);
            break;
          case "SetTextColor":
            styles.textColor = action.values.map((v) => parseInt(v));
            break;
          case "SetBorderColor":
            styles.borderColor = action.values.map((v) => parseInt(v));
            break;
          case "SetBackgroundColor":
            styles.backgroundColor = action.values.map((v) => parseInt(v));
            break;
          case "PlayEffect":
            styles.beam = {
              color: action.values[0].toLowerCase(),
              intensity: 1,
            };
            break;
        }
      });

      return {
        ...item,
        ...styles,
      };
    });
  }

  private _itemMatchesRule(item: any, rule: any): boolean {
    return rule.conditions.every((condition) => {
      switch (condition.type) {
        case "BaseType":
          // Check if any of the BaseType values match
          return condition.values.some(
            (value) => item.baseType.toLowerCase() === value.toLowerCase()
          );
        case "Class":
          // Check if the Class matches
          return condition.values.some(
            (value) => item.class.toLowerCase() === value.toLowerCase()
          );
        case "Rarity":
          return condition.values.includes(item.rarity);
        case "ItemLevel":
          return this._compareNumeric(
            item.itemLevel,
            condition.operator,
            condition.values[0]
          );
        case "GemLevel":
          return this._compareNumeric(
            item.gemLevel,
            condition.operator,
            condition.values[0]
          );
        case "Quality":
          return this._compareNumeric(
            item.quality,
            condition.operator,
            condition.values[0]
          );
        case "Sockets":
          return this._compareNumeric(
            item.sockets?.length,
            condition.operator,
            condition.values[0]
          );
        case "LinkedSockets":
          return this._compareNumeric(
            item.linkedSockets?.length,
            condition.operator,
            condition.values[0]
          );
        case "MapTier":
          return this._compareNumeric(
            item.mapTier,
            condition.operator,
            condition.values[0]
          );
        default:
          return false;
      }
    });
  }

  private _compareNumeric(
    value: number,
    operator: string = "=",
    target: number
  ): boolean {
    if (value === undefined) return false;
    switch (operator) {
      case ">":
        return value > target;
      case "<":
        return value < target;
      case ">=":
        return value >= target;
      case "<=":
        return value <= target;
      default:
        return value === target;
    }
  }

  private _parseMinimapIcon(
    iconAction: any
  ): { color: string; shape: string } | undefined {
    if (!iconAction) return undefined;

    const shapes: { [key: string]: string } = {
      Circle: "●",
      Diamond: "◆",
      Hexagon: "⬡",
      Square: "■",
      Star: "★",
      Triangle: "▲",
    };

    return {
      color: iconAction.values[1],
      shape: shapes[iconAction.values[2]] || "●",
    };
  }
}
