// src/auth.ts
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

// --- Calculate paths relative to this script file (ESM way) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRootDir = path.resolve(__dirname, '..');

const TOKEN_PATH = path.join(projectRootDir, 'token.json');
const CREDENTIALS_PATH = path.join(projectRootDir, 'credentials.json');
// --- End of path calculation ---

const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive' // Full Drive access for listing, searching, and document discovery
];

async function loadSavedCredentialsIfExist(): Promise<OAuth2Client | null> {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content.toString());
    const { client_secret, client_id, redirect_uris } = await loadClientSecrets();
    const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0]);
    client.setCredentials(credentials);
    return client;
  } catch (err) {
    return null;
  }
}

async function loadClientSecrets() {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content.toString());
  const key = keys.installed || keys.web;
   if (!key) throw new Error("Could not find client secrets in credentials.json.");
  return {
      client_id: key.client_id,
      client_secret: key.client_secret,
      redirect_uris: key.redirect_uris
  };
}

async function saveCredentials(client: OAuth2Client): Promise<void> {
  const { client_secret, client_id } = await loadClientSecrets();
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: client_id,
    client_secret: client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
  console.error('Token stored to', TOKEN_PATH);
}

async function authenticate(): Promise<OAuth2Client> {
  // Check if we're running in an interactive environment
  const isInteractive = process.stdin.isTTY && process.stdout.isTTY;
  
  if (!isInteractive) {
    // Non-interactive mode (e.g., launched by MCP client)
    const { client_secret, client_id, redirect_uris } = await loadClientSecrets();
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0]);
    
    const authorizeUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES.join(' '),
    });
    
    console.error('\n=== GOOGLE DOCS MCP SETUP REQUIRED ===');
    console.error('No saved authentication found. Please run the following command ONCE to authenticate:');
    console.error('\nnode ./dist/server.js --setup');
    console.error('\nOr manually visit this URL and follow the setup instructions:');
    console.error(authorizeUrl);
    console.error('\nAfter authentication, the MCP server will work automatically.');
    throw new Error('Authentication required - run setup first');
  }
  
  // Interactive mode - proceed with normal flow
  const { client_secret, client_id, redirect_uris } = await loadClientSecrets();
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0]);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const authorizeUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES.join(' '),
  });

  console.error('Authorize this app by visiting this url:', authorizeUrl);
  
  // Use promise wrapper for readline question
  const code = await new Promise<string>((resolve) => {
    rl.question('Enter the code from that page here: ', (answer) => {
      resolve(answer);
    });
  });
  rl.close();

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    if (tokens.refresh_token) { // Save only if we got a refresh token
         await saveCredentials(oAuth2Client);
    } else {
         console.error("Did not receive refresh token. Token might expire.");
    }
    console.error('Authentication successful!');
    return oAuth2Client;
  } catch (err) {
    console.error('Error retrieving access token', err);
    throw new Error('Authentication failed');
  }
}

export async function authorize(): Promise<OAuth2Client> {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    // Optional: Add token refresh logic here if needed, though library often handles it.
    console.error('Using saved credentials.');
    return client;
  }
  console.error('Starting authentication flow...');
  client = await authenticate();
  return client;
}

// Helper function for manual setup
export async function runSetup(): Promise<void> {
  console.error('=== Google Docs MCP Server Setup ===');
  try {
    await authenticate();
    console.error('\n✅ Setup complete! The MCP server is now ready to use.');
  } catch (err) {
    console.error('\n❌ Setup failed:', err);
    process.exit(1);
  }
}
