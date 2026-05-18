/**
 * Shared Utilities - Used by both Classic and Programmable Todo
 */

// Toast notification system
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${message}</span>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Theme management
function initTheme() {
    const savedTheme = localStorage.getItem('todo_theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.textContent = '☀️';
    } else if (savedTheme === 'light') {
        document.body.classList.remove('dark-theme');
    } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            document.body.classList.add('dark-theme');
            const themeToggle = document.getElementById('themeToggle');
            if (themeToggle) themeToggle.textContent = '☀️';
        }
    }
}

function toggleTheme() {
    const isDark = document.body.classList.contains('dark-theme');
    if (isDark) {
        document.body.classList.remove('dark-theme');
        localStorage.setItem('todo_theme', 'light');
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.textContent = '🌙';
    } else {
        document.body.classList.add('dark-theme');
        localStorage.setItem('todo_theme', 'dark');
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.textContent = '☀️';
    }
}

// Format date
function formatDate(dateISO) {
    const date = new Date(dateISO);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

// Format relative time (e.g., "in 5 minutes", "2 hours ago")
function formatRelativeTime(dateISO) {
    const date = new Date(dateISO);
    const now = new Date();
    const diff = date - now;

    const absDiff = Math.abs(diff);
    const minutes = Math.floor(absDiff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (diff > 0) {
        if (minutes < 60) return `in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
        if (hours < 24) return `in ${hours} hour${hours !== 1 ? 's' : ''}`;
        return `in ${days} day${days !== 1 ? 's' : ''}`;
    } else {
        if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        return `${days} day${days !== 1 ? 's' : ''} ago`;
    }
}

// Generate unique ID
function generateId() {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 8);
}

// Request notification permission
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('This browser does not support notifications');
        return false;
    }

    if (Notification.permission === 'granted') {
        return true;
    }

    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    }

    return false;
}

// Send browser notification
function sendNotification(title, body, tag = null) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const options = {
        body: body,
        icon: '/assets/icon.png',
        badge: '/assets/badge.png',
        tag: tag,
        requireInteraction: true
    };

    new Notification(title, options);
}

// ========================================
// WORKING SOUND ALERT - Fixed Version
// ========================================

let audioContext = null;

function playAlertSound() {
    try {
        // Method 1: Simple Audio (most reliable)
        const audio = new Audio();

        // Create a simple beep using Web Audio API as fallback
        const beep = () => {
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

                // Resume context if suspended
                if (context.state === 'suspended') {
                    context.resume();
                }
            } catch (e) {
                console.log('Web Audio not supported');
            }
        };

        beep();

        // Also try HTML5 Audio as backup
        try {
            const beepSound = new Audio('data:audio/wav;base64,U3RlYWx0aCBzb3VuZA==');
            beepSound.play().catch(() => { });
        } catch (e) { }

    } catch (error) {
        console.log('Sound alert not supported, using visual alert');
        // Fallback: visual alert
        showVisualAlert();
    }
}

// Visual alert fallback
function showVisualAlert() {
    const alertDiv = document.createElement('div');
    alertDiv.innerHTML = '🔔 REMINDER! 🔔';
    alertDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--danger-color);
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        font-weight: bold;
        z-index: 10000;
        animation: pulse 0.5s ease 3;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(alertDiv);
    setTimeout(() => alertDiv.remove(), 3000);
}

// Also add this CSS animation to your style files
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0%, 100% { transform: scale(1); background: var(--danger-color); }
        50% { transform: scale(1.1); background: #ff4444; }
    }
`;
document.head.appendChild(style);

// Check if task is overdue
function isOverdue(dueDateTime) {
    return new Date(dueDateTime) < new Date();
}

// Check if task is due soon (within next X minutes)
function isDueSoon(dueDateTime, minutesBefore = 5) {
    const due = new Date(dueDateTime);
    const now = new Date();
    const diffMinutes = (due - now) / 60000;
    return diffMinutes > 0 && diffMinutes <= minutesBefore;
}