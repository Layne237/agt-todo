/**
 * Programmable Todo App - Smart Tasks with Notifications & Images
 * Version: 2.0.0
 */

// ========================================
// STATE MANAGEMENT
// ========================================

let tasks = [];
let currentFilter = "all";
let notificationInterval = null;
let notificationPermission = false;
let imageDB = null;
let currentUploadingTaskId = null;

// ========================================
// DOM ELEMENTS
// ========================================

const domElements = {
    taskTitle: document.getElementById('taskTitle'),
    taskDesc: document.getElementById('taskDesc'),
    dueDate: document.getElementById('dueDate'),
    dueTime: document.getElementById('dueTime'),
    priority: document.getElementById('priority'),
    category: document.getElementById('category'),
    reminderMinutes: document.getElementById('reminderMinutes'),
    addBtn: document.getElementById('addTaskBtn'),
    taskList: document.getElementById('taskList'),
    filterBtns: document.querySelectorAll('.tab-btn'),
    totalCount: document.getElementById('totalCount'),
    completedCount: document.getElementById('completedCount'),
    upcomingCount: document.getElementById('upcomingCount'),
    overdueCount: document.getElementById('overdueCount'),
    themeToggle: document.getElementById('themeToggle')
};

// ========================================
// INDEXEDDB FOR IMAGES
// ========================================

function initImageDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ProgrammableTodoImages', 2);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            imageDB = request.result;
            console.log('✅ Image DB initialized');
            resolve(imageDB);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('images')) {
                const store = db.createObjectStore('images', { keyPath: 'id' });
                store.createIndex('taskId', 'taskId', { unique: false });
                console.log('✅ Image store created');
            }
        };
    });
}

async function saveTaskImage(taskId, imageFile) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async () => {
            const imageId = `${taskId}_${Date.now()}`;
            const imageData = {
                id: imageId,
                taskId: taskId,
                data: reader.result,
                type: imageFile.type,
                name: imageFile.name,
                size: imageFile.size,
                createdAt: new Date().toISOString()
            };

            const transaction = imageDB.transaction(['images'], 'readwrite');
            const store = transaction.objectStore('images');
            const request = store.put(imageData);

            request.onsuccess = () => {
                console.log('✅ Image saved:', imageId);
                resolve(imageId);
            };
            request.onerror = () => reject(request.error);
        };

        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(imageFile);
    });
}

async function loadTaskImage(imageId) {
    if (!imageId || !imageDB) return null;

    return new Promise((resolve, reject) => {
        const transaction = imageDB.transaction(['images'], 'readonly');
        const store = transaction.objectStore('images');
        const request = store.get(imageId);

        request.onsuccess = () => {
            resolve(request.result ? request.result.data : null);
        };
        request.onerror = () => reject(request.error);
    });
}

