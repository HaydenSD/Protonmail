'use strict';
const path = require('path');
const fs = require('fs');
const electron = require('electron');
const app = electron.app;
const appMenu = require('./menu');
const storage = require('./storage');
const tray = require('./tray');

require('electron-debug')();
require('electron-dl')();

let mainWindow;
let isQuitting = false;
let oldtitle;

const isAlreadyRunning = app.makeSingleInstance(() => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }

        mainWindow.show();
    }
});

if (isAlreadyRunning) {
    app.quit();
}

function updateBadge(messageCount) {
    // Set badge
    if (process.platform === 'darwin') {
        app.dock.setBadge(messageCount ? messageCount[1] : '');
    } else {
        tray.setBadge(messageCount);
    }
}

function checkMessages(title) {
    /* This is an ugly way to do it, it seems to work but needs to be improved.
    Limits: it actualyl does not work while you are not in the Inbox, may need some improvements
    Concerning badge update: Shall I clean badge if window is maximized?
    */

    // How many new messages on new title?
    const messageCount = (/\(([0-9]+)\)/).exec(title);
    // How many messages I had?
    const messageCountOld = (/\(([0-9]+)\)/).exec(oldtitle);

    // No unread messages, do nothing than setting badge to 0
    if (!messageCount) {
        const indexCount = (/inbox/i).exec(title);
        if (indexCount) {
            oldtitle = 0;
            updateBadge(0);
        }
        return;
    }

    // No new messages, do nothing.
    if (messageCountOld && messageCount[1] <= messageCountOld[1]) {
        updateBadge(0);
        return;
    }

    // Send notification when new message, if not focused
    if (!mainWindow.isFocused()) {
        mainWindow.webContents.send('new-message-notification', messageCount[1]);
        updateBadge(messageCount[1]);
    }
    oldtitle = title;
}

function createMainWindow() {
    const lastWindowState = storage.get('lastWindowState') || {
        width: 1300,
        height: 850
    };

    const win = new electron.BrowserWindow({
        title: app.getName(),
        show: false,
        x: lastWindowState.x,
        y: lastWindowState.y,
        width: lastWindowState.width,
        height: lastWindowState.height,
        icon: process.platform === 'linux' && path.join(__dirname, 'static/Icon.png'),
        minWidth: 1000,
        minHeight: 700,
        titleBarStyle: 'hidden-inset',
        webPreferences: {
            // fails without this because of CommonJS script detection
            nodeIntegration: false,
            preload: path.join(__dirname, 'browser.js'),
            // required for Facebook active ping thingy
            webSecurity: false,
            plugins: true
        }
    });

    if (process.platform === 'darwin') {
        win.setSheetOffset(40);
    }

    win.loadURL('https://mail.protonmail.com/login');

    win.on('close', e => {
        if (!isQuitting) {
            e.preventDefault();

            if (process.platform === 'darwin') {
                app.hide();
            } else {
                win.hide();
            }
        }
    });

    win.on('page-title-updated', (e, title) => {
        e.preventDefault();
        checkMessages(title);
    });

    return win;
}

app.on('ready', () => {
    electron.Menu.setApplicationMenu(appMenu);
    mainWindow = createMainWindow();
    tray.create(mainWindow);

    const page = mainWindow.webContents;

    page.on('dom-ready', () => {
        page.insertCSS(fs.readFileSync(path.join(__dirname, 'browser.css'), 'utf8'));
        mainWindow.show();
    });

    page.on('new-window', (e, url) => {
        e.preventDefault();
        electron.shell.openExternal(url);
    });
});

app.on('activate', () => {
    mainWindow.show();
});

app.on('before-quit', () => {
    isQuitting = true;

    if (!mainWindow.isFullScreen()) {
        storage.set('lastWindowState', mainWindow.getBounds());
    }
});
