const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const util = require('util');
const execPromise = util.promisify(exec);
const sharedStorage = require('./sharedStorage');

// VM storage configuration
const STORAGE_CONFIG = {
  baseDir: path.join(os.homedir(), '.hypercore', 'vms'),
  defaultSizes: {
    disk: 20 // GB
  }
};

// Initialize storage directory
async function initializeStorage() {
  try {
    await fs.mkdir(STORAGE_CONFIG.baseDir, { recursive: true });
    // Initialize shared storage
    await sharedStorage.initializeSharedStorage();
    return true;
  } catch (error) {
    console.error('Failed to initialize storage:', error);
    return false;
  }
}

// Create disk image for VM
async function createVmImage(vmName, size = STORAGE_CONFIG.defaultSizes.disk) {
  try {
    const vmDir = path.join(STORAGE_CONFIG.baseDir, vmName);
    await fs.mkdir(vmDir, { recursive: true });

    const diskImage = path.join(vmDir, 'disk.qcow2');

    // Create disk image using qemu-img
    await execPromise(`qemu-img create -f qcow2 "${diskImage}" ${size}G`);

    // Create mount script for shared storage
    await sharedStorage.createMountScript(vmName);
    await sharedStorage.createUnmountScript(vmName);

    return { diskImage };
  } catch (error) {
    console.error('Failed to create VM image:', error);
    throw error;
  }
}

// Delete VM image and all associated files
async function deleteVmImage(vmName) {
  try {
    const vmDir = path.join(STORAGE_CONFIG.baseDir, vmName);
    await fs.rm(vmDir, { recursive: true, force: true });
    return true;
  } catch (error) {
    console.error('Failed to delete VM image:', error);
    throw error;
  }
}

// Clone VM image
async function cloneVmImage(sourceName, targetName) {
  try {
    const sourceDir = path.join(STORAGE_CONFIG.baseDir, sourceName);
    const targetDir = path.join(STORAGE_CONFIG.baseDir, targetName);
    await fs.mkdir(targetDir, { recursive: true });

    const sourceDisk = path.join(sourceDir, 'disk.qcow2');
    const targetDisk = path.join(targetDir, 'disk.qcow2');

    // Clone disk image using qemu-img
    await execPromise(`qemu-img create -f qcow2 -b "${sourceDisk}" "${targetDisk}"`);

    // Create new mount/unmount scripts for the cloned VM
    await sharedStorage.createMountScript(targetName);
    await sharedStorage.createUnmountScript(targetName);

    return { diskImage: targetDisk };
  } catch (error) {
    console.error('Failed to clone VM image:', error);
    throw error;
  }
}

// Create VM snapshot
async function createVmSnapshot(vmName, snapshotName) {
  try {
    const vmDir = path.join(STORAGE_CONFIG.baseDir, vmName);
    const diskImage = path.join(vmDir, 'disk.qcow2');

    // Create snapshot using qemu-img
    await execPromise(`qemu-img snapshot -c "${snapshotName}" "${diskImage}"`);

    return true;
  } catch (error) {
    console.error('Failed to create VM snapshot:', error);
    throw error;
  }
}

// Restore VM snapshot
async function restoreVmSnapshot(vmName, snapshotName) {
  try {
    const vmDir = path.join(STORAGE_CONFIG.baseDir, vmName);
    const diskImage = path.join(vmDir, 'disk.qcow2');

    // Restore snapshot using qemu-img
    await execPromise(`qemu-img snapshot -a "${snapshotName}" "${diskImage}"`);

    return true;
  } catch (error) {
    console.error('Failed to restore VM snapshot:', error);
    throw error;
  }
}

// List VM snapshots
async function listVmSnapshots(vmName) {
  try {
    const vmDir = path.join(STORAGE_CONFIG.baseDir, vmName);
    const diskImage = path.join(vmDir, 'disk.qcow2');

    const { stdout } = await execPromise(`qemu-img snapshot -l "${diskImage}"`);
    return stdout.split('\n')
      .filter(line => line.trim())
      .map(line => {
        const parts = line.split(/\s+/);
        return {
          id: parts[0],
          tag: parts[1],
          vmSize: parts[2],
          date: parts[3],
          vmClock: parts[4]
        };
      });
  } catch (error) {
    console.error('Failed to list VM snapshots:', error);
    throw error;
  }
}