async function deleteTaskImage(imageId) {
    if (!imageId || !imageDB) return;

    return new Promise((resolve, reject) => {
        const transaction = imageDB.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        const request = store.delete(imageId);

        request.onsuccess = () => {
            console.log('✅ Image deleted:', imageId);
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

async function deleteAllTaskImages(taskId) {
    if (!imageDB) return;

    return new Promise((resolve, reject) => {
        const transaction = imageDB.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        const index = store.index('taskId');
        const request = index.getAllKeys(IDBKeyRange.only(taskId));

        request.onsuccess = () => {
            const keys = request.result;
            keys.forEach(key => store.delete(key));
            console.log(`✅ Deleted ${keys.length} images for task ${taskId}`);
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

// ========================================
// HELPER FUNCTIONS
// ========================================

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#6366f1'};
        color: white;
        padding: 12px 20px;
        border-radius: 10px;
        z-index: 10000;
        animation: fadeInUp 0.3s ease;
        font-size: 14px;
        font-weight: bold;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function formatRelativeTime(dateISO) {
    const date = new Date(dateISO);
    const now = new Date();
    const diff = date - now;

    const absDiff = Math.abs(diff);
    const minutes = Math.floor(absDiff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (diff > 0) {
        if (minutes < 60) return `in ${minutes} min`;
        if (hours < 24) return `in ${hours} hour${hours !== 1 ? 's' : ''}`;
        return `in ${days} day${days !== 1 ? 's' : ''}`;
    } else {
        if (minutes < 60) return `${minutes} min ago`;
        if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        return `${days} day${days !== 1 ? 's' : ''} ago`;
    }
}

function isOverdue(dueDateTime) {
    return new Date(dueDateTime) < new Date();
}

function isDueSoon(dueDateTime, minutesBefore = 5) {
    const due = new Date(dueDateTime);
    const now = new Date();
    const diffMinutes = (due - now) / 60000;
    return diffMinutes > 0 && diffMinutes <= minutesBefore;
}

function getPriorityIcon(priority) {
    switch (priority) {
        case 'high': return '🔴';
        case 'medium': return '🟡';
        case 'low': return '🟢';
        default: return '⚪';
    }
}

function getCategoryIcon(category) {
    const icons = {
        work: '💼',
        personal: '🏠',
        shopping: '🛒',
        health: '🏃',
        other: '📌'
    };
    return icons[category] || '📌';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function generateId() {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 8);
}

// ========================================
// STORAGE FUNCTIONS
// ========================================

function saveTasks() {
    const tasksToSave = tasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        dueDateTime: task.dueDateTime,
        completed: task.completed,
        createdAt: task.createdAt,
        priority: task.priority,
        category: task.category,
        reminderMinutes: task.reminderMinutes,
        reminderSent: task.reminderSent || false,
        imageId: task.imageId || null
    }));
    localStorage.setItem('programmable_todo_app', JSON.stringify(tasksToSave));
}

function loadTasks() {
    const stored = localStorage.getItem('programmable_todo_app');
    if (stored) {
        try {
            tasks = JSON.parse(stored);
        } catch (error) {
            tasks = [];
        }
    } else {
        tasks = [];
    }
}

// ========================================
// IMAGE ATTACHMENT FUNCTIONS
// ========================================

async function attachImageToTask(taskId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,image/webp';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            showToast('Image must be less than 2MB!', 'error');
            return;
        }

        if (!file.type.startsWith('image/')) {
            showToast('Please select an image file!', 'error');
            return;
        }

        currentUploadingTaskId = taskId;
        renderTasks();

        try {
            const task = tasks.find(t => t.id === taskId);
            if (task.imageId) {
                await deleteTaskImage(task.imageId);
            }
            const imageId = await saveTaskImage(taskId, file);
            task.imageId = imageId;
            saveTasks();
            renderTasks();
            showToast('✅ Image attached successfully!', 'success');
        } catch (error) {
            console.error('Failed to attach image:', error);
            showToast('Failed to attach image', 'error');
        } finally {
            currentUploadingTaskId = null;
        }
    };

    input.click();
}

async function removeImageFromTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.imageId) return;

    if (confirm('Remove this image from the task?')) {
        await deleteTaskImage(task.imageId);
        task.imageId = null;
        saveTasks();
        renderTasks();
        showToast('✅ Image removed', 'success');
    }
}

async function viewTaskImage(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.imageId) return;

    const imageData = await loadTaskImage(task.imageId);
    if (imageData) {
        showImageModal(imageData);
    }
}

function showImageModal(imageData) {
    let modal = document.getElementById('imageModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'imageModal';
        modal.className = 'image-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="modal-close">&times;</span>
                <img id="modalImage" class="modal-image">
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('modal-close')) {
                modal.classList.remove('active');
            }
        });
    }

    const modalImg = document.getElementById('modalImage');
    modalImg.src = imageData;
    modal.classList.add('active');
}

// ========================================
// CRUD OPERATIONS
// ========================================

