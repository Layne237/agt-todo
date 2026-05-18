/**
 * Classic Todo App - Simple Task Management
 * Version: 2.0.0
 */

// State
let tasks = [];
let currentFilter = "all";
let db = null;
let currentUploadingTaskId = null;

// DOM Elements
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

// IndexedDB Setup
function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ClassicTodoDB', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('images')) {
                db.createObjectStore('images', { keyPath: 'id' });
            }
        };
    });
}

// Image Functions
async function saveImage(taskId, imageFile) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
            const imageId = `${taskId}_${Date.now()}`;
            const imageData = {
                id: imageId,
                taskId: taskId,
                data: reader.result,
                type: imageFile.type,
                name: imageFile.name
            };
            const transaction = db.transaction(['images'], 'readwrite');
            const store = transaction.objectStore('images');
            store.put(imageData);
            resolve(imageId);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(imageFile);
    });
}

async function loadImage(imageId) {
    if (!imageId) return null;
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['images'], 'readonly');
        const store = transaction.objectStore('images');
        const request = store.get(imageId);
        request.onsuccess = () => resolve(request.result ? request.result.data : null);
        request.onerror = () => reject(request.error);
    });
}

async function deleteImage(imageId) {
    if (!imageId) return;
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        const request = store.delete(imageId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Helper Functions
function showError(message) {
    const errorDiv = domElements.errorMessage;
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 3000);
}

function showSuccess(message) {
    showToast(message, 'success');
}

function formatDate(dateISO) {
    const date = new Date(dateISO);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function generateId() {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 8);
}

function updateRemainingCount() {
    const remainingTasks = tasks.filter(task => !task.completed).length;
    domElements.remainingCount.textContent = remainingTasks;
}

function getFilteredTasks() {
    switch (currentFilter) {
        case 'active': return tasks.filter(task => !task.completed);
        case 'completed': return tasks.filter(task => task.completed);
        default: return tasks;
    }
}

// Storage
function saveToLocalStorage() {
    try {
        const tasksToSave = tasks.map(task => ({
            id: task.id,
            text: task.text,
            completed: task.completed,
            createdAt: task.createdAt,
            formattedDate: task.formattedDate,
            imageId: task.imageId || null
        }));
        localStorage.setItem('classic_todo_app', JSON.stringify(tasksToSave));
    } catch (error) {
        console.error('Failed to save:', error);
    }
}

function loadFromLocalStorage() {
    const stored = localStorage.getItem('classic_todo_app');
    if (stored) {
        try {
            tasks = JSON.parse(stored);
            tasks = tasks.map(task => ({
                ...task,
                formattedDate: formatDate(task.createdAt)
            }));
        } catch (error) {
            tasks = [];
        }
    } else {
        tasks = [];
    }
}

// CRUD Operations
function addTask() {
    const taskText = domElements.taskInput.value.trim();
    if (!taskText) {
        showError('Please enter a task!');
        return;
    }

    const newTask = {
        id: generateId(),
        text: taskText,
        completed: false,
        createdAt: new Date().toISOString(),
        formattedDate: formatDate(new Date().toISOString()),
        imageId: null
    };

    tasks.unshift(newTask);
    saveToLocalStorage();
    renderTasks();
    domElements.taskInput.value = '';
    domElements.taskInput.focus();
    showSuccess('Task added!');
}

async function deleteTask(id) {
    const task = tasks.find(t => t.id === id);
    if (confirm('Delete this task?')) {
        if (task.imageId) await deleteImage(task.imageId);
        tasks = tasks.filter(task => task.id !== id);
        saveToLocalStorage();
        renderTasks();
        showSuccess('Task deleted');
    }
}

function toggleComplete(id) {
    const task = tasks.find(task => task.id === id);
    if (task) {
        task.completed = !task.completed;
        saveToLocalStorage();
        renderTasks();
    }
}

function editTask(id, newText) {
    newText = newText.trim();
    if (!newText) {
        showError('Task cannot be empty!');
        renderTasks();
        return;
    }

    const task = tasks.find(task => task.id === id);
    if (task) {
        task.text = newText;
        saveToLocalStorage();
        renderTasks();
        showSuccess('Task updated');
    }
}

async function clearCompletedTasks() {
    const completedTasks = tasks.filter(task => task.completed);
    if (completedTasks.length === 0) {
        showError('No completed tasks!');
        return;
    }

    if (confirm(`Delete ${completedTasks.length} completed tasks?`)) {
        for (const task of completedTasks) {
            if (task.imageId) await deleteImage(task.imageId);
        }
        tasks = tasks.filter(task => !task.completed);
        saveToLocalStorage();
        renderTasks();
        showSuccess(`Cleared ${completedTasks.length} tasks`);
    }
}

// Image Attachment
async function attachImage(taskId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,image/webp';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            showError('Image must be < 2MB!');
            return;
        }

        currentUploadingTaskId = taskId;
        renderTasks();

        try {
            const task = tasks.find(t => t.id === taskId);
            if (task.imageId) await deleteImage(task.imageId);
            const imageId = await saveImage(taskId, file);
            task.imageId = imageId;
            saveToLocalStorage();
            renderTasks();
            showSuccess('Image attached!');
        } catch (error) {
            showError('Failed to attach image');
        } finally {
            currentUploadingTaskId = null;
        }
    };

    input.click();
}