// Start VM
async function startVm(vmName, config) {
  try {
    const vmDir = path.join(STORAGE_CONFIG.baseDir, vmName);
    const diskImage = path.join(vmDir, 'disk.qcow2');
    const logFile = path.join(vmDir, 'qemu.log');
    
    // Create spice socket for clipboard sharing
    const spiceSocket = path.join(vmDir, 'spice.sock');
    
    // Ensure the VM directory exists
    await fs.mkdir(vmDir, { recursive: true });

    // Check if required files exist
    console.log('Checking VM files...');
    try {
      await fs.access(diskImage);
      console.log('Disk image exists:', diskImage);
    } catch (error) {
      throw new Error(`Disk image not found: ${diskImage}`);
    }

    if (config.iso) {
      try {
        await fs.access(config.iso);
        console.log('ISO file exists:', config.iso);
      } catch (error) {
        throw new Error(`ISO file not found: ${config.iso}`);
      }
    }

    // Clean up any existing sockets or pid files
    try {
      await fs.unlink(path.join(vmDir, 'monitor.sock')).catch(() => {});
      await fs.unlink(spiceSocket).catch(() => {});
      await fs.unlink(path.join(vmDir, 'qemu.pid')).catch(() => {});
    } catch (error) {
      console.log('Cleanup of old files failed:', error);
    }
    
    // Build QEMU command with optimizations
    const qemuCmd = [
      'qemu-system-x86_64',
      '-enable-kvm',
      `-m ${config.ram}`,
      '-cpu host',
      `-smp ${config.cpus}`,
      `-drive file="${diskImage}",format=qcow2,if=virtio,cache=none,aio=native,cache.direct=on`,
      config.iso ? `-cdrom "${config.iso}"` : '',
      config.iso ? '-boot d' : '',
      '-net nic,model=virtio -net user',
      '-vga qxl',  // Use SPICE-compatible video
      '-device virtio-tablet-pci',  // Better mouse integration
      '-device virtio-keyboard-pci',  // Better keyboard integration
      '-device virtio-balloon-pci',  // Memory ballooning
      `-spice unix=on,addr="${spiceSocket}",disable-ticketing=on`,
      '-device virtio-serial-pci',  // Add virtio-serial controller
      '-device virtserialport,chardev=spicechannel0,name=com.redhat.spice.0',
      '-chardev spicevmc,id=spicechannel0,name=vdagent',
      '-display gtk',
      '-daemonize',
      `-pidfile "${vmDir}/qemu.pid"`,
      `-monitor unix:"${vmDir}/monitor.sock",server,nowait`,
    ].filter(Boolean);

    // First try to run QEMU with version check
    try {
      const { stdout: versionInfo } = await execPromise('qemu-system-x86_64 -version');
      console.log('QEMU version:', versionInfo);
    } catch (error) {
      throw new Error(`QEMU not found or not executable: ${error.message}`);
    }

    // Check KVM availability
    try {
      await fs.access('/dev/kvm');
      console.log('KVM is available');
    } catch (error) {
      throw new Error('KVM is not available. Please ensure KVM is properly set up and you have permission to access it.');
    }

    // Now run the VM command with output redirection to a log file
    const cmd = `bash -c 'exec ${qemuCmd.join(' ')} > "${logFile}" 2>&1 & echo $!'`;
    console.log('Starting VM with command:', cmd);
    
    // Execute the command
    const { stdout, stderr } = await execPromise(cmd);
    console.log('Command output:', { stdout, stderr });
    
    const pid = parseInt(stdout.trim());

    // Verify the process exists
    if (isNaN(pid) || pid <= 0) {
      const log = await fs.readFile(logFile, 'utf8').catch(() => 'Could not read log file');
      console.error('QEMU log output:', log);
      throw new Error(`Failed to get valid PID. QEMU output: ${log}`);
    }

    console.log('Got PID:', pid);

    // Wait a moment for QEMU to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify the process is still running
    try {
      process.kill(pid, 0);
      console.log('Process is running');
    } catch (e) {
      const log = await fs.readFile(logFile, 'utf8').catch(() => 'Could not read log file');
      console.error('QEMU log output:', log);
      throw new Error(`VM process failed to start properly. QEMU output: ${log}`);
    }

    // Double check that the pid file exists and matches
    try {
      const pidFileContent = await fs.readFile(path.join(vmDir, 'qemu.pid'), 'utf8');
      const pidFromFile = parseInt(pidFileContent.trim());
      console.log('PID from file:', pidFromFile);
      if (pidFromFile !== pid) {
        throw new Error(`PID mismatch: got ${pid} but file contains ${pidFromFile}`);
      }
    } catch (error) {
      const log = await fs.readFile(logFile, 'utf8').catch(() => 'Could not read log file');
      console.error('QEMU log output:', log);
      throw new Error(`Failed to verify VM pid file: ${error.message}. QEMU output: ${log}`);
    }

    // Check if the monitor socket was created
    try {
      await fs.access(path.join(vmDir, 'monitor.sock'));
      console.log('Monitor socket created successfully');
    } catch (error) {
      const log = await fs.readFile(logFile, 'utf8').catch(() => 'Could not read log file');
      console.error('QEMU log output:', log);
      throw new Error(`Monitor socket not created. QEMU output: ${log}`);
    }

    console.log('VM started successfully');
    return pid;
  } catch (error) {
    console.error('Failed to start VM:', error);
    // Try to read the log file if it exists
    try {
      const log = await fs.readFile(path.join(STORAGE_CONFIG.baseDir, vmName, 'qemu.log'), 'utf8');
      console.error('QEMU log contents:', log);
    } catch (logError) {
      console.error('Could not read QEMU log:', logError);
    }
    throw error;
  }
}

