/**
 * Programmable Todo - Alarm system
 *
 * - Checks for due alarms every 5 s while the page is open (the service worker
 *   covers the time the page is closed - see service-worker.js).
 * - Rings a full-screen alarm: escalating two-tone sound, repeating vibration,
 *   "fired at" time and a live countdown to the due time.
 * - Keeps the "Missed Alarms" list: alarms that fired while the app was closed
 *   and nobody acted on them, or that were discovered more than 15 min late.
 *
 * Uses globals from app.js: tasks, reloadTasks, mutateTask, renderTasks,
 * showToast, escapeHtml, getPriorityIcon, getCategoryIcon.
 */

const ALARM_CHECK_MS = 5000;
const RING_INTERVAL_MS = 700;
const RING_START_VOLUME = 0.15;
const RING_ESCALATION_SECONDS = 10;
const VIBRATE_REPEAT_MS = 3500;

let alarmCheckIntervalId = null;
let countdownIntervalId = null;
let countdownSecondsLeft = ALARM_CHECK_MS / 1000;
let activeAlarm = null; // { taskId, kind, at, firedAt, source, test?, snapshot }
let alarmQueue = [];
let ringIntervalId = null;
let vibrateIntervalId = null;
let alarmCountdownIntervalId = null;
let alarmAudioCtx = null;
let alarmMasterGain = null;
let missedAlarms = [];

const alarmEls = {
    modal: document.getElementById('alarmModal'),
    kindLabel: document.getElementById('alarmKindLabel'),
    taskTitle: document.getElementById('alarmTaskTitle'),
    taskDesc: document.getElementById('alarmTaskDesc'),
    priority: document.getElementById('alarmPriority'),
    category: document.getElementById('alarmCategory'),
    dueTime: document.getElementById('alarmDueTime'),
    firedAt: document.getElementById('alarmFiredAt'),
    countdown: document.getElementById('alarmCountdown'),
    soundHint: document.getElementById('alarmSoundHint'),
    snoozeBtn: document.getElementById('alarmSnoozeBtn'),
    completeBtn: document.getElementById('alarmCompleteBtn'),
    dismissBtn: document.getElementById('alarmDismissBtn'),
    missedSection: document.getElementById('missedAlarmsSection'),
    missedList: document.getElementById('missedAlarmsList'),
    missedCount: document.getElementById('missedAlarmsCount'),
    nextCheckIndicator: document.getElementById('nextCheckIndicator')
};

function alarmLog(message) {
    AlarmStore.log('Page', message);
}

// ========================================
// SOUND - escalating two-tone ring
// ========================================

function getAlarmAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!alarmAudioCtx) {
        alarmAudioCtx = new AudioContextClass();
    }
    if (alarmAudioCtx.state === 'suspended') {
        alarmAudioCtx.resume().catch(() => { });
    }
    return alarmAudioCtx;
}

/**
 * Browsers only allow audio after the user has interacted with the page.
 * Unlock it on the first tap/key press so a later alarm can ring by itself.
 */
