import type {Page} from '../third_party/index.js';
import {zod} from '../third_party/index.js';

export interface ToolDefinition<Schema extends zod.ZodRawShape = zod.ZodRawShape> {
  name: string;
  description: string;
  schema: Schema;
  handler: (
    request: Request<Schema>,
    response: Response,
    context: Context,
  ) => Promise<void>;
}

export interface Request<Schema extends zod.ZodRawShape> {
  params: zod.objectOutputType<Schema, zod.ZodTypeAny>;
}

export interface Response {
  appendResponseLine(value: string): void;
  attachImage(value: {data: string; mimeType: string}): void;
  setIncludePages(value: boolean): void;
}

export type Context = Readonly<{
  ensureReactAttached(): Promise<ReactAttachResult>;
  listReactRoots(): Promise<ReactRootInfo[]>;
  listComponents(options: {
    rendererId?: number;
    rootIndex?: number;
    depth?: number;
    maxNodes?: number;
    nameFilter?: string;
  }): Promise<ComponentNode[]>;
  getComponentById(id: string): Promise<ComponentDetails | null>;
  highlightComponent(id: string): Promise<{ok: boolean; message: string}>;
  takeSnapshot(verbose?: boolean): Promise<Snapshot | null>;
  getSelectedPage(): Page;
  getPages(): Page[];
  getPageByIdx(idx: number): Page;
  newPage(): Promise<Page>;
  closePage(pageIdx: number): Promise<void>;
  selectPage(page: Page): void;
}>;

export interface ReactAttachResult {
  attached: boolean;
  renderers: Array<{
    id: number;
    name?: string;
    version?: string;
    bundleType?: number;
  }>;
  message?: string;
}

export interface ReactRootInfo {
  rendererId: number;
  rendererName?: string;
  rootId: string;
  displayName?: string;
  nodes?: number;
  rootIndex: number;
}

export interface ComponentNode {
  id: string;
  name: string;
  type: string;
  key?: string | null;
  depth: number;
  path: string;
}

export interface ComponentDetails {
  id: string;
  name: string;
  type: string;
  key?: string | null;
  props?: unknown;
  state?: unknown;
  source?: {
    fileName?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
  path: string;
}

export interface SnapshotNode {
  role?: string;
  name?: string;
  value?: string | number;
  description?: string;
  keyshortcuts?: string;
  roledescription?: string;
  valuetext?: string;
  disabled?: boolean;
  expanded?: boolean;
  focused?: boolean;
  modal?: boolean;
  multiline?: boolean;
  multiselectable?: boolean;
  readonly?: boolean;
  required?: boolean;
  selected?: boolean;
  checked?: boolean | 'mixed';
  pressed?: boolean | 'mixed';
  level?: number;
  valuemin?: number;
  valuemax?: number;
  autocomplete?: string;
  haspopup?: string;
  invalid?: string;
  orientation?: string;
  children?: SnapshotNode[];
  uid?: string;
  reactComponent?: {
    id: string;
    name: string;
    type: string;
    source?: {
      fileName?: string;
      lineNumber?: number;
      columnNumber?: number;
    };
    props?: unknown;
    state?: unknown;
    owners?: Array<{
      name: string;
      type: string;
      source?: {
        fileName?: string;
        lineNumber?: number;
        columnNumber?: number;
      };
    }>;
  };
}

export interface Snapshot {
  root: SnapshotNode;
  snapshotId: string;
}

export function defineTool<Schema extends zod.ZodRawShape>(
  definition: ToolDefinition<Schema>,
) {
  return definition;
}

export const CLOSE_PAGE_ERROR = 'Cannot close the last open page';

export const timeoutSchema = {
  timeout: zod
    .number()
    .int()
    .optional()
    .describe(
      'Maximum wait time in milliseconds. If set to 0, the default timeout will be used.',
    )
    .transform(value => {
      return value && value <= 0 ? undefined : value;
    }),
};
