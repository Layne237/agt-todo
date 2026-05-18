/**
 * AGT-Todo App - Complete JavaScript
 * Phase 1: Core functionality with localStorage persistence
 * Version: 1.0.0
 */

// ========================================
// 1. STATE MANAGEMENT
// ========================================

// Application state
let tasks = [];
let currentFilter = "all"; // 'all', 'active', 'completed'

// ========================================
// 2. DOM ELEMENTS CACHE
// ========================================

const domElements = {
    taskInput: document.getElementById('taskInput'),
    addBtn: document.getElementById('addBtn'),
    taskList: document.getElementById('taskList'),
    filterBtns: document.querySelectorAll('.filter-btn'),
    clearCompletedBtn: document.getElementById('clearCompletedBtn'),
    remainingCount: document.getElementById('remainingCount'),
    themeToggle: document.getElementById('themeToggle'),
    errorMessage: document.getElementById('errorMessage')
};

// ========================================
// 3. HELPER FUNCTIONS
// ========================================

/**
 * Display temporary error message
 * @param {string} message - Error message to display
 */
function showError(message) {
    const errorDiv = domElements.errorMessage;
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';

    // Auto-hide after 2 seconds
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 2000);
}

/**
 * Format date for display
 * @param {string} dateISO - ISO date string
 * @returns {string} Formatted date (DD/MM/YYYY HH:MM)
 */
function formatDate(dateISO) {
    const date = new Date(dateISO);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Generate unique ID for each task
 * @returns {string} Unique ID
 */
function generateId() {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 8);
}

/**
 * Update remaining tasks counter
 */
function updateRemainingCount() {
    const remainingTasks = tasks.filter(task => !task.completed).length;
    domElements.remainingCount.textContent = remainingTasks;
}

/**
 * Filter tasks based on current filter
 * @returns {Array} Filtered tasks
 */
function getFilteredTasks() {
    switch (currentFilter) {
        case 'active':
            return tasks.filter(task => !task.completed);
        case 'completed':
            return tasks.filter(task => task.completed);
        default:
            return tasks;
    }
}

// ========================================
// 4. LOCALSTORAGE OPERATIONS
// ========================================

/**
 * Save tasks to localStorage
 */
function saveToLocalStorage() {
    try {
        localStorage.setItem('github_todo_app', JSON.stringify(tasks));
    } catch (error) {
        console.error('Failed to save to localStorage:', error);
        showError('Storage limit reached. Please delete some tasks.');
    }
}

/**
 * Load tasks from localStorage
 */
function loadFromLocalStorage() {
    const stored = localStorage.getItem('github_todo_app');
    if (stored) {
        try {
            tasks = JSON.parse(stored);
            // Ensure each task has all required properties
            tasks = tasks.map(task => ({
                ...task,
                formattedDate: formatDate(task.createdAt)
            }));
        } catch (error) {
            console.error('Failed to load from localStorage:', error);
            tasks = [];
        }
    } else {
        // Empty state - no tasks
        tasks = [];
    }
}

// ========================================
// 5. CORE CRUD OPERATIONS
// ========================================

/**
 * Add a new task
 */
function addTask() {
    const taskText = domElements.taskInput.value.trim();

    // Validation
    if (!taskText) {
        showError('Please enter a task!');
        return;
    }

    if (taskText.length > 120) {
        showError('Task cannot exceed 120 characters!');
        return;
    }

    // Create new task object
    const newTask = {
        id: generateId(),
        text: taskText,
        completed: false,
        createdAt: new Date().toISOString(),
        formattedDate: formatDate(new Date().toISOString())
    };

    // Add to tasks array (add to beginning for newest first)
    tasks.unshift(newTask);

    // Save and refresh
    saveToLocalStorage();
    renderTasks();

    // Clear input field
    domElements.taskInput.value = '';
    domElements.taskInput.focus();
}

/**
 * Delete a task by ID
 * @param {string} id - Task ID to delete
 */
function deleteTask(id) {
    if (confirm('Are you sure you want to delete this task?')) {
        tasks = tasks.filter(task => task.id !== id);
        saveToLocalStorage();
        renderTasks();
    }
}

/**
 * Toggle task completion status
 * @param {string} id - Task ID to toggle
 */
function toggleComplete(id) {
    const task = tasks.find(task => task.id === id);
    if (task) {
        task.completed = !task.completed;
        saveToLocalStorage();
        renderTasks();
    }
}

