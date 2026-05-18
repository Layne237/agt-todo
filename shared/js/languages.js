/**
 * Complete Language Support - English & French
 * Works across all pages: Landing, Classic Todo, Programmable Todo
 */

const translations = {
    en: {
        // Common / Navigation
        home: "🏠 Home",
        classicMode: "📝 Classic Mode",
        programmableMode: "⏰ Programmable Mode",
        themeToggle: "Theme",

        // Landing Page
        heroBadge: "⚡ Productivity Suite 2.0",
        mainTitle: "Master Your Tasks<br>Two Powerful Ways",
        mainSubtitle: "Choose the perfect tool for your workflow",
        classicTitle: "Classic Todo",
        classicSubtitle: "Simple & Fast",
        programmableTitle: "Programmable Todo",
        programmableSubtitle: "Smart & Timely",
        classicFeatures: [
            "Simple task management",
            "Dark/Light mode",
            "Image attachments",
            "Keyboard shortcuts",
            "LocalStorage persistence",
            "Clean & intuitive UI"
        ],
        programmableFeatures: [
            "Set due dates & times",
            "Browser notifications",
            "Auto-complete at deadline",
            "Smart reminders",
            "Priority & categories",
            "Image attachments"
        ],
        classicBtnText: "Launch Classic Todo →",
        programmableBtnText: "Launch Programmable Todo →",
        statTasksLabel: "Tasks Managed",
        statUsersLabel: "Happy Users",
        statRemindersLabel: "Reminders Sent",
        footerText: "🚀 Boost your productivity | Made with ❤️",

        // Classic Todo
        addTask: "+ Add",
        taskPlaceholder: "What needs to be done? (max 120 chars)",
        all: "All",
        active: "Active",
        completed: "Completed",
        clearCompleted: "Clear Completed",
        tasksRemaining: "tasks remaining",
        emptyState: "Your todo list is empty",
        emptyStateAdd: "Add a task above to get started",
        attachImage: "Attach image",
        editTask: "Edit task",
        deleteTask: "Delete task",
        removeImage: "Remove image",
        confirmDelete: "Delete this task?",
        confirmClear: "Delete completed tasks?",

        // Programmable Todo
        createSmartTask: "📅 Create Smart Task",
        taskTitle: "Task title *",
        taskDescription: "Description (optional)",
        dueDate: "📅 Due Date",
        dueTime: "⏰ Due Time",
        priority: "🎯 Priority",
        low: "🟢 Low",
        medium: "🟡 Medium",
        high: "🔴 High",
        category: "📂 Category",
        work: "💼 Work",
        personal: "🏠 Personal",
        shopping: "🛒 Shopping",
        health: "🏃 Health",
        other: "📌 Other",
        reminder: "⏰ Reminder (minutes before)",
        noReminder: "No reminder",
        minutesBefore: "minutes before",
        addTaskBtn: "+ Add Programmable Task",
        total: "📊 Total",
        upcoming: "⏰ Upcoming",
        overdue: "⚠️ Overdue",
        allTasks: "All Tasks",
        noTasks: "No tasks found",
        createFirst: "Create your first programmable task above",

        // Notifications
        enableNotifications: "🔔 Enable notifications to get reminders for your tasks",
        enable: "Enable",
        dismiss: "Dismiss",

        // Messages
        taskAdded: "Task added successfully!",
        taskDeleted: "Task deleted",
        taskUpdated: "Task updated",
        taskCompleted: "Completed:",
        enterTitle: "Please enter a task title!",
        enterDateTime: "Please set due date and time!",
        invalidDateTime: "Invalid date/time!",
        deleteConfirm: "Delete this task?",
        reminderSoon: "Task due soon!",
        autoCompleted: "automatically completed",
        imageAttached: "Image attached!",
        imageRemoved: "Image removed",
        imageTooLarge: "Image must be less than 2MB!",
        invalidImage: "Please select an image file!",

        // Buttons
        edit: "✏️ Edit",
        delete: "🗑️ Delete",
        save: "Save",
        cancel: "Cancel",
        attach: "🖼️ Attach"
    },

    fr: {
        // Common / Navigation
        home: "🏠 Accueil",
        classicMode: "📝 Mode Classique",
        programmableMode: "⏰ Mode Programmable",
        themeToggle: "Thème",

        // Landing Page
        heroBadge: "⚡ Suite de Productivité 2.0",
        mainTitle: "Maîtrisez Vos Tâches<br>Deux Façons Puissantes",
        mainSubtitle: "Choisissez l'outil parfait pour votre workflow",
        classicTitle: "Todo Classique",
        classicSubtitle: "Simple & Rapide",
        programmableTitle: "Todo Programmable",
        programmableSubtitle: "Intelligent & Temporel",
        classicFeatures: [
            "Gestion simple des tâches",
            "Mode sombre/clair",
            "Pièces jointes d'images",
            "Raccourcis clavier",
            "Stockage local",
            "Interface propre et intuitive"
        ],
        programmableFeatures: [
            "Définir dates et heures",
            "Notifications navigateur",
            "Auto-complétion à échéance",
            "Rappels intelligents",
            "Priorités et catégories",
            "Pièces jointes d'images"
        ],
        classicBtnText: "Lancer Todo Classique →",
        programmableBtnText: "Lancer Todo Programmable →",
        statTasksLabel: "Tâches Gérées",
        statUsersLabel: "Utilisateurs Heureux",
        statRemindersLabel: "Rappels Envoyés",
        footerText: "🚀 Boostez votre productivité | Fait avec ❤️",

        // Classic Todo
        addTask: "+ Ajouter",
        taskPlaceholder: "Que devez-vous faire ? (max 120 caractères)",
        all: "Tous",
        active: "Actifs",
        completed: "Terminés",
        clearCompleted: "Effacer Terminés",
        tasksRemaining: "tâches restantes",
        emptyState: "Votre liste de tâches est vide",
        emptyStateAdd: "Ajoutez une tâche ci-dessus pour commencer",
        attachImage: "Attacher une image",
        editTask: "Modifier la tâche",
        deleteTask: "Supprimer la tâche",
        removeImage: "Supprimer l'image",
        confirmDelete: "Supprimer cette tâche ?",
        confirmClear: "Supprimer les tâches terminées ?",

        // Programmable Todo
        createSmartTask: "📅 Créer une Tâche Intelligente",
        taskTitle: "Titre de la tâche *",
        taskDescription: "Description (optionnelle)",
        dueDate: "📅 Date d'échéance",
        dueTime: "⏰ Heure d'échéance",
        priority: "🎯 Priorité",
        low: "🟢 Basse",
        medium: "🟡 Moyenne",
        high: "🔴 Haute",
        category: "📂 Catégorie",
        work: "💼 Travail",
        personal: "🏠 Personnel",
        shopping: "🛒 Courses",
        health: "🏃 Santé",
        other: "📌 Autre",
        reminder: "⏰ Rappel (minutes avant)",
        noReminder: "Pas de rappel",
        minutesBefore: "minutes avant",
        addTaskBtn: "+ Ajouter une Tâche Programmée",
        total: "📊 Total",
        upcoming: "⏰ À venir",
        overdue: "⚠️ En retard",
        allTasks: "Toutes les tâches",
        noTasks: "Aucune tâche trouvée",
        createFirst: "Créez votre première tâche programmable ci-dessus",

        // Notifications
        enableNotifications: "🔔 Activez les notifications pour recevoir des rappels",
        enable: "Activer",
        dismiss: "Fermer",

        // Messages
        taskAdded: "Tâche ajoutée avec succès !",
        taskDeleted: "Tâche supprimée",
        taskUpdated: "Tâche mise à jour",
        taskCompleted: "Terminée :",
        enterTitle: "Veuillez saisir un titre de tâche !",
        enterDateTime: "Veuillez définir la date et l'heure !",
        invalidDateTime: "Date/heure invalide !",
        deleteConfirm: "Supprimer cette tâche ?",
        reminderSoon: "Tâche bientôt due !",
        autoCompleted: "automatiquement terminée",
        imageAttached: "Image attachée !",
        imageRemoved: "Image supprimée",
        imageTooLarge: "L'image doit être inférieure à 2 Mo !",
        invalidImage: "Veuillez sélectionner un fichier image !",

        // Buttons
        edit: "✏️ Modifier",
        delete: "🗑️ Supprimer",
        save: "Enregistrer",
        cancel: "Annuler",
        attach: "🖼️ Attacher"
    }
};

