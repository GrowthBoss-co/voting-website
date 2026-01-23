# N8N Automation Guide: ClickUp → Google Drive → Voting Website

This guide shows you how to create an n8n automation that:
1. Gets a task from ClickUp (when created/updated)
2. Uploads the file to Google Drive with naming: `AssigneeName_CompanyName_filename`
3. Sends the Google Drive link to your voting website
4. Automatically creates a poll with the correct creator and company

## Prerequisites

- n8n instance (cloud or self-hosted)
- ClickUp account with API access
- Google Drive account
- Your voting website deployed and accessible

## Step 1: Setup API Key

1. Generate a secure random API key (you can use: https://randomkeygen.com/)
2. Add it to your `.env` file:
   ```
   N8N_API_KEY=your-generated-secure-key-here
   ```
3. Restart your voting website server to load the new environment variable

## Step 2: Get Your Session ID

Before running the automation, you need to know which session to add polls to:

1. Go to your voting website and create a new session (or use an existing one)
2. Copy the Session ID from the host dashboard
3. You'll use this Session ID in the n8n workflow

## Step 3: Create N8N Workflow

### Node 1: ClickUp Trigger

1. Add a **ClickUp Trigger** node
2. Configure:
   - **Credential**: Add your ClickUp API credentials
   - **Event**: `Task Created` or `Task Updated`
   - **List ID**: Select the ClickUp list you want to monitor
3. The trigger will fire whenever a task is created/updated in that list

### Node 2: Extract Task Data

1. Add a **Set** node (name it "Extract Task Data")
2. Configure:
   - **assigneeName**: `{{ $json.assignees[0].username }}` (or use `.name` if available)
   - **companyName**: Extract from task custom field or task name
   - **attachments**: `{{ $json.attachments }}`

### Node 3: Download Attachment from ClickUp

1. Add an **HTTP Request** node (name it "Download Attachment")
2. Configure:
   - **Method**: GET
   - **URL**: `{{ $json.attachments[0].url }}`
   - **Response Format**: File
   - **Output Binary Data**: Yes
   - **Binary Property**: `data`

### Node 4: Upload to Google Drive

1. Add a **Google Drive** node
2. Configure:
   - **Credential**: Add your Google Drive credentials
   - **Operation**: Upload
   - **Binary Property**: `data`
   - **File Name**: `{{ $node["Extract Task Data"].json["assigneeName"] }}_{{ $node["Extract Task Data"].json["companyName"] }}_{{ $json.attachments[0].title }}`
   - **Parent Folder**: Select your target folder in Google Drive
   - **Options > Share**: Enable "Anyone with the link can view"

### Node 5: Parse Filename

1. Add a **Code** node (name it "Parse Drive Link")
2. Add this JavaScript code:

```javascript
// Get the Google Drive link from previous node
const driveLink = $input.item.json.webViewLink;
const fileName = $input.item.json.name;

// Parse the filename to extract creator and company
// Format: AssigneeName_CompanyName_originalfile.ext
const parts = fileName.split('_');
const creator = parts[0] || '';
const company = parts[1] || '';

return {
  json: {
    driveLink: driveLink,
    creator: creator,
    company: company.replace(/\.[^/.]+$/, '') // Remove file extension from company
  }
};
```

### Node 6: Send to Voting Website

1. Add an **HTTP Request** node (name it "Create Poll")
2. Configure:
   - **Method**: POST
   - **URL**: `https://your-voting-website.com/api/automation/add-poll`
   - **Authentication**: None (we use header instead)
   - **Send Headers**: Yes
   - **Header Parameters**:
     - Name: `X-API-Key`
     - Value: `your-secret-api-key-here` (same as in .env file)
     - Name: `Content-Type`
     - Value: `application/json`
   - **Send Body**: Yes
   - **Body Content Type**: JSON
   - **Specify Body**: Using JSON
   - **JSON Body**:

```json
{
  "sessionId": "YOUR_SESSION_ID_HERE",
  "creator": "={{ $node['Parse Drive Link'].json['creator'] }}",
  "company": "={{ $node['Parse Drive Link'].json['company'] }}",
  "driveLinks": ["={{ $node['Parse Drive Link'].json['driveLink'] }}"],
  "timer": 60,
  "exposeThem": false
}
```

## Step 4: Test the Workflow

1. **Activate** the workflow in n8n
2. Create a test task in ClickUp with:
   - Assignee: e.g., "John Doe"
   - Company in task name or custom field: e.g., "Acme Corp"
   - File attachment (image or video)
3. Check the workflow execution in n8n
4. Verify in your voting website that the poll was created with:
   - Creator: John Doe
   - Company: Acme Corp
   - Google Drive video/image link

## Step 5: Handle Multiple Files

If you want to upload multiple files from a single ClickUp task:

1. After **Node 3 (Download Attachment)**, add a **Split In Batches** node to handle each attachment separately
2. Loop through all attachments and upload each to Google Drive
3. Collect all Google Drive links
4. Send all links as an array in the `driveLinks` field

Example for multiple files:

```json
{
  "sessionId": "YOUR_SESSION_ID_HERE",
  "creator": "={{ $node['Parse Drive Link'].json['creator'] }}",
  "company": "={{ $node['Parse Drive Link'].json['company'] }}",
  "driveLinks": [
    "https://drive.google.com/file/d/FILE_ID_1/view",
    "https://drive.google.com/file/d/FILE_ID_2/view"
  ],
  "timer": 60,
  "exposeThem": false
}
```

## API Endpoint Reference

### POST /api/automation/add-poll

**Headers:**
- `X-API-Key`: Your secret API key (from .env file)
- `Content-Type`: application/json

**Request Body:**
```json
{
  "sessionId": "string (required)",
  "creator": "string (required)",
  "company": "string (required)",
  "driveLinks": ["array of strings (required, min 1)"],
  "timer": "number (optional, default: 60)",
  "exposeThem": "boolean (optional, default: false)"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "poll": {
    "id": "generated-uuid",
    "creator": "John Doe",
    "company": "Acme Corp",
    "mediaItems": [
      {
        "url": "https://drive.google.com/file/d/FILE_ID/preview",
        "type": "video"
      }
    ],
    "timer": 60,
    "startTime": null,
    "exposeThem": false,
    "lastVoter": null
  },
  "message": "Poll added successfully to session session-id"
}
```

**Error Responses:**
- `401`: Invalid or missing API key
- `400`: Missing required fields or invalid data
- `404`: Session not found
- `500`: Server error

## Troubleshooting

### Authentication Error (401)
- Make sure the `X-API-Key` header matches the value in your `.env` file
- Verify you restarted the server after adding the API key

### Session Not Found (404)
- Check that the `sessionId` in the request body is correct
- Verify the session exists in your voting website

### Invalid Drive Links (500)
- Ensure Google Drive links are in a supported format:
  - `/file/d/FILE_ID/view`
  - `/open?id=FILE_ID`
  - `/file/d/FILE_ID/preview`

### Filename Parsing Issues
- Make sure the filename format is: `AssigneeName_CompanyName_originalfile.ext`
- Use underscores (_) to separate parts, not spaces or dashes

## Tips

1. **Testing**: Use n8n's "Execute Workflow" button to test without waiting for a real ClickUp trigger
2. **Logging**: Check the n8n execution logs to see exactly what data is being sent
3. **Session Management**: You can create different sessions for different purposes and change the `sessionId` in the workflow
4. **Dynamic Session ID**: You could store the session ID in a ClickUp custom field and extract it in the workflow
5. **Error Handling**: Add error workflow nodes to handle failures gracefully (e.g., send Slack notification)

## Advanced: Dynamic Session Selection

To automatically select which session to add polls to based on ClickUp data:

1. Add a custom field in ClickUp called "Voting Session ID"
2. In the "Extract Task Data" node, add:
   ```
   sessionId: {{ $json.custom_fields.find(f => f.name === 'Voting Session ID').value }}
   ```
3. Use this dynamic session ID in the final HTTP request

## Support

If you encounter issues with the automation endpoint, check:
- Server logs for detailed error messages
- n8n execution logs for the exact request being sent
- Verify all required fields are present in the request body
