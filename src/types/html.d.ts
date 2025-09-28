// Extended HTML attributes for TypeScript
declare module 'react' {
  interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    // allows for webkitdirectory attribute
    webkitdirectory?: string;
  }
}

export {};