// Stop VM gracefully
async function stopVm(pid) {
  try {
    // Try graceful shutdown first
    process.kill(pid, 'SIGTERM');
    
    // Wait for process to end
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Shutdown timeout'));
      }, 30000);

      const checkInterval = setInterval(() => {
        try {
          process.kill(pid, 0); // Check if process exists
        } catch (e) {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve();
        }
      }, 500);
    });

    return true;
  } catch (error) {
    console.error('Failed to stop VM:', error);
    throw error;
  }
}

// Force kill VM
async function forceKillVm(pid) {
  try {
    // Send SIGKILL to the process group to ensure all related processes are terminated
    process.kill(-pid, 'SIGKILL');
    return true;
  } catch (error) {
    // If process is already gone, consider it a success
    if (error.code === 'ESRCH') {
      return true;
    }
    console.error('Failed to force kill VM:', error);
    throw error;
  }
}

// Get VM status
async function getVmStatus(vmName) {
  try {
    const vmDir = path.join(STORAGE_CONFIG.baseDir, vmName);
    const pidFile = path.join(vmDir, 'qemu.pid');

    try {
      const pidContent = await fs.readFile(pidFile, 'utf8');
      const pid = parseInt(pidContent.trim());
      
      try {
        process.kill(pid, 0); // Check if process exists
        return 'running';
      } catch (e) {
        return 'stopped';
      }
    } catch (e) {
      return 'stopped';
    }
  } catch (error) {
    console.error('Failed to get VM status:', error);
    return 'unknown';
  }
}

// Get VM resource usage
async function getVmResources(pid) {
  try {
    const { stdout: cpuInfo } = await execPromise(`ps -p ${pid} -o %cpu,%mem`);
    const lines = cpuInfo.trim().split('\n');
    if (lines.length < 2) throw new Error('No process info available');
    
    const [cpu, mem] = lines[1].trim().split(/\s+/).map(Number);
    
    return { cpu, mem };
  } catch (error) {
    console.error('Failed to get VM resources:', error);
    return { cpu: 0, mem: 0 };
  }
}

// Detach ISO from VM
async function detachIso(vmName) {
  try {
    const vmDir = path.join(STORAGE_CONFIG.baseDir, vmName);
    const monitorSocket = path.join(vmDir, 'monitor.sock');

    // Check if monitor socket exists
    try {
      await fs.access(monitorSocket);
    } catch (error) {
      throw new Error('VM monitor socket not found. Is the VM running?');
    }

    // Use socat to send command to QEMU monitor
    const cmd = `echo "eject -f ide1-cd0" | socat - UNIX-CONNECT:${monitorSocket}`;
    await execPromise(cmd);
    
    console.log('ISO detached successfully');
    return true;
  } catch (error) {
    console.error('Failed to detach ISO:', error);
    throw error;
  }
}

module.exports = {
  STORAGE_CONFIG,
  initializeStorage,
  createVmImage,
  deleteVmImage,
  cloneVmImage,
  createVmSnapshot,
  restoreVmSnapshot,
  listVmSnapshots,
  startVm,
  stopVm,
  forceKillVm,
  getVmStatus,
  getVmResources,
  detachIso
}; 