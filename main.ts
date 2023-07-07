import { App, Editor, MarkdownView, Plugin, getLinkpath, PluginManifest, Vault, MetadataCache } from 'obsidian';
import slugify from "@sindresorhus/slugify";
import Path from 'path';
import { link } from 'fs';

interface ExpandEmbedPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: ExpandEmbedPluginSettings = {
	mySetting: 'default'
}

export default class ExpandEmbedPlugin extends Plugin {

	settings: ExpandEmbedPluginSettings;

	frontmatterRegex = /^\s*?---\n([\s\S]*?)\n---/g;
	transcludedRegex = /!\[\[(.+?)\]\]/g;

	/*
	constructor( app:App, manifest:PluginManifest, settings: ExpandEmbedPluginSettings) {
        super( app, manifest );
		this.vault = app.vault;
        this.metadataCache = metadataCache;
        this.settings = settings;
    }*/

	async onload() {
		await this.loadSettings();

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'expand-embeds-selection',
			name: 'Expand embedded notes in current selection',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());

				const linkName = Path.parse( this.app.workspace.getActiveFile().name ).name;
				const linkPath = getLinkpath( linkName );

				this.expandEmbedsInSelection(
					editor.getSelection(),
					linkPath,
					0, 4 )
					.then( (expandedText: string) => {
						editor.replaceSelection( expandedText );
					}
				);
	
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						//new SampleModal(this.app).open();
						console.log( "Do the operation!" );
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async expandEmbedsInSelection( selection: string, filePath: string, currentDepth: number, maxDepth:number ): Promise<string> {

		// based on code lifted from https://github.com/oleeskild/obsidian-digital-garden
		
		if ( currentDepth >= maxDepth ) {
			console.warn( `expandEmbedsInSelection hit maxDepth: ${maxDepth}` );
            return selection;
        }

		const transclusionMatches = selection.match(this.transcludedRegex);
		let expandedText = selection.slice(); // copy the original text

		if (transclusionMatches) {
			for (let i = 0; i < transclusionMatches.length; i++) {
				try {
	
					const transclusionMatch = transclusionMatches[i];
					const [tranclusionFileName, headerName] = transclusionMatch.substring(transclusionMatch.indexOf('[') + 2, transclusionMatch.indexOf(']')).split("|");
					const tranclusionFilePath = getLinkpath(tranclusionFileName);
					const linkedFile = this.app.metadataCache.getFirstLinkpathDest(tranclusionFilePath, filePath);
					
					let sectionID = "";
					if (linkedFile.extension === "md") {
	
						let fileText = await this.app.vault.cachedRead(linkedFile);

						if (tranclusionFileName.includes('#^')) {
							// Transclude Block
							const metadata = this.app.metadataCache.getFileCache(linkedFile);
							const refBlock = tranclusionFileName.split('#^')[1];
							sectionID = `#${slugify(refBlock)}`;
							const blockInFile = metadata.blocks[refBlock];
							if (blockInFile) {
	
								fileText = fileText
									.split('\n')
									.slice(blockInFile.position.start.line, blockInFile.position.end.line + 1)
									.join('\n').replace(`^${refBlock}`, '');
							}
						
						} else if (tranclusionFileName.includes('#')) { // transcluding header only
							const metadata = this.app.metadataCache.getFileCache(linkedFile);
							const refHeader = tranclusionFileName.split('#')[1];
							const headerInFile = metadata.headings?.find(header => header.heading === refHeader);
							sectionID = `#${slugify(refHeader)}`;
							if (headerInFile) {
								const headerPosition = metadata.headings.indexOf(headerInFile);
								// Embed should copy the content proparly under the given block
								const cutTo = metadata.headings.slice(headerPosition + 1).find(header => header.level <= headerInFile.level);
								if (cutTo) {
									const cutToLine = cutTo?.position?.start?.line;
									fileText = fileText
										.split('\n')
										.slice(headerInFile.position.start.line, cutToLine)
										.join('\n');
								} else {
									fileText = fileText
										.split('\n')
										.slice(headerInFile.position.start.line)
										.join('\n');
								}
	
							}
						}
						//Remove frontmatter from transclusion
						fileText = fileText.replace(this.frontmatterRegex, "");
	
						// Apply custom filters to transclusion
						// fileText = await this.convertCustomFilters(fileText);
	
						// const header = this.generateTransclusionHeader(headerName, linkedFile);
	
						// const headerSection = header ? `$<div class="markdown-embed-title">\n\n${header}\n\n</div>\n` : '';
						// let embedded_link = "";
						// if (publishedFiles.find((f) => f.path == linkedFile.path)) {
						// 	embedded_link = `<a class="markdown-embed-link" href="/${generateUrlPath(getGardenPathForNote(linkedFile.path, this.rewriteRules))}${sectionID}" aria-label="Open link"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-link"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></a>`;
						// }
						// fileText = `\n<div class="transclusion internal-embed is-loaded">${embedded_link}<div class="markdown-embed">\n\n${headerSection}\n\n`
						// 	+ fileText + '\n\n</div></div>\n'
						
						//This should be recursive up to a certain depth
						if (fileText.match(this.transcludedRegex)) {
							fileText = await this.expandEmbedsInSelection( fileText, linkedFile.path, currentDepth + 1, maxDepth );
						}
						
						expandedText = expandedText.replace(transclusionMatch, fileText);
					}
				} catch (error) {
					console.error(error);
					continue;
				}
			}
		}

		return expandedText;
	}
}
