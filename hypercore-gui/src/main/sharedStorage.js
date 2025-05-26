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
      console.log('Created shared storage disk:', sharedDisk);
    } else {
      // Check disk size and recreate if too small
      const { stdout: info } = await execPromise(`qemu-img info "${sharedDisk}"`);
      const sizeMatch = info.match(/virtual size: ([0-9.]+) ([GMK])iB/);
      if (sizeMatch) {
        const size = parseFloat(sizeMatch[1]);
        const unit = sizeMatch[2];
        const sizeInGB = unit === 'G' ? size : unit === 'M' ? size/1024 : size/1024/1024;
        
        if (sizeInGB < SHARED_CONFIG.defaultSize) {
          console.log(`Existing shared disk too small (${sizeInGB}GB < ${SHARED_CONFIG.defaultSize}GB), recreating...`);
          await fs.unlink(sharedDisk);
          await execPromise(`qemu-img create -f qcow2 "${sharedDisk}" ${SHARED_CONFIG.defaultSize}G`);
          console.log('Recreated shared storage disk:', sharedDisk);
        }
      }
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

// Create a scripts disk for the VM
async function createScriptsDisk(vmName) {
  try {
    const vmDir = path.join(os.homedir(), '.hypercore', 'vms', vmName);
    const scriptsDiskPath = path.join(vmDir, 'scripts.qcow2');
    const mountScript = path.join(vmDir, 'mount-shared.sh');
    const unmountScript = path.join(vmDir, 'unmount-shared.sh');
    const tempDir = path.join(vmDir, 'temp_scripts');

    // Create temporary directory
    await fs.mkdir(tempDir, { recursive: true });

    // Copy scripts to temp directory
    await fs.copyFile(mountScript, path.join(tempDir, 'mount-shared.sh'));
    await fs.copyFile(unmountScript, path.join(tempDir, 'unmount-shared.sh'));

    // Create a small disk image for scripts
    await execPromise(`qemu-img create -f qcow2 "${scriptsDiskPath}" 10M`);
    
    // Format the disk with FAT filesystem
    await execPromise(`mkfs.fat "${scriptsDiskPath}"`);

    // Mount the disk image
    await fs.mkdir('/tmp/script_mount', { recursive: true });
    await execPromise(`mount -o loop "${scriptsDiskPath}" /tmp/script_mount`);

    // Copy scripts to the mounted disk
    await execPromise(`cp "${tempDir}"/* /tmp/script_mount/`);

    // Unmount the disk
    await execPromise('umount /tmp/script_mount');

    // Cleanup
    await fs.rm(tempDir, { recursive: true });
    await fs.rm('/tmp/script_mount', { recursive: true });

    return scriptsDiskPath;
  } catch (error) {
    console.error('Failed to create scripts disk:', error);
    throw error;
  }
}

// Attach shared storage to running VM
async function attachSharedStorage(vmName) {
  try {
    const vmDir = path.join(os.homedir(), '.hypercore', 'vms', vmName);
    const monitorSocket = path.join(vmDir, 'monitor.sock');
    const { diskPath } = getVmSharedConfig();

    // First add the drive with a specific ID
    const driveAddCmd = `echo "drive_add 0 file=${diskPath},if=none,id=shared_drive,format=qcow2" | socat - UNIX-CONNECT:${monitorSocket}`;
    await execPromise(driveAddCmd);

    // Then create the virtio-blk device using the drive ID
    const deviceAddCmd = `echo "device_add virtio-blk-pci,drive=shared_drive,id=shared_disk" | socat - UNIX-CONNECT:${monitorSocket}`;
    await execPromise(deviceAddCmd);

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

    // First remove the device
    const deviceDelCmd = `echo "device_del shared_disk" | socat - UNIX-CONNECT:${monitorSocket}`;
    await execPromise(deviceDelCmd);

    // Then remove the drive
    const driveDelCmd = `echo "drive_del shared_drive" | socat - UNIX-CONNECT:${monitorSocket}`;
    await execPromise(driveDelCmd);

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

// Copy scripts to VM
async function copyScriptsToVM(vmName) {
  try {
    const vmDir = path.join(os.homedir(), '.hypercore', 'vms', vmName);
    const mountScript = path.join(vmDir, 'mount-shared.sh');
    const unmountScript = path.join(vmDir, 'unmount-shared.sh');

    // Read script contents
    const mountScriptContent = await fs.readFile(mountScript, 'utf8');
    const unmountScriptContent = await fs.readFile(unmountScript, 'utf8');

    const monitorSocket = path.join(vmDir, 'monitor.sock');

    // Create scripts directory in VM if it doesn't exist
    const mkdirCmd = `echo 'guest-exec "mkdir" "-p" "/usr/local/bin"' | socat - UNIX-CONNECT:${monitorSocket}`;
    await execPromise(mkdirCmd);

    // Write mount script
    const mountCmd = `echo 'guest-file-open "/usr/local/bin/mount-shared.sh" "w" "0755"' | socat - UNIX-CONNECT:${monitorSocket}`;
    const { stdout: mountFd } = await execPromise(mountCmd);
    await execPromise(`echo 'guest-file-write ${mountFd} "${Buffer.from(mountScriptContent).toString('base64')}"' | socat - UNIX-CONNECT:${monitorSocket}`);
    await execPromise(`echo 'guest-file-close ${mountFd}' | socat - UNIX-CONNECT:${monitorSocket}`);

    // Write unmount script
    const unmountCmd = `echo 'guest-file-open "/usr/local/bin/unmount-shared.sh" "w" "0755"' | socat - UNIX-CONNECT:${monitorSocket}`;
    const { stdout: unmountFd } = await execPromise(unmountCmd);
    await execPromise(`echo 'guest-file-write ${unmountFd} "${Buffer.from(unmountScriptContent).toString('base64')}"' | socat - UNIX-CONNECT:${monitorSocket}`);
    await execPromise(`echo 'guest-file-close ${unmountFd}' | socat - UNIX-CONNECT:${monitorSocket}`);

    // Make scripts executable
    await execPromise(`echo 'guest-exec "chmod" "+x" "/usr/local/bin/mount-shared.sh"' | socat - UNIX-CONNECT:${monitorSocket}`);
    await execPromise(`echo 'guest-exec "chmod" "+x" "/usr/local/bin/unmount-shared.sh"' | socat - UNIX-CONNECT:${monitorSocket}`);

    // Create symlinks in /usr/bin for easier access
    await execPromise(`echo 'guest-exec "ln" "-sf" "/usr/local/bin/mount-shared.sh" "/usr/bin/mount-shared.sh"' | socat - UNIX-CONNECT:${monitorSocket}`);
    await execPromise(`echo 'guest-exec "ln" "-sf" "/usr/local/bin/unmount-shared.sh" "/usr/bin/unmount-shared.sh"' | socat - UNIX-CONNECT:${monitorSocket}`);

    // Verify the scripts are accessible
    await execPromise(`echo 'guest-exec "ls" "-l" "/usr/local/bin/mount-shared.sh"' | socat - UNIX-CONNECT:${monitorSocket}`);
    await execPromise(`echo 'guest-exec "ls" "-l" "/usr/local/bin/unmount-shared.sh"' | socat - UNIX-CONNECT:${monitorSocket}`);

    return true;
  } catch (error) {
    console.error('Failed to copy scripts to VM:', error);
    return false;
  }
}

// Create mount script for VM
async function createMountScript(vmName) {
  try {
    const vmDir = path.join(os.homedir(), '.hypercore', 'vms', vmName);
    const mountScriptPath = path.join(vmDir, 'mount-shared.sh');
    const mountPoint = '/shared';

    const scriptContent = `#!/bin/bash
# Mount shared storage for Hypercore VM
# This script requires root privileges

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: This script must be run as root"
    echo "Please run: sudo $0"
    exit 1
fi

# Function to detect the Linux distribution
detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "$ID"
    elif [ -f /etc/redhat-release ]; then
        echo "rhel"
    elif [ -f /etc/debian_version ]; then
        echo "debian"
    else
        echo "unknown"
    fi
}

# Function to install required packages
install_required_packages() {
    local distro=$(detect_distro)
    echo "Detected distribution: $distro"
    
    # Clear any stale locks that might exist
    rm -f /var/lib/apt/lists/lock
    rm -f /var/cache/apt/archives/lock
    rm -f /var/lib/dpkg/lock*
    
    case "$distro" in
        "ubuntu"|"debian")
            apt-get update || { echo "Failed to update package lists. Error: $?"; exit 1; }
            apt-get install -y qemu-guest-agent || { echo "Failed to install qemu-guest-agent. Error: $?"; exit 1; }
            systemctl enable qemu-guest-agent || { echo "Failed to enable qemu-guest-agent service. Error: $?"; exit 1; }
            systemctl start qemu-guest-agent || { echo "Failed to start qemu-guest-agent service. Error: $?"; exit 1; }
            ;;
        "fedora"|"rhel"|"centos")
            dnf install -y qemu-guest-agent || { echo "Failed to install qemu-guest-agent. Error: $?"; exit 1; }
            systemctl enable qemu-guest-agent || { echo "Failed to enable qemu-guest-agent service. Error: $?"; exit 1; }
            systemctl start qemu-guest-agent || { echo "Failed to start qemu-guest-agent service. Error: $?"; exit 1; }
            ;;
        *)
            echo "Please install QEMU guest agent manually for your distribution"
            ;;
    esac
}

echo "Checking QEMU guest agent status..."
if ! systemctl is-active --quiet qemu-guest-agent; then
    echo "QEMU guest agent not running. Installing..."
    install_required_packages
else
    echo "QEMU guest agent is already running"
fi

echo "Creating mount point ${mountPoint}..."
mkdir -p ${mountPoint} || { echo "Failed to create mount point. Error: $?"; exit 1; }

echo "Mounting 9P shared folder..."
mount -t 9p -o trans=virtio,version=9p2000.L hypercore_share ${mountPoint} || { 
    echo "Failed to mount shared folder. Error: $?"
    echo "Common issues:"
    echo "  - Missing 9P kernel module"
    echo "  - Insufficient permissions"
    echo "  - Mount point already in use"
    exit 1
}

echo "Success: Shared folder mounted at ${mountPoint}"
echo "You can now access shared files at ${mountPoint}"
`;

    // Write the mount script
    await fs.writeFile(mountScriptPath, scriptContent, { mode: 0o755 });
    console.log('Mount script created successfully');

    return true;
  } catch (error) {
    console.error('Failed to create mount script:', error);
    throw error;
  }
}

// Create unmount script for VM
async function createUnmountScript(vmName) {
  try {
    const vmDir = path.join(os.homedir(), '.hypercore', 'vms', vmName);
    const unmountScriptPath = path.join(vmDir, 'unmount-shared.sh');
    const mountPoint = '/shared';

    const scriptContent = `#!/bin/bash
# Unmount shared storage for Hypercore VM
# This script requires root privileges

# Check if the mount point exists and is mounted
if mountpoint -q ${mountPoint}; then
    # Unmount the shared storage
    umount ${mountPoint}
    if [ $? -eq 0 ]; then
        echo "Shared storage unmounted successfully"
    else
        echo "Failed to unmount shared storage"
        exit 1
    fi
else
    echo "Shared storage is not mounted"
    exit 0
fi
`;

    // Write the unmount script
    await fs.writeFile(unmountScriptPath, scriptContent, { mode: 0o755 });
    console.log(`Created unmount script at ${unmountScriptPath}`);
    return true;
  } catch (error) {
    console.error('Failed to create unmount script:', error);
    throw error;
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
  isSharedStorageAttached,
  copyScriptsToVM
}; 