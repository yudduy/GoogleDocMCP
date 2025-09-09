# Ultimate Google Docs & Drive MCP Server

**Built with the official MCP SDK** - A Google Docs and Drive integration that connects Claude Desktop and other MCP clients directly to your Google workspace. Originally inspired by [a-bonus/google-docs-mcp](https://github.com/a-bonus/google-docs-mcp), but completely rewritten to use the official Model Context Protocol SDK.

![Demo Animation](assets/google.docs.mcp.1.gif)

Connect Claude Desktop (or other MCP clients) to your Google Docs and Google Drive!

> 🔥 **Check out [15 powerful tasks](SAMPLE_TASKS.md) you can accomplish with this enhanced server!**
> 📁 **NEW:** Complete Google Drive file management capabilities!

I built this to solve a real problem: I wanted Claude to help me manage my Google Docs and Drive files, but there wasn't a reliable way to do it. This server bridges that gap, giving AI assistants comprehensive access to read, edit, format, and organize your Google workspace.

What started as a simple document reader has evolved into a full-featured Drive management tool. Whether you're organizing project files, formatting reports, or just want Claude to help with document tasks, this server handles it all.

**Features:**

### Document Access & Editing
- **Read Documents:** Read content with `readGoogleDoc` (plain text, JSON structure, or markdown)
- **Append to Documents:** Add text to documents with `appendToGoogleDoc`
- **Insert Text:** Place text at specific positions with `insertText`
- **Delete Content:** Remove content from a document with `deleteRange`

### Formatting & Styling
- **Text Formatting:** Apply rich styling with `applyTextStyle` (bold, italic, colors, etc.)
- **Paragraph Formatting:** Control paragraph layout with `applyParagraphStyle` (alignment, spacing, etc.)
- **Find & Format:** Format by text content using `formatMatchingText` (legacy support)

### Document Structure
- **Tables:** Create tables with `insertTable`
- **Page Breaks:** Insert page breaks with `insertPageBreak`
- **Experimental Features:** Tools like `fixListFormatting` for automatic list detection

### 🆕 Google Drive File Management
- **Document Discovery:** Find and list documents with `listGoogleDocs`, `searchGoogleDocs`, `getRecentGoogleDocs`
- **Document Information:** Get detailed metadata with `getDocumentInfo`
- **Folder Management:** Create folders (`createFolder`), list contents (`listFolderContents`), get info (`getFolderInfo`)
- **File Operations:** Move (`moveFile`), copy (`copyFile`), rename (`renameFile`), delete (`deleteFile`)
- **Document Creation:** Create new docs (`createDocument`) or from templates (`createFromTemplate`)

### Integration
- **Google Authentication:** Secure OAuth 2.0 authentication with full Drive access
- **MCP Compliant:** Designed for use with Claude and other MCP clients
- **VS Code Integration:** [Setup guide](vscode.md) for VS Code MCP extension

---

## Prerequisites

You'll need a few things before we start:

1.  **Node.js and npm** - Version 18 or newer. Download from [nodejs.org](https://nodejs.org/) if you don't have it.
2.  **Git** - For cloning the repository. Get it from [git-scm.com](https://git-scm.com/downloads).
3.  **A Google Account** - The one that has access to the docs you want to work with.
4.  **Basic terminal skills** - You'll need to run a few commands in Terminal (Mac/Linux) or Command Prompt (Windows).
5.  **Claude Desktop** (optional) - If you want to use this with Claude. The server works with any MCP client.

---

## Setup Instructions

Here's how to set everything up. I'll walk you through each step:

### Step 1: Google Cloud Project & Credentials (The Important Bit!)

Your server needs permission to access Google's APIs. Think of this as creating a secure key that lets your server talk to Google on your behalf - no one else can use it.

1.  **Go to Google Cloud Console:** Open your web browser and go to the [Google Cloud Console](https://console.cloud.google.com/). You might need to log in with your Google Account.
2.  **Create or Select a Project:**
    - If you don't have a project, click the project dropdown near the top and select "NEW PROJECT". Give it a name (e.g., "My MCP Docs Server") and click "CREATE".
    - If you have existing projects, you can select one or create a new one.
3.  **Enable the APIs:** We need to turn on Google Docs and Drive access.
    - Search for "APIs & Services" and go to "Library".
    - Find "**Google Docs API**" and enable it.
    - Find "**Google Drive API**" and enable it too (needed for file management).
4.  **Configure OAuth Consent Screen:** This screen tells users (usually just you) what your app wants permission for.
    - On the left menu, click "APIs & Services" -> "**OAuth consent screen**".
    - Choose User Type: Select "**External**" and click "CREATE".
    - Fill in App Information:
      - **App name:** Give it a name users will see (e.g., "Claude Docs MCP Access").
      - **User support email:** Select your email address.
      - **Developer contact information:** Enter your email address.
    - Click "**SAVE AND CONTINUE**".
    - **Scopes:** Click "**ADD OR REMOVE SCOPES**". Search for and add the following scopes:
      - `https://www.googleapis.com/auth/documents` (Allows reading/writing docs)
      - `https://www.googleapis.com/auth/drive.file` (Allows access to specific files opened/created by the app)
      - Click "**UPDATE**".
    - Click "**SAVE AND CONTINUE**".
    - **Test Users:** Click "**ADD USERS**". Enter the same Google email address you are logged in with. Click "**ADD**". This allows _you_ to use the app while it's in "testing" mode.
    - Click "**SAVE AND CONTINUE**". Review the summary and click "**BACK TO DASHBOARD**".
5.  **Create Credentials (The Keys!):**
    - On the left menu, click "APIs & Services" -> "**Credentials**".
    - Click "**+ CREATE CREDENTIALS**" at the top and choose "**OAuth client ID**".
    - **Application type:** Select "**Desktop app**" from the dropdown.
    - **Name:** Give it a name (e.g., "MCP Docs Desktop Client").
    - Click "**CREATE**".
6.  **⬇️ DOWNLOAD THE CREDENTIALS FILE:** A box will pop up showing your Client ID. Click the "**DOWNLOAD JSON**" button.
    - Save this file. It will likely be named something like `client_secret_....json`.
    - **IMPORTANT:** Rename the downloaded file to exactly `credentials.json`.
7.  **⚠️ Keep this file safe!** Treat `credentials.json` like a password. Don't share it or upload it to GitHub. The included `.gitignore` should protect you, but be careful.

### Step 2: Get the Server Code

1.  **Clone the Repository:** Open your terminal/command prompt and run:
    ```bash
    git clone https://github.com/duy/gdoc-mcp.git mcp-googledocs-server
    ```
2.  **Navigate into Directory:**
    ```bash
    cd mcp-googledocs-server
    ```
3.  **Place Credentials:** Move or copy the `credentials.json` file you downloaded and renamed (from Step 1.6) directly into this `mcp-googledocs-server` folder.

### Step 3: Install Dependencies

Your server needs some helper libraries specified in the `package.json` file.

1.  In your terminal (make sure you are inside the `mcp-googledocs-server` directory), run:
    ```bash
    npm install
    ```
    This will download and install all the necessary packages into a `node_modules` folder.

### Step 4: Build the Server Code

The server is written in TypeScript (`.ts`), but we need to compile it into JavaScript (`.js`) that Node.js can run directly.

1.  In your terminal, run:
    ```bash
    npm run build
    ```
    This uses the TypeScript compiler (`tsc`) to create a `dist` folder containing the compiled JavaScript files.

### Step 5: First Run & Google Authorization (One Time Only)

Now you need to run the server once manually to grant it permission to access your Google account data. This will create a `token.json` file that saves your permission grant.

1.  In your terminal, run the _compiled_ server using `node`:
    ```bash
    node ./dist/server.js
    ```
2.  **Watch the Terminal:** The script will print:
    - Status messages (like "Attempting to authorize...").
    - An "Authorize this app by visiting this url:" message followed by a long `https://accounts.google.com/...` URL.
3.  **Authorize in Browser:**
    - Copy the entire long URL from the terminal.
    - Paste the URL into your web browser and press Enter.
    - Log in with the **same Google account** you added as a Test User in Step 1.4.
    - Google will show a screen asking for permission for your app ("Claude Docs MCP Access" or similar) to access Google Docs/Drive. Review and click "**Allow**" or "**Grant**".
4.  **Get the Authorization Code:**
    - After clicking Allow, your browser will try to go to `http://localhost` and show an error. **This is expected!**
    - Look at the URL in your browser's address bar. You'll see something like `http://localhost/?code=4/0Axxxxxxxxxxxxxx&scope=...`
    - Copy the long code between `code=` and `&scope`. That's your authorization code.
5.  **Paste Code into Terminal:** Go back to your terminal where the script is waiting ("Enter the code from that page here:"). Paste the code you just copied.
6.  **Press Enter.**
7.  **Success!** The script should print:
    - "Authentication successful!"
    - "Token stored to .../token.json"
    - It will then finish starting and likely print "Awaiting MCP client connection via stdio..." or similar, and then exit (or you can press `Ctrl+C` to stop it).
8.  ✅ **Check:** You should now see a new file named `token.json` in your `mcp-googledocs-server` folder.
9.  **🔒 Keep token.json safe too!** This file lets the server access your Google account. Don't share it or commit it to Git (`.gitignore` has you covered).

### Step 6: Configure Claude Desktop (Optional)

If you want to use this server with Claude Desktop, you need to tell Claude how to run it.

1.  **Find Your Absolute Path:** You need the full path to the server code.
    - In your terminal, make sure you are still inside the `mcp-googledocs-server` directory.
    - Run the `pwd` command (on macOS/Linux) or `cd` (on Windows, just displays the path).
    - Copy the full path (e.g., `/Users/yourname/projects/mcp-googledocs-server` or `C:\Users\yourname\projects\mcp-googledocs-server`).
2.  **Locate `mcp_config.json`:** Find Claude's configuration file:
    - **macOS:** `~/Library/Application Support/Claude/mcp_config.json` (You might need to use Finder's "Go" -> "Go to Folder..." menu and paste `~/Library/Application Support/Claude/`)
    - **Windows:** `%APPDATA%\Claude\mcp_config.json` (Paste `%APPDATA%\Claude` into File Explorer's address bar)
    - **Linux:** `~/.config/Claude/mcp_config.json`
    - _If the `Claude` folder or `mcp_config.json` file doesn't exist, create them._
3.  **Edit `mcp_config.json`:** Open the file in a text editor. Add or modify the `mcpServers` section like this, **replacing `/PATH/TO/YOUR/CLONED/REPO` with the actual absolute path you copied in Step 6.1**:

    ```json
    {
      "mcpServers": {
        "google-docs-mcp": {
          "command": "node",
          "args": [
            "/PATH/TO/YOUR/CLONED/REPO/mcp-googledocs-server/dist/server.js"
          ],
          "env": {}
        }
        // Add commas here if you have other servers defined
      }
      // Other Claude settings might be here
    }
    ```

    - **Make sure the path in `"args"` is correct and absolute!**
    - If the file already existed, carefully merge this entry into the existing `mcpServers` object. Ensure the JSON is valid (check commas!).

4.  **Save `mcp_config.json`.**
5.  **Restart Claude Desktop:** Close Claude completely and reopen it.

---

## Usage with Claude Desktop

Once configured, you should be able to use the tools in your chats with Claude:

- "Use the `google-docs-mcp` server to read the document with ID `YOUR_GOOGLE_DOC_ID`."
- "Can you get the content of Google Doc `YOUR_GOOGLE_DOC_ID`?"
- "Append 'This was added by Claude!' to document `YOUR_GOOGLE_DOC_ID` using the `google-docs-mcp` tool."

### Advanced Usage Examples:
- **Text Styling**: "Use `applyTextStyle` to make the text 'Important Section' bold and red (#FF0000) in document `YOUR_GOOGLE_DOC_ID`."
- **Paragraph Styling**: "Use `applyParagraphStyle` to center-align the paragraph containing 'Title Here' in document `YOUR_GOOGLE_DOC_ID`."
- **Table Creation**: "Insert a 3x4 table at index 500 in document `YOUR_GOOGLE_DOC_ID` using the `insertTable` tool."
- **Legacy Formatting**: "Use `formatMatchingText` to find the second instance of 'Project Alpha' and make it blue (#0000FF) in doc `YOUR_GOOGLE_DOC_ID`."

Remember to replace `YOUR_GOOGLE_DOC_ID` with the actual ID from a Google Doc's URL (the long string between `/d/` and `/edit`).

Claude will automatically launch your server in the background when needed using the command you provided. You do **not** need to run `node ./dist/server.js` manually anymore.

---

## Security & Token Storage

- **`.gitignore`:** This repository includes a `.gitignore` file which should prevent you from accidentally committing your sensitive `credentials.json` and `token.json` files. **Do not remove these lines from `.gitignore`**.
- **Token Storage:** This server stores the Google authorization token (`token.json`) directly in the project folder for simplicity during setup. In production or more security-sensitive environments, consider storing this token more securely, such as using system keychains, encrypted files, or dedicated secret management services.

---

## Troubleshooting

- **Claude shows "Failed" or "Could not attach":**
  - Double-check the absolute path in `mcp_config.json`.
  - Ensure you ran `npm run build` successfully and the `dist` folder exists.
  - Try running the command from `mcp_config.json` manually in your terminal: `node /PATH/TO/YOUR/CLONED/REPO/mcp-googledocs-server/dist/server.js`. Look for any errors printed.
  - Check the Claude Desktop logs (see the official MCP debugging guide).
  - Make sure all `console.log` status messages in the server code were changed to `console.error`.
- **Google Authorization Errors:**
  - Ensure you enabled the correct APIs (Docs, Drive).
  - Make sure you added your email as a Test User on the OAuth Consent Screen.
  - Verify the `credentials.json` file is correctly placed in the project root.

---

## License

MIT License - see the `LICENSE` file for details. Feel free to use this in your own projects!