async function addTask() {
    const title = domElements.taskTitle.value.trim();
    const dueDate = domElements.dueDate.value;
    const dueTime = domElements.dueTime.value;

    if (!title) {
        showToast('Please enter a task title!', 'error');
        return;
    }

    if (!dueDate || !dueTime) {
        showToast('Please set due date and time!', 'error');
        return;
    }

    const dueDateTime = new Date(`${dueDate}T${dueTime}`).toISOString();

    const newTask = {
        id: generateId(),
        title: title,
        description: domElements.taskDesc.value.trim(),
        dueDateTime: dueDateTime,
        completed: false,
        createdAt: new Date().toISOString(),
        priority: domElements.priority.value,
        category: domElements.category.value,
        reminderMinutes: parseInt(domElements.reminderMinutes.value),
        reminderSent: false,
        imageId: null
    };

    tasks.unshift(newTask);
    saveTasks();
    renderTasks();

    // Clear form
    domElements.taskTitle.value = '';
    domElements.taskDesc.value = '';
    domElements.dueDate.value = '';
    domElements.dueTime.value = '';
    domElements.taskTitle.focus();

    showToast('✅ Task added successfully!', 'success');
}

async function deleteTask(id) {
    if (confirm('Delete this task?')) {
        const task = tasks.find(t => t.id === id);
        if (task && task.imageId) {
            await deleteTaskImage(task.imageId);
        }
        tasks = tasks.filter(task => task.id !== id);
        saveTasks();
        renderTasks();
        showToast('✅ Task deleted', 'success');
    }
}

function toggleComplete(id) {
    const task = tasks.find(task => task.id === id);
    if (task) {
        task.completed = !task.completed;
        saveTasks();
        renderTasks();
        if (task.completed) {
            showToast(`✅ Completed: ${task.title}`, 'success');
        }
    }
}

function editTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const newTitle = prompt('Edit title:', task.title);
    if (!newTitle || newTitle === task.title) return;

    task.title = newTitle;
    saveTasks();
    renderTasks();
    showToast('✅ Task updated', 'success');
}

// ========================================
// NOTIFICATION SYSTEM
// ========================================

async function initNotifications() {
    if (!('Notification' in window)) {
        console.log('This browser does not support notifications');
        return false;
    }

    if (Notification.permission === 'granted') {
        notificationPermission = true;
        return true;
    }

    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        notificationPermission = permission === 'granted';
        return notificationPermission;
    }

    return false;
}

function sendBrowserNotification(title, body, tag) {
    if (!notificationPermission) return;

    new Notification(title, {
        body: body,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⏰</text></svg>',
        tag: tag,
        requireInteraction: true
    });
}

function playAlertSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(context.destination);

        oscillator.frequency.value = 880;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.3;

        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + 0.5);
        oscillator.stop(context.currentTime + 0.5);

        if (context.state === 'suspended') {
            context.resume();
        }
    } catch (error) {
        console.log('Sound not supported');
    }
}

function checkRemindersAndAutoComplete() {
    const now = new Date();
    let needsRender = false;

    tasks.forEach(task => {
        if (task.completed) return;

        const dueDate = new Date(task.dueDateTime);

        // Auto-complete if past due
        if (now >= dueDate && !task.completed) {
            task.completed = true;
            needsRender = true;
            sendBrowserNotification(
                '✅ Task Auto-Completed',
                `"${task.title}" was automatically completed at its deadline.`,
                task.id
            );
            showToast(`⏰ "${task.title}" auto-completed`, 'info');
        }

        // Send reminder if due soon and not sent
        if (task.reminderMinutes > 0 && !task.reminderSent) {
            const reminderTime = new Date(dueDate.getTime() - (task.reminderMinutes * 60000));
            if (now >= reminderTime && now < dueDate) {
                task.reminderSent = true;
                needsRender = true;
                sendBrowserNotification(
                    '⏰ Task Reminder',
                    `"${task.title}" is due in ${task.reminderMinutes} minutes!`,
                    task.id
                );
                playAlertSound();
                showToast(`🔔 Reminder: "${task.title}" due soon!`, 'warning');
            }
        }
    });

    if (needsRender) {
        saveTasks();
        renderTasks();
    }
}

