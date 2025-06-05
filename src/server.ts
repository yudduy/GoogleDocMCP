// src/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { google, docs_v1, drive_v3 } from 'googleapis';
import { authorize, runSetup } from './auth.js';
import { OAuth2Client } from 'google-auth-library';
import { ApplyParagraphStyleParameter, ApplyTextStyleParameter, CreateDocumentParameter, CreateFolderParameter, CreateFromTemplateParameter, DeleteContentRangeParameter, DeleteFileParameter, FileIdParameter, FolderIdParameter, FormatMatchingTextParameter, InsertPageBreakParameter, InsertTableParameter, InsertTextParameter, ListDocsParameter, ListFolderContentsParameter, MoveFileParameter, ReadGoogleDocParameter, RenameFileParameter, TextToAppendParameter, CopyFileParameter } from './types.js';
import { buildParagraphStyleRequests, buildTextStyleRequests, deleteContentRange, executeBatchUpdate, insertText } from './googleDocsApiHelpers.js';

let authClient: OAuth2Client | null = null;
let googleDocs: docs_v1.Docs | null = null;
let googleDrive: drive_v3.Drive | null = null;

// --- Initialization ---
async function initializeGoogleClient() {
  if (googleDocs && googleDrive) return { authClient, googleDocs, googleDrive };
  if (!authClient) {
    try {
      console.error("Attempting to authorize Google API client...");
      const client = await authorize();
      authClient = client;
      googleDocs = google.docs({ version: 'v1', auth: authClient });
      googleDrive = google.drive({ version: 'v3', auth: authClient });
      console.error("Google API client authorized successfully.");
    } catch (error) {
      console.error("FATAL: Failed to initialize Google API client:", error);
      authClient = null;
      googleDocs = null;
      googleDrive = null;
      throw new Error("Google client initialization failed. Cannot start server tools.");
    }
  }

  if (authClient && !googleDocs) {
    googleDocs = google.docs({ version: 'v1', auth: authClient });
  }
  if (authClient && !googleDrive) {
    googleDrive = google.drive({ version: 'v3', auth: authClient });
  }

  if (!googleDocs || !googleDrive) {
    throw new Error("Google Docs and Drive clients could not be initialized.");
  }

  return { authClient, googleDocs, googleDrive };
}

// --- Helper to get Docs client within tools ---
async function getDocsClient() {
  const { googleDocs: docs } = await initializeGoogleClient();
  if (!docs) {
    throw new Error("Google Docs client is not initialized. Authentication might have failed during startup or lost connection.");
  }
  return docs;
}

// --- Helper to get Drive client within tools ---
async function getDriveClient() {
  const { googleDrive: drive } = await initializeGoogleClient();
  if (!drive) {
    throw new Error("Google Drive client is not initialized. Authentication might have failed during startup or lost connection.");
  }
  return drive;
}

