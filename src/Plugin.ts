import {
  FileView,
  Notice,
  TAbstractFile,
  TFile,
  TFolder
} from 'obsidian';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';

import type { CopyPathPluginTypes } from './PluginTypes.ts';

import { CopyPathPluginSettingsManager } from './PluginSettingsManager.ts';
import { CopyPathPluginSettingsTab } from './PluginSettingsTab.ts';

const LINK_ELEMENT_SELECTOR = '.internal-link, .internal-embed, [data-href], [data-src]';
const LINKTEXT_ATTRIBUTES = ['data-href', 'src', 'data-src'] as const;
const NOTICE_TIMEOUT_IN_MILLISECONDS = 2000;

interface CopyTarget {
  file: TAbstractFile;
  fromLink: boolean;
}

interface HoveredLinkElement {
  linktext: string;
  targetEl: HTMLElement;
}

interface HoveredLinkEventData {
  linktext: string;
  sourcePath: null | string;
  targetEl: HTMLElement | null;
}

export class CopyPathPlugin extends PluginBase<CopyPathPluginTypes> {
  private hoveredLinkElement: HoveredLinkElement | null = null;
  private hoveredLinkEvent: HoveredLinkEventData | null = null;

  protected override createSettingsManager(): CopyPathPluginSettingsManager {
    return new CopyPathPluginSettingsManager(this);
  }

  protected override createSettingsTab(): CopyPathPluginSettingsTab {
    return new CopyPathPluginSettingsTab(this);
  }

  protected override async onloadImpl(): Promise<void> {
    await super.onloadImpl();

    this.registerHoveredLinkTracking();

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (this.settings.copyVaultPathContextItem) {
          menu.addItem((item) => {
            item
              .setSection('info')
              .setTitle('Copy vault path')
              .setIcon('copy')
              .onClick(async () => {
                await copyVaultPath(file, this, false);
              });
          });
        }

        if (this.settings.copyFullPathContextItem) {
          menu.addItem((item) => {
            item
              .setSection('info')
              .setTitle('Copy full path')
              .setIcon('copy')
              .onClick(async () => {
                await copyFullPath(file, this, false);
              });
          });
        }
      })
    );

    this.addCommand({
      checkCallback: (checking: boolean) => {
        const copyTarget = this.getCopyTarget();

        if (!copyTarget) {
          return false;
        }

        if (!checking) {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          copyVaultPath(copyTarget.file, this, copyTarget.fromLink);
        }

        return true;
      },
      id: 'copy-vault-path',
      name: 'Copy vault path of hovered link or active item'
    });

    this.addCommand({
      checkCallback: (checking: boolean) => {
        const copyTarget = this.getCopyTarget();

        if (!copyTarget) {
          return false;
        }

        if (!checking) {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          copyFullPath(copyTarget.file, this, copyTarget.fromLink);
        }

        return true;
      },
      id: 'copy-full-path',
      name: 'Copy full path of hovered link or active item'
    });
  }

  private findHoveredLinkElement(target: EventTarget | null): HoveredLinkElement | null {
    if (!(target instanceof Element)) {
      return null;
    }

    const linkEl = target.closest<HTMLElement>(LINK_ELEMENT_SELECTOR);
    if (!linkEl) {
      return null;
    }

    const linktext = getLinktext(linkEl);
    if (!linktext) {
      return null;
    }

    return { linktext, targetEl: linkEl };
  }

  private getActiveFile(): null | TFile {
    // First try active file
    const activeFileView = this.app.workspace.getActiveViewOfType(FileView);
    if (activeFileView) {
      return activeFileView.file;
    }
    return null;
  }

  private getCopyTarget(): CopyTarget | null {
    const hoveredFile = this.settings.copyHoveredLinkPath
      ? this.resolveHoveredLinkFile()
      : null;

    if (hoveredFile) {
      return { file: hoveredFile, fromLink: true };
    }

    const activeFile = this.getActiveFile();
    if (activeFile) {
      return { file: activeFile, fromLink: false };
    }

    return null;
  }

  private getSourcePathForElement(el: HTMLElement): null | string {
    let sourcePath: null | string = null;

    this.app.workspace.iterateAllLeaves((leaf) => {
      if (sourcePath !== null) {
        return;
      }

      const view = leaf.view;
      if (view.containerEl.contains(el) && view instanceof FileView) {
        sourcePath = view.file?.path ?? null;
      }
    });

    return sourcePath;
  }

  private registerHoveredLinkTracking(): void {
    // The hover-link event reports the link text and the path of the showing note.
    this.registerEvent(
      this.app.workspace.on('hover-link', (event) => {
        if (!event.linktext) {
          return;
        }

        this.hoveredLinkEvent = {
          linktext: event.linktext,
          sourcePath: event.sourcePath ?? null,
          targetEl: event.targetEl ?? null
        };
      })
    );

    // The hover-link event has no end event, so follow the pointer instead.
    this.registerDomEvent(
      document,
      'mouseover',
      (event: MouseEvent) => {
        this.updateHoveredLinkElement(event);
      },
      true
    );
  }

  private resolveHoveredLinkFile(): null | TFile {
    const hoveredLink = this.hoveredLinkElement;
    if (!hoveredLink) {
      return null;
    }

    const hoverEvent = this.hoveredLinkEvent;
    const hasMatchingEvent = hoverEvent !== null && isSameLinkElement(hoverEvent.targetEl, hoveredLink.targetEl);

    const linktext = hasMatchingEvent ? hoverEvent.linktext : hoveredLink.linktext;
    const sourcePath = (hasMatchingEvent ? hoverEvent.sourcePath : null)
      ?? this.getSourcePathForElement(hoveredLink.targetEl)
      ?? this.getActiveFile()?.path
      ?? '';

    for (const candidate of getLinktextCandidates(linktext)) {
      const file = this.app.metadataCache.getFirstLinkpathDest(candidate, sourcePath);
      if (file) {
        return file;
      }
    }

    return null;
  }

  private updateHoveredLinkElement(event: MouseEvent): void {
    const hoveredLink = this.findHoveredLinkElement(event.target);
    this.hoveredLinkElement = hoveredLink;

    if (!hoveredLink) {
      this.hoveredLinkEvent = null;
    }
  }
}

