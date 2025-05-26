import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { MonitoringService } from './services/MonitoringService';

let mainWindow: BrowserWindow | null = null;
let monitoringService: MonitoringService | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the index.html from webpack output
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

  // Initialize monitoring service
  monitoringService = new MonitoringService();
  monitoringService.startMetricsPolling(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (monitoringService) {
      monitoringService.cleanup();
    }
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
}); 