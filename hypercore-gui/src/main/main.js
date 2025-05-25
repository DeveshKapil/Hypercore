const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const Store = require('electron-store');
const osu = require('node-os-utils');
const fs = require('fs').promises;
const os = require('os');
const storage = require('./cephStorage');

const store = new Store();
const cpu = osu.cpu;
const mem = osu.mem;
const drive = osu.drive;

// Cache for VM PIDs
const vmPids = new Map();

// Ceph configuration
const CEPH_CONF_PATH = '/etc/ceph/ceph.conf';
const CEPH_POOL_NAME = 'vm-pool';
const DEFAULT_VM_SIZE_GB = 10;

// Selected VMs for clipboard sharing
const selectedVMs = new Set();

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

// Helper function to execute commands and forward output
async function execCommandWithOutput(command, event = null) {
  return new Promise((resolve, reject) => {
    const childProcess = exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });

    // Forward output in real-time if event is provided
    if (event) {
      childProcess.stdout.on('data', (data) => {
        event.sender.send('terminal-output', data.toString());
      });

      childProcess.stderr.on('data', (data) => {
        event.sender.send('terminal-output', data.toString());
      });
    }
  });
}

// Helper function to initialize Ceph storage
async function initializeCephStorage() {
  try {
    // Check if pool exists
    const pools = await execCommandWithOutput(`ceph -c ${CEPH_CONF_PATH} osd pool ls`, null);
    if (!pools.includes(CEPH_POOL_NAME)) {
      // Create pool if it doesn't exist
      await execCommandWithOutput(`ceph -c ${CEPH_CONF_PATH} osd pool create ${CEPH_POOL_NAME} 8`, null);
    }
    return true;
  } catch (error) {
    console.error('Failed to initialize Ceph storage:', error);
    return false;
  }
}

// Helper function to create RBD image for VM
async function createRbdImage(vmName) {
  const imageName = `${vmName}-disk`;
  try {
    await execCommandWithOutput(
      `rbd -c ${CEPH_CONF_PATH} create ${CEPH_POOL_NAME}/${imageName} --size ${DEFAULT_VM_SIZE_GB}G`,
      null
    );
    return `rbd:${CEPH_POOL_NAME}/${imageName}:conf=${CEPH_CONF_PATH}`;
  } catch (error) {
    console.error('Failed to create RBD image:', error);
    throw error;
  }
}

// Check if required commands are available
async function checkDependencies() {
  console.log('Checking dependencies...'); // Debug log
  try {
    await execCommandWithOutput('which qemu-system-x86_64');
    await execCommandWithOutput('which qemu-img');
    console.log('All dependencies found'); // Debug log
    return true;
  } catch (error) {
    console.error('Missing required dependencies:', error);
    return false;
  }
}

app.whenReady().then(async () => {
  createWindow();
  const depsOk = await checkDependencies();
  if (!depsOk) {
    console.error('Missing required dependencies. Please install QEMU.');
  }
  const storageOk = await storage.initializeStorage();
  if (!storageOk) {
    console.error('Failed to initialize storage.');
  }
});

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

// File system IPC handlers
ipcMain.handle('get-home-path', () => os.homedir());

ipcMain.handle('read-directory', async (event, dirPath) => {
  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    return items.map(item => ({
      name: item.name,
      isDirectory: item.isDirectory()
    }));
  } catch (error) {
    console.error('Failed to read directory:', error);
    throw error;
  }
});

// VM Management IPC handlers
ipcMain.handle('get-vm-configs', async () => {
  return store.get('vm') || {};
});