/**
 * Edit task text
 * @param {string} id - Task ID to edit
 * @param {string} newText - New task text
 */
function editTask(id, newText) {
    newText = newText.trim();

    if (!newText) {
        showError('Task cannot be empty!');
        renderTasks(); // Re-render to restore original text
        return;
    }

    if (newText.length > 120) {
        showError('Task cannot exceed 120 characters!');
        renderTasks();
        return;
    }

    const task = tasks.find(task => task.id === id);
    if (task) {
        task.text = newText;
        saveToLocalStorage();
        renderTasks();
    }
}

/**
 * Clear all completed tasks with undo option
 */
let lastDeletedTasks = [];

function clearCompletedTasks() {
    const completedTasks = tasks.filter(task => task.completed);

    if (completedTasks.length === 0) {
        showError('✨ No completed tasks to clear!');
        return;
    }

    // Store deleted tasks for potential undo
    lastDeletedTasks = [...completedTasks];

    const confirmMsg = `Delete ${completedTasks.length} completed task(s)?\n\nYou can undo this action.`;

    if (confirm(confirmMsg)) {
        tasks = tasks.filter(task => !task.completed);
        saveToLocalStorage();
        renderTasks();

        // Show undo option
        showUndoOption();
    }
}

/**
 * Show undo option after clearing completed tasks
 */
