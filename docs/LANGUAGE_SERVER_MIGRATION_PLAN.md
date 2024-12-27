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
   - [ ] Shape validation
     - [ ] Valid shape names (Circle, Diamond, etc)
   - [ ] Sound file validation
     - [ ] Sound ID range validation (1-16)
     - [ ] Volume range validation (0-300)
     - [ ] Custom sound file path validation
   - [ ] Block/Condition/Action keyword validation
     - [ ] Block keyword validation
     - [ ] Condition keyword validation
     - [ ] Action keyword validation

2. Clean up
   - [ ] Remove extractCommandsFromGrammar() and related code

## Phase 2: Rule Conflict Detection

1. Port rule conflict detection
   - [ ] Port FilterRuleEngine to use new AST (from filterRuleEngine.ts)
     - [ ] Update rule matching logic
     - [ ] Update condition evaluation
     - [ ] Update action evaluation
     - [ ] Add support for Continue blocks
     - [ ] Add support for nested rules
   - [ ] Adapt conflict detection logic (from filterConflicts.ts)
     - [ ] Blocks with empty conditions should catch all rules below them
   - [ ] Convert diagnostic output format
   - [ ] Add related information support (goto links)
   - [ ] Add nested block detection
   - [ ] Add empty block detection

## Phase 3: Game Data Integration

1. Move game data validation
   - [ ] Port GameDataService to language server (from gameDataService.ts)
   - [ ] BaseType validation (from filterDiagnostics.ts:826-895)
   - [ ] Class validation (from filterDiagnostics.ts:826-895)
     - [ ] Handle singular/plural forms
   - [ ] Performance impact analysis (from README.md:187-191)

## Phase 4: Document Features

1. Document symbols

   - [ ] Show/Hide block symbols
   - [ ] Comment-based section symbols
     - [ ] Parse section comments
     - [ ] Show section hierarchy
     - [ ] Support folding ranges
   - [ ] Condition/Action symbols
   - [ ] Support breadcrumb navigation

2. Document formatting
   - [ ] Indent rules properly
   - [ ] Align values in columns
   - [ ] Handle comments
   - [ ] Preserve empty lines between blocks
   - [ ] Format color values consistently

## Phase 5: Advanced Features

1. Code completion

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

2. Hover information (from README.md:192-194)

   - [ ] Command documentation
   - [ ] Parameter documentation
   - [ ] Value documentation
   - [ ] Range information for numeric values

3. Quick fixes (from README.md:195)

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

4. CodeLens features (from preview/FilterPreviewEditor.ts)
   - [ ] Play sound button for PlayAlertSound commands
   - [ ] Play sound button for CustomAlertSound commands
   - [ ] Volume indicator
   - [ ] Sound file existence validation
   - [ ] Error handling for missing/invalid sound files

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