async function removeImage(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task.imageId) return;

    if (confirm('Remove image?')) {
        await deleteImage(task.imageId);
        task.imageId = null;
        saveToLocalStorage();
        renderTasks();
        showSuccess('Image removed');
    }
}

function showFullImage(imageUrl) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    modal.classList.add('active');
    modalImg.src = imageUrl;
}

// Render
async function renderTasks() {
    const filteredTasks = getFilteredTasks();
    const taskList = domElements.taskList;
    taskList.innerHTML = '';

    if (filteredTasks.length === 0) {
        taskList.innerHTML = `
            <li class="empty-state">
                <div class="empty-state-content">
                    <span class="empty-emoji">📭</span>
                    <p>No tasks found</p>
                </div>
            </li>
        `;
    } else {
        for (const task of filteredTasks) {
            const taskItem = await createTaskElement(task);
            taskList.appendChild(taskItem);
        }
    }

    updateRemainingCount();
}

async function createTaskElement(task) {
    const li = document.createElement('li');
    li.className = 'task-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-checkbox';
    checkbox.checked = task.completed;
    checkbox.addEventListener('change', () => toggleComplete(task.id));

    const contentDiv = document.createElement('div');
    contentDiv.className = 'task-content';

    const taskText = document.createElement('div');
    taskText.className = `task-text ${task.completed ? 'completed' : ''}`;
    taskText.textContent = task.text;
    taskText.addEventListener('dblclick', () => {
        const newText = prompt('Edit task:', task.text);
        if (newText && newText !== task.text) editTask(task.id, newText);
    });

    const taskDate = document.createElement('div');
    taskDate.className = 'task-date';
    taskDate.textContent = `📅 ${task.formattedDate}`;

    contentDiv.appendChild(taskText);
    contentDiv.appendChild(taskDate);

    if (task.imageId) {
        const imageData = await loadImage(task.imageId);
        if (imageData) {
            const imageDiv = document.createElement('div');
            imageDiv.className = 'task-image';

            const img = document.createElement('img');
            img.src = imageData;
            img.className = 'task-image-thumb';
            img.addEventListener('click', () => showFullImage(imageData));

            const removeBtn = document.createElement('button');
            removeBtn.innerHTML = '✕';
            removeBtn.className = 'remove-image-btn';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeImage(task.id);
            });

            imageDiv.appendChild(img);
            imageDiv.appendChild(removeBtn);
            contentDiv.appendChild(imageDiv);
        }
    }

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'task-actions';

    const attachBtn = document.createElement('button');
    attachBtn.innerHTML = currentUploadingTaskId === task.id ? '<span class="spinner"></span>' : '🖼️';
    attachBtn.className = 'attach-image-btn';
    attachBtn.disabled = currentUploadingTaskId === task.id;
    attachBtn.addEventListener('click', () => attachImage(task.id));

    const editBtn = document.createElement('button');
    editBtn.innerHTML = '✏️';
    editBtn.className = 'edit-btn';
    editBtn.addEventListener('click', () => {
        const newText = prompt('Edit task:', task.text);
        if (newText && newText !== task.text) editTask(task.id, newText);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.className = 'delete-btn';
    deleteBtn.addEventListener('click', () => deleteTask(task.id));

    actionsDiv.appendChild(attachBtn);
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);

    li.appendChild(checkbox);
    li.appendChild(contentDiv);
    li.appendChild(actionsDiv);

    return li;
}

// Filters
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

function setFilter(filter) {
    currentFilter = filter;
    updateFilterButtons();
    renderTasks();
}

// Event Listeners
function attachEventListeners() {
    domElements.addBtn.addEventListener('click', addTask);
    domElements.taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });

    domElements.filterBtns.forEach(btn => {
        btn.addEventListener('click', () => setFilter(btn.getAttribute('data-filter')));
    });

    domElements.clearCompletedBtn.addEventListener('click', clearCompletedTasks);
    domElements.themeToggle.addEventListener('click', toggleTheme);

    const modal = document.getElementById('imageModal');
    const closeBtn = document.querySelector('.modal-close');
    if (modal && closeBtn) {
        modal.addEventListener('click', () => modal.classList.remove('active'));
        closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    }
}

// Initialize
async function init() {
    await initIndexedDB();
    loadFromLocalStorage();
    initTheme();
    attachEventListeners();
    await renderTasks();
    console.log('✅ Classic Todo initialized');
}

document.addEventListener('DOMContentLoaded', init);