let currentLanguage = 'en';

// Initialize language from localStorage
function initLanguage() {
    const saved = localStorage.getItem('app_language');
    if (saved === 'fr') {
        currentLanguage = 'fr';
    } else {
        currentLanguage = 'en';
    }
}

// Get translation
function t(key) {
    return translations[currentLanguage][key] || translations['en'][key] || key;
}

// Set language and update all pages
function setLanguage(lang) {
    if (lang !== 'en' && lang !== 'fr') return;
    currentLanguage = lang;
    localStorage.setItem('app_language', lang);

    // Update all translatable elements on the current page
    updatePageTranslations();

    // Show feedback
    showLanguageToast(lang === 'en' ? 'Language: English' : 'Langue: Français');
}

// Update all translatable elements on current page
function updatePageTranslations() {
    // Update elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = t(key);
        if (translation === key) return; // Skip if no translation found

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = translation;
        } else {
            el.textContent = translation;
        }
    });

    // Update Navigation (using flexible selectors to match different pages)
    const navMappings = {
        'navHome': 'home', 'homeBtnClassic': 'home', 'homeBtnProgrammable': 'home',
        'navClassic': 'classicMode', 'classicBtnProgrammable': 'classicMode',
        'navProgrammable': 'programmableMode', 'programmableBtnClassic': 'programmableMode'
    };

    Object.entries(navMappings).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = t(key);
    });

    // Update filter buttons (if on classic page)
    document.querySelectorAll('.filter-btn').forEach(btn => {
        const filter = btn.getAttribute('data-filter');
        if (filter) btn.textContent = t(filter);
    });

    // Bulk update simple IDs
    ['clearCompletedBtn', 'addBtn', 'addTaskBtn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = t(id.replace('Btn', '').toLowerCase() === 'addtask' ? 'addTaskBtn' : id.replace('Btn', ''));
    });

    // Update reminder options
    const reminderSelect = document.getElementById('reminderMinutes');
    if (reminderSelect && reminderSelect.options[0]) {
        reminderSelect.options[0].text = t('noReminder');
        for (let i = 1; i < reminderSelect.options.length; i++) {
            const val = reminderSelect.options[i].value;
            reminderSelect.options[i].text = `${val} ${t('minutesBefore')}`;
        }
    }

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        const filter = btn.getAttribute('data-filter');
        if (filter === 'all') btn.textContent = t('allTasks');
        if (filter === 'upcoming') btn.textContent = t('upcoming');
        if (filter === 'overdue') btn.textContent = t('overdue');
        if (filter === 'completed') btn.textContent = t('completed');
    });

    // Update stat labels
    const totalLabel = document.getElementById('totalLabel');
    const completedLabel = document.getElementById('completedLabel');
    const upcomingLabel = document.getElementById('upcomingLabel');
    const overdueLabel = document.getElementById('overdueLabel');

    if (totalLabel) totalLabel.textContent = t('total');
    if (completedLabel) completedLabel.textContent = t('completed');
    if (upcomingLabel) upcomingLabel.textContent = t('upcoming');
    if (overdueLabel) overdueLabel.textContent = t('overdue');

    // Update notification banner
    const bannerText = document.getElementById('bannerText');
    const enableBtn = document.getElementById('enableNotificationsBtn');
    const dismissBtn = document.getElementById('dismissBannerBtn');

    if (bannerText) bannerText.textContent = t('enableNotifications');
    if (enableBtn) enableBtn.textContent = t('enable');
    if (dismissBtn) dismissBtn.textContent = t('dismiss');

    console.log(`✅ Page translated to: ${currentLanguage.toUpperCase()}`);
}

