# OpenPAVE Google Tasks Skill

Secure Google Tasks management skill for the PAVE sandbox environment. Create, manage, and organize tasks with OAuth authentication using the secure token system.

## Features

- **🔐 Secure Authentication** - OAuth tokens never exposed to sandbox code
- **📋 Task Management** - Create, update, complete, and delete tasks
- **📝 Task Lists** - Manage multiple task lists and organize work
- **📅 Due Dates** - Set and track task due dates with flexible date parsing
- **✅ Status Tracking** - Mark tasks as complete/incomplete, clear completed
- **📱 Multiple Output Formats** - Summary, full details, or JSON

## Installation

This skill runs in the PAVE sandbox environment with secure token management.

## Setup

### 1. Configure Token Permissions

Add to `~/.pave/permissions.yaml`:

```yaml
tokens:
  google-tasks:
    env: GOOGLE_TASKS_ACCESS_TOKEN
    type: oauth
    domains:
      - tasks.googleapis.com
      - "*.googleapis.com"
    placement:
      type: header
      name: Authorization
      format: "Bearer {token}"
    refreshEnv: GOOGLE_TASKS_REFRESH_TOKEN
    refreshUrl: https://oauth2.googleapis.com/token
    clientIdEnv: GOOGLE_TASKS_CLIENT_ID
    clientSecretEnv: GOOGLE_TASKS_CLIENT_SECRET
```

### 2. Set Environment Variables

Create a `.env` file or add to your environment:

```bash
# Google OAuth credentials (from Google Cloud Console)
GOOGLE_TASKS_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_TASKS_CLIENT_SECRET=your-client-secret
GOOGLE_TASKS_REFRESH_TOKEN=your-refresh-token

# Access token (optional - will be auto-generated)
GOOGLE_TASKS_ACCESS_TOKEN=your-access-token
```

### 3. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the **Google Tasks API**
4. Create OAuth 2.0 credentials (Desktop application)
5. Download the credentials JSON file
6. Use the OAuth 2.0 playground to generate a refresh token with `https://www.googleapis.com/auth/tasks` scope

## Usage

### Basic Commands

```bash
# Check authentication status
pave-run gtasks.js auth

# List all task lists
pave-run gtasks.js lists --summary

# Show tasks in default list
pave-run gtasks.js tasks --summary

# Show all tasks including completed
pave-run gtasks.js tasks --all --summary

# Create a new task
pave-run gtasks.js add "Buy groceries" --due tomorrow

# Mark task as complete
pave-run gtasks.js complete @default <taskId>
```

### Advanced Usage

```bash
# Create task with notes and due date
pave-run gtasks.js add "Project proposal" --notes "Draft initial outline" --due "+5d"

# Update task title and due date
pave-run gtasks.js update @default <taskId> --title "New title" --due "2026-01-15"

# List tasks from specific list
pave-run gtasks.js tasks <listId> --completed --summary

# Create new task list
pave-run gtasks.js create-list "Work Tasks"

# Clear completed tasks (with confirmation)
pave-run gtasks.js clear @default --yes

# Get detailed task information
pave-run gtasks.js get @default <taskId>

# Delete task (with confirmation)
pave-run gtasks.js delete @default <taskId> --yes
```

## Commands

