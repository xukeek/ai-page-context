/** Types for page runtime (implementation lives in runtime-browser.js). */

export type ComponentNode = {
  name: string;
  file: string;
  line: number;
  column: number;
};

export type ResolveResult = {
  selected?: ComponentNode;
  ancestors: ComponentNode[];
  children: ComponentNode[];
  deps: ComponentNode[];
  dom: {
    tag: string;
    id?: string;
    className?: string;
    outerHTMLSnippet: string;
  };
};

declare global {
  interface Window {
    __AI_PAGE_CONTEXT__?: {
      resolveElement: (el: Element) => ResolveResult;
      version: string;
    };
  }
}

export {};
