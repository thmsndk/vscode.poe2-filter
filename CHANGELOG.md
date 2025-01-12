# Change Log

All notable changes to the "poe2-filter" extension will be documented in this file.

## [Unreleased]

### Changed

- 🔄 Updated PoE2 game data to patch 4.1.0.12.4

### Added

- ✨ Added stack size display in filter preview (e.g., "5x Scroll of Wisdom")

### Fixed

- 🐛 Fixed alpha channel not being respected in filter preview colors
- 🐛 Fixed font size parsing and rounding issues in preview

## [0.0.13] - 2024-12-23 15:10

### Fixed

- 🐛 Fixed data not being included in extension build

## [0.0.12] - 2024-12-23

### Added

- ✨ Added PoE2 data extraction integration
  - Data extraction using SnosMe's poe-dat-viewer tool
  - Configured for PoE2 patch 4.1.0.11
  - Selective table and column extraction
  - Support for English translations
- ✨ Added Class and BaseType validation
  - Validates against actual game data
  - Supports both singular and plural forms for Class names (e.g., "Charm" and "Charms")
  - Shows suggestions for similar valid values when mistyped
- ✨ Added BaseType match indicators
  - Shows count of potential matches before BaseType values
  - Hover tooltips display matching items
  - Only shows indicators for multiple matches
  - Helps identify overly broad BaseType patterns
- ✨ Enhanced item preview generation
  - Generates representative items based on Class and BaseType conditions
  - Respects AreaLevel and DropLevel restrictions
  - Randomly selects items to show variety in previews
  - Shows actual game item names instead of generic placeholders

## [0.0.11] - 2024-12-22 22:00

### Fixed

- 🐛 Improved rule conflict detection
  - Added bidirectional item matching verification for potential conflicts
  - Prevents false positives by checking if generated items would match both rules
  - Better handling of rules with different condition types (like AreaLevel vs ItemLevel)
- 🐛 Improved formatter spacing handling
  - Fixed inconsistent spacing between commented and uncommented blocks
  - Better handling of empty lines between blocks
  - Maintains proper spacing when transitioning between block types

## [0.0.10] - 2024-12-21 00:25

### Added

- ✨ Added Live Filter Preview
  - Interactive visualization of filter rules
  - Real-time updates as you edit
  - Visual representation of all styling:
    - Text colors and font sizes
    - Border and background colors
    - Beam effects
  - Interactive features:
    - Zoom and pan to explore
    - Click items to jump to rules
    - Hover tooltips with item details
    - Highlights currently edited rule
  - Sample items for testing
  - Clear indication of hidden items
  - Support for Continue rules