// ========================================
// STATISTICS & FILTERING
// ========================================

function updateStats() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const upcoming = tasks.filter(t => !t.completed && !isOverdue(t.dueDateTime)).length;
    const overdue = tasks.filter(t => !t.completed && isOverdue(t.dueDateTime)).length;

    if (domElements.totalCount) domElements.totalCount.textContent = total;
    if (domElements.completedCount) domElements.completedCount.textContent = completed;
    if (domElements.upcomingCount) domElements.upcomingCount.textContent = upcoming;
    if (domElements.overdueCount) domElements.overdueCount.textContent = overdue;
}

function getFilteredTasks() {
    switch (currentFilter) {
        case 'upcoming':
            return tasks.filter(t => !t.completed && !isOverdue(t.dueDateTime));
        case 'overdue':
            return tasks.filter(t => !t.completed && isOverdue(t.dueDateTime));
        case 'completed':
            return tasks.filter(t => t.completed);
        default:
            return tasks;
    }
}

function setFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.getAttribute('data-filter') === filter) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    renderTasks();
}

// ========================================
// RENDER FUNCTIONS
// ========================================

async function renderTasks() {
    const filteredTasks = getFilteredTasks();
    const taskList = domElements.taskList;

    if (filteredTasks.length === 0) {
        taskList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-content">
                    <span class="empty-emoji">📭</span>
                    <p>No tasks found</p>
                    <small>Create your first programmable task above</small>
                </div>
            </div>
        `;
        updateStats();
        return;
    }

    let html = '';

    for (const task of filteredTasks) {
        const dueDate = new Date(task.dueDateTime);
        const isTaskOverdue = isOverdue(task.dueDateTime) && !task.completed;
        const isTaskDueSoon = isDueSoon(task.dueDateTime, 60) && !task.completed;

        // Handle Image Thumbnail
        let imagePreviewHtml = '';
        if (currentUploadingTaskId === task.id) {
            imagePreviewHtml = `<div class="task-image-preview">⏳ Uploading...</div>`;
        } else if (task.imageId) {
            // We can't await inside this string template easily, 
            // so we show the "View" button which calls viewTaskImage
            imagePreviewHtml = `
                <div class="task-image-preview" data-action="viewImage" data-id="${task.id}">
                    🖼️ <span style="text-decoration: underline; cursor: pointer;">View Attached Image</span>
                </div>`;
        }

        html += `
            <div class="task-card ${task.completed ? 'completed' : ''} ${isTaskOverdue ? 'overdue' : ''} ${task.priority}-priority">
                <div class="task-header">
                    <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} data-action="toggle" data-id="${task.id}">
                    <div class="task-title-section">
                        <div class="task-title">${escapeHtml(task.title)}</div>
                        ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
                        ${imagePreviewHtml}
                    </div>
                </div>
                
                <div class="task-meta">
                    <span class="meta-item">📅 ${dueDate.toLocaleString()}</span>
                    <span class="meta-item ${isTaskDueSoon ? 'due-soon' : ''}">⏰ ${formatRelativeTime(task.dueDateTime)}</span>
                    <span class="meta-item priority-badge priority-${task.priority}">${getPriorityIcon(task.priority)} ${task.priority.toUpperCase()}</span>
                    <span class="meta-item">${getCategoryIcon(task.category)} ${task.category}</span>
                    ${task.reminderMinutes > 0 ? `<span class="meta-item">🔔 ${task.reminderMinutes}min before</span>` : ''}
                </div>
                
                <div class="task-actions">
                    <button class="attach-image-btn" data-action="attach" data-id="${task.id}">🖼️ ${task.imageId ? 'Change' : 'Add'} Image</button>
                    ${task.imageId ? `<button class="remove-image-btn" data-action="removeImage" data-id="${task.id}">🗑️ Remove</button>` : ''}
                    <button class="edit-btn" data-action="edit" data-id="${task.id}">✏️ Edit</button>
                    <button class="delete-btn" data-action="delete" data-id="${task.id}">🗑️ Delete</button>
                </div>
            </div>
        `;
    }

    taskList.innerHTML = html;
    updateStats();
}

// ========================================
// THEME MANAGEMENT
// ========================================

function initTheme() {
    const savedTheme = localStorage.getItem('todo_theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        if (domElements.themeToggle) domElements.themeToggle.textContent = '☀️';
    } else if (savedTheme === 'light') {
        document.body.classList.remove('dark-theme');
        if (domElements.themeToggle) domElements.themeToggle.textContent = '🌙';
    } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            document.body.classList.add('dark-theme');
            if (domElements.themeToggle) domElements.themeToggle.textContent = '☀️';
        }
    }
}

function toggleTheme() {
    const isDark = document.body.classList.contains('dark-theme');
    if (isDark) {
        document.body.classList.remove('dark-theme');
        localStorage.setItem('todo_theme', 'light');
        if (domElements.themeToggle) domElements.themeToggle.textContent = '🌙';
    } else {
        document.body.classList.add('dark-theme');
        localStorage.setItem('todo_theme', 'dark');
        if (domElements.themeToggle) domElements.themeToggle.textContent = '☀️';
    }
}

// ========================================
// EVENT LISTENERS
// ========================================

function attachEventListeners() {
    // Task List Event Delegation
    if (domElements.taskList) {
        domElements.taskList.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.getAttribute('data-action');
            const id = target.getAttribute('data-id');

            if (action === 'delete') deleteTask(id);
            if (action === 'edit') editTask(id);
            if (action === 'attach') attachImageToTask(id);
            if (action === 'removeImage') removeImageFromTask(id);
            if (action === 'viewImage') viewTaskImage(id);
        });
    }

    if (domElements.addBtn) domElements.addBtn.addEventListener('click', addTask);
    if (domElements.taskTitle) {
        domElements.taskTitle.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addTask();
        });
    }

    if (domElements.filterBtns) {
        domElements.filterBtns.forEach(btn => {
            btn.addEventListener('click', () => setFilter(btn.getAttribute('data-filter')));
        });
    }

    if (domElements.themeToggle) domElements.themeToggle.addEventListener('click', toggleTheme);

    // Set default date/time
    const now = new Date();
    const defaultDate = now.toISOString().split('T')[0];
    const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (domElements.dueDate) domElements.dueDate.value = defaultDate;
    if (domElements.dueTime) domElements.dueTime.value = defaultTime;
}

// ========================================
// MAKE FUNCTIONS GLOBAL FOR HTML
// ========================================

window.toggleComplete = toggleComplete;
window.deleteTask = deleteTask;
window.editTask = editTask;
window.attachImageToTask = attachImageToTask;
window.removeImageFromTask = removeImageFromTask;
window.viewTaskImage = viewTaskImage;
window.setFilter = setFilter;

// ========================================
// INITIALIZATION
// ========================================

async function init() {
    console.log('🚀 Initializing Programmable Todo...');

    await initImageDB();
    loadTasks();
    initTheme();
    attachEventListeners();
    await initNotifications();
    renderTasks();

    // Start reminder checker (every 30 seconds)
    notificationInterval = setInterval(() => {
        checkRemindersAndAutoComplete();
    }, 30000);

    console.log(`✅ Programmable Todo initialized with ${tasks.length} tasks`);
}

// Cleanup
window.addEventListener('beforeunload', () => {
    if (notificationInterval) clearInterval(notificationInterval);
});

// Start the app
document.addEventListener('DOMContentLoaded', init);