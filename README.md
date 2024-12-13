# POE2 Filter Extension

A Visual Studio Code extension for Path of Exile 2 item filter files.

## Features

- Syntax highlighting for POE2 filter files
- Color previews for SetTextColor, SetBorderColor, and SetBackgroundColor commands
- Document formatting support
- Color picker integration for easy color editing

![Color Preview](images/color-preview.png)

## Known Issues

- None currently reported

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

### 0.0.1

Initial release:

- Basic syntax highlighting
- Color previews and picker integration
- Document formatting

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