function unlockAlarmAudio() {
    const unlock = () => {
        getAlarmAudioContext();
        updateSoundHint();
        document.removeEventListener('pointerdown', unlock);
        document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
}

/** Chrome blocks (and logs an error for) vibrate() before the user has tapped the page. */
function canVibrate() {
    return 'vibrate' in navigator && (!navigator.userActivation || navigator.userActivation.hasBeenActive);
}

function playAlarmTone() {
    // Two-tone "ring" burst, like a phone alarm chirp.
    const context = getAlarmAudioContext();
    if (!context || !alarmMasterGain) return;

    [880, 660].forEach((freq, i) => {
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(alarmMasterGain);

        const startTime = context.currentTime + i * 0.18;
        oscillator.frequency.value = freq;
        oscillator.type = 'square';
        gainNode.gain.setValueAtTime(0.0001, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.5, startTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.16);

        oscillator.start(startTime);
        oscillator.stop(startTime + 0.18);
    });
}

function startRinging() {
    stopRinging();

    const context = getAlarmAudioContext();
    if (context) {
        // Every tone goes through one master gain that ramps up over 10 s.
        alarmMasterGain = context.createGain();
        alarmMasterGain.connect(context.destination);
        alarmMasterGain.gain.setValueAtTime(RING_START_VOLUME, context.currentTime);
        alarmMasterGain.gain.linearRampToValueAtTime(1.0, context.currentTime + RING_ESCALATION_SECONDS);
    }
    playAlarmTone();
    ringIntervalId = setInterval(playAlarmTone, RING_INTERVAL_MS);

    if (canVibrate()) {
        navigator.vibrate(AlarmStore.VIBRATION_PATTERN);
        vibrateIntervalId = setInterval(() => {
            if (canVibrate()) navigator.vibrate(AlarmStore.VIBRATION_PATTERN);
        }, VIBRATE_REPEAT_MS);
    }

    // If audio is still locked, tell the user one tap will start it.
    setTimeout(updateSoundHint, 400);
}

function stopRinging() {
    if (ringIntervalId) {
        clearInterval(ringIntervalId);
        ringIntervalId = null;
    }
    if (vibrateIntervalId) {
        clearInterval(vibrateIntervalId);
        vibrateIntervalId = null;
    }
    if (canVibrate()) navigator.vibrate(0);
    if (alarmMasterGain) {
        alarmMasterGain.disconnect();
        alarmMasterGain = null;
    }
}

function updateSoundHint() {
    if (!alarmEls.soundHint) return;
    const locked = !alarmAudioCtx || alarmAudioCtx.state !== 'running';
    alarmEls.soundHint.style.display = activeAlarm && locked ? 'block' : 'none';
}

// ========================================
// CHECKING & QUEUE
// ========================================

async function checkAlarms() {
    const now = Date.now();
    let fired;
    try {
        fired = await AlarmStore.fireDueAlarms(now);
    } catch (error) {
        console.error('[Alarm Check] failed', error);
        return;
    }

    if (fired.length) {
        await reloadTasks();
        renderTasks();
        await handleFiredAlarms(fired.map(a => ({ taskId: a.taskId, kind: a.kind, at: a.at, firedAt: now })), 'page');
    }

    processAlarmQueue();
    resetCountdown();
}

/**
 * Rings alarms that are recent; alarms found more than 15 min after their
 * time (laptop asleep, app closed without push...) go to Missed Alarms.
 */
async function handleFiredAlarms(list, source) {
    const now = Date.now();
    const late = list.filter(a => now - a.at > AlarmStore.MISSED_AFTER_MS);
    const recent = list.filter(a => now - a.at <= AlarmStore.MISSED_AFTER_MS);

    recent.forEach(alarm => {
        alarmLog(`${alarm.kind} alarm fired for ${alarm.taskId} (${source})`);
        enqueueAlarm(Object.assign({ source: source }, alarm));
    });
    if (late.length) {
        alarmLog(`${late.length} alarm(s) were missed (${source})`);
        await AlarmStore.addMissedAlarms(late);
        await refreshMissedAlarms(true);
    }
    processAlarmQueue();
}

function enqueueAlarm(alarm) {
    const alreadyQueued = alarmQueue.some(a => a.taskId === alarm.taskId) ||
        (activeAlarm && activeAlarm.taskId === alarm.taskId);
    if (!alreadyQueued) {
        alarmQueue.push(alarm);
    }
}

function processAlarmQueue() {
    if (activeAlarm || alarmQueue.length === 0) return;

    const next = alarmQueue.shift();
    const task = next.test ? next.snapshot : tasks.find(t => t.id === next.taskId);

    // Task may have been deleted/completed since it was queued.
    if (!task || task.completed) {
        processAlarmQueue();
        return;
    }

    activeAlarm = Object.assign({}, next, { snapshot: task });
    showAlarmModal(task, activeAlarm);
    startRinging();

    // The service worker already showed a system notification for alarms it fired.
    // For alarms the page found itself, add one when the user can't see the page.
    if (next.source === 'page' && document.visibilityState !== 'visible') {
        const n = AlarmStore.buildAlarmNotification(task, next.kind, next.at, next.firedAt);
        NotificationManager.show(n.title, n.options);
    }
}

// ========================================
// ALARM MODAL
// ========================================

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    return `${minutes}:${seconds}`;
}

