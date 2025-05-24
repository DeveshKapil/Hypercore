const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const Store = require('electron-store');
const osu = require('node-os-utils');
const fs = require('fs').promises;
const os = require('os');
const cephStorage = require('./cephStorage');

const store = new Store();
const cpu = osu.cpu;
const mem = osu.mem;
const drive = osu.drive;

// Cache for VM PIDs
const vmPids = new Map();

// Ceph configuration
const CEPH_CONF_PATH = '/home/dev/Documents/Hypercore/ceph.conf';
const CEPH_POOL_NAME = 'vm-pool';
const DEFAULT_VM_SIZE_GB = 10;

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

// Helper function to execute commands
function execCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

// Helper function to initialize Ceph storage
async function initializeCephStorage() {
  try {
    // Check if pool exists
    const pools = await execCommand(`ceph -c ${CEPH_CONF_PATH} osd pool ls`);
    if (!pools.includes(CEPH_POOL_NAME)) {
      // Create pool if it doesn't exist
      await execCommand(`ceph -c ${CEPH_CONF_PATH} osd pool create ${CEPH_POOL_NAME} 8`);
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
    await execCommand(
      `rbd -c ${CEPH_CONF_PATH} create ${CEPH_POOL_NAME}/${imageName} --size ${DEFAULT_VM_SIZE_GB}G`
    );
    return `rbd:${CEPH_POOL_NAME}/${imageName}:conf=${CEPH_CONF_PATH}`;
  } catch (error) {
    console.error('Failed to create RBD image:', error);
    throw error;
  }
}

app.whenReady().then(async () => {
  createWindow();
  await cephStorage.initializeCephStorage();
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
    // Create RBD images for VM
    const { systemDisk, dataDisk } = await cephStorage.createVmImage(name);
    
    // Create VM using the RBD images
    const command = `virt-install \
      --name ${name} \
      --ram ${ram} \
      --vcpus ${cpus} \
      --disk path=${systemDisk},format=raw,bus=virtio \
      --disk path=${dataDisk},format=raw,bus=virtio \
      ${iso ? `--cdrom ${iso}` : '--import'} \
      --os-variant generic \
      --network bridge=virbr0 \
      --graphics vnc`;

    await execCommand(command);
    
    // Store VM configuration
    store.set(`vm.${name}`, {
      name,
      ram,
      cpus,
      systemDisk,
      dataDisk,
      iso
    });
    
    return { success: true };
  } catch (error) {
    console.error('Failed to create VM:', error);
    throw error;
  }
});

ipcMain.handle('clone-vm', async (event, { source, target }) => {
  try {
    const sourceConfig = store.get(`vm.${source}`);
    if (!sourceConfig) {
      throw new Error('Source VM not found');
    }

    // Clone RBD images
    const { systemDisk, dataDisk } = await cephStorage.cloneVmImages(source, target);

    // Clone VM configuration
    const command = `virt-clone \
      --original ${source} \
      --name ${target} \
      --file ${systemDisk} \
      --file ${dataDisk}`;

    await execCommand(command);

    store.set(`vm.${target}`, {
      ...sourceConfig,
      name: target,
      systemDisk,
      dataDisk
    });
    return { success: true };
  } catch (error) {
    console.error('Failed to clone VM:', error);
    throw error;
  }
});

ipcMain.handle('delete-vm', async (event, { name }) => {
  try {
    const vmConfig = store.get(`vm.${name}`);
    if (!vmConfig) {
      throw new Error('VM not found');
    }

    // Delete VM
    await execCommand(`virsh undefine ${name} --remove-all-storage`);

    // Delete RBD images
    await cephStorage.deleteVmImages(name);

    store.delete(`vm.${name}`);
    vmPids.delete(name);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete VM:', error);
    throw error;
  }
});

ipcMain.handle('snapshot-vm', async (event, { name, snapshotName }) => {
  try {
    const vmConfig = store.get(`vm.${name}`);
    if (!vmConfig) {
      throw new Error('VM not found');
    }

    // Create VM snapshot
    await execCommand(`virsh snapshot-create-as ${name} ${snapshotName}`);

    // Create RBD snapshots
    await cephStorage.createVmSnapshot(name, snapshotName);

    return { success: true };
  } catch (error) {
    console.error('Failed to create snapshot:', error);
    throw error;
  }
});

ipcMain.handle('restore-vm', async (event, { name, snapshotName }) => {
  try {
    const vmConfig = store.get(`vm.${name}`);
    if (!vmConfig) {
      throw new Error('VM not found');
    }

    // Stop VM if running
    await execCommand(`virsh destroy ${name}`).catch(() => {});

    // Restore RBD snapshots
    await cephStorage.restoreVmSnapshot(name, snapshotName);

    // Restore VM snapshot
    await execCommand(`virsh snapshot-revert ${name} ${snapshotName}`);

    return { success: true };
  } catch (error) {
    console.error('Failed to restore snapshot:', error);
    throw error;
  }
});

// Resource monitoring
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

// Helper functions for process monitoring
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