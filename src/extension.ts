// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { error } from 'console';
import { RecordableHistogram } from 'perf_hooks';
import { CallSiteObject } from 'util';
import * as vscode from 'vscode';
import { DOMParser } from '@xmldom/xmldom';

export interface TEIElementInfo {
    element: 'pb' | 'lb';
    nValue: string;
    nextValue: string;
}

export class TEIParser {
    private xmlParser: DOMParser;

    constructor() {
        this.xmlParser = new DOMParser();
    }

    /**
     * Parse the current XML document and extract the latest pb and lb elements
     */
    public async parseCurrentDocument(): Promise<{ latestPb?: TEIElementInfo, latestLb?: TEIElementInfo }> {
        const activeEditor = vscode.window.activeTextEditor;
        
        if (!activeEditor) {
            throw new Error('No active editor found');
        }

        const document = activeEditor.document;
        
        // Check if it's an XML file
        if (document.languageId !== 'xml') {
            throw new Error('Current document is not an XML file');
        }

        const xmlContent = document.getText();
        
        try {
            const xmlDoc = this.xmlParser.parseFromString(xmlContent, 'text/xml');
            
            const latestPb = this.findLatestElement(xmlDoc, 'pb');
            const latestLb = this.findLatestElement(xmlDoc, 'lb');
            
            return {
                latestPb: latestPb ? this.createElementInfo('pb', latestPb) : undefined,
                latestLb: latestLb ? this.createElementInfo('lb', latestLb) : undefined
            };
        } catch (error) {
            throw new Error(`Failed to parse XML: ${error}`);
        }
    }

	public async parseSpecificElement(elementType: 'pb' | 'lb'): Promise<TEIElementInfo | undefined> {
        const activeEditor = vscode.window.activeTextEditor;
        
        if (!activeEditor) {
            throw new Error('No active editor found');
        }

        const document = activeEditor.document;
        
        // Check if it's an XML file
        if (document.languageId !== 'xml') {
            throw new Error('Current document is not an XML file');
        }

        const xmlContent = document.getText();
        
        try {
            const xmlDoc = this.xmlParser.parseFromString(xmlContent, 'text/xml');
            const latestElement = this.findLatestElement(xmlDoc, elementType);
            
            return latestElement ? this.createElementInfo(elementType, latestElement) : undefined;
        } catch (error) {
            throw new Error(`Failed to parse XML: ${error}`);
        }
    }

    /**
     * Find the latest (last occurring) element of the specified tag name
     */
    private findLatestElement(xmlDoc: Document, tagName: string): Element | null {
        const elements = xmlDoc.getElementsByTagName(tagName);
        
        if (elements.length === 0) {
            return null;
        }
        
        // Return the last element found
        return elements[elements.length - 1] as Element;
    }

    /**
     * Create element info with next value calculation
     */
    private createElementInfo(elementType: 'pb' | 'lb', element: Element): TEIElementInfo {
        const nValue = element.getAttribute('n') || '';
        const nextValue = this.calculateNextValue(nValue);
        
        return {
            element: elementType,
            nValue,
            nextValue
        };
    }

    /**
     * Calculate the next value based on the current n attribute
     * Handles numeric, alphanumeric, and roman numeral patterns
     */
    private calculateNextValue(currentValue: string): string {
		if (!currentValue) {
			return '1';
		}

		// Handle roman numerals
		if (this.isRomanNumeral(currentValue)) {
			return this.incrementRomanNumeral(currentValue);
		}

		// Handle recto/verso pattern (1r, 1v, 2r, 2v, etc.) - for page numbers
		const rectoVersoMatch = currentValue.match(/^(\d+)([rv])$/);
		if (rectoVersoMatch) {
			const pageNumber = parseInt(rectoVersoMatch[1]);
			const side = rectoVersoMatch[2];
			
			if (side === 'r') {
				// r -> v (same page number)
				return `${pageNumber}v`;
			} else {
				// v -> r (next page number)
				return `${pageNumber + 1}r`;
			}
		}

		// Handle pure numeric values (line numbers) - simple increment
		const numericMatch = currentValue.match(/^(\d+)$/);
		if (numericMatch) {
			return (parseInt(numericMatch[1]) + 1).toString();
		}

		// Fallback for other patterns
return `${currentValue}1`;
    }

