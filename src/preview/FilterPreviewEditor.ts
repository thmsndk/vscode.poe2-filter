import * as vscode from "vscode";
import {
  FilterItem,
  FilterRule,
  wouldRuleMatchItem,
  generateItemFromRule,
  parseRules,
} from "../parser/filterRuleEngine";
import { calculateNameSimilarity } from "../utils/stringUtils";
import {
  BaseItemType,
  GameDataService,
  ItemClass,
  Match,
} from "../services/gameDataService";

type ExtendedFilterItem = FilterItem & {
  ruleLineNumber?: number;
};

export class FilterPreviewEditor
  implements vscode.CustomReadonlyEditorProvider
{
  public static register(
    context: vscode.ExtensionContext,
    gameData: GameDataService
  ): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      "poe2Filter.preview",
      new FilterPreviewEditor(context, gameData),
      {
        supportsMultipleEditorsPerDocument: false,
        webviewOptions: { retainContextWhenHidden: true },
      }
    );
  }

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly gameData: GameDataService
  ) {}

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

          case "jumpToRule":
            const textDocument = await vscode.workspace.openTextDocument(
              document.uri
            );
            const editor = await vscode.window.showTextDocument(
              textDocument,
              vscode.ViewColumn.One
            );
            const position = new vscode.Position(message.lineNumber - 1, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(
              new vscode.Range(position, position),
              vscode.TextEditorRevealType.InCenter
            );
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

    const fontFace = `
      <style>
        @font-face {
          font-family: 'Fontin SmallCaps';
          src: local('Fontin SmallCaps');
        }
      </style>
    `;

    return `<!DOCTYPE html>
      <html>
        <head>
          <link href="${styleUri}" rel="stylesheet">
        </head>
        <body>
          <div id="tooltip" class="tooltip"></div>
          <div class="button-container">
            <button id="refreshPreview">Refresh Preview</button>
            <button id="showSampleItems">Show Sample Items</button>
          </div>
          <canvas id="filterPreview"></canvas>
          ${fontFace}
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
              if (!item) return;
              
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
              ctx.font = \`\${fontSize}px "Fontin SmallCaps", Arial\`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              const metrics = ctx.measureText(item.name);
              const padding = 10 * camera.zoom;
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
              
              // Draw HIDDEN indicator
              if (item.hidden) {
                const hiddenFontSize = (item.fontSize || 32) * camera.zoom * 1.5;
                ctx.font = \`bold \${hiddenFontSize}px "Fontin SmallCaps", Arial\`;
                ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
                ctx.fillText('HIDDEN', x, y + textHeight/2 + padding + hiddenFontSize/2);
              }
                                                      
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
                // Adjust pan speed based on zoom level
                const panSpeed = 1 / camera.zoom;
                camera.x -= dx * panSpeed;
                camera.y -= dy * panSpeed;
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
              
              // Get mouse position relative to canvas
              const rect = canvas.getBoundingClientRect();
              const mouseX = e.clientX - rect.left;
              const mouseY = e.clientY - rect.top;
              
              // Convert mouse position to world space before zoom
              const worldX = mouseX / camera.zoom + camera.x;
              const worldY = mouseY / camera.zoom + camera.y;
              
              // Update zoom
              const oldZoom = camera.zoom;
              if (e.deltaY < 0) {
                camera.zoom *= (1 + zoomSpeed);
              } else {
                camera.zoom *= (1 - zoomSpeed);
              }
              
              // Clamp zoom
              camera.zoom = Math.min(Math.max(camera.zoom, 0.1), 5);
              
              // Adjust camera position to zoom towards mouse position
              camera.x = worldX - (mouseX / camera.zoom);
              camera.y = worldY - (mouseY / camera.zoom);
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
                  items = message.items;
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

            // Add tooltip element reference
            const tooltip = document.getElementById('tooltip');
            
            // Add function to check if mouse is over an item
            function isMouseOverItem(mouseX, mouseY, item) {
              if (!item) return false;
              
              const x = (item.x - camera.x) * camera.zoom;
              const y = (item.y - camera.y) * camera.zoom;
              
              // Calculate text metrics for hit testing
              const fontSize = (item.fontSize || 32) * camera.zoom;
              ctx.font = \`\${fontSize}px "Fontin SmallCaps", Arial\`;
              const metrics = ctx.measureText(item.name);
              const padding = 10 * camera.zoom;
              
              const boxX = x - metrics.width/2 - padding;
              const boxY = y - fontSize/2 - padding;
              const boxWidth = metrics.width + padding * 2;
              const boxHeight = fontSize + padding * 2;
              
              const isOver = mouseX >= boxX && mouseX <= boxX + boxWidth &&
                     mouseY >= boxY && mouseY <= boxY + boxHeight;

              // Change cursor based on if item has a rule to jump to
              if (isOver && item.ruleLineNumber) {
                canvas.style.cursor = 'pointer';
              } else if (!isDragging) {
                canvas.style.cursor = 'grab';
              }
              
              return isOver;
            }
            
            // Add mousemove handler for tooltip
            canvas.addEventListener('mousemove', (e) => {
              const tooltip = document.getElementById('tooltip');
              if (!tooltip) {
                console.error('Tooltip element not found');
                return;
              }

              if (isDragging) {
                tooltip.style.display = 'none';
                return;
              }
              
              const rect = canvas.getBoundingClientRect();
              const mouseX = e.clientX - rect.left;
              const mouseY = e.clientY - rect.top;
              
              const hoveredItem = items.find(item => isMouseOverItem(mouseX, mouseY, item));
              
              if (hoveredItem) {
                const skipProps = ['x', 'y', 'matched', 'hidden', 'textColor', 'fontSize', 'borderColor', 'backgroundColor', 'beam'];
                const formatKey = (key) => key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                
                const details = Object.entries(hoveredItem)
                  .sort(([keyA], [keyB]) => {
                    if (keyA === 'name') return -1;
                    if (keyB === 'name') return 1;
                    return keyA.localeCompare(keyB);
                  })
                  .reduce((acc, [key, value]) => {
                    if (!skipProps.includes(key) && value !== undefined && value !== null && value !== false && value !== '') {
                      acc.push(\`\${formatKey(key)}: \${value}\`);
                    }
                    return acc;
                  }, [])
                  .join('\\n');
                
                tooltip.textContent = details;
                tooltip.style.display = 'block';
                
                // Position tooltip near mouse but ensure it stays within viewport
                const tooltipX = e.clientX + 15;
                const tooltipY = e.clientY + 15;
                
                tooltip.style.left = tooltipX + 'px';
                tooltip.style.top = tooltipY + 'px';
                
                // After positioning, check if tooltip is visible
                console.log('Tooltip positioned:', {
                  left: tooltip.style.left,
                  top: tooltip.style.top,
                  display: tooltip.style.display
                });
              } else {
                tooltip.style.display = 'none';
              }
            });
            
            // Hide tooltip when mouse leaves canvas
            canvas.addEventListener('mouseleave', () => {
              const tooltip = document.getElementById('tooltip');
              if (tooltip) {
                tooltip.style.display = 'none';
              }
            });

            canvas.addEventListener('click', (e) => {
              if (isDragging) return; // Don't handle clicks while dragging
              
              const rect = canvas.getBoundingClientRect();
              const mouseX = e.clientX - rect.left;
              const mouseY = e.clientY - rect.top;
              
              const clickedItem = items.find(item => isMouseOverItem(mouseX, mouseY, item));
              
              if (clickedItem?.ruleLineNumber) {
                vscode.postMessage({ 
                  command: 'jumpToRule',
                  lineNumber: clickedItem.ruleLineNumber
                });
              }
            });
          </script>
        </body>
      </html>`;
  }

  private _updatePreview(
    webview: vscode.Webview,
    rules: FilterRule[],
    items: ExtendedFilterItem[]
  ): void {
    const styledItems = this._applyFilterRules(items, rules);
    const spreadItems = this._spreadItemsNaturally(styledItems);

    webview.postMessage({
      type: "update",
      items: spreadItems,
    });
  }

  // Helper methods for generating and styling items
  private _generateSampleItems(): ExtendedFilterItem[] {
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

  private _applyFilterRules(
    items: ExtendedFilterItem[],
    rules: FilterRule[]
  ): ExtendedFilterItem[] {
    console.log("Applying rules to items:", {
      items: JSON.stringify(items, null, 2),
      rules: JSON.stringify(rules, null, 2),
    });

    return items.map((item) => {
      // Find all matching rules until we hit a non-continue rule
      const matchingRules: FilterRule[] = [];
      for (const rule of rules) {
        if (wouldRuleMatchItem(rule, item)) {
          matchingRules.push(rule);
          if (!rule.hasContinue) {
            break;
          }
        }
      }

      if (matchingRules.length === 0) {
        console.log(`No matching rule for ${item.name}`, item);
        return {
          ...item,
          matched: false,
          hidden: false,
          textColor: [128, 128, 128], // Default gray
          fontSize: 32,
        };
      }

      console.log(`Found matching rules for ${item.name}:`, matchingRules);

      const styles: {
        matched: boolean;
        hidden: boolean;
        fontSize: number;
        textColor: number[];
        borderColor?: number[];
        backgroundColor?: number[];
        beam?: { color: string; temporary: boolean };
        minimapIcon?: string;
        ruleLineNumber?: number;
      } = {
        matched: true,
        hidden: !matchingRules[matchingRules.length - 1].isShow, // Use last rule's Show/Hide
        fontSize: 32,
        textColor: [200, 200, 200],
        ruleLineNumber: matchingRules[matchingRules.length - 1].lineNumber, // Keep last matching rule's line number so navigating goes to that rule
      };

      // Apply actions from all matching rules in order
      for (const rule of matchingRules) {
        for (const action of rule.actions) {
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
      }

      console.log(`Final styles for ${item.name}:`, styles);

      return {
        ...item,
        ...styles,
      };
    });
  }

  private _spreadItemsNaturally(
    items: ExtendedFilterItem[]
  ): ExtendedFilterItem[] {
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

  private _generateItemsFromRules(rules: FilterRule[]): ExtendedFilterItem[] {
    const items: ExtendedFilterItem[] = [];

    for (const rule of rules) {
      // Find BaseType and Class conditions first
      const baseTypeCondition = rule.conditions.find(
        (c) => c.type === "BaseType"
      );
      const classCondition = rule.conditions.find((c) => c.type === "Class");
      const areaLevelCondition = rule.conditions.find(
        (c) => c.type === "AreaLevel"
      );

      // Calculate min and max drop level from area level if present
      let minDropLevel: number | undefined;
      let maxDropLevel: number | undefined;

      if (areaLevelCondition) {
        const level = Number(areaLevelCondition.values[0]);
        if (!isNaN(level)) {
          switch (areaLevelCondition.operator) {
            case "==":
              minDropLevel = level;
              maxDropLevel = Math.floor(level * 1.25);
              break;
            case ">=":
              minDropLevel = level;
              maxDropLevel = undefined;
              break;
            case "<=":
              minDropLevel = undefined;
              maxDropLevel = Math.floor(level * 1.25);
              break;
            case "<":
              minDropLevel = undefined;
              maxDropLevel = Math.floor((level - 1) * 1.25);
              break;
            case ">":
              minDropLevel = level + 1;
              maxDropLevel = undefined;
              break;
          }
        }
      }

      // Try to find a matching item
      let matchingItem: Match<BaseItemType | ItemClass> | undefined;

      if (baseTypeCondition) {
        const isExactMatch = baseTypeCondition.operator === "==";
        console.log("BaseType condition:", {
          values: baseTypeCondition.values,
          operator: baseTypeCondition.operator,
          isExactMatch,
        });

        const matches = isExactMatch
          ? this.gameData.findExactBaseType(baseTypeCondition.values)
          : this.gameData.findMatchingBaseTypes(baseTypeCondition.values);

        console.log(
          "Found matches:",
          isExactMatch,
          baseTypeCondition.operator,
          matches
        );

        if (matches.length > 0) {
          if (isExactMatch) {
            // For exact matches, pick a random match
            matchingItem = matches[Math.floor(Math.random() * matches.length)];
            console.log("Using random exact match:", matchingItem);
          } else {
            // Only apply level filtering for non-exact matches
            const levelMatches = matches.filter((m) => {
              const dropLevel = m.item.DropLevel;
              if (minDropLevel && dropLevel < minDropLevel) {
                return false;
              }
              if (maxDropLevel && dropLevel > maxDropLevel) {
                return false;
              }
              return true;
            });

            // Pick a random match from level-filtered matches, or all matches if none match level
            const candidateMatches =
              levelMatches.length > 0 ? levelMatches : matches;
            matchingItem =
              candidateMatches[
                Math.floor(Math.random() * candidateMatches.length)
              ];
          }
        }
      } else if (classCondition) {
        const classMatches = this.gameData.findExactClass(
          classCondition.values
        );

        if (classMatches.length > 0) {
          const classMatch = classMatches[0];
          // Find base items of this class
          let baseItems = this.gameData.baseItemTypes.filter(
            (item) => item.ItemClassesKey === classMatch.item._index
          );

          // For hide rules with DropLevel condition, prioritize that over AreaLevel
          const dropLevelCondition = rule.conditions.find(
            (c) => c.type === "DropLevel"
          );
          if (dropLevelCondition) {
            const level = Number(dropLevelCondition.values[0]);
            if (!isNaN(level)) {
              switch (dropLevelCondition.operator) {
                case "<":
                  baseItems = baseItems.filter(
                    (item) => item.DropLevel < level
                  );
                  break;
                case "<=":
                  baseItems = baseItems.filter(
                    (item) => item.DropLevel <= level
                  );
                  break;
                case ">":
                  baseItems = baseItems.filter(
                    (item) => item.DropLevel > level
                  );
                  break;
                case ">=":
                  baseItems = baseItems.filter(
                    (item) => item.DropLevel >= level
                  );
                  break;
                case "==":
                  baseItems = baseItems.filter(
                    (item) => item.DropLevel === level
                  );
                  break;
              }
            }
          }
          // Only apply area level filtering if we don't have a DropLevel condition
          else if (minDropLevel || maxDropLevel) {
            baseItems = baseItems.filter((item) => {
              if (minDropLevel && item.DropLevel < minDropLevel) {
                return false;
              }
              if (maxDropLevel && item.DropLevel > maxDropLevel) {
                return false;
              }
              return true;
            });
          }

          if (baseItems.length > 0) {
            // Sort by drop level - for hide rules with DropLevel < X, we want the highest level item that's still under X
            baseItems.sort((a, b) => b.DropLevel - a.DropLevel);
            const randomItem =
              baseItems[Math.floor(Math.random() * baseItems.length)];
            matchingItem = {
              item: randomItem,
              matchedBy: classMatch.matchedBy,
            };
          } else {
            // If no base items found after filtering, use a random representative item from the class
            baseItems = this.gameData.baseItemTypes.filter(
              (item) => item.ItemClassesKey === classMatch.item._index
            );
            if (baseItems.length > 0) {
              const randomItem =
                baseItems[Math.floor(Math.random() * baseItems.length)];
              matchingItem = {
                item: randomItem,
                matchedBy: classMatch.matchedBy,
              };
            } else {
              // If still no items, fall back to the class itself
              matchingItem = classMatch;
            }
          }
        }
      }

      const item = generateItemFromRule(rule);
      if (item) {
        if (matchingItem) {
          item.name = matchingItem.item.Name;
          if ("DropLevel" in matchingItem.item) {
            item.dropLevel = matchingItem.item.DropLevel;
          }
        }

        items.push({
          ...item,
          ruleLineNumber: rule.lineNumber,
        });
      }
    }

    return items;
  }
}