function showUndoOption() {
    const undoDiv = document.createElement('div');
    undoDiv.className = 'undo-notification';
    undoDiv.innerHTML = `
        <span>🗑️ ${lastDeletedTasks.length} task(s) removed</span>
        <button id="undoBtn" class="btn-undo">↩️ Undo</button>
    `;
    undoDiv.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        padding: var(--spacing-md);
        box-shadow: var(--shadow-md);
        z-index: 1000;
        display: flex;
        gap: var(--spacing-md);
        align-items: center;
        animation: slideUp 0.3s ease;
    `;

    document.body.appendChild(undoDiv);

    const undoBtn = document.getElementById('undoBtn');
    undoBtn.addEventListener('click', () => {
        tasks = [...lastDeletedTasks, ...tasks];
        saveToLocalStorage();
        renderTasks();
        undoDiv.remove();
        showError('✅ Undo successful!');
    });

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (undoDiv.parentNode) {
            undoDiv.remove();
        }
    }, 5000);
}

// ========================================
// 6. RENDER FUNCTIONS
// ========================================

/**
 * Render tasks based on current filter
 */
function renderTasks() {
    const filteredTasks = getFilteredTasks();
    const taskList = domElements.taskList;

    // Clear current list
    taskList.innerHTML = '';

    // Check if no tasks exist
    if (filteredTasks.length === 0) {
        const emptyMessage = document.createElement('li');
        emptyMessage.className = 'empty-state';

        let messageText = '';
        if (tasks.length === 0) {
            messageText = `
                <div class="empty-state-content">
                    <span class="empty-emoji">📭</span>
                    <p>Your todo list is empty</p>
                    <small>Add a task above to get started</small>
                </div>
            `;
        } else if (currentFilter === 'active') {
            messageText = `
                <div class="empty-state-content">
                    <span class="empty-emoji">✅</span>
                    <p>No active tasks</p>
                    <small>All tasks are completed!</small>
                </div>
            `;
        } else if (currentFilter === 'completed') {
            messageText = `
                <div class="empty-state-content">
                    <span class="empty-emoji">📝</span>
                    <p>No completed tasks yet</p>
                    <small>Complete some tasks to see them here</small>
                </div>
            `;
        }

        emptyMessage.innerHTML = messageText;
        taskList.appendChild(emptyMessage);
    } else {
        // Render each task
        filteredTasks.forEach(task => {
            const taskItem = createTaskElement(task);
            taskList.appendChild(taskItem);
        });
    }

    /**
  * Update remaining tasks counter with animation
  */
    function updateRemainingCount() {
        const remainingTasks = tasks.filter(task => !task.completed).length;
        const counterElement = domElements.remainingCount;

        // Add animation class
        counterElement.style.animation = 'none';
        counterElement.offsetHeight; // Trigger reflow
        counterElement.style.animation = 'fadeIn 0.3s ease';

        counterElement.textContent = remainingTasks;

        // Update document title with count
        const taskText = remainingTasks === 1 ? 'task' : 'tasks';
        document.title = remainingTasks > 0 ? `(${remainingTasks}) AGT-Todo` : 'AGT-Todo';
    }
}

/**
 * Create DOM element for a single task
 * @param {Object} task - Task object
 * @returns {HTMLLIElement} Task list item
 */
function createTaskElement(task) {
    const li = document.createElement('li');
    li.className = 'task-item';
    li.dataset.id = task.id;

    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-checkbox';
    checkbox.checked = task.completed;
    checkbox.addEventListener('change', () => toggleComplete(task.id));

    // Task content container
    const contentDiv = document.createElement('div');
    contentDiv.className = 'task-content';

    // Task text
    const taskText = document.createElement('div');
    taskText.className = `task-text ${task.completed ? 'completed' : ''}`;
    taskText.textContent = task.text;

    // Make text editable on double-click
    taskText.addEventListener('dblclick', () => {
        const newText = prompt('Edit task:', task.text);
        if (newText !== null && newText !== task.text) {
            editTask(task.id, newText);
        }
    });

    // Task date
    const taskDate = document.createElement('div');
    taskDate.className = 'task-date';
    taskDate.textContent = `📅 ${task.formattedDate}`;

    contentDiv.appendChild(taskText);
    contentDiv.appendChild(taskDate);

    // Action buttons container
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'task-actions';

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.innerHTML = '✏️';
    editBtn.title = 'Edit task';
    editBtn.addEventListener('click', () => {
        const newText = prompt('Edit task:', task.text);
        if (newText !== null && newText !== task.text) {
            editTask(task.id, newText);
        }
    });

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'Delete task';
    deleteBtn.addEventListener('click', () => deleteTask(task.id));

    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);

    li.appendChild(checkbox);
    li.appendChild(contentDiv);
    li.appendChild(actionsDiv);

    return li;
}

// ========================================
// 7. FILTER FUNCTIONS
// ========================================

/**
 * Update active filter button styling
 */
function updateFilterButtons() {
    domElements.filterBtns.forEach(btn => {
        const filterValue = btn.getAttribute('data-filter');
        if (filterValue === currentFilter) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

/**
 * Set current filter
 * @param {string} filter - Filter value ('all', 'active', 'completed')
 */
function setFilter(filter) {
    currentFilter = filter;
    updateFilterButtons();
    renderTasks();
}

// ========================================
// 8. THEME MANAGEMENT
// ========================================

/**
 * Initialize theme based on user preference or saved setting
 */
function initTheme() {
    const savedTheme = localStorage.getItem('todo_theme');

    if (savedTheme) {
        // Use saved preference
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
            domElements.themeToggle.textContent = '☀️';
        } else {
            document.body.classList.remove('dark-theme');
            domElements.themeToggle.textContent = '🌙';
        }
    } else {
        // Check system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            document.body.classList.add('dark-theme');
            domElements.themeToggle.textContent = '☀️';
        }
    }
}

/**
 * Toggle between light and dark themes
 */
function toggleTheme() {
    const isDark = document.body.classList.contains('dark-theme');

    if (isDark) {
        document.body.classList.remove('dark-theme');
        domElements.themeToggle.textContent = '🌙';
        localStorage.setItem('todo_theme', 'light');
    } else {
        document.body.classList.add('dark-theme');
        domElements.themeToggle.textContent = '☀️';
        localStorage.setItem('todo_theme', 'dark');
    }
}

// ========================================
// 9. EVENT LISTENERS SETUP
// ========================================

/**
 * Attach all event listeners
 */
function attachEventListeners() {
    // Add task on button click
    domElements.addBtn.addEventListener('click', addTask);

    // Add task on Enter key
    domElements.taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addTask();
        }
    });

    // Global keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Filter buttons
    domElements.filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.getAttribute('data-filter');
            setFilter(filter);
        });
    });

    // Clear completed tasks
    domElements.clearCompletedBtn.addEventListener('click', clearCompletedTasks);

    // Theme toggle
    domElements.themeToggle.addEventListener('click', toggleTheme);
}

// ========================================
// 11. KEYBOARD SHORTCUTS
// ========================================

/**
 * Handle keyboard shortcuts
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleKeyboardShortcuts(e) {
    // Ctrl/Cmd + N: Focus on add task input
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        domElements.taskInput.focus();
        showError('📝 Focus moved to task input');
    }

    // Ctrl/Cmd + D: Clear all completed tasks
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        clearCompletedTasks();
    }

    // Ctrl/Cmd + T: Toggle theme
    if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        toggleTheme();
    }

    // Escape: Clear error message
    if (e.key === 'Escape') {
        domElements.errorMessage.style.display = 'none';
    }

    // ? : Show shortcuts help
    if (e.key === '?') {
        showShortcutsHelp();
    }
}

/**
 * Display keyboard shortcuts help
 */
function showShortcutsHelp() {
    const shortcuts = [
        '⌘/Ctrl + N → Focus on task input',
        '⌘/Ctrl + D → Clear completed tasks',
        '⌘/Ctrl + T → Toggle theme',
        'ESC → Hide error messages',
        '? → Show this help'
    ];

    alert('🎯 Keyboard Shortcuts:\n\n' + shortcuts.join('\n'));
}

// ========================================
// 12. IMPORT/EXPORT FUNCTIONALITY
// ========================================

/**
 * Export tasks to JSON file
 */
function exportTasks() {
    if (tasks.length === 0) {
        showError('No tasks to export!');
        return;
    }

    const dataStr = JSON.stringify(tasks, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `todo-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);

    showError(`✅ Exported ${tasks.length} tasks successfully!`);
}