ipcMain.handle('create-vm', async (event, { name, ram, cpus, iso }) => {
  try {
    // Validate input
    if (!name || !ram || !cpus) {
      throw new Error('Missing required parameters');
    }

    // Check if VM name already exists
    if (store.get(`vm.${name}`)) {
      throw new Error('VM with this name already exists');
    }

    // Create disk image for VM
    const { diskImage } = await storage.createVmImage(name);
    event.sender.send('terminal-output', `Created disk: ${diskImage}`);
    
    // Create mount/unmount scripts
    await storage.createMountScript(name);
    await storage.createUnmountScript(name);
    
    // Store VM configuration
    const config = {
      name,
      ram,
      cpus,
      diskImage,
      iso,
      state: 'stopped',
      selected: false,
      sharedStorageAttached: false
    };
    store.set(`vm.${name}`, config);
    
    // Start VM if ISO is provided
    if (iso) {
      event.sender.send('terminal-output', 'Starting VM installation...');
      try {
        const pid = await storage.startVm(name, config);
        vmPids.set(name, pid);
        store.set(`vm.${name}.state`, 'running');
        event.sender.send('terminal-output', 'VM started successfully');
        event.sender.send('terminal-output', 'Note: Use the GUI to attach shared storage when needed');
      } catch (startError) {
        event.sender.send('terminal-output', `Failed to start VM: ${startError.message}`);
        // Clean up on start failure
        await storage.deleteVmImage(name);
        store.delete(`vm.${name}`);
        throw startError;
      }
    }
    
    return { success: true };
  } catch (error) {
    event.sender.send('terminal-output', `Error: ${error.message}`);
    // Clean up any created resources on failure
    try {
      if (name) {
        if (vmPids.has(name)) {
          await storage.forceKillVm(vmPids.get(name));
          vmPids.delete(name);
        }
        await storage.deleteVmImage(name);
        store.delete(`vm.${name}`);
      }
    } catch (cleanupError) {
      event.sender.send('terminal-output', `Cleanup error: ${cleanupError.message}`);
    }
    return { 
      success: false, 
      error: error.message || 'Failed to create VM' 
    };
  }
});

ipcMain.handle('start-vm', async (event, { name }) => {
  try {
    const config = store.get(`vm.${name}`);
    if (!config) {
      throw new Error('VM not found');
    }

    // Double check if VM is already running
    const currentState = await storage.getVmStatus(name);
    if (currentState === 'running') {
      throw new Error('VM is already running');
    }

    event.sender.send('terminal-output', `Starting VM ${name}...`);
    const pid = await storage.startVm(name, config);
    
    // Verify VM actually started
    await new Promise(resolve => setTimeout(resolve, 1000));
    const newState = await storage.getVmStatus(name);
    
    if (newState !== 'running') {
      throw new Error('Failed to start VM - process did not start properly');
    }
    
    vmPids.set(name, pid);
    store.set(`vm.${name}.state`, 'running');
    
    event.sender.send('terminal-output', 'VM started successfully');
    return { success: true };
  } catch (error) {
    event.sender.send('terminal-output', `Error: ${error.message}`);
    // Ensure state is correctly set even on failure
    store.set(`vm.${name}.state`, 'stopped');
    throw error;
  }
});

ipcMain.handle('stop-vm', async (event, { name }) => {
  try {
    const config = store.get(`vm.${name}`);
    if (!config) {
      throw new Error('VM not found');
    }

    // Double check if VM is actually running
    const currentState = await storage.getVmStatus(name);
    if (currentState !== 'running') {
      throw new Error('VM is not running');
    }

    const pid = vmPids.get(name);
    if (!pid) {
      throw new Error('VM process not found');
    }

    event.sender.send('terminal-output', `Stopping VM ${name}...`);
    await storage.stopVm(pid);
    
    // Verify VM actually stopped
    await new Promise(resolve => setTimeout(resolve, 1000));
    const newState = await storage.getVmStatus(name);
    
    if (newState === 'running') {
      throw new Error('Failed to stop VM - process is still running');
    }
    
    vmPids.delete(name);
    store.set(`vm.${name}.state`, 'stopped');
    
    // Reset shared storage state
    if (config.sharedStorageAttached) {
      store.set(`vm.${name}.sharedStorageAttached`, false);
    }
    
    event.sender.send('terminal-output', 'VM stopped successfully');
    return { success: true };
  } catch (error) {
    event.sender.send('terminal-output', `Error: ${error.message}`);
    throw error;
  }
});

