## Brief overview
Guidelines for developing Chrome extensions to avoid common build, configuration, and deployment issues encountered during extension development.

## Build configuration
- Always verify that all files referenced in manifest.json exist in the correct paths before building
- Use build scripts that automatically copy required extension files (manifest.json, background.js, content.js, popup files) to the dist folder
- Configure Vite or build tools to output extension files to the root of the dist directory, not nested folders
- Test extension loading immediately after build to catch missing file errors early

## Manifest validation
- Double-check all file paths in manifest.json match the actual built file locations
- Ensure web_accessible_resources paths are correct and files exist
- Validate that service worker scripts don't use APIs not available in service workers (like chrome.contextMenus)
- Test popup and action configurations before final deployment

## File organization
- Keep extension source files in a dedicated extension/ directory
- Use build scripts to copy manifest.json and service worker files to dist root
- Ensure HTML files referenced in manifest are accessible at expected paths
- Maintain consistent file naming between source and built versions

## Dependency management
- Resolve package version conflicts early by checking compatibility before installation
- Consider simplified implementations when complex library integrations cause issues
- Test API integrations with placeholder data before full implementation
- Use virtual environments and lock dependency versions

## CORS and API configuration
- Configure CORS properly for extension-backend communication from the start
- Validate API keys and environment variables before running the application
- Test cross-origin requests between extension and backend during development
- Document required environment setup clearly

## Error prevention
- Implement early validation of configuration files and API keys
- Test extension loading after each significant change
- Use absolute imports in backend code to avoid path resolution issues
- Maintain clear separation between development and production builds

