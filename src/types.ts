// src/types.ts
// Basic types for Google Docs MCP Server using official SDK

export interface DocumentIdParameter {
  documentId: string;
}

export interface ReadGoogleDocParameter extends DocumentIdParameter {
  format?: 'text' | 'json';
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

export interface InsertTextParameter extends DocumentIdParameter {
  text: string;
  index: number;
}

export interface DeleteContentRangeParameter extends DocumentIdParameter {
  startIndex: number;
  endIndex: number;
}

// --- Style Types ---

export interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

export interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontSize?: number;
  fontFamily?: string;
  foregroundColor?: string; // Hex format e.g., "#FF0000"
  backgroundColor?: string; // Hex format e.g., "#FFFF00"
  linkUrl?: string;
}

export interface ParagraphStyle {
  alignment?: 'START' | 'CENTER' | 'END' | 'JUSTIFIED';
  namedStyleType?: 'NORMAL_TEXT' | 'TITLE' | 'SUBTITLE' | 'HEADING_1' | 'HEADING_2' | 'HEADING_3' | 'HEADING_4' | 'HEADING_5' | 'HEADING_6';
}

// --- Tool Parameter Types ---

export interface ApplyTextStyleParameter extends DocumentIdParameter, TextStyle {
  startIndex: number;
  endIndex: number;
}

export interface FormatMatchingTextParameter extends DocumentIdParameter, TextStyle {
  textToFind: string;
  matchInstance?: number; // 1-based instance
}

export interface ApplyParagraphStyleParameter extends DocumentIdParameter, ParagraphStyle {
  startIndex: number;
  endIndex: number;
}

export interface InsertTableParameter extends DocumentIdParameter {
  rows: number;
  columns: number;
  index: number;
}

export interface InsertPageBreakParameter extends DocumentIdParameter {
  index: number;
}

// --- Drive Management Types ---

export interface FolderIdParameter {
  folderId: string;
}

export interface FileIdParameter {
  fileId: string;
}

export interface CreateFolderParameter {
  name: string;
  parentFolderId?: string;
}

export interface ListFolderContentsParameter extends FolderIdParameter {}

export interface MoveFileParameter extends FileIdParameter {
  destinationFolderId: string;
}

export interface CopyFileParameter extends FileIdParameter {
  newName: string;
  destinationFolderId?: string;
}

export interface RenameFileParameter extends FileIdParameter {
  newName: string;
}

export interface DeleteFileParameter extends FileIdParameter {}

export interface CreateFromTemplateParameter {
  templateId: string;
  newName: string;
  parentFolderId?: string;
}
