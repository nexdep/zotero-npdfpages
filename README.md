# NPDFPages

![NPDFPages icon](addon/content/icons/pdf-pages-icon-96.png)

Minimal Zotero plugin that adds:

- a sortable `PDF Pages` column to the item tree
- a `PDF Pages` condition in Advanced Search

Requires Zotero 7 or newer. The current release is marked compatible through
Zotero 9.0.x.

The item-tree column is hidden by default and can be enabled from the column
picker. The advanced-search condition supports `is`, `is not`, `is less than`,
and `is greater than`.

Page totals are based on Zotero's indexed PDF page totals. Parent items show
the sum of known indexed pages across child PDFs. EPUB attachments contribute
`0` in this version because Zotero does not persist EPUB page totals.

## Installation

Download the latest `npdf-pages.xpi` from the GitHub releases page and install it
from Zotero's Add-ons Manager.

## Usage

Enable the `PDF Pages` column from the item-tree column picker. Use the same
`PDF Pages` field in Advanced Search to find items by the total number of known
indexed PDF pages.

## Development

Use Node 22.8 or newer for scaffold build commands.

```sh
npm install
npm run build
```

## Release

The repository includes the template release workflow. Pushing a version tag
matching `v**` starts `.github/workflows/release.yml`, which builds the plugin
and runs `npm run release` to attach the generated XPI and update metadata to a
GitHub release.

Use `main` as the development and release branch.

## Acknowledgements

This plugin is built from the
[Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template)
project.
