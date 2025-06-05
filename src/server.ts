// src/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { google, docs_v1, drive_v3 } from 'googleapis';
import { authorize, runSetup } from './auth.js';
import { OAuth2Client } from 'google-auth-library';

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
        const { documentId, format = "text" } = args as { documentId: string; format?: string };
        
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
        const { documentId, textToAppend } = args as { documentId: string; textToAppend: string };

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
        const { maxResults = 20, query } = args as { maxResults?: number; query?: string };

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
        const { title, initialContent } = args as { title: string; initialContent?: string };

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
