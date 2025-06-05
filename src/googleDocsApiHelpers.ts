// src/googleDocsApiHelpers.ts
// Simplified helpers for Google Docs API using official MCP SDK

import { docs_v1 } from 'googleapis';

export async function executeBatchUpdate(
  docs: docs_v1.Docs,
  documentId: string,
  requests: docs_v1.Schema$Request[]
): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
  const response = await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests }
  });
  return response.data;
}

export async function insertText(
  docs: docs_v1.Docs,
  documentId: string,
  text: string,
  index: number
): Promise<void> {
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [{
        insertText: {
          location: { index },
          text
        }
      }]
    }
  });
}
