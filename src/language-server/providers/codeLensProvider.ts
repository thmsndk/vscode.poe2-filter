import * as fs from "fs";
import * as path from "path";
import { CodeLens, Range, Location } from "vscode-languageserver";
import { RootNode, ActionNode, Node, isBlockNode } from "../ast/nodes";
import { FilterRuleEngine } from "../analysis/ruleEngine";

/**
 * Provides "Play sound" code lenses above sound actions, mirroring the old
 * client-side {@link CodelensProvider}:
 *  - `PlayAlertSound[Positional] <id> <volume>` → plays the built-in sound.
 *  - `CustomAlertSound[Optional] "<file>" <volume>` → plays the referenced
 *    file, but only when that file exists relative to the document.
 *
 * The lenses carry client commands (`poe2-filter.playDefaultSound` /
 * `poe2-filter.playCustomSound`) which execute in the extension host where the
 * audio playback lives.
 */
export class CodeLensProvider {
  public provideCodeLenses(ast: RootNode, documentUri: string): CodeLens[] {
    const lenses: CodeLens[] = [
      ...this.provideSoundLenses(ast, documentUri),
      ...this.provideConflictLenses(ast, documentUri),
    ];

    return lenses;
  }

  /**
   * Emits a "Shadows N later rule(s)" lens above every rule that makes one or
   * more later rules unreachable. Clicking it opens a peek view listing all the
   * shadowed rules (via the client-side `poe2-filter.showConflicts` command,
   * which forwards to VS Code's built-in `editor.action.showReferences`).
   */
  private provideConflictLenses(
    ast: RootNode,
    documentUri: string
  ): CodeLens[] {
    const conflicts = new FilterRuleEngine(ast).detectConflicts();

    // Group the unreachable rules by the earlier rule that shadows them.
    const shadowedByRule = new Map<Node, Node[]>();
    for (const conflict of conflicts) {
      if (!conflict.relatedNode) {
        continue;
      }
      const group = shadowedByRule.get(conflict.relatedNode) ?? [];
      group.push(conflict.node);
      shadowedByRule.set(conflict.relatedNode, group);
    }

    const lenses: CodeLens[] = [];
    for (const [catchingRule, shadowed] of shadowedByRule) {
      const sorted = [...shadowed].sort((a, b) => a.line - b.line);
      const locations: Location[] = sorted.map((node) => ({
        uri: documentUri,
        range: this.nodeRange(node),
      }));

      const title =
        sorted.length === 1
          ? `$(eye-closed) Shadows 1 later rule (line ${sorted[0].line})`
          : `$(eye-closed) Shadows ${sorted.length} later rules (lines ${sorted
              .map((n) => n.line)
              .join(", ")})`;

      lenses.push({
        range: this.nodeRange(catchingRule),
        command: {
          title,
          command: "poe2-filter.showConflicts",
          arguments: [
            documentUri,
            this.nodeRange(catchingRule).start,
            locations,
          ],
        },
      });
    }

    return lenses;
  }

  private provideSoundLenses(ast: RootNode, documentUri: string): CodeLens[] {
    const lenses: CodeLens[] = [];
    const baseDir = path.dirname(this.toFsPath(documentUri));

    for (const node of ast.children) {
      if (!isBlockNode(node)) {
        continue;
      }

      for (const child of node.body) {
        if (child.type !== "Action" || child.commented === true) {
          continue;
        }

        const action = child as ActionNode;
        const range = Range.create(
          action.line - 1,
          action.columnStart - 1,
          action.line - 1,
          action.columnEnd - 1
        );

        const sound = action.values[0]?.value;
        const volume = action.values[1]?.value;

        // A volume is required to mirror the previous behaviour (the old
        // regex only matched "<sound> <volume>").
        if (sound === undefined || volume === undefined) {
          continue;
        }

        if (
          action.action === "PlayAlertSound" ||
          action.action === "PlayAlertSoundPositional"
        ) {
          lenses.push({
            range,
            command: {
              title: "Play sound",
              command: "poe2-filter.playDefaultSound",
              arguments: [String(sound), String(volume)],
            },
          });
        } else if (
          action.action === "CustomAlertSound" ||
          action.action === "CustomAlertSoundOptional"
        ) {
          const soundPath = String(sound);
          if (soundPath === "None" || soundPath.includes(";")) {
            continue;
          }

          const targetPath = path.isAbsolute(soundPath)
            ? soundPath
            : path.join(baseDir, soundPath);

          if (fs.existsSync(targetPath)) {
            lenses.push({
              range,
              command: {
                title: `Play ${soundPath}`,
                command: "poe2-filter.playCustomSound",
                arguments: [soundPath, String(volume)],
              },
            });
          }
        }
      }
    }

    return lenses;
  }

  private nodeRange(node: Node): Range {
    return Range.create(
      node.line - 1,
      node.columnStart - 1,
      node.line - 1,
      node.columnEnd - 1
    );
  }

  private toFsPath(uri: string): string {
    if (!uri.startsWith("file:")) {
      return uri;
    }

    let p = decodeURIComponent(uri.replace(/^file:\/\//, ""));
    if (/^\/[a-zA-Z]:/.test(p)) {
      p = p.slice(1);
    }
    return p;
  }
}
