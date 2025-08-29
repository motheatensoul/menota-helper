// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { error } from 'console';
import { RecordableHistogram } from 'perf_hooks';
import { CallSiteObject } from 'util';
import * as vscode from 'vscode';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

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

    private findLatestLbInCurrentContext(xmlDoc: Document): Element | null {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return null;
        }

        // Get cursor position to determine which paragraph we're in
        const cursorPosition = activeEditor.selection.active;
        const documentText = activeEditor.document.getText();
        const cursorOffset = activeEditor.document.offsetAt(cursorPosition);
        
        // Find all <p> elements and determine which one contains the cursor
        const bodyElements = xmlDoc.getElementsByTagName('body');
        if (bodyElements.length === 0) {
            return null;
        }
        
        const paragraphs = bodyElements[0].getElementsByTagName('p');
        let currentParagraph: Element | null = null;
        
        // Find the paragraph that contains or comes before the cursor position
        for (let i = 0; i < paragraphs.length; i++) {
            const paragraph = paragraphs[i];
            const serializer = new XMLSerializer();
            const paragraphText = serializer.serializeToString(paragraph);
            const paragraphIndex = documentText.indexOf(paragraphText);
            
            if (paragraphIndex >= 0 && paragraphIndex <= cursorOffset) {
                currentParagraph = paragraph;
            }
        }
        
        // If we couldn't determine current paragraph, use the last one
        if (!currentParagraph && paragraphs.length > 0) {
            currentParagraph = paragraphs[paragraphs.length - 1];
        }
        
        if (!currentParagraph) {
            return null;
        }
        
        // Find lb elements within this specific paragraph
        const lbElements = currentParagraph.getElementsByTagName('lb');
        
        if (lbElements.length === 0) {
            return null;
        }
        
        // Return the last lb element found in this paragraph
        return lbElements[lbElements.length - 1] as Element;
    }

    /**
     * Check if an element is inside a <note> tag (editorial comments)
     */
    private isInsideNoteElement(element: Node): boolean {
        let current = element.parentNode;
        while (current && current.nodeType === 1) {
            const currentElement = current as Element;
            if (currentElement.tagName.toLowerCase() === 'note') {
                return true;
            }
            current = current.parentNode;
        }
        return false;
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

    /**
     * Wrap words in <w> tags and punctuation in <pc> tags within <p> elements
     */
    public async wrapWordsInParagraphs(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        const document = activeEditor.document;
        
        // Check if it's an XML file
        if (document.languageId !== 'xml') {
            vscode.window.showErrorMessage('Current document is not an XML file');
            return;
        }

        const xmlContent = document.getText();

        try {
            const wrappedContent = this.processXMLForWordWrapping(xmlContent);
            
            // Replace entire document content
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(xmlContent.length)
            );

            await activeEditor.edit(editBuilder => {
                editBuilder.replace(fullRange, wrappedContent);
            });

            vscode.window.showInformationMessage('Words wrapped in <w> and <pc> tags successfully!');
        } catch (error) {
            vscode.window.showErrorMessage(`Error processing document: ${error}`);
        }
    }

    /**
     * Process XML content to wrap words and punctuation
     */
    private processXMLForWordWrapping(xmlContent: string): string {
        const xmlDoc = this.xmlParser.parseFromString(xmlContent, 'text/xml');
        
        // Check for parsing errors
        const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
        if (parserError) {
            throw new Error(`XML parsing error: ${parserError.textContent}`);
        }
        
        // Find the body element
        const bodyElements = xmlDoc.getElementsByTagName('body');
        if (bodyElements.length === 0) {
            throw new Error('No <body> element found in document');
        }
        
        const body = bodyElements[0];
        
        // Find all <p> elements within the body
        const paragraphs = body.getElementsByTagName('p');
        
        // Process each paragraph
        for (let i = 0; i < paragraphs.length; i++) {
            const paragraph = paragraphs[i];
            this.wrapWordsInElement(paragraph, xmlDoc);
        }
        
        // Serialize back to string
        const serializer = new XMLSerializer();
        let result = serializer.serializeToString(xmlDoc);
        
        // Fix the XML entity escaping issue by restoring proper entities
        result = this.restoreXMLEntities(result);
        
        return result;
    }

    /**
     * Restore XML entities that were escaped during serialization
     */
    private restoreXMLEntities(xmlString: string): string {
        // Restore named entities that were escaped (e.g., &amp;aelig; back to &aelig;)
        let restored = xmlString.replace(/&amp;([a-zA-Z][a-zA-Z0-9]*;)/g, '&$1');
        
        // Restore numeric entities that were escaped (e.g., &amp;#123; back to &#123;)
        restored = restored.replace(/&amp;(#(?:x[0-9a-fA-F]+|\d+);)/g, '&$1');
        
        return restored;
    }

    /**
     * Recursively process an element to wrap words and punctuation
     * Skip content within <note> tags
     */
    private wrapWordsInElement(element: Element, doc: Document): void {
        // Skip processing if this element is inside a <note>
        if (this.isInsideNoteElement(element)) {
            return;
        }

        const childNodes = Array.from(element.childNodes);
        
        for (let i = childNodes.length - 1; i >= 0; i--) {
            const node = childNodes[i];
            
            // Skip processing if this node is inside a <note>
            if (this.isInsideNoteElement(node)) {
                continue;
            }
            
            if (node.nodeType === 3) { // Text node
                const textContent = node.textContent || '';
                if (textContent.trim()) {
                    const wrappedNodes = this.createWrappedNodes(textContent, doc);
                    
                    // Replace the text node with wrapped nodes
                    for (let j = wrappedNodes.length - 1; j >= 0; j--) {
                        element.insertBefore(wrappedNodes[j], node.nextSibling);
                    }
                    element.removeChild(node);
                }
            } else if (node.nodeType === 1) { // Element node
                const elementNode = node as Element;
                const tagName = elementNode.tagName.toLowerCase();
                
                // Skip <note> elements entirely
                if (tagName === 'note') {
                    continue;
                }
                
                // Skip self-closing tags and already wrapped elements
                if (!this.isSelfClosingOrSkippableTag(tagName)) {
                    // Check if this element contains word content that should be wrapped
                    if (this.isInlineTextElement(tagName)) {
                        // For inline elements like <unclear>, <add>, etc., wrap the whole element in <w>
                        const hasWordContent = this.containsWordContent(elementNode);
                        if (hasWordContent && !this.isAlreadyWrapped(elementNode)) {
                            this.wrapElementInW(elementNode, doc);
                        }
                    } else {
                        // Recursively process child elements
                        this.wrapWordsInElement(elementNode, doc);
                    }
                }
            }
        }
    }

    
    /**
     * Create wrapped word and punctuation nodes from text
     */
    private createWrappedNodes(text: string, doc: Document): Node[] {
        const nodes: Node[] = [];
        
        // Split text preserving whitespace and handling word boundaries
        const tokens = this.tokenizeText(text);
        
        for (const token of tokens) {
            if (token.type === 'whitespace') {
                nodes.push(doc.createTextNode(token.value));
            } else if (token.type === 'word') {
                const wElement = doc.createElement('w');
                wElement.textContent = token.value;
                nodes.push(wElement);
            } else if (token.type === 'punctuation') {
                const pcElement = doc.createElement('pc');
                pcElement.textContent = token.value;
                nodes.push(pcElement);
            }
        }
        
        return nodes;
    }

    /**
     * Tokenize text into words, punctuation, and whitespace
     */
    private tokenizeText(text: string): Array<{type: 'word' | 'punctuation' | 'whitespace', value: string}> {
        const tokens: Array<{type: 'word' | 'punctuation' | 'whitespace', value: string}> = [];
        
        // Define what constitutes a word character (including Unicode letters, numbers, parentheses, and XML entities)
        // Using Unicode property escapes to match all letters from any language
        const wordCharPattern = /[\p{Letter}\p{Mark}\p{Decimal_Number}_()]/u;
        const xmlEntityPattern = /&[a-zA-Z][a-zA-Z0-9]*;|&#(?:x[0-9a-fA-F]+|\d+);/;
        
        let i = 0;
        while (i < text.length) {
            // Check for whitespace
            if (/\s/.test(text[i])) {
                let whitespace = '';
                while (i < text.length && /\s/.test(text[i])) {
                    whitespace += text[i];
                    i++;
                }
                tokens.push({type: 'whitespace', value: whitespace});
                continue;
            }
            
            // Check for XML entity at current position
            const entityMatch = text.substring(i).match(/^(&[a-zA-Z][a-zA-Z0-9]*;|&#(?:x[0-9a-fA-F]+|\d+);)/);
            if (entityMatch) {
                // Found XML entity - check if it's part of a word or standalone
                let word = entityMatch[1];
                let j = i + entityMatch[1].length;
                
                // Continue collecting word characters or entities
                while (j < text.length) {
                    const nextEntityMatch = text.substring(j).match(/^(&[a-zA-Z][a-zA-Z0-9]*;|&#(?:x[0-9a-fA-F]+|\d+);)/);
                    if (nextEntityMatch) {
                        word += nextEntityMatch[1];
                        j += nextEntityMatch[1].length;
                    } else if (wordCharPattern.test(text[j])) {
                        word += text[j];
                        j++;
                    } else {
                        break;
                    }
                }
                
                tokens.push({type: 'word', value: word});
                i = j;
                continue;
            }
            
            // Check for regular word character
            if (wordCharPattern.test(text[i])) {
                let word = '';
                while (i < text.length) {
                    // Check for XML entity
                    const entityMatch = text.substring(i).match(/^(&[a-zA-Z][a-zA-Z0-9]*;|&#(?:x[0-9a-fA-F]+|\d+);)/);
                    if (entityMatch) {
                        word += entityMatch[1];
                        i += entityMatch[1].length;
                    } else if (wordCharPattern.test(text[i])) {
                        word += text[i];
                        i++;
                    } else {
                        break;
                    }
                }
                tokens.push({type: 'word', value: word});
                continue;
            }
            
            // Everything else is punctuation
            let punctuation = '';
            while (i < text.length && 
                !(/\s/.test(text[i])) && 
                !(wordCharPattern.test(text[i])) &&
                !(text.substring(i).match(/^(&[a-zA-Z][a-zA-Z0-9]*;|&#(?:x[0-9a-fA-F]+|\d+);)/))) {
                punctuation += text[i];
                i++;
            }
            
            if (punctuation) {
                tokens.push({type: 'punctuation', value: punctuation});
            }
        }
        
        return tokens;
    }

    /**
     * Check if element contains word content
     */
    private containsWordContent(element: Element): boolean {
        const textContent = element.textContent || '';
        // Check for Unicode letters, numbers, parentheses, or XML entities
        return /[\p{Letter}\p{Mark}\p{Decimal_Number}_()]|&[a-zA-Z][a-zA-Z0-9]*;|&#(?:x[0-9a-fA-F]+|\d+);/u.test(textContent);
    }

    /**
     * Check if element is already wrapped in <w> or <pc>
     */
    private isAlreadyWrapped(element: Element): boolean {
        const parent = element.parentNode as Element;
        if (!parent) return false;
        
        const parentTag = parent.tagName.toLowerCase();
        return parentTag === 'w' || parentTag === 'pc';
    }

    /**
     * Wrap an entire element in a <w> tag
     */
    private wrapElementInW(element: Element, doc: Document): void {
        const wElement = doc.createElement('w');
        const parent = element.parentNode;
        
        if (parent) {
            parent.insertBefore(wElement, element);
            parent.removeChild(element);
            wElement.appendChild(element);
        }
    }

    /**
     * Check if tag should be skipped or is self-closing
     */
    private isSelfClosingOrSkippableTag(tagName: string): boolean {
        const skipTags = ['pb', 'lb', 'br', 'hr', 'img', 'input', 'meta', 'link', 'w', 'pc', 'note'];
        return skipTags.includes(tagName.toLowerCase());
    }


    /**
     * Check if element is an inline text element that should be wrapped as a unit
     */
    private isInlineTextElement(tagName: string): boolean {
        const inlineTextTags = ['unclear', 'add', 'del', 'supplied', 'abbr', 'expan', 'hi', 'emph', 'foreign'];
        return inlineTextTags.includes(tagName.toLowerCase());
    }

    /**
     * Format XML output to maintain readability
     */
    private formatXMLOutput(xmlString: string): string {
        // Return the XML string without adding any line breaks
        // to preserve the original document structure
        return xmlString;
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

    const wrapWordsCommand = vscode.commands.registerCommand('menota-helper.wrapWords', async () => {
        try {
            await teiParser.wrapWordsInParagraphs();
        } catch (error) {
            vscode.window.showErrorMessage(`Error wrapping words: ${error}`);
        }
    });

    context.subscriptions.push(
        insertTEIElement,
        insertNextPb,
        insertNextLb,
        insertWithPreview,
        showCurrentStatus,
        insertCustomElement,
        wrapWordsCommand
    );
}

// This method is called when your extension is deactivated
export function deactivate() {

}

module.exports = {
	activate,
	deactivate
};