| Command | Description | Arguments | Options |
|---------|-------------|-----------|---------|
| `auth` | Show authentication status | | `--summary`, `--json` |
| `lists` | List all task lists | | `--max <number>`, `--summary`, `--json` |
| `tasks` | List tasks | `[listId]` | `--list <id>`, `--max <count>`, `--completed`, `--all`, `--summary`, `--full`, `--json` |
| `add` | Create new task | `<title>` | `--list <id>`, `--notes <text>`, `--due <date>`, `--summary`, `--json` |
| `get` | Get task details | `<listId> <taskId>` | `--summary`, `--json` |
| `update` | Update task | `<listId> <taskId>` | `--title <text>`, `--notes <text>`, `--due <date>`, `--summary`, `--json` |
| `complete` | Mark task complete | `<listId> <taskId>` | `--summary`, `--json` |
| `uncomplete` | Mark task incomplete | `<listId> <taskId>` | `--summary`, `--json` |
| `delete` | Delete task | `<listId> <taskId>` | `--yes`, `--summary`, `--json` |
| `clear` | Clear completed tasks | `<listId>` | `--yes`, `--summary`, `--json` |
| `create-list` | Create task list | `<title>` | `--summary`, `--json` |
| `delete-list` | Delete task list | `<listId>` | `--yes`, `--summary`, `--json` |

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-l, --list <listId>` | Task list ID | `@default` |
| `-n, --notes <notes>` | Task notes/description | |
| `-d, --due <date>` | Due date | |
| `-t, --title <title>` | New title (for update) | |
| `-m, --max <count>` | Maximum results | `100` |
| `--completed` | Show completed tasks | |
| `--all` | Show all tasks including completed | |
| `--summary` | Human-readable output | |
| `--full` | Show full task details | |
| `--json` | Raw JSON output | |
| `--yes` | Skip confirmation prompts | |

## Date Formats

The skill supports flexible date parsing for due dates:

| Format | Example | Description |
|--------|---------|-------------|
| Relative | `today`, `tomorrow` | Common relative dates |
| Days offset | `+3`, `3d`, `+5d` | Days from today |
| ISO date | `2026-01-15` | Specific date (YYYY-MM-DD) |

## Output Formats

### Summary Format (Human-readable)

```
📋 Found 3 task(s) in default list:

  [ ] Buy groceries 📅 Sat, Jan 18, 2026
      Milk, bread, eggs...

  [✓] Complete project proposal
      ✅ Completed: Fri, Jan 17, 2026 2:30 PM

  [ ] Schedule team meeting ⚠️
      Find a time that works for everyone
```

### Full Format

Includes all task details: IDs, timestamps, status, and complete notes.

### JSON Format

Raw API responses for programmatic use.

## Task Lists

- **@default** - Special identifier for the default task list
- **Custom Lists** - Use actual list IDs from `gtasks.js lists`
- **List Management** - Create and delete task lists as needed

## Security Features

- **🔐 Secure Token Management** - OAuth tokens never visible to sandbox code
- **🌐 Domain Restrictions** - Network access limited to Google APIs only  
- **🛡️ Permission Controls** - Minimal filesystem and system access
- **🔄 Auto Token Refresh** - Automatic OAuth token refresh on expiry
- **⚠️ Confirmation Prompts** - Destructive operations require `--yes` flag

## Error Handling

The skill provides helpful error messages for common issues:

- Missing token configuration
- Network permission requirements  
- Invalid date formats
- Task or list not found
- Confirmation prompts for destructive operations

## Examples

### Daily Task Management

```bash
# Morning routine
pave-run gtasks.js tasks --summary

# Add tasks for today
pave-run gtasks.js add "Review pull requests" --due today
pave-run gtasks.js add "Team standup" --due "9:00"

# Mark tasks complete as you go
pave-run gtasks.js complete @default <taskId>
```

### Project Organization

```bash
# Create project-specific list
pave-run gtasks.js create-list "Website Redesign"

# Add project tasks with notes
pave-run gtasks.js add "Design mockups" --list <projectListId> --notes "Focus on mobile-first approach" --due "+3d"
pave-run gtasks.js add "User research" --list <projectListId> --due tomorrow
```

### Weekly Cleanup

```bash
# Review completed tasks
pave-run gtasks.js tasks --completed --summary

# Clear completed tasks
pave-run gtasks.js clear @default --yes

# Export task data for reporting
pave-run gtasks.js tasks --all --json > tmp/tasks-backup.json
```

## License

MIT License - see LICENSE file for details.