function updateAlarmCountdown() {
    if (!activeAlarm || !alarmEls.countdown) return;
    const diff = AlarmStore.getEffectiveDueTime(activeAlarm.snapshot) - Date.now();
    alarmEls.countdown.textContent = diff > 0
        ? `⏳ Due in ${formatDuration(diff)}`
        : `⌛ Overdue by ${formatDuration(-diff)}`;
    alarmEls.countdown.classList.toggle('overdue', diff <= 0);
}

function showAlarmModal(task, alarm) {
    if (!alarmEls.modal) return;

    alarmEls.kindLabel.textContent = alarm.kind === 'reminder' ? '⏰ REMINDER' : '🚨 TASK DUE';
    alarmEls.taskTitle.textContent = task.title;
    alarmEls.taskDesc.textContent = task.description || '';
    alarmEls.taskDesc.style.display = task.description ? 'block' : 'none';
    alarmEls.priority.textContent = `${getPriorityIcon(task.priority)} ${task.priority.toUpperCase()}`;
    alarmEls.category.textContent = `${getCategoryIcon(task.category)} ${task.category}`;
    alarmEls.dueTime.textContent = `📅 ${new Date(task.dueDateTime).toLocaleString()}`;
    alarmEls.firedAt.textContent = `🔔 Alarm fired at ${new Date(alarm.firedAt || Date.now()).toLocaleTimeString()}`;

    updateAlarmCountdown();
    clearInterval(alarmCountdownIntervalId);
    alarmCountdownIntervalId = setInterval(updateAlarmCountdown, 1000);

    alarmEls.modal.classList.add('active');
    if (alarmEls.snoozeBtn) alarmEls.snoozeBtn.focus();
}

/** Closes the modal, stops the ring and returns the alarm that was showing. */
function takeActiveAlarm() {
    const alarm = activeAlarm;
    if (alarmEls.modal) alarmEls.modal.classList.remove('active');
    clearInterval(alarmCountdownIntervalId);
    stopRinging();
    activeAlarm = null;
    updateSoundHint();
    if (alarm) NotificationManager.closeByTag('task-' + alarm.taskId);
    // Small delay before showing the next queued alarm, so the UI doesn't jump instantly.
    setTimeout(processAlarmQueue, 300);
    return alarm;
}

async function handleAlarmComplete() {
    const alarm = takeActiveAlarm();
    if (!alarm) return;
    if (!alarm.test) {
        await mutateTask(alarm.taskId, task => { task.completed = true; });
        await AlarmStore.removeMissedAlarms(alarm.taskId);
        renderTasks();
        refreshMissedAlarms(false);
    }
    alarmLog(`alarm completed: ${alarm.taskId}`);
    showToast(`✅ Completed: ${alarm.snapshot.title}`, 'success');
}

async function handleAlarmSnooze() {
    const alarm = takeActiveAlarm();
    if (!alarm) return;
    if (!alarm.test) {
        await mutateTask(alarm.taskId, task => AlarmStore.applySnooze(task, alarm.kind, Date.now()));
        await AlarmStore.removeMissedAlarms(alarm.taskId);
        renderTasks();
        refreshMissedAlarms(false);
    }
    alarmLog(`alarm snoozed: ${alarm.taskId}`);
    showToast(`🔕 Snoozed "${alarm.snapshot.title}" for ${AlarmStore.SNOOZE_MINUTES} minutes`, 'info');
}

async function handleAlarmDismiss() {
    const alarm = takeActiveAlarm();
    if (!alarm) return;
    // Dismiss only silences the alarm: the task stays active (and shows as overdue).
    if (!alarm.test) {
        await AlarmStore.removeMissedAlarms(alarm.taskId);
        refreshMissedAlarms(false);
    }
    alarmLog(`alarm dismissed: ${alarm.taskId}`);
    showToast('🔇 Alarm dismissed - the task stays active', 'info');
}

