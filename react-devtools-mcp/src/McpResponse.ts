import type {ImageContent, TextContent} from './third_party/index.js';

export class McpResponse {
  #lines: string[] = [];
  #images: ImageContent[] = [];

  appendResponseLine(value: string) {
    this.#lines.push(value);
  }

  attachImage(value: ImageContent) {
    this.#images.push(value);
  }

  toCallToolResult() {
    const contents: Array<ImageContent | TextContent> = [
      ...this.#lines.map(line => ({type: 'text' as const, text: line})),
      ...this.#images,
    ];
    return {content: contents};
  }
}
