import type {ImageContent, Page, TextContent} from './third_party/index.js';

export class McpResponse {
  #lines: string[] = [];
  #images: ImageContent[] = [];
  #includePages = false;

  appendResponseLine(value: string) {
    this.#lines.push(value);
  }

  attachImage(value: ImageContent) {
    this.#images.push(value);
  }

  setIncludePages(value: boolean) {
    this.#includePages = value;
  }

  getIncludePages(): boolean {
    return this.#includePages;
  }

  toCallToolResult(pages?: Page[], selectedPage?: Page) {
    const lines = [...this.#lines];

    if (this.#includePages && pages) {
      lines.push('## Pages');
      pages.forEach((page, idx) => {
        const isSelected = page === selectedPage;
        lines.push(`${idx}: ${page.url()}${isSelected ? ' [selected]' : ''}`);
      });
    }

    const contents: Array<ImageContent | TextContent> = [
      ...lines.map(line => ({type: 'text' as const, text: line})),
      ...this.#images,
    ];
    return {content: contents};
  }
}
