#!/usr/bin/env node
/**
 * Google Tasks CLI - Secure Token Version
 * 
 * Uses the PAVE sandbox secure token system for authentication.
 * Tokens are never visible to sandbox code - they're injected by the host.
 * 
 * Token configuration in ~/.pave/permissions.yaml:
 * {
 *   "tokens": {
 *     "google-tasks": {
 *       "env": "GOOGLE_TASKS_ACCESS_TOKEN",
 *       "type": "oauth",
 *       "domains": ["tasks.googleapis.com", "*.googleapis.com"],
 *       "placement": { "type": "header", "name": "Authorization", "format": "Bearer {token}" },
 *       "refreshEnv": "GOOGLE_TASKS_REFRESH_TOKEN",
 *       "refreshUrl": "https://oauth2.googleapis.com/token",
 *       "clientIdEnv": "GOOGLE_TASKS_CLIENT_ID",
 *       "clientSecretEnv": "GOOGLE_TASKS_CLIENT_SECRET"
 *     }
 *   }
 * }
 */

// Parse command line arguments  
const args = process.argv.slice(2);

function parseArgs() {
  const parsed = {
    command: null,
    positional: [],
    options: {}
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      if (arg.startsWith('--')) {
        const [key, value] = arg.slice(2).split('=', 2);
        if (value !== undefined) {
          parsed.options[key] = value;
        } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          parsed.options[key] = args[i + 1];
          i++;
        } else {
          parsed.options[key] = true;
        }
      } else {
        const flag = arg.slice(1);
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          parsed.options[flag] = args[i + 1];
          i++;
        } else {
          parsed.options[flag] = true;
        }
      }
    } else {
      if (parsed.command === null) {
        parsed.command = arg;
      } else {
        parsed.positional.push(arg);
      }
    }
  }
  
  return parsed;
}

// Helper function to build query strings (URLSearchParams not available in sandbox)
function buildQueryString(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  return parts.join('&');
}

// Helper function to format dates for display
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

// Helper function to format due date for API (RFC 3339)
function formatDueDate(dateStr) {
  const date = new Date(dateStr);
  return date.toISOString();
}

// Helper function to parse relative dates
function parseDate(input) {
  const today = new Date();
  
  if (input === 'today') {
    return today;
  } else if (input === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return tomorrow;
  } else if (input.match(/^\+?\d+d?$/)) {
    // +3, 3d, etc.
    const days = parseInt(input.replace(/[^\d]/g, ''));
    const future = new Date(today);
    future.setDate(today.getDate() + days);
    return future;
  } else {
    // Assume YYYY-MM-DD format
    return new Date(input);
  }
}

// Google Tasks API client using secure tokens
class TasksClient {
  constructor() {
    // Check if secure token system is available
    if (typeof hasToken === 'undefined') {
      throw new Error('Secure token system not available. Use: pave-run gtasks.js');
    }

    if (!hasToken('google-tasks')) {
      console.error('Google Tasks token not configured.');
      console.error('');
      console.error('Add to ~/.pave/permissions.yaml:');
      console.error(`tokens:
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
    clientSecretEnv: GOOGLE_TASKS_CLIENT_SECRET`);
      console.error('');
      console.error('Then set environment variables:');
      console.error('  GOOGLE_TASKS_CLIENT_ID, GOOGLE_TASKS_CLIENT_SECRET, GOOGLE_TASKS_REFRESH_TOKEN');
      throw new Error('Google Tasks token not configured');
    }

    this.baseUrl = 'https://tasks.googleapis.com/tasks/v1';
  }

  /**
   * Make authenticated request to Tasks API
   */
  request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = authenticatedFetch('google-tasks', url, {
        timeout: 15000,
        ...options
      });

      if (!response.ok) {
        const error = response.json();
        const err = new Error(error.error?.message || `HTTP ${response.status}: ${response.statusText}`);
        err.status = response.status;
        err.code = error.error?.code;
        err.data = error;
        throw err;
      }