async function copyFullPath(
  file: TAbstractFile,
  plugin: CopyPathPlugin,
  fromLink: boolean
): Promise<void> {
  let absolutePath = plugin.app.vault.adapter.getFullRealPath(file.path);

  if (file instanceof TFolder && plugin.settings.addTrailingSlashToFolders) {
    absolutePath += '/';
  }

  await navigator.clipboard.writeText(absolutePath);
  const source = fromLink ? ' of link target' : '';
  new Notice(
    `Copied full path${source}:\n${absolutePath}`,
    NOTICE_TIMEOUT_IN_MILLISECONDS
  );
}

// Is normalized.
async function copyVaultPath(
  file: TAbstractFile,
  plugin: CopyPathPlugin,
  fromLink: boolean
): Promise<void> {
  let vaultPath = file.path;

  if (file instanceof TFolder && plugin.settings.addTrailingSlashToFolders) {
    vaultPath += '/';
  }

  await navigator.clipboard.writeText(vaultPath);
  const source = fromLink ? ' of link target' : '';
  new Notice(`Copied vault path${source}:\n${vaultPath}`, NOTICE_TIMEOUT_IN_MILLISECONDS);
}

function decodeUriComponentSafe(value: string): null | string {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function getLinktext(el: HTMLElement): null | string {
  for (const attribute of LINKTEXT_ATTRIBUTES) {
    const value = el.getAttribute(attribute);
    if (value) {
      return value;
    }
  }

  return null;
}

// Link text can keep escapes, encoding, or subpath of the source markdown link.
function getLinktextCandidates(linktext: string): string[] {
  const forms: string[] = [];
  const queue = [linktext];

  while (queue.length > 0) {
    const form = queue.pop();
    if (!form || forms.includes(form)) {
      continue;
    }

    forms.push(form);
    const unescapedForm = form.replace(/^<|>$/g, '');
    queue.push(unescapedForm);

    const decodedForm = decodeUriComponentSafe(unescapedForm);
    if (decodedForm !== null) {
      queue.push(decodedForm);
    }
  }

  const candidates: string[] = [];
  for (const form of forms) {
    candidates.push(form);
    const [path] = form.split('#');
    if (path && path !== form) {
      candidates.push(path);
    }
  }

  return candidates;
}

function isSameLinkElement(
  firstEl: HTMLElement | null,
  secondEl: HTMLElement
): boolean {
  if (!firstEl) {
    return false;
  }

  return firstEl === secondEl || firstEl.contains(secondEl) || secondEl.contains(firstEl);
}