/**
 * Import tasks from JSON file
 * @param {File} file - JSON file to import
 */
function importTasks(file) {
    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            const importedTasks = JSON.parse(e.target.result);

            if (!Array.isArray(importedTasks)) {
                throw new Error('Invalid format');
            }

            // Validate and sanitize imported tasks
            const validTasks = importedTasks.filter(task =>
                task.id &&
                task.text &&
                typeof task.completed === 'boolean' &&
                task.createdAt
            ).map(task => ({
                ...task,
                formattedDate: formatDate(task.createdAt)
            }));

            if (validTasks.length === 0) {
                showError('No valid tasks found in file!');
                return;
            }

            // Merge with existing tasks (add to beginning)
            tasks = [...validTasks, ...tasks];
            saveToLocalStorage();
            renderTasks();

            showError(`✅ Imported ${validTasks.length} tasks successfully!`);
        } catch (error) {
            showError('Invalid file format! Please use a valid JSON backup.');
        }
    };

    reader.onerror = function () {
        showError('Error reading file!');
    };

    reader.readAsText(file);
}

/**
 * Create import/export buttons in the UI
 */
function addImportExportButtons() {
    const filterSection = document.querySelector('.filter-section');

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'import-export-buttons';
    buttonGroup.style.display = 'flex';
    buttonGroup.style.gap = 'var(--spacing-sm)';

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-secondary';
    exportBtn.innerHTML = '💾 Export';
    exportBtn.title = 'Export tasks to JSON file';
    exportBtn.addEventListener('click', exportTasks);

    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-secondary';
    importBtn.innerHTML = '📂 Import';
    importBtn.title = 'Import tasks from JSON file';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            importTasks(e.target.files[0]);
        }
        fileInput.value = ''; // Reset input
    });

    importBtn.addEventListener('click', () => fileInput.click());

    buttonGroup.appendChild(exportBtn);
    buttonGroup.appendChild(importBtn);
    buttonGroup.appendChild(fileInput);

    filterSection.appendChild(buttonGroup);
}

// ========================================
// 13. STORAGE MONITORING
// ========================================

/**
 * Check localStorage available space
 */
function checkStorageSpace() {
    try {
        const test = 'storageTest';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);

        // Estimate used space
        let total = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage[key].length + key.length;
            }
        }

        const usedKB = (total / 1024).toFixed(2);
        const maxKB = 5120; // 5MB typical limit

        if (usedKB > maxKB * 0.8) {
            console.warn(`Storage usage: ${usedKB}KB / ${maxKB}KB`);
            showError(`⚠️ Storage at ${Math.round((usedKB / maxKB) * 100)}% capacity. Consider deleting old tasks.`);
        }
    } catch (e) {
        console.error('Storage check failed:', e);
    }
}

// ========================================
// 10. INITIALIZATION
// ========================================

/**
 * Initialize the application
 */
function init() {
    loadFromLocalStorage();
    initTheme();
    attachEventListeners();
    renderTasks();
    addImportExportButtons(); // Add this line
    checkStorageSpace(); // Add this line

    console.log('AGT-Todo App initialized successfully!');
    console.log(`Loaded ${tasks.length} tasks from localStorage`);
}

// Start the app when DOM is fully loaded
document.addEventListener('DOMContentLoaded', init);