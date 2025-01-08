# Language Server Migration Plan

## Note on Syntax Highlighting

Syntax highlighting is handled by the existing TextMate grammar (tmLanguage) file and will not be migrated to the language server.

## Phase 1: Core Validation

1. Semantic Validations

   - [x] Create SemanticValidator class
   - [x] Number range validation (value bounds checking)
   - [x] Color validation
     - [x] RGB value range checking (0-255)
     - [x] Alpha value validation
     - [x] Named color validation (Red, Green, Blue, etc)
   - [x] Shape validation
     - [x] Valid shape names (Circle, Diamond, etc)
   - [x] Sound file validation
     - [x] Sound ID range validation (1-16)
     - [x] Volume range validation (0-300)
     - [x] Custom sound file path validation
   - [ ] Block/Condition/Action keyword validation
     - [x] Block keyword validation
     - [x] Condition keyword validation
     - [x] Action keyword validation

2. Clean up
   - [ ] Remove extractCommandsFromGrammar() and related code

## Phase 2: Rule Conflict Detection

1. Port rule conflict detection
   - [ ] Port FilterRuleEngine to use new AST (from filterRuleEngine.ts)
     - [x] Update rule matching logic
     - [x] Update condition evaluation
     - [x] Update action evaluation
     - [x] Add support for Continue blocks
   - [ ] Adapt conflict detection logic (from filterConflicts.ts)
     - [ ] Blocks with empty conditions should catch all rules below them

## Phase 3: Game Data Integration

1. Move game data validation
   - [ ] Port GameDataService to language server (from gameDataService.ts)
   - [x] BaseType validation (from filterDiagnostics.ts:826-895)
   - [x] Class validation (from filterDiagnostics.ts:826-895)
     - [x] Handle singular/plural forms
   - [ ] Performance impact analysis (from README.md:187-191)

## Phase 4: Document Features (LSP Capabilities)

1. Document symbols (`documentSymbolProvider`)

   - [ ] Show/Hide block symbols in outline view
   - [ ] Comment-based section symbols
     - [ ] Parse section comments (e.g. "# Section: Currency")
     - [ ] Show section hierarchy in outline
   - [ ] Support folding ranges for sections
   - [ ] Condition/Action symbols in outline
   - [ ] Support breadcrumb navigation (path: Currency > High Value > Exalted Orb)

2. Document formatting (`documentFormattingProvider`, `documentRangeFormattingProvider`)

   - [ ] Indent rules properly (4 spaces for conditions)
   - [ ] Align values in columns (like tabular data)
   - [ ] Handle comments (preserve alignment)
   - [ ] Preserve empty lines between blocks
   - [ ] Format color values consistently (RGB vs RGBA)

3. Document colors (`colorProvider`)

   - [x] Color previews in RGB/RGBA values (show color picker on hover)
   - [x] Color picker integration (click to edit)
   - [ ] Named color validation (Red, Green, Blue)

4. Document links (`documentLinkProvider`)

   - [ ] Links to sound files (make CustomAlertSound paths clickable)

5. Selection ranges (`selectionRangeProvider`)

   - [ ] Smart selection for blocks (expand from value → condition → block)
   - [ ] Selection for condition groups (select related conditions)
   - [ ] Value selection support (select multiple values in a condition)

6. Folding ranges (`foldingRangeProvider`)
   - [ ] Block-based folding (collapse entire Show/Hide blocks)
   - [ ] Comment-based folding (collapse sections marked by comments)
   - [ ] Multi-line condition folding (collapse conditions with multiple values)

## Phase 5: Advanced Features (LSP Capabilities)

1. Code completion (`completionProvider`)

   - [ ] Command completion (from filterDiagnostics.ts:331-337)

     - [ ] Show/Hide block suggestions
     - [ ] Condition suggestions
     - [ ] Action suggestions
     - [ ] Similar command suggestions

   - [ ] Value completion

     - [ ] BaseType values from game data (from filterDiagnostics.ts:826-895)
     - [ ] Class values from game data (from filterDiagnostics.ts:826-895)
     - [ ] Color values (from filterDiagnostics.ts:734-765)
     - [ ] Shape values (from filterDiagnostics.ts:254-256)
     - [ ] Rarity values
     - [ ] Sound effect IDs
     - [ ] Boolean values
     - [ ] Operator suggestions

   - [ ] Parameter completion
     - [ ] Required parameters
     - [ ] Optional parameters
     - [ ] Default values
     - [ ] Range hints for numeric values

2. Hover information (`hoverProvider`)

   - [ ] Command documentation
   - [ ] Parameter documentation
   - [ ] Value documentation
   - [ ] Range information for numeric values

3. Code actions (`codeActionProvider`)

   - [ ] Fix color value ranges
   - [ ] Add missing parameters
   - [ ] Fix typos in block/condition/action keywords
     - [ ] Block keyword validation
     - [ ] Condition keyword validation
     - [ ] Action keyword validation
   - [ ] Convert = to == in comparisons
   - [ ] Value corrections
     - [ ] Suggest similar named colors
     - [ ] Suggest similar shape values
     - [ ] Suggest similar rarity values
     - [ ] Suggest similar BaseType values
     - [ ] Suggest similar Class values

4. CodeLens (`codeLensProvider`)

   - [ ] Play sound button for PlayAlertSound commands
   - [ ] Play sound button for CustomAlertSound commands
   - [ ] Volume indicator
   - [ ] Sound file existence validation
   - [ ] Error handling for missing/invalid sound files

