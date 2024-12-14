# POE2 Filter Extension

A Visual Studio Code extension for Path of Exile 2 item filter files.

## Features

- [Syntax highlighting](#syntax-highlighting) for POE2 filter files
- [Color previews and editing](#color-features) for filter colors
- [Document formatting](#document-formatting) support
- [Document Outline](#document-outline) for easy navigation

## Feature Details

### Syntax Highlighting

Proper syntax highlighting for POE2 filter files to improve readability and help catch syntax errors.

<!-- ![Syntax Highlighting](images/syntax-highlight.png) -->

### Color Features

- Live color previews for SetTextColor, SetBorderColor, and SetBackgroundColor
- Integrated color picker for easy RGB/RGBA value editing

![Color Preview](images/color-preview.png)

### Document Formatting

Automatically format your filter files to maintain consistent styling and improve readability.

### Document Outline

Navigate through your filter with ease using the document outline view:

- Quick navigation through filter sections and rules
- Hierarchical view of your filter structure
- Easy folding/unfolding of filter sections

![Outline View](images/outline-view.png)

## Known Issues

- None currently reported

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

## Future Ideas / TODO

- error/warnings :
  - Syntax error highlighting
  - detection of spelling mistakes
  - Parameter validation
  - warnings if a rule is not applied due to a previous rule
- Command completion and snippets
- Hover documentation for commands
- Quick fixes for common mistakes
- preview of filter results

## Contributing

Feel free to open issues or PRs on the [GitHub repository](https://github.com/thmsndk/vscode.poe2-filter).

## Development

### Building and Packaging

To create a .vsix package:

### Publishing

1. Ensure you have a Personal Access Token (PAT) from the [VS Code Marketplace](https://marketplace.visualstudio.com/manage)
2. Login to vsce:
3. Build and publish:

```bash
pnpm package
```

```bash
vsce publish --no-dependencies
```
