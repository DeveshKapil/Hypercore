const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const Store = require('electron-store');
const osu = require('node-os-utils');

const store = new Store();
const cpu = osu.cpu;
const mem = osu.mem;
const drive = osu.drive;

// Cache for VM PIDs
const vmPids = new Map();

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  
  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Helper function to get VM PID
async function getVmPid(vmName) {
  if (vmPids.has(vmName)) {
    return vmPids.get(vmName);
  }

  return new Promise((resolve, reject) => {
    exec(`pgrep -f "qemu.*${vmName}"`, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      const pid = parseInt(stdout.trim());
      vmPids.set(vmName, pid);
      resolve(pid);
    });
  });
}

// Helper function to get process CPU usage
async function getProcessCpuUsage(pid) {
  return new Promise((resolve, reject) => {
    exec(`ps -p ${pid} -o %cpu`, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      const cpuUsage = parseFloat(stdout.split('\n')[1]);
      resolve(cpuUsage);
    });
  });
}

// Helper function to get process memory usage
async function getProcessMemUsage(pid) {
  return new Promise((resolve, reject) => {
    exec(`ps -p ${pid} -o %mem`, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      const memUsage = parseFloat(stdout.split('\n')[1]);
      resolve(memUsage);
    });
  });
}

// VM Resource monitoring
ipcMain.handle('get-vm-resources', async (event, vmName) => {
  try {
    const pid = await getVmPid(vmName);
    const [cpuUsage, memUsage, { usedPercentage: diskUsage }] = await Promise.all([
      getProcessCpuUsage(pid),
      getProcessMemUsage(pid),
      drive.info()
    ]);

    return {
      cpu: cpuUsage,
      memory: memUsage,
      disk: diskUsage
    };
  } catch (error) {
    console.error('Error getting VM resources:', error);
    return {
      cpu: 0,
      memory: 0,
      disk: 0
    };
  }
});

// VM Management IPC handlers
ipcMain.handle('create-vm', async (event, { name, ram, cpus, disk, iso }) => {
  return new Promise((resolve, reject) => {
    const command = `create-vm ${name} ${ram} ${cpus} ${disk} ${iso}`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      store.set(`vm.${name}`, { name, ram, cpus, disk, iso });
      resolve(stdout);
    });
  });
});

ipcMain.handle('clone-vm', async (event, { source, target }) => {
  return new Promise((resolve, reject) => {
    const sourceConfig = store.get(`vm.${source}`);
    if (!sourceConfig) {
      reject(new Error('Source VM not found'));
      return;
    }

    const command = `virt-clone --original ${source} --name ${target} --auto-clone`;
    exec(command, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      store.set(`vm.${target}`, { ...sourceConfig, name: target });
      resolve(stdout);
    });
  });
});

ipcMain.handle('delete-vm', async (event, { name }) => {
  return new Promise((resolve, reject) => {
    const command = `virsh undefine ${name} --remove-all-storage`;
    exec(command, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      store.delete(`vm.${name}`);
      vmPids.delete(name);
      resolve(stdout);
    });
  });
});

ipcMain.handle('snapshot-vm', async (event, { name, snapshotName }) => {
  return new Promise((resolve, reject) => {
    const command = `virsh snapshot-create-as ${name} ${snapshotName}`;
    exec(command, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
});

ipcMain.handle('restore-vm', async (event, { name, snapshotName }) => {
  return new Promise((resolve, reject) => {
    const command = `virsh snapshot-revert ${name} ${snapshotName}`;
    exec(command, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
});

ipcMain.handle('get-vm-configs', async () => {
  return store.get('vm') || {};
});

ipcMain.handle('update-vm', async (event, { name, config }) => {
  return new Promise((resolve, reject) => {
    const currentConfig = store.get(`vm.${name}`);
    if (!currentConfig) {
      reject(new Error('VM not found'));
      return;
    }

    const command = `virsh setmaxmem ${name} ${config.ram}M --config && virsh setvcpus ${name} ${config.cpus} --config`;
    exec(command, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      store.set(`vm.${name}`, { ...currentConfig, ...config });
      resolve(stdout);
    });
  });
}); 