5. Inlay hints (`inlayHintProvider`)

   - [x] Show match counts for BaseType/Class conditions
   - [ ] Show condition type hints
     - [ ] Show "Block" before Show/Hide keywords
     - [ ] Show "Condition" before condition lines
     - [ ] Show "Action" before action lines
   - [ ] Show operator hints
     - [ ] Show "equals" for == operator
     - [ ] Show "contains" for implicit string matching
   - [ ] Show implicit defaults
     - [ ] Show default volume for PlayAlertSound
     - [ ] Show default size for SetFontSize
   - [ ] Show area level hint (would a codelens be better? perhaps also hover?)
     - [ ] Can we extract them from client data? (worldareas.dat64)

6. Signature help (`signatureHelpProvider`)

   - [ ] Show parameter documentation while typing
   - [ ] Show valid ranges and types for parameters
   - [ ] Show examples of valid values

7. Semantic tokens (`semanticTokensProvider`)

   - [ ] Highlight conditions by type
   - [ ] Highlight actions by type
   - [ ] Custom token types for filter-specific elements

8. Workspace symbols (`workspaceSymbolProvider`)

   - [ ] Show all blocks in workspace
   - [ ] Filter by condition types
   - [ ] Search by values

## Phase 6: Preview Features

1. Filter Preview

   - [ ] Parser Integration

     - [ ] Import Parser from language-server/ast/parser.ts
     - [ ] Convert FilterPreviewEditor to use AST types
     - [ ] Use updated FilterRuleEngine from Phase 2

   - [ ] Item Preview Generation (from preview/FilterPreviewEditor.ts)

     - [ ] Convert existing item generation to use new AST
     - [ ] Update example item templates
     - [ ] Add support for all condition types
     - [ ] Add support for all action types
     - [ ] Validate generated items match game data

   - [ ] UI Updates
     - [ ] Update preview panel to use new item format
     - [ ] Add rule match highlighting
     - [ ] Show which conditions matched/failed
     - [ ] Add performance warning indicators
     - [ ] Update live preview refresh logic

## Migration Strategy

1. For each feature:
   - Create new handler in language server
   - Test with simple cases
   - Port existing logic
   - Add comprehensive tests
   - Remove old implementation
   - Update documentation

## Testing Requirements

1. Unit tests for each ported feature
2. Integration tests for language server
3. End-to-end tests with VSCode extension
4. Test files from real filters

## Notes

- Keep 1-based line numbers in parser, convert to 0-based only at LSP boundary
- Maintain backward compatibility during migration
- Update error messages to be more LSP-friendly
- Consider performance impact of game data validation

## LSP Capability Documentation

### Phase 4: Document Features

1. [`documentSymbolProvider`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_documentSymbol)

   - Powers the Outline view and breadcrumb navigation
   - Used to show block structure and sections in the filter
   - Enables quick navigation between blocks

2. [`documentFormattingProvider`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_formatting)

   - Handles "Format Document" command
   - Ensures consistent indentation and alignment
   - Maintains readability of filter blocks

3. [`colorProvider`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_documentColor)

   - Shows color pickers for RGB/RGBA values
   - Provides visual color previews inline
   - Enables visual color editing

4. [`documentLinkProvider`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_documentLink)

   - Makes CustomAlertSound paths clickable
   - Enables navigation to referenced files
   - Validates file existence

5. [`selectionRangeProvider`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_selectionRange)

   - Powers "Expand Selection" feature
   - Enables smart selection of blocks and conditions
   - Helps with block manipulation

6. [`foldingRangeProvider`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_foldingRange)
   - Enables collapsing of blocks and sections
   - Helps organize large filter files
   - Makes navigation easier

### Phase 5: Advanced Features

1. [`completionProvider`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_completion)

   - Provides autocomplete for commands and values
   - Suggests BaseTypes and Classes from game data
   - Shows valid options while typing

2. [`hoverProvider`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_hover)

   - Shows documentation on hover
   - Displays valid value ranges
   - Provides examples and usage hints

3. [`codeActionProvider`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_codeAction)

   - Offers quick fixes for common issues
   - Suggests improvements and optimizations
   - Helps fix typos and validation errors

4. [`codeLensProvider`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_codeLens)

   - Shows "Play Sound" buttons above sound commands
   - Displays volume indicators
   - Provides quick actions in context

5. [`inlayHintProvider`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_inlayHint)

   - Shows match counts for conditions
   - Makes implicit behavior explicit
   - Displays default values inline

6. [`signatureHelpProvider`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_signatureHelp)

   - Shows command syntax while typing
   - Displays parameter documentation
   - Indicates required vs optional parameters

7. [`semanticTokensProvider`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_semanticTokens)

   - Provides semantic highlighting
   - Distinguishes between conditions and actions
   - Highlights different value types

8. [`workspaceSymbolProvider`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_symbol)

   - Enables searching across multiple filters
   - Finds blocks by condition type
   - Locates specific value usage

9. [`linkedEditingRangeProvider`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_linkedEditingRange)

   - Enables simultaneous editing of related values
   - Links BaseType/Class values
   - Connects related color settings

10. [`executeCommandProvider`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_executeCommand)

    - Adds custom commands to command palette
    - Enables bulk operations on filters
    - Provides testing and validation tools

11. [`callHierarchyProvider`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_prepareCallHierarchy)
    - Shows rule override relationships
    - Displays Continue block connections
    - Visualizes rule catching hierarchy