/** Opens the alarm for a task when the user tapped its notification. */
function showAlarmFromNotification(taskId, kind, firedAt) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.completed) return;
    AlarmStore.removeMissedAlarms(taskId).then(() => refreshMissedAlarms(false));
    enqueueAlarm({
        taskId: taskId,
        kind: kind === 'reminder' ? 'reminder' : 'due',
        at: AlarmStore.getEffectiveDueTime(task),
        firedAt: firedAt || Date.now(),
        source: 'notification'
    });
    processAlarmQueue();
}

/** Handles /programmable/index.html?alarm=<taskId>&kind=due (opened from a notification). */
function handleLaunchAlarm() {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('alarm');
    if (!taskId) return;
    history.replaceState(null, '', window.location.pathname);
    alarmLog(`opened from notification for ${taskId}`);
    showAlarmFromNotification(taskId, params.get('kind'), Number(params.get('firedAt')) || Date.now());
}

function testAlarm(delaySeconds) {
    const ring = () => {
        const snapshot = {
            id: '__test__',
            title: 'Test Alarm Task',
            description: 'This is a test of the alarm system.',
            dueDateTime: new Date().toISOString(),
            priority: 'high',
            category: 'other',
            reminderMinutes: 0,
            completed: false
        };
        enqueueAlarm({ taskId: '__test__', kind: 'due', at: Date.now(), firedAt: Date.now(), source: 'test', test: true, snapshot: snapshot });
        processAlarmQueue();
        alarmLog('test alarm triggered');
    };
    if (delaySeconds > 0) {
        alarmLog(`in-page test alarm in ${delaySeconds}s`);
        setTimeout(ring, delaySeconds * 1000);
    } else {
        ring();
    }
}

// ========================================
// MISSED ALARMS
// ========================================

async function refreshMissedAlarms(announce) {
    // Drop entries whose task has been completed or deleted meanwhile.
    const openTaskIds = new Set(tasks.filter(t => !t.completed).map(t => t.id));
    missedAlarms = await AlarmStore.updateMeta('missedAlarms', [], list => list.filter(m => openTaskIds.has(m.taskId)));
    renderMissedAlarms();

    if (announce && missedAlarms.length) {
        const n = missedAlarms.length;
        showToast(`⚠️ ${n} task${n !== 1 ? 's were' : ' was'} missed while you were away`, 'error');
        alarmLog(`${n} missed alarm(s) shown`);
    }
}

