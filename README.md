# Copy Path

This is a simple plugin for [Obsidian](https://obsidian.md/) that adds context menu actions and commands for copying the full or vault relative paths of files, folders, and hovered links.

## Installation

[Download](https://obsidian.md/plugins?id=copy-path) the plugin from the official Community Plugins repository.

## Commands

The commands "Copy vault path" and "Copy full path" take the path of the item that the mouse rests on. When the mouse does not rest on a link, the commands take the path of the active note.

This lets you copy the path of a linked file without opening it:

```markdown
See the offer in [[offers/acme/offer.pdf]].
```

Hover over `offer.pdf` and run "Copy full path". The clipboard gets the absolute path of the PDF, not the path of the note.

These link types resolve to the linked file:

| Link | Result |
| --- | --- |
| `[[note]]` | Path of the note |
| `[[document.pdf]]` | Path of the PDF |
| `![[image.png]]` and `![[document.pdf]]` | Path of the embed target |
| `[text](document.pdf)` | Path of the file in the markdown link |

External links, such as `https://example.com`, do not resolve. The commands then take the path of the active note.

## Settings

- **"Copy vault path" context menu action**: Show the option to copy the vault path of a file or folder.
- **"Copy full path" context menu action**: Show the option to copy the full path of a file or folder.
- **Prefer the hovered link target**: When enabled, the commands copy the path of the linked file when the mouse rests on a link. Disable it to always copy the path of the active note.
- **Add trailing slash to folder paths**: When enabled, folder paths will end with a trailing slash (e.g., `folder/`) to distinguish them from files. This applies to both vault and full path copying.

You can toggle these settings in the plugin's settings tab.
