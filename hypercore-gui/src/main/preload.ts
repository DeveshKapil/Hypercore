import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electron',
  {
    invoke: (channel: string, ...args: any[]) => {
      const validChannels = ['get-system-metrics', 'connect-monitor-socket', 'send-monitor-command'];
      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
      return Promise.reject(new Error(`Invalid channel: ${channel}`));
    },
    on: (channel: string, callback: (...args: any[]) => void) => {
      const validChannels = ['system-metrics-update', 'monitor-response'];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender` 
        const subscription = (_event: any, ...args: any[]) => callback(...args);
        ipcRenderer.on(channel, subscription);
        return () => {
          ipcRenderer.removeListener(channel, subscription);
        };
      }
      return () => {};
    }
  }
); 