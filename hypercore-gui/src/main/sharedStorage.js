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
    
    // Always recreate the shared disk to ensure proper initialization
    try {
      await fs.unlink(sharedDisk).catch(() => {});
      console.log('Removed existing shared disk for recreation');
    } catch (error) {
      // Ignore deletion errors
    }

    // Create new shared disk with proper size
    await execPromise(`qemu-img create -f qcow2 "${sharedDisk}" ${SHARED_CONFIG.defaultSize}G`);
    console.log('Created shared storage disk:', sharedDisk);

    // Format the disk with ext4 filesystem
    try {
      // Create a temporary loop device
      const { stdout: loopDev } = await execPromise(`sudo losetup --find --show "${sharedDisk}"`);
      const device = loopDev.trim();
      
      // Format with ext4
      await execPromise(`sudo mkfs.ext4 ${device}`);
      
      // Cleanup loop device
      await execPromise(`sudo losetup -d ${device}`);
      
      console.log('Formatted shared disk with ext4 filesystem');
    } catch (formatError) {
      console.warn('Failed to format shared disk:', formatError);
      // Continue anyway as the guest can format it
    }

    // Ensure proper permissions
    await execPromise(`chmod 666 "${sharedDisk}"`);
    
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

    // Verify monitor socket exists and is accessible
    try {
      await fs.access(monitorSocket);
    } catch (error) {
      throw new Error(`Monitor socket not accessible: ${error.message}`);
    }

    // Verify shared disk exists and is accessible
    try {
      await fs.access(diskPath);
      const { stdout: diskInfo } = await execPromise(`qemu-img info "${diskPath}"`);
      console.log('Shared disk info:', diskInfo);
    } catch (error) {
      throw new Error(`Shared disk not accessible: ${error.message}`);
    }

    // Use VM-specific IDs to allow multiple connections
    const driveId = `shared_drive_${vmName}`;
    const deviceId = `shared_disk_${vmName}`;

    // Test monitor connection
    try {
      await execPromise(`echo "info status" | socat - UNIX-CONNECT:${monitorSocket}`);
    } catch (error) {
      throw new Error(`Cannot connect to VM monitor: ${error.message}`);
    }

    console.log(`Attaching shared storage to VM ${vmName}...`);

    // Add the drive with shared=on to allow multiple connections
    const driveAddCmd = `echo "drive_add 0 file=${diskPath},if=none,id=${driveId},format=qcow2,share-rw=on" | socat - UNIX-CONNECT:${monitorSocket}`;
    try {
      const { stdout: driveResult } = await execPromise(driveAddCmd);
      console.log('Drive add result:', driveResult);
    } catch (error) {
      throw new Error(`Failed to add drive: ${error.message}`);
    }

    // Wait a moment for drive to be recognized
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create the virtio-blk device using VM-specific IDs and serial number
    const deviceAddCmd = `echo "device_add virtio-blk-pci,drive=${driveId},id=${deviceId},serial=${deviceId}" | socat - UNIX-CONNECT:${monitorSocket}`;
    try {
      const { stdout: deviceResult } = await execPromise(deviceAddCmd);
      console.log('Device add result:', deviceResult);
    } catch (error) {
      // Try to clean up the drive if device add fails
      try {
        await execPromise(`echo "drive_del ${driveId}" | socat - UNIX-CONNECT:${monitorSocket}`);
      } catch (cleanupError) {
        console.error('Failed to clean up drive after device add failure:', cleanupError);
      }
      throw new Error(`Failed to add device: ${error.message}`);
    }

    // Verify the device was added successfully
    try {
      const { stdout: blockInfo } = await execPromise(`echo "info block" | socat - UNIX-CONNECT:${monitorSocket}`);
      if (!blockInfo.includes(driveId)) {
        throw new Error('Drive not found in block devices after addition');
      }
      console.log('Shared storage attached successfully');
    } catch (error) {
      throw new Error(`Failed to verify device addition: ${error.message}`);
    }

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

    // Use VM-specific IDs when detaching
    const deviceId = `shared_disk_${vmName}`;
    const driveId = `shared_drive_${vmName}`;

    // First remove the device
    const deviceDelCmd = `echo "device_del ${deviceId}" | socat - UNIX-CONNECT:${monitorSocket}`;
    await execPromise(deviceDelCmd);

    // Then remove the drive
    const driveDelCmd = `echo "drive_del ${driveId}" | socat - UNIX-CONNECT:${monitorSocket}`;
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

# Function to install QEMU guest agent
install_qemu_guest_agent() {
    local distro=$(detect_distro)
    echo "Detected distribution: $distro"
    
    case "$distro" in
        "ubuntu"|"debian")
            apt-get update
            apt-get install -y qemu-guest-agent
            systemctl enable qemu-guest-agent
            systemctl start qemu-guest-agent
            ;;
        "fedora"|"rhel"|"centos")
            dnf install -y qemu-guest-agent
            systemctl enable qemu-guest-agent
            systemctl start qemu-guest-agent
            ;;
        "arch"|"manjaro")
            pacman -Sy --noconfirm qemu-guest-agent
            systemctl enable qemu-guest-agent
            systemctl start qemu-guest-agent
            ;;
        "opensuse"*)
            zypper install -y qemu-guest-agent
            systemctl enable qemu-guest-agent
            systemctl start qemu-guest-agent
            ;;
        *)
            echo "Unsupported distribution for automatic installation"
            echo "Please install QEMU guest agent manually"
            ;;
    esac
}

# Check and install QEMU guest agent if not present
if ! systemctl is-active --quiet qemu-guest-agent; then
    echo "QEMU guest agent not running. Installing..."
    install_qemu_guest_agent
else
    echo "QEMU guest agent is already running"
fi

# Create mount point if it doesn't exist
mkdir -p ${mountPoint}

# Get the device name for shared storage by checking virtio devices
for device in /sys/block/vd*; do
    if [ -e "$device" ]; then
        dev_name=$(basename $device)
        # Check if this is our shared storage by looking at the device ID
        if grep -q "shared_disk_${vmName}" "$device/device/serial" 2>/dev/null; then
            DEVICE=$dev_name
            break
        fi
    fi
done

if [ -z "$DEVICE" ]; then
    echo "Shared storage device not found"
    exit 1
fi

# Mount the device
mount /dev/$DEVICE ${mountPoint}
if [ $? -eq 0 ]; then
    echo "Shared storage mounted successfully at ${mountPoint}"
    # Set appropriate permissions
    chmod 777 ${mountPoint}
else
    echo "Failed to mount shared storage"
    exit 1
fi
`;

    // Write the mount script
    await fs.writeFile(mountScriptPath, scriptContent, { mode: 0o755 });
    console.log(`Created mount script at ${mountScriptPath}`);
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