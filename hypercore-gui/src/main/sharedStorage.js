const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Shared storage configuration
const SHARED_CONFIG = {
  baseDir: path.join(os.homedir(), '.hypercore', 'shared'),
  defaultSize: 10 // GB
};

// Initialize shared storage
async function initializeSharedStorage() {
  try {
    // Create shared directory
    await fs.mkdir(SHARED_CONFIG.baseDir, { recursive: true });
    
    // Create a shared disk image if it doesn't exist
    const sharedDisk = path.join(SHARED_CONFIG.baseDir, 'shared.qcow2');
    if (!await fileExists(sharedDisk)) {
      // Create shared disk
      await execPromise(`qemu-img create -f qcow2 "${sharedDisk}" ${SHARED_CONFIG.defaultSize}G`);
      
      // Format the disk with ext4
      await execPromise(`mkfs.ext4 "${sharedDisk}"`);
    }

    return true;
  } catch (error) {
    console.error('Failed to initialize shared storage:', error);
    return false;
  }
}

// Helper function to check if file exists
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Get shared storage configuration for a VM
function getVmSharedConfig() {
  const sharedDisk = path.join(SHARED_CONFIG.baseDir, 'shared.qcow2');
  return {
    diskPath: sharedDisk,
    mountPoint: '/shared'
  };
}

// Create mount script for a VM
async function createMountScript(vmName) {
  try {
    const vmDir = path.join(os.homedir(), '.hypercore', 'vms', vmName);
    const scriptPath = path.join(vmDir, 'mount-shared.sh');
    
    const scriptContent = `#!/bin/bash
# Mount shared storage if device exists
if [ -e /dev/vdb ]; then
  mkdir -p /shared
  mount /dev/vdb /shared
  chmod 777 /shared
  echo "Shared storage mounted successfully"
else
  echo "Shared storage device not found"
fi`;

    await fs.writeFile(scriptPath, scriptContent, { mode: 0o755 });
    return scriptPath;
  } catch (error) {
    console.error('Failed to create mount script:', error);
    throw error;
  }
}

// Create unmount script for a VM
async function createUnmountScript(vmName) {
  try {
    const vmDir = path.join(os.homedir(), '.hypercore', 'vms', vmName);
    const scriptPath = path.join(vmDir, 'unmount-shared.sh');
    
    const scriptContent = `#!/bin/bash
# Unmount shared storage
if mountpoint -q /shared; then
  umount /shared
  echo "Shared storage unmounted successfully"
else
  echo "Shared storage not mounted"
fi`;

    await fs.writeFile(scriptPath, scriptContent, { mode: 0o755 });
    return scriptPath;
  } catch (error) {
    console.error('Failed to create unmount script:', error);
    throw error;
  }
}

// Attach shared storage to running VM
async function attachSharedStorage(vmName) {
  try {
    const vmDir = path.join(os.homedir(), '.hypercore', 'vms', vmName);
    const monitorSocket = path.join(vmDir, 'monitor.sock');
    const { diskPath } = getVmSharedConfig();

    // Send command to QEMU monitor to attach drive
    const command = `echo "drive_add 0 file=${diskPath},format=qcow2,if=virtio" | socat - UNIX-CONNECT:${monitorSocket}`;
    await execPromise(command);

    return true;
  } catch (error) {
    console.error('Failed to attach shared storage:', error);
    throw error;
  }
}

// Detach shared storage from running VM
async function detachSharedStorage(vmName) {
  try {
    const vmDir = path.join(os.homedir(), '.hypercore', 'vms', vmName);
    const monitorSocket = path.join(vmDir, 'monitor.sock');

    // Send command to QEMU monitor to detach drive
    const command = `echo "device_del virtio-disk1" | socat - UNIX-CONNECT:${monitorSocket}`;
    await execPromise(command);

    return true;
  } catch (error) {
    console.error('Failed to detach shared storage:', error);
    throw error;
  }
}

// Check if shared storage is attached to VM
async function isSharedStorageAttached(vmName) {
  try {
    const vmDir = path.join(os.homedir(), '.hypercore', 'vms', vmName);
    const monitorSocket = path.join(vmDir, 'monitor.sock');

    // Query device list from QEMU monitor
    const command = `echo "info block" | socat - UNIX-CONNECT:${monitorSocket}`;
    const result = await execPromise(command);

    // Check if virtio-disk1 is in the device list
    return result.includes('virtio-disk1');
  } catch (error) {
    console.error('Failed to check shared storage status:', error);
    return false;
  }
}

module.exports = {
  SHARED_CONFIG,
  initializeSharedStorage,
  getVmSharedConfig,
  createMountScript,
  createUnmountScript,
  attachSharedStorage,
  detachSharedStorage,
  isSharedStorageAttached
}; 