function toLocalInputValue(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderMissedAlarms() {
    if (!alarmEls.missedSection) return;
    alarmEls.missedSection.style.display = missedAlarms.length ? 'block' : 'none';
    if (alarmEls.missedCount) alarmEls.missedCount.textContent = missedAlarms.length;

    alarmEls.missedList.innerHTML = missedAlarms.map(missed => {
        const task = tasks.find(t => t.id === missed.taskId);
        if (!task) return '';
        const defaultTime = toLocalInputValue(new Date(Date.now() + 3600000));
        return `
            <div class="missed-item" data-id="${task.id}">
                <div class="missed-info">
                    <div class="missed-title">${escapeHtml(task.title)}</div>
                    <div class="missed-meta">
                        ${missed.kind === 'reminder' ? '⏰ Reminder' : '🚨 Due'} ·
                        ${new Date(missed.at).toLocaleString()} (${formatRelativeTime(new Date(missed.at).toISOString())})
                    </div>
                </div>
                <div class="missed-actions">
                    <button class="btn-small missed-btn-complete" data-missed="complete" data-id="${task.id}">✅ Complete</button>
                    <button class="btn-small" data-missed="plus-hour" data-id="${task.id}">⏰ +1 hour</button>
                    <button class="btn-small" data-missed="reschedule" data-id="${task.id}">📅 Reschedule</button>
                    <button class="btn-small btn-secondary" data-missed="dismiss" data-id="${task.id}" aria-label="Dismiss">✕</button>
                </div>
                <div class="missed-reschedule" style="display: none;">
                    <input type="datetime-local" class="form-input" value="${defaultTime}">
                    <button class="btn-small missed-btn-complete" data-missed="save-reschedule" data-id="${task.id}">Save</button>
                </div>
            </div>
        `;
    }).join('');
}

async function rescheduleTask(taskId, when) {
    await mutateTask(taskId, task => {
        task.dueDateTime = new Date(when).toISOString();
        task.snoozedUntil = null;
        task.remindAgainAt = null;
        task.dueFired = false;
        task.reminderFired = false;
    });
    showToast(`📅 Rescheduled for ${new Date(when).toLocaleString()}`, 'success');
}

async function handleMissedAction(action, taskId, item) {
    if (action === 'reschedule') {
        const form = item.querySelector('.missed-reschedule');
        form.style.display = form.style.display === 'none' ? 'flex' : 'none';
        return;
    }

    if (action === 'save-reschedule') {
        const value = item.querySelector('input[type="datetime-local"]').value;
        const when = new Date(value);
        if (!value || isNaN(when) || when <= new Date()) {
            showToast('Please pick a time in the future!', 'error');
            return;
        }
        await rescheduleTask(taskId, when);
    } else if (action === 'plus-hour') {
        await rescheduleTask(taskId, Date.now() + 3600000);
    } else if (action === 'complete') {
        await mutateTask(taskId, task => { task.completed = true; });
        showToast('✅ Task completed', 'success');
    }

    await AlarmStore.removeMissedAlarms(taskId);
    alarmLog(`missed alarm ${action}: ${taskId}`);
    renderTasks();
    await refreshMissedAlarms(false);
}

// ========================================
// DEBUG COUNTDOWN (shown in the dev menu)
// ========================================

function resetCountdown() {
    countdownSecondsLeft = ALARM_CHECK_MS / 1000;
    updateCountdownIndicator();
}

function updateCountdownIndicator() {
    if (alarmEls.nextCheckIndicator) {
        alarmEls.nextCheckIndicator.textContent = `Next in-page check in ${countdownSecondsLeft}s`;
    }
}

// ========================================
// INIT
// ========================================

function initAlarmSystem() {
    // Alarm modal buttons (no click-outside-to-close: must use a button)
    if (alarmEls.completeBtn) alarmEls.completeBtn.addEventListener('click', handleAlarmComplete);
    if (alarmEls.snoozeBtn) alarmEls.snoozeBtn.addEventListener('click', handleAlarmSnooze);
    if (alarmEls.dismissBtn) alarmEls.dismissBtn.addEventListener('click', handleAlarmDismiss);

    // Tapping anywhere on a ringing alarm unlocks the sound if the browser blocked it.
    if (alarmEls.modal) {
        alarmEls.modal.addEventListener('pointerdown', () => {
            if (activeAlarm && (!alarmAudioCtx || alarmAudioCtx.state !== 'running')) {
                getAlarmAudioContext();
                startRinging();
            }
        });
    }

    if (alarmEls.missedList) {
        alarmEls.missedList.addEventListener('click', (e) => {
            const button = e.target.closest('[data-missed]');
            if (!button) return;
            handleMissedAction(button.dataset.missed, button.dataset.id, button.closest('.missed-item'));
        });
    }

    unlockAlarmAudio();
}

function startAlarmLoop() {
    alarmCheckIntervalId = setInterval(checkAlarms, ALARM_CHECK_MS);

    // Background tabs throttle setInterval; catch up as soon as the tab is visible again.
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState !== 'visible') return;
        await reloadTasks();
        renderTasks();
        await refreshMissedAlarms(false);
        checkAlarms();
    });

    // 1-second debug countdown ("next check in Xs")
    countdownIntervalId = setInterval(() => {
        countdownSecondsLeft = Math.max(0, countdownSecondsLeft - 1);
        updateCountdownIndicator();
    }, 1000);
}

window.addEventListener('beforeunload', () => {
    if (alarmCheckIntervalId) clearInterval(alarmCheckIntervalId);
    if (countdownIntervalId) clearInterval(countdownIntervalId);
    stopRinging();
});