// Create MCP server
const server = new Server(
  {
    name: "Ultimate Google Docs MCP Server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "readGoogleDoc",
        description: "Reads the content of a specific Google Document",
        inputSchema: {
          type: "object",
          properties: {
            documentId: {
              type: "string",
              description: "The ID of the Google Document"
            },
            format: {
              type: "string",
              enum: ["text", "json"],
              default: "text",
              description: "Output format: 'text' (plain text) or 'json' (raw API structure)"
            }
          },
          required: ["documentId"]
        }
      },
      {
        name: "appendToGoogleDoc",
        description: "Appends text to the very end of a specific Google Document",
        inputSchema: {
          type: "object",
          properties: {
            documentId: {
              type: "string",
              description: "The ID of the Google Document"
            },
            textToAppend: {
              type: "string",
              description: "The text to add to the end"
            }
          },
          required: ["documentId", "textToAppend"]
        }
      },
      {
        name: "listGoogleDocs",
        description: "Lists Google Documents from your Google Drive",
        inputSchema: {
          type: "object",
          properties: {
            maxResults: {
              type: "number",
              minimum: 1,
              maximum: 100,
              default: 20,
              description: "Maximum number of documents to return (1-100)"
            },
            query: {
              type: "string",
              description: "Search query to filter documents by name or content"
            }
          }
        }
      },
      {
        name: "createDocument",
        description: "Creates a new Google Document",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Title for the new document"
            },
            initialContent: {
              type: "string",
              description: "Initial text content to add to the document"
            }
          },
          required: ["title"]
        }
      },
      {
        name: "insertText",
        description: "Inserts text at a specific index in a Google Document.",
        inputSchema: {
          type: "object",
          properties: {
            documentId: {
              type: "string",
              description: "The ID of the Google Document"
            },
            text: {
              type: "string",
              description: "The text to insert."
            },
            index: {
              type: "number",
              minimum: 1,
              description: "The index where to insert the text (must be >= 1)."
            }
          },
          required: ["documentId", "text", "index"]
        }
      },
      {
        name: "deleteContentRange",
        description: "Deletes a range of content from a Google Document.",
        inputSchema: {
          type: "object",
          properties: {
            documentId: {
              type: "string",
              description: "The ID of the Google Document"
            },
            startIndex: {
              type: "number",
              minimum: 1,
              description: "The starting index of the range to delete (inclusive)."
            },
            endIndex: {
              type: "number",
              minimum: 1,
              description: "The ending index of the range to delete (exclusive)."
            }
          },
          required: ["documentId", "startIndex", "endIndex"]
        }
      },
      {
        name: "applyTextStyle",
        description: "Applies rich styling (bold, italic, colors, etc.) to a specific text range.",
        inputSchema: {
          type: "object",
          properties: {
            documentId: { type: "string" },
            startIndex: { type: "number", minimum: 1 },
            endIndex: { type: "number", minimum: 1 },
            bold: { type: "boolean", nullable: true },
            italic: { type: "boolean", nullable: true },
            underline: { type: "boolean", nullable: true },
            strikethrough: { type: "boolean", nullable: true },
            fontSize: { type: "number", minimum: 1, nullable: true },
            fontFamily: { type: "string", nullable: true },
            foregroundColor: { type: "string", pattern: "^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$", nullable: true },
            backgroundColor: { type: "string", pattern: "^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$", nullable: true },
            linkUrl: { type: "string", format: "uri", nullable: true }
          },
          required: ["documentId", "startIndex", "endIndex"]
        }
      },
      {
        name: "formatMatchingText",
        description: "Finds text within a document and applies styling to it.",
        inputSchema: {
          type: "object",
          properties: {
            documentId: { type: "string" },
            textToFind: { type: "string" },
            matchInstance: { type: "number", minimum: 1, default: 1 },
            bold: { type: "boolean", nullable: true },
            italic: { type: "boolean", nullable: true },
            underline: { type: "boolean", nullable: true },
            strikethrough: { type: "boolean", nullable: true },
            fontSize: { type: "number", minimum: 1, nullable: true },
            fontFamily: { type: "string", nullable: true },
            foregroundColor: { type: "string", pattern: "^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$", nullable: true },
            backgroundColor: { type: "string", pattern: "^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$", nullable: true },
            linkUrl: { type: "string", format: "uri", nullable: true }
          },
          required: ["documentId", "textToFind"]
        }
      },
      {
        name: "applyParagraphStyle",
        description: "Applies paragraph-level styling (alignment, named styles) to a range.",
        inputSchema: {
          type: "object",
          properties: {
            documentId: { type: "string" },
            startIndex: { type: "number", minimum: 1 },
            endIndex: { type: "number", minimum: 1 },
            alignment: { type: "string", enum: ['START', 'CENTER', 'END', 'JUSTIFIED'], nullable: true },
            namedStyleType: { type: "string", enum: ['NORMAL_TEXT', 'TITLE', 'SUBTITLE', 'HEADING_1', 'HEADING_2', 'HEADING_3', 'HEADING_4', 'HEADING_5', 'HEADING_6'], nullable: true }
          },
          required: ["documentId", "startIndex", "endIndex"]
        }
      },
      {
        name: "insertTable",
        description: "Inserts a table into a document.",
        inputSchema: {
          type: "object",
          properties: {
            documentId: { type: "string" },
            rows: { type: "number", minimum: 1 },
            columns: { type: "number", minimum: 1 },
            index: { type: "number", minimum: 1 }
          },
          required: ["documentId", "rows", "columns", "index"]
        }
      },
      {
        name: "insertPageBreak",
        description: "Inserts a page break at a specific index.",
        inputSchema: {
          type: "object",
          properties: {
            documentId: { type: "string" },
            index: { type: "number", minimum: 1 }
          },
          required: ["documentId", "index"]
        }
      },
      {
        name: "getDocumentInfo",
        description: "Gets detailed metadata for a specific file in Google Drive.",
        inputSchema: {
          type: "object",
          properties: { fileId: { type: "string" } },
          required: ["fileId"]
        }
      },
      {
        name: "createFolder",
        description: "Creates a new folder in Google Drive.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            parentFolderId: { type: "string", nullable: true, description: "ID of the parent folder. If omitted, folder is created in root." }
          },
          required: ["name"]
        }
      },
      {
        name: "listFolderContents",
        description: "Lists the contents (files and folders) of a specific folder in Google Drive.",
        inputSchema: {
          type: "object",
          properties: { folderId: { type: "string" } },
          required: ["folderId"]
        }
      },
      {
        name: "moveFile",
        description: "Moves a file to a different folder in Google Drive.",
        inputSchema: {
          type: "object",
          properties: {
            fileId: { type: "string" },
            destinationFolderId: { type: "string" }
          },
          required: ["fileId", "destinationFolderId"]
        }
      },
      {
        name: "copyFile",
        description: "Creates a copy of a file.",
        inputSchema: {
          type: "object",
          properties: {
            fileId: { type: "string" },
            newName: { type: "string" },
            destinationFolderId: { type: "string", nullable: true }
          },
          required: ["fileId", "newName"]
        }
      },
      {
        name: "renameFile",
        description: "Renames a file in Google Drive.",
        inputSchema: {
          type: "object",
          properties: {
            fileId: { type: "string" },
            newName: { type: "string" }
          },
          required: ["fileId", "newName"]
        }
      },
      {
        name: "deleteFile",
        description: "Deletes a file or folder (moves it to the trash).",
        inputSchema: {
          type: "object",
          properties: { fileId: { type: "string" } },
          required: ["fileId"]
        }
      },
      {
        name: "createFromTemplate",
        description: "Creates a new Google Document from a template.",
        inputSchema: {
          type: "object",
          properties: {
            templateId: { type: "string" },
            newName: { type: "string" },
            parentFolderId: { type: "string", nullable: true }
          },
          required: ["templateId", "newName"]
        }
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "readGoogleDoc": {
        const docs = await getDocsClient();
        const { documentId, format = "text" } = args as unknown as ReadGoogleDocParameter;
        
        const fields = format === 'json' 
          ? '*' 
          : 'body(content(paragraph(elements(textRun(content)))))';

        const res = await docs.documents.get({
          documentId,
          fields,
        });

        if (format === 'json') {
          return {
            content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }]
          };
        }

        let textContent = '';
        res.data.body?.content?.forEach(element => {
          element.paragraph?.elements?.forEach(pe => {
            textContent += pe.textRun?.content || '';
          });
        });

        if (!textContent.trim()) {
          return {
            content: [{ type: "text", text: "Document found, but appears empty." }]
          };
        }

        const maxLength = 4000;
        const truncatedContent = textContent.length > maxLength 
          ? textContent.substring(0, maxLength) + `... [truncated ${textContent.length} chars]` 
          : textContent;

        return {
          content: [{ type: "text", text: `Content:\n---\n${truncatedContent}` }]
        };
      }

      case "appendToGoogleDoc": {
        const docs = await getDocsClient();
        const { documentId, textToAppend } = args as unknown as TextToAppendParameter;

        // Get the current end index
        const docInfo = await docs.documents.get({ 
          documentId, 
          fields: 'body(content(endIndex))' 
        });
        
        let endIndex = 1;
        if (docInfo.data.body?.content) {
          const lastElement = docInfo.data.body.content[docInfo.data.body.content.length - 1];
          if (lastElement?.endIndex) {
            endIndex = lastElement.endIndex - 1;
          }
        }

        const textToInsert = (endIndex > 1 ? '\n' : '') + textToAppend;

        await docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests: [{
              insertText: { 
                location: { index: endIndex }, 
                text: textToInsert 
              }
            }]
          }
        });

        return {
          content: [{ type: "text", text: `Successfully appended text to document ${documentId}.` }]
        };
      }

      case "listGoogleDocs": {
        const drive = await getDriveClient();
        const { maxResults = 20, query } = args as unknown as ListDocsParameter;

        let queryString = "mimeType='application/vnd.google-apps.document' and trashed=false";
        if (query) {
          queryString += ` and (name contains '${query}' or fullText contains '${query}')`;
        }

        const response = await drive.files.list({
          q: queryString,
          pageSize: maxResults,
          orderBy: 'modifiedTime desc',
          fields: 'files(id,name,modifiedTime,webViewLink,owners(displayName))',
        });

        const files = response.data.files || [];

        if (files.length === 0) {
          return {
            content: [{ type: "text", text: "No Google Docs found matching your criteria." }]
          };
        }

        let result = `Found ${files.length} Google Document(s):\n\n`;
        files.forEach((file, index) => {
          const modifiedDate = file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : 'Unknown';
          const owner = file.owners?.[0]?.displayName || 'Unknown';
          result += `${index + 1}. **${file.name}**\n`;
          result += `   ID: ${file.id}\n`;
          result += `   Modified: ${modifiedDate}\n`;
          result += `   Owner: ${owner}\n`;
          result += `   Link: ${file.webViewLink}\n\n`;
        });

        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "createDocument": {
        const drive = await getDriveClient();
        const { title, initialContent } = args as unknown as CreateDocumentParameter;

        const documentMetadata = {
          name: title,
          mimeType: 'application/vnd.google-apps.document',
        };

        const response = await drive.files.create({
          requestBody: documentMetadata,
          fields: 'id,name,webViewLink',
        });

        const document = response.data;
        let result = `Successfully created document "${document.name}" (ID: ${document.id})\nView Link: ${document.webViewLink}`;

        // Add initial content if provided
        if (initialContent) {
          try {
            const docs = await getDocsClient();
            await docs.documents.batchUpdate({
              documentId: document.id!,
              requestBody: {
                requests: [{
                  insertText: {
                    location: { index: 1 },
                    text: initialContent,
                  },
                }],
              },
            });
            result += `\n\nInitial content added to document.`;
          } catch (contentError) {
            result += `\n\nDocument created but failed to add initial content. You can add content manually.`;
          }
        }

        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "insertText": {
        const docs = await getDocsClient();
        const { documentId, text, index } = args as unknown as InsertTextParameter;

        if (index < 1) {
          throw new Error("Insert index must be 1 or greater.");
        }
        
        await insertText(docs, documentId, text, index);

        return {
          content: [{ type: "text", text: `Successfully inserted text into document ${documentId} at index ${index}.` }]
        };
      }

      case "deleteContentRange": {
        const docs = await getDocsClient();
        const { documentId, startIndex, endIndex } = args as unknown as DeleteContentRangeParameter;

        if (startIndex >= endIndex) {
          throw new Error("startIndex must be less than endIndex.");
        }
        if (startIndex < 1) {
          throw new Error("startIndex must be 1 or greater.");
        }

        await deleteContentRange(docs, documentId, startIndex, endIndex);

        return {
          content: [{ type: "text", text: `Successfully deleted content from document ${documentId} between ${startIndex} and ${endIndex}.` }]
        };
      }

      case "applyTextStyle": {
        const docs = await getDocsClient();
        const { documentId, startIndex, endIndex, ...textStyle } = args as unknown as ApplyTextStyleParameter;
        if (startIndex >= endIndex) throw new Error("startIndex must be less than endIndex.");
        if (Object.keys(textStyle).length === 0) throw new Error("At least one styling property must be provided.");

        const requests = buildTextStyleRequests(textStyle, { startIndex, endIndex });
        if(requests.length === 0) throw new Error("No valid styling properties were provided to create a request.");

        await executeBatchUpdate(docs, documentId, requests);

        return {
          content: [{ type: "text", text: `Successfully applied text style to range ${startIndex}-${endIndex} in document ${documentId}.` }]
        };
      }

      case "formatMatchingText": {
        const docs = await getDocsClient();
        const { documentId, textToFind, matchInstance = 1, ...textStyle } = args as unknown as FormatMatchingTextParameter;

        if (Object.keys(textStyle).length === 0) {
          throw new Error("At least one styling property (bold, color, etc.) must be provided.");
        }

        const res = await docs.documents.get({
          documentId,
          fields: 'body(content(paragraph(elements(startIndex,endIndex,textRun(content)))))',
        });

        if (!res.data.body?.content) {
          throw new Error(`Document body is empty or inaccessible for document ${documentId}.`);
        }
        
        // Reconstruct the full text to find matches accurately
        let fullText = '';
        res.data.body.content.forEach(element => {
          element.paragraph?.elements?.forEach(pe => {
            fullText += pe.textRun?.content || '';
          });
        });

        let foundCount = 0;
        let startIndex = -1;
        let searchPos = 0;
        while(foundCount < matchInstance) {
          const matchIndex = fullText.indexOf(textToFind, searchPos);
          if (matchIndex === -1) {
            throw new Error(`Could not find instance ${matchInstance} of "${textToFind}". Only ${foundCount} instance(s) were found.`);
          }
          startIndex = matchIndex + 1; // Docs API is 1-based index
          searchPos = matchIndex + textToFind.length;
          foundCount++;
        }

        const endIndex = startIndex + textToFind.length;
        
        const requests = buildTextStyleRequests(textStyle, { startIndex, endIndex });
        if(requests.length === 0) throw new Error("No valid styling properties were provided to create a request.");
        
        await executeBatchUpdate(docs, documentId, requests);
        
        return {
          content: [{ type: "text", text: `Successfully formatted instance ${matchInstance} of "${textToFind}" in document ${documentId}.` }]
        };
      }
      
      case "applyParagraphStyle": {
        const docs = await getDocsClient();
        const { documentId, startIndex, endIndex, ...paragraphStyle } = args as unknown as ApplyParagraphStyleParameter;
        if (startIndex >= endIndex) throw new Error("startIndex must be less than endIndex.");
        if (Object.keys(paragraphStyle).length === 0) throw new Error("At least one paragraph styling property must be provided.");

        const requests = buildParagraphStyleRequests(paragraphStyle, { startIndex, endIndex });
        if(requests.length === 0) throw new Error("No valid styling properties were provided to create a request.");

        await executeBatchUpdate(docs, documentId, requests);

        return {
          content: [{ type: "text", text: `Successfully applied paragraph style to range ${startIndex}-${endIndex} in document ${documentId}.` }]
        };
      }

      case "insertTable": {
        const docs = await getDocsClient();
        const { documentId, rows, columns, index } = args as unknown as InsertTableParameter;

        await executeBatchUpdate(docs, documentId, [{
          insertTable: {
            rows,
            columns,
            location: { index }
          }
        }]);

        return {
          content: [{ type: "text", text: `Successfully inserted a ${rows}x${columns} table in document ${documentId}.` }]
        };
      }

      case "insertPageBreak": {
        const docs = await getDocsClient();
        const { documentId, index } = args as unknown as InsertPageBreakParameter;

        await executeBatchUpdate(docs, documentId, [{
          insertPageBreak: {
            location: { index }
          }
        }]);

        return {
          content: [{ type: "text", text: `Successfully inserted page break in document ${documentId}.` }]
        };
      }

      case "getDocumentInfo": {
        const drive = await getDriveClient();
        const { fileId } = args as unknown as FileIdParameter;
        const res = await drive.files.get({
          fileId,
          fields: 'id,name,mimeType,createdTime,modifiedTime,owners,webViewLink,parents'
        });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }

      case "createFolder": {
        const drive = await getDriveClient();
        const { name, parentFolderId } = args as unknown as CreateFolderParameter;
        const fileMetadata = {
          name,
          mimeType: 'application/vnd.google-apps.folder',
          ...(parentFolderId && { parents: [parentFolderId] })
        };
        const res = await drive.files.create({
          requestBody: fileMetadata,
          fields: 'id,name,webViewLink'
        });
        return { content: [{ type: "text", text: `Folder created successfully: ${JSON.stringify(res.data, null, 2)}` }] };
      }
      
      case "listFolderContents": {
        const drive = await getDriveClient();
        const { folderId } = args as unknown as ListFolderContentsParameter;
        const res = await drive.files.list({
          q: `'${folderId}' in parents and trashed=false`,
          fields: 'files(id,name,mimeType,modifiedTime)',
          orderBy: 'folder,name'
        });
        return { content: [{ type: "text", text: `Contents of folder ${folderId}:\n${JSON.stringify(res.data.files, null, 2)}` }] };
      }

      case "moveFile": {
        const drive = await getDriveClient();
        const { fileId, destinationFolderId } = args as unknown as MoveFileParameter;
        const file = await drive.files.get({ fileId, fields: 'parents' });
        const previousParents = file.data.parents?.join(',');

        const res = await drive.files.update({
          fileId,
          addParents: destinationFolderId,
          removeParents: previousParents,
          fields: 'id,name,parents'
        });

        return { content: [{ type: "text", text: `File moved successfully: ${JSON.stringify(res.data, null, 2)}` }] };
      }

      case "copyFile": {
        const drive = await getDriveClient();
        const { fileId, newName, destinationFolderId } = args as unknown as CopyFileParameter;
        const requestBody: drive_v3.Schema$File = { name: newName };
        if (destinationFolderId) {
          requestBody.parents = [destinationFolderId];
        }

        const res = await drive.files.copy({
          fileId,
          requestBody,
          fields: 'id,name,webViewLink,parents'
        });
        return { content: [{ type: "text", text: `File copied successfully: ${JSON.stringify(res.data, null, 2)}` }] };
      }

      case "renameFile": {
        const drive = await getDriveClient();
        const { fileId, newName } = args as unknown as RenameFileParameter;
        const res = await drive.files.update({
          fileId,
          requestBody: { name: newName },
          fields: 'id,name'
        });
        return { content: [{ type: "text", text: `File renamed successfully: ${JSON.stringify(res.data, null, 2)}` }] };
      }

      case "deleteFile": {
        const drive = await getDriveClient();
        const { fileId } = args as unknown as DeleteFileParameter;
        await drive.files.update({
          fileId,
          requestBody: { trashed: true }
        });
        return { content: [{ type: "text", text: `File with ID ${fileId} moved to trash.` }] };
      }

      case "createFromTemplate": {
        const drive = await getDriveClient();
        const { templateId, newName, parentFolderId } = args as unknown as CreateFromTemplateParameter;
        const requestBody: drive_v3.Schema$File = {
            name: newName,
            ...(parentFolderId && { parents: [parentFolderId] })
        };
        const res = await drive.files.copy({
            fileId: templateId,
            requestBody,
            fields: 'id,name,webViewLink'
        });
        return { content: [{ type: "text", text: `Document created from template: ${JSON.stringify(res.data, null, 2)}` }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    throw new Error(`Tool execution failed: ${error.message || error}`);
  }
});

// --- Server Startup ---
async function startServer() {
  try {
    // Check for setup mode
    if (process.argv.includes('--setup')) {
      console.error('Running in setup mode...');
      await runSetup();
      return;
    }

    await initializeGoogleClient(); // Authorize BEFORE starting listeners
    console.error("Starting Ultimate Google Docs MCP server...");

    // Create transport and start server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP Server running using stdio. Awaiting client connection...");

  } catch(startError: any) {
    console.error("FATAL: Server failed to start:", startError.message || startError);
    process.exit(1);
  }
}

startServer();