      return response.json();
    } catch (error) {
      if (error.message.includes('Network permission denied')) {
        throw new Error('Network permission required: --allow-network=googleapis.com');
      }
      throw error;
    }
  }

  /**
   * List all task lists
   */
  listTaskLists(options = {}) {
    const params = buildQueryString({
      maxResults: options.maxResults || 100
    });

    return this.request(`/users/@me/lists?${params}`);
  }

  /**
   * Get a specific task list
   */
  getTaskList(listId) {
    return this.request(`/users/@me/lists/${encodeURIComponent(listId)}`);
  }

  /**
   * Create a new task list
   */
  createTaskList(title) {
    return this.request('/users/@me/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
  }

  /**
   * Delete a task list
   */
  deleteTaskList(listId) {
    return this.request(`/users/@me/lists/${encodeURIComponent(listId)}`, {
      method: 'DELETE'
    });
  }

  /**
   * List tasks in a task list
   */
  listTasks(listId, options = {}) {
    const params = buildQueryString({
      maxResults: options.maxResults || 100,
      showCompleted: options.showCompleted || false,
      showDeleted: options.showDeleted || false,
      showHidden: options.showHidden || false,
      completedMin: options.completedMin,
      completedMax: options.completedMax,
      dueMin: options.dueMin,
      dueMax: options.dueMax,
      updatedMin: options.updatedMin
    });

    return this.request(`/lists/${encodeURIComponent(listId)}/tasks?${params}`);
  }

  /**
   * Get a specific task
   */
  getTask(listId, taskId) {
    return this.request(`/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`);
  }

  /**
   * Create a new task
   */
  createTask(listId, task) {
    return this.request(`/lists/${encodeURIComponent(listId)}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task)
    });
  }

  /**
   * Update a task
   */
  updateTask(listId, taskId, updates) {
    return this.request(`/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  }

  /**
   * Delete a task
   */
  deleteTask(listId, taskId) {
    return this.request(`/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE'
    });
  }

  /**
   * Mark task as complete
   */
  completeTask(listId, taskId) {
    return this.updateTask(listId, taskId, {
      status: 'completed',
      completed: new Date().toISOString()
    });
  }

  /**
   * Mark task as incomplete
   */
  uncompleteTask(listId, taskId) {
    return this.updateTask(listId, taskId, {
      status: 'needsAction',
      completed: null
    });
  }

  /**
   * Clear completed tasks from a list
   */
  clearCompleted(listId) {
    return this.request(`/lists/${encodeURIComponent(listId)}/clear`, {
      method: 'POST'
    });
  }
}

// Task formatting utilities
class TaskFormatter {
  static format(task) {
    return {
      id: task.id,
      title: task.title || '(No title)',
      notes: task.notes || '',
      status: task.status,
      isCompleted: task.status === 'completed',
      due: task.due,
      completed: task.completed,
      updated: task.updated,
      self_link: task.selfLink,
      position: task.position,
      parent: task.parent,
      hidden: task.hidden || false
    };
  }

  static formatSummary(task, options = {}) {
    const formatted = this.format(task);
    const checkbox = formatted.isCompleted ? '[✓]' : '[ ]';
    const dueStr = formatted.due ? ` 📅 ${formatDate(formatted.due)}` : '';
    const priorityStr = options.showPriority && formatted.notes && formatted.notes.includes('!') ? ' ⚠️' : '';
    
    let summary = `${checkbox} ${formatted.title}${dueStr}${priorityStr}`;
    
    if (options.showNotes && formatted.notes) {
      const notes = formatted.notes.split('\n')[0].substring(0, 60);
      summary += `\n    ${notes}${formatted.notes.length > 60 ? '...' : ''}`;
    }
    
    if (options.showStatus && formatted.isCompleted && formatted.completed) {
      summary += `\n    ✅ Completed: ${formatDate(formatted.completed)}`;
    }
    
    return summary;
  }

  static formatDetailed(task) {
    const formatted = this.format(task);
    
    let details = [];
    details.push(`Title: ${formatted.title}`);
    details.push(`Status: ${formatted.isCompleted ? 'Completed' : 'Needs Action'}`);
    
    if (formatted.due) {
      details.push(`Due: ${formatDate(formatted.due)}`);
    }
    
    if (formatted.completed) {
      details.push(`Completed: ${formatDate(formatted.completed)}`);
    }
    
    if (formatted.notes) {
      details.push(`\nNotes:\n${formatted.notes}`);
    }
    
    details.push(`\nID: ${formatted.id}`);
    details.push(`Updated: ${formatDate(formatted.updated)}`);
    
    return details.join('\n');
  }
}

// Print functions
function printHelp() {
  console.log(`
📋 Google Tasks CLI - Secure Token Version

USAGE:
  node gtasks.js <command> [options]

COMMANDS:
  auth                     Show authentication status
  lists                   List all task lists
  tasks [listId]          List tasks (default: @default)
  add <title>             Create a new task
  get <listId> <taskId>   Get task details
  update <listId> <taskId> Update a task
  complete <listId> <taskId> Mark task as complete
  uncomplete <listId> <taskId> Mark task as incomplete
  delete <listId> <taskId> Delete a task
  clear <listId>          Clear completed tasks
  create-list <title>     Create a new task list
  delete-list <listId>    Delete a task list

OPTIONS:
  -l, --list <listId>     Task list ID (default: @default)
  -n, --notes <notes>     Task notes/description
  -d, --due <date>        Due date (YYYY-MM-DD, 'today', 'tomorrow', '+3d')
  -t, --title <title>     New title (for update)
  -m, --max <count>       Maximum results (default: 100)
  --completed             Show completed tasks
  --all                   Show all tasks including completed
  --summary               Show brief summary only
  --full                  Show full task details
  --json                  Output raw JSON
  --yes                   Skip confirmation prompts

EXAMPLES:
  node gtasks.js lists --summary
  node gtasks.js tasks --all --summary
  node gtasks.js add "Buy groceries" --due tomorrow --notes "Milk, bread, eggs"
  node gtasks.js complete @default taskId123
  node gtasks.js tasks @default --completed
  node gtasks.js update @default taskId123 --title "New title" --due "+5d"

DATE FORMATS:
  'today', 'tomorrow'     Relative dates
  '+3', '3d'             Days from today
  '2026-01-15'           Specific date (YYYY-MM-DD)

TOKEN SETUP:
  Tokens are configured in ~/.pave/permissions.yaml
  Environment variables needed:
    GOOGLE_TASKS_CLIENT_ID       - OAuth client ID
    GOOGLE_TASKS_CLIENT_SECRET   - OAuth client secret  
    GOOGLE_TASKS_REFRESH_TOKEN   - OAuth refresh token
    GOOGLE_TASKS_ACCESS_TOKEN    - (optional) Current access token
`);
}

function checkAuth() {
  try {
    const client = new TasksClient();
    const lists = client.listTaskLists({ maxResults: 1 });
    
    console.log('✅ Authentication successful');
    console.log(`📋 Access to ${lists.items?.length || 0} task list(s) confirmed`);
    console.log('🔐 Using secure token system (credentials not exposed to sandbox)');
    
    if (lists.items && lists.items.length > 0) {
      const defaultList = lists.items[0];
      console.log(`📝 Default list: ${defaultList.title}`);
    }
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    
    if (error.message.includes('not configured')) {
      console.error('💡 Configure google-tasks token in ~/.pave/permissions.yaml');
    }
    
    process.exit(1);
  }
}

function listTaskLists(args) {
  try {
    const client = new TasksClient();
    const options = {
      maxResults: args.options.max ? parseInt(args.options.max) : 100
    };
    
    const result = client.listTaskLists(options);
    
    if (args.options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    
    console.log(`📋 Found ${result.items?.length || 0} task list(s):\n`);
    
    if (result.items && result.items.length > 0) {
      for (const list of result.items) {
        console.log(`📝 ${list.title}`);
        
        if (!args.options.summary) {
          console.log(`   ID: ${list.id}`);
          console.log(`   Updated: ${formatDate(list.updated)}`);
          console.log('');
        }
      }
    }
  } catch (error) {
    console.error('❌ Failed to list task lists:', error.message);
    process.exit(1);
  }
}

function listTasks(args) {
  try {
    const client = new TasksClient();
    const listId = args.positional[0] || args.options.list || args.options.l || '@default';
    
    const options = {
      maxResults: args.options.max ? parseInt(args.options.max) : 100,
      showCompleted: args.options.all || args.options.completed,
      showDeleted: false,
      showHidden: false
    };
    
    const result = client.listTasks(listId, options);
    
    if (args.options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    
    const tasks = result.items || [];
    const listInfo = listId === '@default' ? 'default list' : `list: ${listId}`;
    
    console.log(`📋 Found ${tasks.length} task(s) in ${listInfo}:\n`);
    
    if (tasks.length > 0) {
      for (const task of tasks) {
        const summary = TaskFormatter.formatSummary(task, {
          showNotes: !args.options.summary,
          showStatus: args.options.full,
          showPriority: true
        });
        
        console.log(`  ${summary}\n`);
        
        if (args.options.full) {
          console.log(`    ID: ${task.id}`);
          console.log(`    Updated: ${formatDate(task.updated)}\n`);
        }
      }
    } else {
      const statusMsg = options.showCompleted ? 'tasks' : 'pending tasks';
      console.log(`📋 No ${statusMsg} found in ${listInfo}`);
      
      if (!options.showCompleted) {
        console.log('💡 Use --all to see completed tasks');
      }
    }
  } catch (error) {
    console.error('❌ Failed to list tasks:', error.message);
    process.exit(1);
  }
}

function addTask(args) {
  try {
    if (!args.positional[0]) {
      console.error('❌ Task title required');
      console.error('Usage: node gtasks.js add "Task title"');
      process.exit(1);
    }
    
    const client = new TasksClient();
    const listId = args.options.list || args.options.l || '@default';
    
    const task = {
      title: args.positional[0]
    };
    
    if (args.options.notes || args.options.n) {
      task.notes = args.options.notes || args.options.n;
    }
    
    if (args.options.due || args.options.d) {
      const dueInput = args.options.due || args.options.d;
      const dueDate = parseDate(dueInput);
      task.due = formatDueDate(dueDate);
    }
    
    const result = client.createTask(listId, task);
    
    if (args.options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    
    console.log(`✅ Task created: ${result.title}`);
    console.log(`   ID: ${result.id}`);
    
    if (result.due) {
      console.log(`   Due: ${formatDate(result.due)}`);
    }
    
    console.log('');
  } catch (error) {
    console.error('❌ Failed to create task:', error.message);
    process.exit(1);
  }
}

function getTask(args) {
  try {
    if (!args.positional[0] || !args.positional[1]) {
      console.error('❌ List ID and task ID required');
      console.error('Usage: node gtasks.js get <listId> <taskId>');
      process.exit(1);
    }
    
    const client = new TasksClient();
    const listId = args.positional[0];
    const taskId = args.positional[1];
    
    const task = client.getTask(listId, taskId);
    
    if (args.options.json) {
      console.log(JSON.stringify(task, null, 2));
      return;
    }
    
    console.log('📋 Task Details:\n');
    console.log(TaskFormatter.formatDetailed(task));
    console.log('');
  } catch (error) {
    console.error('❌ Failed to get task:', error.message);
    process.exit(1);
  }
}

function updateTask(args) {
  try {
    if (!args.positional[0] || !args.positional[1]) {
      console.error('❌ List ID and task ID required');
      console.error('Usage: node gtasks.js update <listId> <taskId> [options]');
      process.exit(1);
    }
    
    const client = new TasksClient();
    const listId = args.positional[0];
    const taskId = args.positional[1];
    
    const updates = {};
    
    if (args.options.title || args.options.t) {
      updates.title = args.options.title || args.options.t;
    }
    
    if (args.options.notes || args.options.n) {
      updates.notes = args.options.notes || args.options.n;
    }
    
    if (args.options.due || args.options.d) {
      const dueInput = args.options.due || args.options.d;
      const dueDate = parseDate(dueInput);
      updates.due = formatDueDate(dueDate);
    }
    
    if (Object.keys(updates).length === 0) {
      console.error('❌ No updates specified. Use --title, --notes, or --due.');
      process.exit(1);
    }
    
    const result = client.updateTask(listId, taskId, updates);
    
    if (args.options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    
    console.log(`✅ Task updated: ${result.title}`);
    console.log(`   ID: ${result.id}`);
    console.log('');
  } catch (error) {
    console.error('❌ Failed to update task:', error.message);
    process.exit(1);
  }
}

function completeTask(args) {
  try {
    if (!args.positional[0] || !args.positional[1]) {
      console.error('❌ List ID and task ID required');
      console.error('Usage: node gtasks.js complete <listId> <taskId>');
      process.exit(1);
    }
    
    const client = new TasksClient();
    const listId = args.positional[0];
    const taskId = args.positional[1];
    
    const result = client.completeTask(listId, taskId);
    
    if (args.options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    
    console.log(`✅ Task completed: ${result.title}`);
    console.log(`   Completed: ${formatDate(result.completed)}`);
    console.log('');
  } catch (error) {
    console.error('❌ Failed to complete task:', error.message);
    process.exit(1);
  }
}

function uncompleteTask(args) {
  try {
    if (!args.positional[0] || !args.positional[1]) {
      console.error('❌ List ID and task ID required');
      console.error('Usage: node gtasks.js uncomplete <listId> <taskId>');
      process.exit(1);
    }
    
    const client = new TasksClient();
    const listId = args.positional[0];
    const taskId = args.positional[1];
    
    const result = client.uncompleteTask(listId, taskId);
    
    if (args.options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    
    console.log(`🔄 Task marked as incomplete: ${result.title}`);
    console.log('');
  } catch (error) {
    console.error('❌ Failed to uncomplete task:', error.message);
    process.exit(1);
  }
}

function deleteTask(args) {
  try {
    if (!args.positional[0] || !args.positional[1]) {
      console.error('❌ List ID and task ID required');
      console.error('Usage: node gtasks.js delete <listId> <taskId>');
      process.exit(1);
    }
    
    const client = new TasksClient();
    const listId = args.positional[0];
    const taskId = args.positional[1];
    
    // Get task details for confirmation
    const task = client.getTask(listId, taskId);
    
    if (!args.options.yes && !args.options.y) {
      console.log(`⚠️  About to delete task: ${task.title}`);
      console.log('💡 Use --yes to skip this confirmation');
      console.log('⚠️  This action cannot be undone!');
      
      // In sandbox, we don't have readline, so require explicit --yes flag
      console.error('❌ Deletion cancelled. Use --yes flag to confirm.');
      process.exit(1);
    }
    
    client.deleteTask(listId, taskId);
    
    console.log(`🗑️  Task deleted: ${task.title}`);
    console.log('');
  } catch (error) {
    console.error('❌ Failed to delete task:', error.message);
    process.exit(1);
  }
}

function clearCompletedTasks(args) {
  try {
    if (!args.positional[0]) {
      console.error('❌ List ID required');
      console.error('Usage: node gtasks.js clear <listId>');
      process.exit(1);
    }
    
    const client = new TasksClient();
    const listId = args.positional[0];
    
    if (!args.options.yes && !args.options.y) {
      // Get completed tasks count for display
      const result = client.listTasks(listId, { showCompleted: true });
      const completedTasks = (result.items || []).filter(t => t.status === 'completed');
      
      if (completedTasks.length === 0) {
        console.log('📋 No completed tasks to clear');
        console.log('');
        return;
      }
      
      console.log(`⚠️  About to clear ${completedTasks.length} completed task(s) from list`);
      console.log('💡 Use --yes to skip this confirmation');
      console.log('⚠️  This action cannot be undone!');
      
      // In sandbox, we don't have readline, so require explicit --yes flag
      console.error('❌ Clear cancelled. Use --yes flag to confirm.');
      process.exit(1);
    }
    
    client.clearCompleted(listId);
    
    console.log('🧹 Completed tasks cleared');
    console.log('');
  } catch (error) {
    console.error('❌ Failed to clear completed tasks:', error.message);
    process.exit(1);
  }
}

function createTaskList(args) {
  try {
    if (!args.positional[0]) {
      console.error('❌ List title required');
      console.error('Usage: node gtasks.js create-list "List Name"');
      process.exit(1);
    }
    
    const client = new TasksClient();
    const title = args.positional[0];
    
    const result = client.createTaskList(title);
    
    if (args.options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    
    console.log(`✅ Task list created: ${result.title}`);
    console.log(`   ID: ${result.id}`);
    console.log('');
  } catch (error) {
    console.error('❌ Failed to create task list:', error.message);
    process.exit(1);
  }
}

function deleteTaskList(args) {
  try {
    if (!args.positional[0]) {
      console.error('❌ List ID required');
      console.error('Usage: node gtasks.js delete-list <listId>');
      process.exit(1);
    }
    
    const client = new TasksClient();
    const listId = args.positional[0];
    
    if (!args.options.yes && !args.options.y) {
      // Get list details for confirmation
      const list = client.getTaskList(listId);
      const tasks = client.listTasks(listId, { showCompleted: true });
      const taskCount = (tasks.items || []).length;
      
      console.log(`⚠️  About to DELETE entire task list: ${list.title}`);
      console.log(`⚠️  This will delete ${taskCount} task(s) permanently!`);
      console.log('💡 Use --yes to skip this confirmation');
      console.log('⚠️  This action cannot be undone!');
      
      // In sandbox, we don't have readline, so require explicit --yes flag
      console.error('❌ Deletion cancelled. Use --yes flag to confirm.');
      process.exit(1);
    }
    
    client.deleteTaskList(listId);
    
    console.log('🗑️  Task list deleted');
    console.log('');
  } catch (error) {
    console.error('❌ Failed to delete task list:', error.message);
    process.exit(1);
  }
}

// Main execution function
function main() {
  const parsed = parseArgs();
  
  if (!parsed.command || parsed.command === 'help' || parsed.options.help) {
    printHelp();
    return;
  }
  
  try {
    switch (parsed.command) {
      case 'auth':
        checkAuth();
        break;
        
      case 'lists':
        listTaskLists(parsed);
        break;
        
      case 'tasks':
        listTasks(parsed);
        break;
        
      case 'add':
        addTask(parsed);
        break;
        
      case 'get':
        getTask(parsed);
        break;
        
      case 'update':
        updateTask(parsed);
        break;
        
      case 'complete':
        completeTask(parsed);
        break;
        
      case 'uncomplete':
        uncompleteTask(parsed);
        break;
        
      case 'delete':
        deleteTask(parsed);
        break;
        
      case 'clear':
        clearCompletedTasks(parsed);
        break;
        
      case 'create-list':
        createTaskList(parsed);
        break;
        
      case 'delete-list':
        deleteTaskList(parsed);
        break;
        
      default:
        console.error(`❌ Unknown command: ${parsed.command}`);
        console.error('💡 Run: node gtasks.js help');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Execution failed:', error.message);
    
    if (error.message.includes('Secure token system')) {
      console.error('💡 This script must run in sandbox: pave-run gtasks.js');
    }
    
    if (parsed.options.json) {
      console.error(JSON.stringify({
        error: error.message,
        status: error.status,
        data: error.data
      }, null, 2));
    } else if (process.env.DEBUG) {
      console.error('Stack trace:', error.stack);
    }
    
    process.exit(1);
  }
}

// Execute
main();