ipcMain.handle('delete-vm', async (event, { name }) => {
  try {
    const config = store.get(`vm.${name}`);
    if (!config) {
      throw new Error('VM not found');
    }

    event.sender.send('terminal-output', `Deleting VM ${name}...`);

    // Stop VM if running
    if (vmPids.has(name)) {
      await storage.stopVm(vmPids.get(name));
      vmPids.delete(name);
    }

    // Delete VM image
    await storage.deleteVmImage(name);
    store.delete(`vm.${name}`);

    event.sender.send('terminal-output', 'VM deletion completed successfully');
    return { success: true };
  } catch (error) {
    event.sender.send('terminal-output', `Error: ${error.message}`);
    throw error;
  }
});

ipcMain.handle('snapshot-vm', async (event, { name, snapshotName }) => {
  try {
    const config = store.get(`vm.${name}`);
    if (!config) {
      throw new Error('VM not found');
    }

    // Stop VM if running
    if (vmPids.has(name)) {
      await storage.stopVm(vmPids.get(name));
      vmPids.delete(name);
      store.set(`vm.${name}.state`, 'stopped');
    }

    event.sender.send('terminal-output', `Creating snapshot ${snapshotName} for VM ${name}...`);
    await storage.createVmSnapshot(name, snapshotName);
    event.sender.send('terminal-output', 'Snapshot creation completed successfully');
    return { success: true };
  } catch (error) {
    event.sender.send('terminal-output', `Error: ${error.message}`);
    throw error;
  }
});

ipcMain.handle('restore-vm', async (event, { name, snapshotName }) => {
  try {
    const config = store.get(`vm.${name}`);
    if (!config) {
      throw new Error('VM not found');
    }

    // Stop VM if running
    if (vmPids.has(name)) {
      await storage.stopVm(vmPids.get(name));
      vmPids.delete(name);
      store.set(`vm.${name}.state`, 'stopped');
    }

    event.sender.send('terminal-output', `Restoring snapshot ${snapshotName} for VM ${name}...`);
    await storage.restoreVmSnapshot(name, snapshotName);
    event.sender.send('terminal-output', 'Snapshot restoration completed successfully');
    return { success: true };
  } catch (error) {
    event.sender.send('terminal-output', `Error: ${error.message}`);
    throw error;
  }
});

