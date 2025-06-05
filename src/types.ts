// src/types.ts
// Basic types for Google Docs MCP Server using official SDK

export interface DocumentIdParameter {
  documentId: string;
}

export interface TextToAppendParameter extends DocumentIdParameter {
  textToAppend: string;
}

export interface ListDocsParameter {
  maxResults?: number;
  query?: string;
}

export interface CreateDocumentParameter {
  title: string;
  initialContent?: string;
}

export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}
