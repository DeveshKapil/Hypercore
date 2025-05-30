const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const Store = require('electron-store');
const osu = require('node-os-utils');
const fs = require('fs').promises;
const os = require('os');
const storage = require('./cephStorage');
const sharedStorage = require('./sharedStorage');
const { STORAGE_CONFIG } = require('./cephStorage');
const util = require('util');
const execPromise = util.promisify(exec);

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

  // Handle window close event
  mainWindow.on('close', async (e) => {
    e.preventDefault(); // Prevent the window from closing immediately
    
    try {
      // Get all running VMs
      const configs = store.get('vm') || {};
      const runningVMs = Object.entries(configs).filter(([name, config]) => vmPids.has(name));
      
      if (runningVMs.length > 0) {
        // Show confirmation dialog
        const { response } = await dialog.showMessageBox(mainWindow, {
          type: 'question',
          buttons: ['Cancel', 'Force Kill', 'Save State & Shutdown'],
          defaultId: 2,
          title: 'Confirm Exit',
          message: `There are ${runningVMs.length} VMs still running. How would you like to proceed?`,
          detail: 'Save State & Shutdown will save the current state of all VMs before shutting them down.\nForce Kill will terminate them immediately without saving.\nCancel will keep the application running.'
        });

        if (response === 0) { // Cancel
          return;
        }

        const isForceKill = response === 1;
        
        // Show progress in terminal output
        for (const [name] of runningVMs) {
          try {
            if (isForceKill) {
              await storage.forceKillVm(vmPids.get(name));
              console.log(`Force killed VM: ${name}`);
            } else {
              // Create a snapshot before stopping
              const snapshotName = `shutdown-state-${Date.now()}`;
              console.log(`Saving state for VM ${name}...`);
              
              try {
                // Send QEMU monitor command to stop CPU before snapshot
                const vmDir = path.join(STORAGE_CONFIG.baseDir, name);
                const monitorSocket = path.join(vmDir, 'monitor.sock');
                await execPromise(`echo "stop" | socat - UNIX-CONNECT:${monitorSocket}`);
                
                // Create snapshot
                await storage.createVmSnapshot(name, snapshotName);
                console.log(`State saved for VM ${name} as snapshot: ${snapshotName}`);
                
                // Store the snapshot name for auto-restore
                store.set(`vm.${name}.lastShutdownSnapshot`, snapshotName);
                
                // Now stop the VM
                await storage.stopVm(vmPids.get(name));
                console.log(`Gracefully stopped VM: ${name}`);
              } catch (snapshotError) {
                console.error(`Failed to save state for VM ${name}:`, snapshotError);
                // If snapshot fails, try normal shutdown
                await storage.stopVm(vmPids.get(name));
                console.log(`Gracefully stopped VM ${name} (without state save)`);
              }
            }
            vmPids.delete(name);
            store.set(`vm.${name}.state`, 'stopped');
          } catch (error) {
            console.error(`Failed to stop VM ${name}:`, error);
            // If graceful shutdown fails, try force kill
            if (!isForceKill) {
              try {
                await storage.forceKillVm(vmPids.get(name));
                console.log(`Force killed VM after failed graceful shutdown: ${name}`);
                vmPids.delete(name);
                store.set(`vm.${name}.state`, 'stopped');
              } catch (killError) {
                console.error(`Failed to force kill VM ${name}:`, killError);
              }
            }
          }
        }
      }
      
      // Cleanup and quit
      app.quit();
    } catch (error) {
      console.error('Error during shutdown:', error);
      dialog.showErrorBox('Error', `Failed to properly shut down: ${error.message}`);
      app.exit(1); // Force quit with error code
    }
  });
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