    /**
     * Check if a string is a roman numeral
     */
    private isRomanNumeral(value: string): boolean {
        return /^[IVXLCDMivxlcdm]+$/.test(value);
    }

    /**
     * Increment roman numeral (basic implementation for common cases)
     */
    private incrementRomanNumeral(roman: string): string {
        const romanToDecimal: { [key: string]: number } = {
            'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5,
            'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10,
            'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5,
            'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10
        };

        const decimalToRoman = (num: number, isUpperCase: boolean): string => {
            const values = [10, 9, 5, 4, 1];
            const symbols = isUpperCase ? 
                ['X', 'IX', 'V', 'IV', 'I'] : 
                ['x', 'ix', 'v', 'iv', 'i'];
            
            let result = '';
            for (let i = 0; i < values.length; i++) {
                while (num >= values[i]) {
                    result += symbols[i];
                    num -= values[i];
                }
            }
            return result;
        };

        const decimal = romanToDecimal[roman];
        if (decimal !== undefined) {
            const isUpperCase = roman === roman.toUpperCase();
            return decimalToRoman(decimal + 1, isUpperCase);
        }

        return `${roman}1`; // Fallback
    }


    /**
     * Get cursor position to determine where to insert new elements
     */
    public getCursorPosition(): vscode.Position | null {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return null;
        }
        
