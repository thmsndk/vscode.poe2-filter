import * as vscode from "vscode";
import {
  FilterItem,
  FilterRule,
  wouldRuleMatchItem,
  generateItemFromRule,
  parseRules,
} from "../parser/filterRuleEngine";
import { calculateNameSimilarity } from "../utils/stringUtils";

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
    // console.log("Parsed rules:", JSON.stringify(rules, null, 2)); // Debug log

    // Set up initial HTML content with the preview
    webviewPanel.webview.html = this._getPreviewHtml(
      webviewPanel.webview,
      rules
    );

    // Watch for changes in the original filter file
    const changeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        const updatedRules = parseRules(e.document.getText());
        const items = this._generateItemsFromRules(updatedRules);
        this._updatePreview(webviewPanel.webview, updatedRules, items);
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
            const items = this._generateItemsFromRules(refreshedRules);
            this._updatePreview(webviewPanel.webview, refreshedRules, items);
            break;

          case "showSampleItems":
            const sampleItems = this._generateSampleItems();
            this._updatePreview(webviewPanel.webview, rules, sampleItems);
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

    // Generate items from rules by default
    const items = this._generateItemsFromRules(rules);
    const styledItems = this._applyFilterRules(items, rules);
    const initialItems = this._spreadItemsNaturally(styledItems);
    // loop each item output the name and the item object
    // initialItems.forEach((item) => {
    //   console.log(`${item.name}:`, JSON.stringify(item, null, 2));
    // });

    return `<!DOCTYPE html>
      <html>
        <head>
          <link href="${styleUri}" rel="stylesheet">
        </head>
        <body>
          <div class="button-container">
            <button id="refreshPreview">Refresh Preview</button>
            <button id="showSampleItems">Show Sample Items</button>
          </div>
          <canvas id="filterPreview"></canvas>
          <script>
            const vscode = acquireVsCodeApi();
            const canvas = document.getElementById('filterPreview');
            const ctx = canvas.getContext('2d');
            
            let items = ${JSON.stringify(initialItems)};
            let camera = { 
              x: 0, 
              y: 0,
              zoom: 1
            };
            
            function resizeCanvas() {
              canvas.width = window.innerWidth;
              canvas.height = window.innerHeight;
              fitItemsInView(); // Refit items when canvas is resized
            }
            
            function drawItem(item) {
              if (!item || item.hidden) return;
              
              const x = (item.x - camera.x) * camera.zoom;
              const y = (item.y - camera.y) * camera.zoom;
              
              ctx.save();
              
              // Helper function to convert color array to rgba string
              const toRGBA = (colorArr, alpha = 1) => {
                if (!colorArr) return 'rgba(200, 200, 200, 1)';
                return \`rgba(\${colorArr[0]}, \${colorArr[1]}, \${colorArr[2]}, \${alpha})\`;
              };
              
              // Beam effect color mapping
              const beamColors = {
                Red: [255, 0, 0],
                Green: [0, 255, 0],
                Blue: [0, 0, 255],
                Brown: [139, 69, 19],
                White: [255, 255, 255],
                Yellow: [255, 255, 0],
                Cyan: [0, 255, 255],
                Grey: [128, 128, 128],
                Orange: [255, 165, 0],
                Pink: [255, 192, 203],
                Purple: [128, 0, 128]
              };
              
              // Draw beam effect if item has PlayEffect
              if (item.beam) {
                const beamHeight = 150 * camera.zoom;  // Reduced from 300 to 150
                const beamColor = beamColors[item.beam.color] || beamColors.White;
                const intensity = item.beam.temporary ? 0.8 : 1;
                
                ctx.shadowColor = toRGBA(beamColor, 0.8 * intensity);
                ctx.shadowBlur = 15 * camera.zoom;
                
                ctx.beginPath();
                ctx.strokeStyle = toRGBA(beamColor, intensity);
                ctx.lineWidth = 2 * camera.zoom;
                ctx.moveTo(x, y);
                ctx.lineTo(x, y - beamHeight);
                ctx.stroke();
                
                ctx.beginPath();
                ctx.strokeStyle = toRGBA(beamColor, 0.3 * intensity);
                ctx.lineWidth = 6 * camera.zoom;
                ctx.moveTo(x, y);
                ctx.lineTo(x, y - beamHeight);
                ctx.stroke();
                
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
              }
              
              // Calculate text metrics (used for background and border)
              const fontSize = (item.fontSize || 32) * camera.zoom;
              ctx.font = \`\${fontSize}px Arial\`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              const metrics = ctx.measureText(item.name);
              const padding = 5 * camera.zoom;
              const textWidth = metrics.width;
              const textHeight = fontSize;
              const boxX = x - textWidth/2 - padding;
              const boxY = y - textHeight/2 - padding;
              const boxWidth = textWidth + padding * 2;
              const boxHeight = textHeight + padding * 2;
              
              // Draw background if specified
              if (item.backgroundColor) {
                ctx.fillStyle = toRGBA(item.backgroundColor);
                ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
              }
              
              // Draw border if specified
              if (item.borderColor) {
                ctx.strokeStyle = toRGBA(item.borderColor);
                ctx.lineWidth = 2 * camera.zoom;
                ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
              }
              
              // Draw text
              ctx.fillStyle = toRGBA(item.textColor);
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
            
            // Add zoom handler
            canvas.addEventListener('wheel', (e) => {
              e.preventDefault();
              const zoomSpeed = 0.1;
              const mouseX = e.clientX;
              const mouseY = e.clientY;
              
              // Calculate world position of mouse before zoom
              const worldX = (mouseX + camera.x) / camera.zoom;
              const worldY = (mouseY + camera.y) / camera.zoom;
              
              // Update zoom
              if (e.deltaY < 0) {
                camera.zoom *= (1 + zoomSpeed);
              } else {
                camera.zoom *= (1 - zoomSpeed);
              }
              
              // Clamp zoom
              camera.zoom = Math.min(Math.max(camera.zoom, 0.1), 5);
              
              // Adjust camera to keep mouse position fixed
              camera.x = worldX * camera.zoom - mouseX;
              camera.y = worldY * camera.zoom - mouseY;
            });
            
            // Function to fit all items in view
            function fitItemsInView() {
              if (items.length === 0) return;
              
              // Find bounds of all items
              let minX = Infinity;
              let minY = Infinity;
              let maxX = -Infinity;
              let maxY = -Infinity;
              
              items.forEach(item => {
                if (!item.hidden) {
                  minX = Math.min(minX, item.x);
                  minY = Math.min(minY, item.y);
                  maxX = Math.max(maxX, item.x);
                  maxY = Math.max(maxY, item.y);
                }
              });
              
              // Add padding
              const padding = 100;
              minX -= padding;
              minY -= padding;
              maxX += padding;
              maxY += padding;
              
              // Calculate required zoom
              const contentWidth = maxX - minX;
              const contentHeight = maxY - minY;
              const zoomX = canvas.width / contentWidth;
              const zoomY = canvas.height / contentHeight;
              camera.zoom = Math.min(zoomX, zoomY);
              
              // Center camera
              camera.x = (minX + maxX) / 2 - (canvas.width / 2 / camera.zoom);
              camera.y = (minY + maxY) / 2 - (canvas.height / 2 / camera.zoom);
            }
            
            // Update message handler to fit items after update
            window.addEventListener('message', event => {
              const message = event.data;
              switch (message.type) {
                case 'update':
                  items = message.items.map(item => ({
                    ...item,
                    x: Math.random() * (canvas.width * 0.6) + (canvas.width * 0.2),
                    y: Math.random() * (canvas.height * 0.6) + (canvas.height * 0.2)
                  }));
                  fitItemsInView(); // Fit items after updating
                  break;
              }
            });
            
            // Handle button clicks
            document.getElementById('refreshPreview').addEventListener('click', () => {
              vscode.postMessage({ command: 'refresh' });
            });
            
            document.getElementById('showSampleItems').addEventListener('click', () => {
              vscode.postMessage({ command: 'showSampleItems' });
            });
            
            // Initial setup
            resizeCanvas();
            canvas.style.cursor = 'grab';
            render();
          </script>
        </body>
      </html>`;
  }

  private _updatePreview(
    webview: vscode.Webview,
    rules: FilterRule[],
    items: FilterItem[]
  ): void {
    const styledItems = this._applyFilterRules(items, rules);
    const spreadItems = this._spreadItemsNaturally(styledItems);

    webview.postMessage({
      type: "update",
      items: spreadItems,
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
        class: "Rings",
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
        baseType: " Rune",
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

      // Update the styles object type
      const styles: {
        matched: boolean;
        hidden: boolean;
        fontSize: number;
        textColor: number[];
        borderColor?: number[];
        backgroundColor?: number[];
        beam?: { color: string; temporary: boolean };
        minimapIcon?: string;
      } = {
        matched: true,
        hidden: !matchingRule.isShow,
        fontSize: 32,
        textColor: [200, 200, 200],
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

  private _spreadItemsNaturally(items: any[]): any[] {
    const width = 4000;
    const height = 3000;
    const cellSize = 300; // Minimum space between items
    const centerX = width / 2;
    const centerY = height / 2;

    return items.map((item, index) => {
      // Create a spiral pattern
      const angle = Math.sqrt(index) * Math.PI;
      const radius = cellSize * Math.sqrt(index);

      return {
        ...item,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      };
    });
  }

  private _generateItemsFromRules(rules: FilterRule[]): FilterItem[] {
    const items: FilterItem[] = [];

    rules.forEach((rule) => {
      if (rule.isShow) {
        // Generate an item based on the rule conditions
        const item = generateItemFromRule(rule);
        if (item) {
          items.push(item);
        }
      }
    });

    return items;
  }
}