- ✨ Added Sound Playback (thanks to [@RobertFrydenlund](https://github.com/RobertFrydenlund))
  - Play alert sounds directly in the editor
  - CodeLens integration for PlayAlertSound commands
  - Support for both default and custom sound files
  - Cross-platform compatibility (Windows, macOS, Linux)
  - Volume control support (where available)

### Fixed

- 🐛 Fixed rule conflict detection
  - Corrected numeric condition comparison logic to properly handle ranges
  - Fixed false positives when rules had mutually exclusive conditions
  - Improved detection of overlapping conditions with different operators
  - Enhanced Rarity condition comparison to properly handle:
    - Comparison operators (<=, <)
    - Multiple values (e.g., "Rarity Magic Rare")
    - Single value matches
  - Added proper comparison support for defensive stats:
    - BaseArmour condition
    - BaseEnergyShield condition
    - BaseEvasion condition

## [0.0.9] - 2024-12-17 21:25

### Fixed

- 🐛 Fixed validation to allow named sound IDs (like ShAlchemy, ShBlessed) in PlayAlertSound command (closes #5)

### Improved

- 💡 Added suggestions for invalid parameter values
  - Shows "Did you mean: X?" when typing similar valid values
  - Lists all valid options when no close matches are found
  - Provides pattern information for complex validations

## [0.0.8] - 2024-12-16 20:10

### Improved

- ✨ Enhanced formatter to handle section headers consistently
  - Added proper spacing around bordered sections
  - Maintains empty lines before and after section headers
  - Preserves formatting of multi-line section headers

### Fixed

- 🐛 Fixed formatter to properly handle commented blocks (closes #4)

## [0.0.7] - 2024-12-16 16:50

### Added

- ✨ Added detection of conflicting filter rules
  - Warns when a rule may never trigger due to being caught by an earlier rule
  - Shows which conditions from the earlier rule would catch the items
  - Provides quick navigation to the conflicting rule
- ✨ Added sound file validation for CustomAlertSound
  - Warns when specified sound files don't exist
  - Respects CustomAlertSoundOptional for optional sound files
- ✨ Added support for defensive stat conditions
  - BaseArmour condition for armor value filtering
  - BaseEnergyShield condition for ES value filtering
  - BaseEvasion condition for evasion value filtering

### Improved

- 🎨 Enhanced error detection and validation system
  - More accurate condition matching
  - Better handling of numeric comparisons
  - Clearer warning messages for rule conflicts
  - Smarter color validation distinguishing between RGB and named colors
  - Fixed CustomAlertSound incorrectly flagging sound file paths as invalid numbers

## [0.0.6] - 2024-12-16 09:35

### Added

- ✨ Added minimap icon decorations
  - Visual indicators for all shape and color combinations
  - Live preview of minimap icons in the editor
  - Support for all 12 shapes and 11 colors

### Fixed

- 🐛 Fixed color command validation to properly handle:
  - Inline comments after color values (closes #3)
- 🐛 Fixed formatter to properly indent commented lines within Show/Hide blocks

### Improved

- 🎨 Enhanced TextMate grammar for better syntax highlighting and error detection:
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

- ✨ Added proper support for Continue command
  - Syntax highlighting as control flow statement
  - Proper indentation within Show/Hide blocks
  - Command validation support
- ✨ Improved Document Outline support for FilterBlade/CDR table of contents format
  - Proper hierarchical section detection using border characters
  - Top-level sections with '=' borders
  - Sub-sections with '-' borders

## [0.0.4] - 2024-12-14 15:30

### Fixed

- 🐛 Fixed command validation where certain commands (like DisableDropSound) were incorrectly flagged as invalid due to regex pattern stripping
- 🐛 Fixed WaystoneTier condition not being recognized as a valid filter condition
- 🎨 Improved Document Outline view
  - Better handling of Show/Hide blocks with proper scope detection
  - More meaningful block descriptions based on filter conditions
  - Added condition and action counts to block descriptions
  - Organized conditions and actions as collapsible child nodes
  - Fixed condition detection to properly handle operators (≤, ≥, etc.)

## [0.0.3] - 2024-12-14 12:50

### Added

- ✨ Document Outline view
  - Navigation through filter sections
  - Hierarchical structure display
  - Folding/unfolding support
- ✨ Error detection and validation
  - Command validation with suggestions for misspelled commands
  - Quick fixes for command typos
  - Parameter validation for color values

### Fixed

- 🎨 Improved formatting for inline comments
  - Consistent spacing after # in comments
  - Proper handling of inline comments on block statements (Show/Hide)
  - Preserved special comment sections (like dividers)

## [0.0.2] - 2024-12-13

- ⬇️ Lowered vscode requirement as cursor is at 1.93.1

## [0.0.1] - 2024-12-13

### Added

- 🎉 Initial release
- ✨ Syntax highlighting for POE2 filter files
- 🎨 Color previews for SetTextColor, SetBorderColor, and SetBackgroundColor
- ✨ Document formatting support
- 🎨 Color picker integration for RGB/RGBA values
- 🔧 Basic extension settings

### Changed

- N/A

### Fixed

- N/A