ipcMain.handle('create-vm', async (event, { name, ram, cpus, iso, storageSize }) => {
  try {
    // Validate input
    if (!name || !ram || !cpus || !storageSize) {
      throw new Error('Missing required parameters');
    }

    // Check if VM name already exists
    if (store.get(`vm.${name}`)) {
      throw new Error('VM with this name already exists');
    }

    // Create disk image for VM
    const { diskImage } = await storage.createVmImage(name, storageSize);
    event.sender.send('terminal-output', `Created disk: ${diskImage}`);
    
    // Create mount/unmount scripts using sharedStorage module
    await sharedStorage.createMountScript(name);
    await sharedStorage.createUnmountScript(name);
    
    // Store VM configuration with guest agent enabled
    const config = {
      name,
      ram,
      cpus,
      diskImage,
      iso,
      storageSize,
      state: 'stopped',
      selected: false,
      sharedStorageAttached: false,
      guestAgent: true, // Enable QEMU guest agent
      extraArgs: [
        '-device', 'virtio-serial',
        '-chardev', 'socket,path=/tmp/qga.sock,server=on,wait=off,id=qga0',
        '-device', 'virtserialport,chardev=qga0,name=org.qemu.guest_agent.0'
      ]
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
        event.sender.send('terminal-output', 'Note: Please install qemu-guest-agent package in the VM');
      } catch (startError) {
        event.sender.send('terminal-output', `Failed to start VM: ${startError.message}`);
        await storage.deleteVmImage(name);
        store.delete(`vm.${name}`);
        throw startError;
      }
    }
    
    return { success: true };
  } catch (error) {
    event.sender.send('terminal-output', `Error: ${error.message}`);
    try {
      if (name) {
        if (vmPids.has(name)) {
          await storage.forceKillVm(vmPids.get(name));
          vmPids.delete(name);
        }
        store.set(`vm.${name}.state`, 'failed');
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

    event.sender.send('terminal-output', `Starting VM ${name}...`);

    // Check if VM is already running
    if (vmPids.has(name)) {
      throw new Error('VM is already running');
    }

    // Check for saved shutdown state
    const lastShutdownSnapshot = config.lastShutdownSnapshot;
    if (lastShutdownSnapshot) {
      try {
        event.sender.send('terminal-output', `Restoring saved state from snapshot: ${lastShutdownSnapshot}`);
        await storage.restoreVmSnapshot(name, lastShutdownSnapshot);
        // Clear the snapshot reference after successful restore
        store.delete(`vm.${name}.lastShutdownSnapshot`);
      } catch (restoreError) {
        event.sender.send('terminal-output', `Failed to restore state: ${restoreError.message}`);
        event.sender.send('terminal-output', 'Proceeding with normal startup...');
      }
    }

    // Handle ISO and boot order
    let bootConfig = { ...config };
    if (config.hasBooted && config.iso) {
      // If VM has booted before and ISO is still attached, detach it
      event.sender.send('terminal-output', 'VM has booted before, detaching ISO...');
      try {
        await storage.detachIso(name);
        store.set(`vm.${name}.iso`, null);
        bootConfig.iso = null;
        event.sender.send('terminal-output', 'ISO detached successfully');
      } catch (detachError) {
        event.sender.send('terminal-output', `Warning: Failed to detach ISO: ${detachError.message}`);
      }
      bootConfig.bootOrder = 'c'; // Boot from disk
    } else if (!config.hasBooted && config.iso) {
      // First boot with ISO
      bootConfig.bootOrder = 'd'; // Boot from CD
    } else {
      // Normal boot from disk
      bootConfig.bootOrder = 'c';
    }

    // Start the VM
    const pid = await storage.startVm(name, bootConfig);

    // Update VM state
    vmPids.set(name, pid);
    store.set(`vm.${name}.state`, 'running');
    if (!config.hasBooted) {
      store.set(`vm.${name}.hasBooted`, true);
    }

    // Launch SPICE viewer
    const vmDir = path.join(STORAGE_CONFIG.baseDir, name);
    const spiceSocket = path.join(vmDir, 'spice.sock');
    
    // Wait a moment for the SPICE socket to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      // Kill any existing remote-viewer processes for this VM
      await execPromise(`pkill -f "remote-viewer.*${spiceSocket}"`).catch(() => {});
      
      // Check if remote-viewer is installed
      await execPromise('which remote-viewer');
      
      // Launch SPICE viewer with full socket path
      const spiceCmd = `remote-viewer spice+unix://${spiceSocket} &`;
      await execPromise(spiceCmd);
      event.sender.send('terminal-output', 'SPICE viewer launched');
    } catch (error) {
      if (error.message.includes('which remote-viewer')) {
        event.sender.send('terminal-output', 'Warning: remote-viewer not found. Installing virt-viewer package...');
        try {
          await execPromise('sudo apt-get update && sudo apt-get install -y virt-viewer');
          // Try launching viewer again after installation
          const spiceCmd = `remote-viewer spice+unix://${spiceSocket} &`;
          await execPromise(spiceCmd);
          event.sender.send('terminal-output', 'SPICE viewer installed and launched');
        } catch (installError) {
          event.sender.send('terminal-output', `Warning: Failed to install virt-viewer. Please install it manually: sudo apt-get install virt-viewer`);
        }
      } else {
        event.sender.send('terminal-output', `Warning: Failed to launch SPICE viewer: ${error.message}`);
      }
    }

    event.sender.send('terminal-output', 'VM started successfully');
    return { success: true };
  } catch (error) {
    event.sender.send('terminal-output', `Error: ${error.message}`);
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
    
    try {
      await storage.stopVm(pid);
      
      // Double check process is actually gone
      try {
        process.kill(pid, 0);
        throw new Error('Process still running after stop attempt');
      } catch (e) {
        if (e.code !== 'ESRCH') {
          throw e;
        }
        // Process is gone, clean up
        vmPids.delete(name);
        store.set(`vm.${name}.state`, 'stopped');
        
        // Reset shared storage state
        if (config.sharedStorageAttached) {
          store.set(`vm.${name}.sharedStorageAttached`, false);
        }
        
        event.sender.send('terminal-output', 'VM stopped successfully');
        return { success: true };
      }
    } catch (stopError) {
      // If stop fails, try force kill
      event.sender.send('terminal-output', `Graceful stop failed, attempting force kill: ${stopError.message}`);
      await storage.forceKillVm(pid);
      vmPids.delete(name);
      store.set(`vm.${name}.state`, 'stopped');
      event.sender.send('terminal-output', 'VM force killed after failed stop');
      return { success: true };
    }
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
    
    const pid = vmPids.get(name);
    await storage.forceKillVm(pid);
    
    // Verify process is actually gone
    try {
      process.kill(pid, 0);
      throw new Error('Process still exists after force kill');
    } catch (e) {
      if (e.code !== 'ESRCH') {
        throw e;
      }
      // Process is gone, clean up
      vmPids.delete(name);
      store.set(`vm.${name}.state`, 'stopped');
      
      // Reset shared storage state
      const config = store.get(`vm.${name}`);
      if (config && config.sharedStorageAttached) {
        store.set(`vm.${name}.sharedStorageAttached`, false);
      }
      
      event.sender.send('terminal-output', 'VM force killed successfully');
      return { success: true };
    }
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

    // Update VM configuration
    store.set(`vm.${name}.sharedStorageAttached`, true);
    
    if (vmPids.has(name)) {
      // If VM is running, try to hot-attach the storage
      try {
        await sharedStorage.attachSharedStorage(name);
        event.sender.send('terminal-output', 'Shared storage attached successfully');
        event.sender.send('terminal-output', 'Run mount-shared.sh inside the VM to mount the storage');
      } catch (attachError) {
        event.sender.send('terminal-output', 'Failed to hot-attach storage. Changes will take effect after VM restart.');
      }
    } else {
      event.sender.send('terminal-output', 'Shared storage will be available next time the VM starts');
    }
    
    return { success: true };
  } catch (error) {
    event.sender.send('terminal-output', `Error: ${error.message}`);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('detach-shared-storage', async (event, { name }) => {
  try {
    const config = store.get(`vm.${name}`);
    if (!config) {
      throw new Error('VM not found');
    }

    // Update VM configuration
    store.set(`vm.${name}.sharedStorageAttached`, false);
    
    if (vmPids.has(name)) {
      // If VM is running, try to hot-detach the storage
      try {
        event.sender.send('terminal-output', 'Please run unmount-shared.sh inside the VM first');
        await sharedStorage.detachSharedStorage(name);
        event.sender.send('terminal-output', 'Shared storage detached successfully');
      } catch (detachError) {
        event.sender.send('terminal-output', 'Failed to hot-detach storage. Changes will take effect after VM restart.');
      }
    } else {
      event.sender.send('terminal-output', 'Shared storage will be detached next time the VM starts');
    }
    
    return { success: true };
  } catch (error) {
    event.sender.send('terminal-output', `Error: ${error.message}`);
    return { success: false, error: error.message };
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

    const attached = await sharedStorage.isSharedStorageAttached(name);
    return { attached };
  } catch (error) {
    console.error('Failed to get shared storage status:', error);
    return { attached: false, error: error.message };
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

    // Handle shared storage toggle
    if (settings.sharedStorageAttached !== config.sharedStorageAttached) {
      if (settings.sharedStorageAttached) {
        if (isRunning) {
          try {
            await sharedStorage.attachSharedStorage(name);
            event.sender.send('terminal-output', 'Run mount-shared.sh inside the VM to mount the storage');
          } catch (attachError) {
            event.sender.send('terminal-output', 'Failed to hot-attach storage. Changes will take effect after VM restart.');
          }
        } else {
          event.sender.send('terminal-output', 'Shared storage will be available next time the VM starts');
        }
      } else {
        if (isRunning) {
          try {
            event.sender.send('terminal-output', 'Please run unmount-shared.sh inside the VM first');
            await sharedStorage.detachSharedStorage(name);
          } catch (detachError) {
            event.sender.send('terminal-output', 'Failed to hot-detach storage. Changes will take effect after VM restart.');
          }
        } else {
          event.sender.send('terminal-output', 'Shared storage will be detached next time the VM starts');
        }
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

// Handle ISO detachment
ipcMain.handle('detach-iso', async (event, { name }) => {
  try {
    const config = store.get(`vm.${name}`);
    if (!config) {
      throw new Error('VM not found');
    }

    event.sender.send('terminal-output', `Detaching ISO from VM ${name}...`);

    // Detach ISO using QEMU monitor
    await storage.detachIso(name);

    // Update VM configuration
    store.set(`vm.${name}.iso`, null);
    
    event.sender.send('terminal-output', 'ISO detached successfully');
    return { success: true };
  } catch (error) {
    event.sender.send('terminal-output', `Error: ${error.message}`);
    throw error;
  }
});

// Handle boot order changes
ipcMain.handle('set-boot-order', async (event, { name, bootOrder }) => {
  try {
    const config = store.get(`vm.${name}`);
    if (!config) {
      throw new Error('VM not found');
    }

    // Update VM configuration
    store.set(`vm.${name}.bootOrder`, bootOrder);
    
    event.sender.send('terminal-output', `Updated boot order for VM ${name}`);
    return { success: true };
  } catch (error) {
    event.sender.send('terminal-output', `Error: ${error.message}`);
    throw error;
  }
});

// Shared storage management
ipcMain.handle('get-shared-folder-info', async () => {
  try {
    return sharedStorage.getVmSharedConfig();
  } catch (error) {
    console.error('Failed to get shared folder info:', error);
    throw error;
  }
});

// Shared folder management
ipcMain.handle('list-shared-files', async (event, { path }) => {
  try {
    const items = await fs.readdir(path, { withFileTypes: true });
    return items.map(item => ({
      name: item.name,
      isDirectory: item.isDirectory()
    }));
  } catch (error) {
    console.error('Failed to list shared files:', error);
    throw error;
  }
});

ipcMain.handle('create-shared-folder', async (event, { path, folderName }) => {
  try {
    const folderPath = `${path}/${folderName}`;
    await fs.mkdir(folderPath);
    return { success: true };
  } catch (error) {
    console.error('Failed to create shared folder:', error);
    throw error;
  }
});

ipcMain.handle('import-shared-file', async (event, { targetPath }) => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Select File to Import'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const sourcePath = result.filePaths[0];
      const fileName = path.basename(sourcePath);
      const destinationPath = path.join(targetPath, fileName);
      
      await fs.copyFile(sourcePath, destinationPath);
      return { success: true };
    }
    return { success: false };
  } catch (error) {
    console.error('Failed to import file:', error);
    throw error;
  }
});

ipcMain.handle('delete-shared-item', async (event, { path, itemName }) => {
  try {
    const itemPath = `${path}/${itemName}`;
    const stats = await fs.stat(itemPath);
    
    if (stats.isDirectory()) {
      await fs.rm(itemPath, { recursive: true });
    } else {
      await fs.unlink(itemPath);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Failed to delete shared item:', error);
    throw error;
  }
});