// Resource monitoring
ipcMain.handle('get-vm-resources', async (event, vmName) => {
  try {
    const pid = vmPids.get(vmName);
    if (!pid) {
      return {
        cpu: 0,
        memory: 0,
        disk: 0
      };
    }

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

// Helper functions for process monitoring
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

ipcMain.handle('force-kill-vm', async (event, { name }) => {
  try {
    if (!vmPids.has(name)) {
      throw new Error('VM is not running');
    }

    event.sender.send('terminal-output', `Force killing VM ${name}...`);
    await storage.forceKillVm(vmPids.get(name));
    vmPids.delete(name);
    store.set(`vm.${name}.state`, 'stopped');
    
    event.sender.send('terminal-output', 'VM force killed successfully');
    return { success: true };
  } catch (error) {
    event.sender.send('terminal-output', `Error: ${error.message}`);
    throw error;
  }
});

// Selected VMs for clipboard sharing
ipcMain.handle('select-vm', async (event, { name, selected }) => {
  try {
    const config = store.get(`vm.${name}`);
    if (!config) {
      throw new Error('VM not found');
    }

    if (selected) {
      selectedVMs.add(name);
    } else {
      selectedVMs.delete(name);
    }

    // Update VM configuration
    store.set(`vm.${name}.selected`, selected);
    
    // If VM is running, update SPICE agent configuration
    if (vmPids.has(name)) {
      const spiceSocket = storage.getVmSpiceSocket(name);
      // TODO: Update SPICE configuration for clipboard sharing
    }

    return { success: true };
  } catch (error) {
    event.sender.send('terminal-output', `Error: ${error.message}`);
    throw error;
  }
});

ipcMain.handle('get-selected-vms', async () => {
  return Array.from(selectedVMs);
});

// Shared storage management
ipcMain.handle('attach-shared-storage', async (event, { name }) => {
  try {
    const config = store.get(`vm.${name}`);
    if (!config) {
      throw new Error('VM not found');
    }

    if (!vmPids.has(name)) {
      throw new Error('VM is not running');
    }

    event.sender.send('terminal-output', `Attaching shared storage to VM ${name}...`);
    await storage.attachSharedStorage(name);
    
    // Update VM configuration
    store.set(`vm.${name}.sharedStorageAttached`, true);
    
    event.sender.send('terminal-output', 'Shared storage attached successfully');
    event.sender.send('terminal-output', 'Run mount-shared.sh inside the VM to mount the storage');
    return { success: true };
  } catch (error) {
    event.sender.send('terminal-output', `Error: ${error.message}`);
    throw error;
  }
});

ipcMain.handle('detach-shared-storage', async (event, { name }) => {
  try {
    const config = store.get(`vm.${name}`);
    if (!config) {
      throw new Error('VM not found');
    }

    if (!vmPids.has(name)) {
      throw new Error('VM is not running');
    }

    event.sender.send('terminal-output', `Detaching shared storage from VM ${name}...`);
    event.sender.send('terminal-output', 'Please run unmount-shared.sh inside the VM first');
    
    await storage.detachSharedStorage(name);
    
    // Update VM configuration
    store.set(`vm.${name}.sharedStorageAttached`, false);
    
    event.sender.send('terminal-output', 'Shared storage detached successfully');
    return { success: true };
  } catch (error) {
    event.sender.send('terminal-output', `Error: ${error.message}`);
    throw error;
  }
});

ipcMain.handle('get-shared-storage-status', async (event, { name }) => {
  try {
    const config = store.get(`vm.${name}`);
    if (!config) {
      throw new Error('VM not found');
    }

    if (!vmPids.has(name)) {
      return { attached: false };
    }

    const attached = await storage.isSharedStorageAttached(name);
    return { attached };
  } catch (error) {
    console.error('Failed to get shared storage status:', error);
    return { attached: false };
  }
});

// Update VM settings
ipcMain.handle('update-vm-settings', async (event, { name, settings }) => {
  try {
    const config = store.get(`vm.${name}`);
    if (!config) {
      throw new Error('VM not found');
    }

    const isRunning = vmPids.has(name);
    
    // Update RAM and CPUs only if VM is stopped
    if (!isRunning) {
      if (settings.ram && settings.ram >= 512) {
        store.set(`vm.${name}.ram`, settings.ram);
      }
      if (settings.cpus && settings.cpus >= 1) {
        store.set(`vm.${name}.cpus`, settings.cpus);
      }
    }

    // Handle shared storage toggle if VM is running
    if (isRunning && settings.sharedStorageAttached !== config.sharedStorageAttached) {
      if (settings.sharedStorageAttached) {
        await storage.attachSharedStorage(name);
        event.sender.send('terminal-output', 'Run mount-shared.sh inside the VM to mount the storage');
      } else {
        event.sender.send('terminal-output', 'Please run unmount-shared.sh inside the VM first');
        await storage.detachSharedStorage(name);
      }
      store.set(`vm.${name}.sharedStorageAttached`, settings.sharedStorageAttached);
    }

    return { success: true };
  } catch (error) {
    event.sender.send('terminal-output', `Error: ${error.message}`);
    throw error;
  }
});

// Check VM states
ipcMain.handle('check-vm-states', async () => {
  try {
    const configs = store.get('vm') || {};
    const states = {};

    // Check each VM's actual state
    for (const [name, config] of Object.entries(configs)) {
      try {
        // Get actual state from process check
        const actualState = await storage.getVmStatus(name);
        
        // If stored state doesn't match actual state, update it
        if (config.state !== actualState) {
          store.set(`vm.${name}.state`, actualState);
          
          // If VM was running but now isn't, clean up
          if (config.state === 'running' && actualState === 'stopped') {
            vmPids.delete(name);
            // Also update shared storage state
            if (config.sharedStorageAttached) {
              store.set(`vm.${name}.sharedStorageAttached`, false);
            }
          }
        }
        
        states[name] = actualState;
      } catch (error) {
        console.error(`Failed to check state for VM ${name}:`, error);
        states[name] = 'unknown';
      }
    }

    return states;
  } catch (error) {
    console.error('Failed to check VM states:', error);
    throw error;
  }
});