        return activeEditor.selection.active;
    }

    /**
     * Insert new TEI element at cursor position
     */
    public async insertTEIElement(elementType: 'pb' | 'lb', nValue: string): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return;
        }

        const position = activeEditor.selection.active;
        const elementTag = `<${elementType} n="${nValue}"/>`;
        
        /* await activeEditor.edit(editBuilder => {
            editBuilder.insert(position, "\n");
            editBuilder.insert(position, elementTag);
        }); */

        // Use snippet insertion which automatically maintains indentation
        const snippet = new vscode.SnippetString(`\n${elementTag}$0`);
        await activeEditor.insertSnippet(snippet, position);
    }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	const teiParser = new TEIParser();

    // Command to let user choose which element to insert
    const insertTEIElement = vscode.commands.registerCommand('menota-helper.insertElement', async () => {
        try {
            // Show quick pick for element type
            const elementType = await vscode.window.showQuickPick([
                { label: 'Page Break', description: 'Insert <pb> element', value: 'pb' as const },
                { label: 'Line Break', description: 'Insert <lb> element', value: 'lb' as const }
            ], {
                placeHolder: 'Select element type to insert',
                matchOnDescription: true
            });

            if (!elementType) {
                return; // User cancelled
            }

            const elementInfo = await teiParser.parseSpecificElement(elementType.value);
            const nextValue = elementInfo?.nextValue || '1';
            
            // Show input box for custom value (with calculated next value as default)
            const customValue = await vscode.window.showInputBox({
                prompt: `Enter n attribute value for <${elementType.value}>`,
                value: nextValue,
                placeHolder: nextValue
            });

            if (customValue === undefined) {
                return; // User cancelled
            }

            await teiParser.insertTEIElement(elementType.value, customValue);
            vscode.window.showInformationMessage(`Inserted <${elementType.value} n="${customValue}"/>`);
        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    });

    // Quick command to insert next page break
    const insertNextPb = vscode.commands.registerCommand('menota-helper.insertNextPb', async () => {
        try {
            const elementInfo = await teiParser.parseSpecificElement('pb');
            const nextValue = elementInfo?.nextValue || '1';
            await teiParser.insertTEIElement('pb', nextValue);
            vscode.window.showInformationMessage(`Inserted <pb n="${nextValue}"/>`);
        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    });

    // Quick command to insert next line break
    const insertNextLb = vscode.commands.registerCommand('menota-helper.insertNextLb', async () => {
        try {
            const elementInfo = await teiParser.parseSpecificElement('lb');
            const nextValue = elementInfo?.nextValue || '1';
            await teiParser.insertTEIElement('lb', nextValue);
            vscode.window.showInformationMessage(`Inserted <lb n="${nextValue}"/>`);
        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    });

    // Command with user choice and preview
    const insertWithPreview = vscode.commands.registerCommand('menota-helper.insertWithPreview', async () => {
        try {
            // Parse both elements to show preview
            const { latestPb, latestLb } = await teiParser.parseCurrentDocument();
            
            const options = [];
            
            if (latestPb) {
                options.push({
                    label: `$(file) Page Break: ${latestPb.nextValue}`,
                    description: `Current: n="${latestPb.nValue}" → Next: n="${latestPb.nextValue}"`,
                    value: 'pb' as const,
                    nextValue: latestPb.nextValue
                });
            } else {
                options.push({
                    label: `$(file) Page Break: 1`,
                    description: `No existing <pb> elements found → Start with n="1"`,
                    value: 'pb' as const,
                    nextValue: '1'
                });
            }
            
            if (latestLb) {
                options.push({
                    label: `$(list-ordered) Line Break: ${latestLb.nextValue}`,
                    description: `Current: n="${latestLb.nValue}" → Next: n="${latestLb.nextValue}"`,
                    value: 'lb' as const,
                    nextValue: latestLb.nextValue
                });
            } else {
                options.push({
                    label: `$(list-ordered) Line Break: 1`,
                    description: `No existing <lb> elements found → Start with n="1"`,
                    value: 'lb' as const,
                    nextValue: '1'
                });
            }

            const selection = await vscode.window.showQuickPick(options, {
                placeHolder: 'Select element to insert (showing next calculated value)',
                matchOnDescription: true
            });

            if (!selection) {
                return; // User cancelled
            }

            await teiParser.insertTEIElement(selection.value, selection.nextValue);
            vscode.window.showInformationMessage(`Inserted <${selection.value} n="${selection.nextValue}"/>`);
        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    });

    // Command to show current status
    const showCurrentStatus = vscode.commands.registerCommand('menota-helper.showStatus', async () => {
        try {
            const { latestPb, latestLb } = await teiParser.parseCurrentDocument();
            
            let message = 'TEI Status:\n';
            message += latestPb ? `Latest PB: n="${latestPb.nValue}" (next: "${latestPb.nextValue}")\n` : 'No PB elements found\n';
            message += latestLb ? `Latest LB: n="${latestLb.nValue}" (next: "${latestLb.nextValue}")` : 'No LB elements found';
            
            vscode.window.showInformationMessage(message);
        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    });

    // Advanced command for custom element types
    const insertCustomElement = vscode.commands.registerCommand('menota-helper.insertCustomElement', async () => {
        try {
            // Let user specify custom element name
            const customElementType = await vscode.window.showInputBox({
                prompt: 'Enter custom TEI element name (without angle brackets)',
                placeHolder: 'e.g., cb, milestone, anchor'
            });

            if (!customElementType) {
                return; // User cancelled
            }

            const nValue = await vscode.window.showInputBox({
                prompt: `Enter n attribute value for <${customElementType}>`,
                placeHolder: '1'
            });

            if (nValue === undefined) {
                return; // User cancelled
            }

            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                return;
            }

            const position = activeEditor.selection.active;
            const elementTag = `<${customElementType} n="${nValue}"/>`;
            
            await activeEditor.edit(editBuilder => {
                editBuilder.insert(position, elementTag);
            });

            vscode.window.showInformationMessage(`Inserted <${customElementType} n="${nValue}"/>`);
        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    });

    context.subscriptions.push(
        insertTEIElement,
        insertNextPb,
        insertNextLb,
        insertWithPreview,
        showCurrentStatus,
        insertCustomElement
    );
}

async function findCurrentPage() {
	let editor = vscode.window.activeTextEditor;
	if(editor === undefined) {
		console.log("No editor found.");
		error('error', 1);
	}
	
}
// This method is called when your extension is deactivated
export function deactivate() {

}

module.exports = {
	activate,
	deactivate
};