// Show language change toast
function showLanguageToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        background: var(--accent-color, #6366f1);
        color: white;
        padding: 10px 20px;
        border-radius: 10px;
        z-index: 10000;
        animation: fadeInUp 0.3s ease;
        font-size: 14px;
        font-weight: bold;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

// Add language selector to any page
function addLanguageSelector() {
    // Check if selector already exists
    if (document.querySelector('.language-selector-global')) return;

    const selector = document.createElement('div');
    selector.className = 'language-selector-global';
    selector.innerHTML = `
        <button class="lang-btn-en" onclick="setLanguage('en')">🇬🇧 EN</button>
        <button class="lang-btn-fr" onclick="setLanguage('fr')">🇫🇷 FR</button>
    `;
    selector.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        display: flex;
        gap: 8px;
        background: var(--bg-secondary, white);
        padding: 6px 12px;
        border-radius: 40px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        border: 1px solid var(--border-color, #e0e0e0);
    `;

    const style = document.createElement('style');
    style.textContent = `
        .language-selector-global button {
            background: none;
            border: none;
            padding: 4px 12px;
            border-radius: 30px;
            cursor: pointer;
            font-weight: 600;
            font-size: 12px;
            transition: all 0.2s;
        }
        .language-selector-global button:hover {
            background: var(--accent-color, #6366f1);
            color: white;
            transform: scale(1.05);
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(selector);
}

// Run when page loads
document.addEventListener('DOMContentLoaded', () => {
    initLanguage();
    addLanguageSelector();
    updatePageTranslations();
});