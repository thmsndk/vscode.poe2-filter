# Change Log

All notable changes to the "poe2-filter" extension will be documented in this file.

## [0.0.6] - 2024-12-16 09:35

### Added

- Added minimap icon decorations
  - Visual indicators for all shape and color combinations
  - Live preview of minimap icons in the editor
  - Support for all 12 shapes and 11 colors

### Fixed

- Fixed color command validation to properly handle:
  - Inline comments after color values Closes #1
- Fixed formatter to properly indent commented lines within Show/Hide blocks

### Improved

- Enhanced TextMate grammar for better syntax highlighting and error detection:
  - Properly scoped command names using consistent patterns:
    - Block commands as `keyword.control`
    - Conditions as `support.function`
    - Actions as `storage.type`
  - Standardized parameter scoping:
    - Numbers as `constant.numeric`
    - Strings as `string.quoted.double`
    - Colors as `variable.parameter.color`
    - Operators as `keyword.operator`
  - Added proper pattern matching for:
    - Optional operators in numeric conditions
    - Multiple quoted arguments in BaseType/Class
    - Optional True/False in boolean conditions
  - Improved command extraction for diagnostics and error detection

## [0.0.5] - 2024-12-15 10:30

### Added

- Added proper support for Continue command
  - Syntax highlighting as control flow statement
  - Proper indentation within Show/Hide blocks
  - Command validation support
- Improved Document Outline support for FilterBlade/CDR table of contents format
  - Proper hierarchical section detection using border characters
  - Top-level sections with '=' borders
  - Sub-sections with '-' borders

## [0.0.4] - 2024-12-14 15:30

### Fixed

- Fixed command validation where certain commands (like DisableDropSound) were incorrectly flagged as invalid due to regex pattern stripping
- Fixed WaystoneTier condition not being recognized as a valid filter condition
- Improved Document Outline view
  - Better handling of Show/Hide blocks with proper scope detection
  - More meaningful block descriptions based on filter conditions
  - Added condition and action counts to block descriptions
  - Organized conditions and actions as collapsible child nodes
  - Fixed condition detection to properly handle operators (≤, ≥, etc.)

## [0.0.3] - 2024-12-14 12:50

### Added

- Document Outline view
  - Navigation through filter sections
  - Hierarchical structure display
  - Folding/unfolding support
- Error detection and validation
  - Command validation with suggestions for misspelled commands
  - Quick fixes for command typos
  - Parameter validation for color values

### Fixed

- Improved formatting for inline comments
  - Consistent spacing after # in comments
  - Proper handling of inline comments on block statements (Show/Hide)
  - Preserved special comment sections (like dividers)

## [0.0.2] - 2024-12-13

- lowered vscode requirement as cursor is at 1.93.1

## [0.0.1] - 2024-12-13

### Added

- Initial release
- Syntax highlighting for POE2 filter files
- Color previews for SetTextColor, SetBorderColor, and SetBackgroundColor
- Document formatting support
- Color picker integration for RGB/RGBA values
- Basic extension settings

### Changed

- N/A

### Fixed

- N/A
