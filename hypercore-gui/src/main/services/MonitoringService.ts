import { ipcMain } from 'electron';
import * as os from 'node:os';
import * as osu from 'node-os-utils';
import { Socket } from 'net';
import * as path from 'path';
import * as fs from 'fs';

interface SystemMetrics {
  cpu: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
  };
}

export class MonitoringService {
  private monitorSockets: Map<string, Socket> = new Map();
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.setupIpcHandlers();
  }

  private setupIpcHandlers() {
    ipcMain.handle('get-system-metrics', () => this.getSystemMetrics());
    ipcMain.handle('connect-monitor-socket', (_event, vmId: string, sockPath: string) => 
      this.connectMonitorSocket(vmId, sockPath));
    ipcMain.handle('send-monitor-command', (_event, vmId: string, command: string) => 
      this.sendMonitorCommand(vmId, command));
  }

  private async getSystemMetrics(): Promise<SystemMetrics> {
    const cpuUsage = await osu.cpu.usage();
    const memory = {
      used: os.totalmem() - os.freemem(),
      total: os.totalmem(),
      percentage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
    };

    // Get disk metrics for the root directory
    const disk = await new Promise<{ used: number; total: number; percentage: number }>((resolve) => {
      osu.drive.info().then(info => {
        resolve({
          used: (info.totalGb - info.freeGb) * 1024 * 1024 * 1024,
          total: info.totalGb * 1024 * 1024 * 1024,
          percentage: ((info.totalGb - info.freeGb) / info.totalGb) * 100
        });
      });
    });

    return {
      cpu: cpuUsage,
      memory,
      disk
    };
  }

  public startMetricsPolling(window: Electron.BrowserWindow) {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    this.metricsInterval = setInterval(async () => {
      const metrics = await this.getSystemMetrics();
      window.webContents.send('system-metrics-update', metrics);
    }, 1000);
  }

  public stopMetricsPolling() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  private connectMonitorSocket(vmId: string, sockPath: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (this.monitorSockets.has(vmId)) {
        this.monitorSockets.get(vmId)?.destroy();
      }

      const socket = new Socket();
      
      socket.on('connect', () => {
        this.monitorSockets.set(vmId, socket);
        resolve(true);
      });

      socket.on('error', (error) => {
        console.error(`Monitor socket error for VM ${vmId}:`, error);
        reject(error);
      });

      socket.on('data', (data) => {
        // Handle monitor responses
        const response = data.toString();
        // Send response back to renderer
        ipcMain.emit('monitor-response', vmId, response);
      });

      socket.connect({ path: sockPath });
    });
  }

  private sendMonitorCommand(vmId: string, command: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.monitorSockets.get(vmId);
      if (!socket) {
        reject(new Error(`No monitor socket connection for VM ${vmId}`));
        return;
      }

      socket.write(`${command}\n`, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  public cleanup() {
    this.stopMetricsPolling();
    for (const socket of this.monitorSockets.values()) {
      socket.destroy();
    }
    this.monitorSockets.clear();
  }
} 