## UI/UX considerations
- Plan extension UI layout early - decide between popup, side panel, or full tab interfaces
- For AI chat interfaces, consider using established UI component libraries like shadcn/ui AI Elements
- Test component compatibility and dependencies before implementing complex UI features
- Ensure proper TypeScript path mapping (@/* imports) is configured for component libraries
- Validate all UI component dependencies are installed before building
- Scope markdown sanitisation helpers to assistant output; running auto-completion on user-authored messages can introduce stray characters (e.g., trailing `**`).

## Side panel vs popup configuration
- Choose between popup and side panel based on use case - side panels provide more space for complex interfaces
- When switching from popup to side panel, remove "action" configuration and add "side_panel" with "default_path"
- Include "sidePanel" permission in manifest when using side panel API
- Test extension icon click behavior after configuration changes

## Component library integration
- When using shadcn/ui or similar component libraries, ensure all required Radix UI primitives are installed
- Configure TypeScript path aliases properly for component imports
- Test component builds incrementally to catch syntax errors early
- Consider component library compatibility with extension build tools (Vite, etc.)

## Build process reliability
- Implement post-build file copying for extension-specific files not handled by build tools
- Verify all manifest-referenced files exist in dist folder before testing
- Use build verification scripts to catch missing files early
- Maintain consistent file structure between source and built extension
- Add a repo-wide `.gitignore` on day one: ignore Python caches/virtualenvs (`__pycache__/`, `venv/`), Node/Vite artifacts (`frontend/node_modules/`, `frontend/dist/`, `frontend/.vite/`), generic build output (`dist/`, `build/`), editor folders (`.vscode/`, `.idea/`), and local secrets (`.env` while keeping `.env.example`).

## Lessons Learned from Development
During the development of this LangGraph AI Agent Chrome extension, several issues were encountered that can be avoided in future projects:

### Backend/API Contract Mismatches
- **LangChain message serialization**: FastAPI endpoints returned 500s because the code assumed responses were `dict` objects and called `.get`. When integrating LangChain (or any library emitting custom message classes), inspect the returned types and normalise them (`BaseMessage.content`) before serialising to JSON.
- **Form submission loops**: The chat UI wrapped the prompt input in a `<form>` whose submit handler did not call `event.preventDefault()`. The browser performed a full page refresh, clearing state before the assistant reply rendered. Always prevent default form submission when handling SPA-style submits programmatically.
- **Page context propagation**: Simply storing `page_content` in state isn’t enough—ensure the extension formats a rich snapshot (title, URL, visible text, form structure) and sends both the human-readable string and structured `page_details` so the backend can inject context as a system message before calling the LLM.
- **Gemini system instructions**: The Gemini SDK does not accept `system_instruction` when calling `chat.send_message`. Prepend context as dedicated history turns (e.g., a prefixed “Context for the assistant” user message) before invoking the model to avoid `TypeError: unexpected keyword argument 'system_instruction'` while still delivering rich context.

### Practical Flow: Wiring Page Context End-to-End
1. **Content capture request**: The React side panel calls `chrome.runtime.sendMessage action: 'getPageContent' })` before posting to FastAPI.
2. **Background routing with fallback**: `background.js` checks the active tab. If the declarative `content.js` responds, its structured `{ title, url, text, forms }` payload is returned. When the content script is unavailable (restricted schemes, timing), the service worker executes a fallback snippet with `chrome.scripting.executeScript` that serialises body text (trimmed to 5k chars) and form metadata, guaranteeing at least `{ title, url }` on every request.
3. **Frontend formatting**: `chat.tsx` converts that payload into two artefacts: a compressed human-readable summary string (`page_content`) and the raw structured snapshot (`page_details`). Both accompany the user’s message in the POST body.
4. **State persistence**: FastAPI caches `page_content`/`page_details` inside `AgentState` so the session retains the latest page snapshot alongside chat history.
5. **Context injection**: Before each Gemini call, `backend/agent.py` generates (or refreshes) a single `SystemMessage` containing the page text, metadata, and user profile data. Because Gemini rejects `system_instruction` at send time, the system message is appended to chat history as a prefixed “Context for the assistant” user turn.
6. **LLM invocation**: Gemini receives the contextual turn plus the user prompt and responds with page-aware answers. Tool calls inherit the same state, enabling downstream automations (e.g., EXA research) to use the stored context.

#### FastAPI `/chat/{session_id}` Contract
Requests should be JSON with the following shape:

```json
{
"message": "User prompt text",
"page_content": "Flattened summary (title, URL, first 5k chars, form overview)",
"page_details": {
"title": "Page title",
"url": "https://example.com"
"text": "Raw visible text (first 5k chars)",
"forms": [
{
"id": "form_0",
"action": "https://example.com/submit";,
"method": "post",
"fields": [
{ "name": "email", "label": "Email", "type": "email", "required": true, "value": "" }
]
}
]
}
}
```

`page_content` supplies a compact summary for logging/UI, while `page_details` preserves the full structured snapshot used by tools and the context system message. Both keys are optional but at least one should be non-empty for grounded responses.

Documenting this flow avoids regressions: the extension must always send both summary and structured payloads, the backend must update the dedicated context message per turn, and Gemini must treat that context as normal conversation history rather than a system prompt.

### Extension Messaging Reliability
- **Missing receiving end**: The background script attempted to message the content script on every tab, including `chrome://` or other restricted URLs. Chrome throws `runtime.lastError` in these cases; the error is benign but spammed the console. Guard against non-`http(s)` URLs and always check `chrome.runtime.lastError before assuming the message was delivered.
- **Active tab validation**: Tabs without IDs (e.g., closed or special pages) also triggered warnings. Bail out early with an empty payload so the UI can continue without context data.
- **Content script fallbacks**: When the declarative content script fails or isn’t injected (e.g., due to permissions or timing), the background worker should fall back to `chrome.scripting.executeScript` to extract page metadata synchronously. Always return at least the tab’s `title` and `url` so the LLM can anchor its response even if full DOM scraping fails.
- **WebSocket + REST dual path**: The side panel opens `ws://localhost:8000/ws/{session_id}` as soon as it mounts so that status updates (`thinking`, `completed`, `error`) stream live. Send each prompt over that socket together with `page_content` and `page_details`. If the connection fails (firewall, offline mode), fall back to `POST /chat/{session_id}` so the chat remains functional without WebSocket support.
- **Install WebSocket support**: Uvicorn must include a WebSocket implementation (`uvicorn[standard]`, or add `websockets`/`wsproto`). The backend `requirements.txt` pins `uvicorn[standard]>=0.20.0`; after updating, rebuild the virtualenv (`pip install -r backend/requirements.txt`) so the `/ws/{session_id}` endpoint accepts upgrades.
- **EXA API requests**: The research tool issues `POST https://api.exa.ai/answer` through a shared `requests.Session`. Ensure `EXA_API_KEY` is present in `.env`; truncate the page context to roughly 4k characters before sending to keep payload sizes predictable.

### EXA web research integration (2024-10)
- **Gemini SDK versions**: Upgrading to `google-generativeai>=0.8.0` surfaced conflicts with `langchain-google-genai==1.0.8`. If you do not depend on that package, uninstall it (`pip uninstall langchain-google-genai`); otherwise pick a release that supports the newer SDK to avoid `whichOneof` runtime errors.
- **Tool schema definition**: Passing `genai.types.Schema` objects on 0.8.x raised `AttributeError`. Using plain Python dicts for tool declarations (as shown in Google’s examples) keeps the payload compatible with the SDK.
- **Replaying tool calls**: Gemini expects the `function_call` key (snake_case) when you feed previous tool invocations back into the conversation. Using camelCase causes `Unable to determine the intended type of the dict`. Always serialize history parts as `{"parts": [{"function_call": {"name": ..., "args": {...}}}]}`.
- **`response.text` limitations**: When a candidate only contains a `function_call`, accessing `response.text` raises `ValueError`. Harvest text directly from `candidate.content.parts` first and wrap any fallback to `response.text` in `try/except`.
- **Diagnostic logging**: Before large integration changes, temporarily log the outgoing payload, raw Gemini response, and parsed `tool_calls`. It sped up debugging for every issue above. After stabilizing the feature, drop the verbosity or switch to the structured `logging` module with a DEBUG level.
- **Future tool integrations**: For every new tool, document its argument schema, context-size limits, history-filtering rules, and required environment variables. Capturing this information keeps the `extension → FastAPI → Gemini → tools` pipeline stable.

### Build and Dependency Management
- **Service worker parsing**: Listing `background.js` as a Vite build entry caused Rollup to parse the MV3 service worker as an ES module, emitting `Parse error @:1:1`. Keep service workers out of the bundler inputs and copy them post-build instead.
- **Audit-induced downgrades**: Running `npm audit fix --force` pulled `react-syntax-highlighter@5.x`, which lacks the `dist/esm/...` paths imported in the UI, leading to Rollup resolution errors. After audits, re-verify critical dependency versions and pin them explicitly if the code depends on modern entrypoints.

### Build Scripts and Environment Usage
- **Context-aware tooling**: Attempts to run `npm install` inside the Python backend directory failed because no `package.json` exists there. Document the directory layout so future commands run in the appropriate environment (`frontend/` for Node tooling, `backend/` venv for Python).

### Manifest and File Path Issues
- **Side panel path errors**: The `side_panel.default_path must point to the exact location of the HTML file in the built dist folder (e.g., "extension/chat.html" if nested, or "chat.html" if at root).
- **Web accessible resources**: Paths in `web_accessible_resources` must match the actual file locations in dist; use relative paths from the extension root.
- **Content script loading**: If content scripts are not bundled by the build tool, manually copy them to the dist root and ensure the manifest references them correctly (e.g., "content.js" at root).
- **Service worker paths**: Background service worker paths (e.g., "assets/background.js") must match the bundled output location.

### Build Configuration Challenges
- **Vite input configuration**: Including `manifest.json` in Vite's input can generate empty chunks; exclude it from input and copy it manually post-build to avoid corruption.
- **Static file copying**: Use post-build scripts in `package.json` (e.g., `npm run build && cp extension/* dist/`) to copy static files like manifest.json, content.js, and background.js to the dist root, as Vite may not handle them automatically.
- **HTML script/CSS paths**: In HTML files (e.g., chat.html), use relative paths that match the built structure (e.g., `<script src="../assets/chat.js">` for nested folders, or `<script src="assets/chat.js">` for root).
- **Asset bundling**: Ensure CSS files are generated and linked correctly; if Tailwind CSS is used, configure `tailwind.config.js` with content paths including `./extension/**/*.html` to process styles in HTML files.

### CSS and Styling Problems
- **Tailwind CSS setup**: Create `tailwind.config.js` and `postcss.config.js` files in the project root to enable Tailwind processing. Include `./extension/**/*.html` in content paths to style HTML files.
- **CSS file generation**: Tailwind utilities won't be generated without proper configuration; the output CSS file (e.g., chat.css) must be linked in HTML with the correct relative path.
- **Missing styles**: If only KaTeX fonts appear in CSS, Tailwind directives (@tailwind base; etc.) are missing from the main CSS file (e.g., src/index.css).

### Extension Loading Errors
- **"Side panel file path must exist"**: Verify the HTML file exists at the specified path in dist (e.g., dist/extension/chat.html).
- **"Could not load javascript 'content.js'"**: Ensure content.js is copied to dist root and referenced correctly in manifest.
- **"Manifest file is missing or unreadable"**: Copy manifest.json to dist root after build, as Vite may not include it.
- **UI not rendering**: Check browser console for script loading errors; ensure JS bundle (e.g., chat.js) is accessible and CSS is loaded.

### General Best Practices
- **Post-build verification**: Always run `ls -la dist/` after building to confirm all files (manifest.json, content.js, background.js, HTML files, assets) are present.
- **Manual file management**: For static files not bundled by Vite, use shell commands or npm scripts to copy them post-build.
- **Testing workflow**: Load the extension after each build change and check Chrome's extension console for errors.
- **Path consistency**: Test relative paths in HTML/CSS/JS against the final dist structure to avoid 404 errors.
- **Dependency installation**: Install all required packages (Radix UI primitives, Tailwind, etc.) before building to avoid missing components.

By addressing these issues early, future Chrome extension development can avoid common pitfalls related to build tools, file paths, and configuration.