# Change Log

All notable changes to the "poe2-filter" extension will be documented in this file.

## [0.0.4] - Unreleased

### Fixed

- Fixed command validation where certain commands (like DisableDropSound) were incorrectly flagged as invalid due to regex pattern stripping
- Fixed WaystoneTier condition not being recognized as a valid filter condition

## [0.0.3] - 2024-12-14

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
