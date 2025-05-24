const { exec } = require('child_process');
const path = require('path');

// Ceph storage configuration
const CEPH_CONFIG = {
  confPath: '/home/dev/Documents/Hypercore/ceph.conf',
  pools: {
    vm: {
      name: 'vm-pool',
      pg_num: 8,
      pgp_num: 8,
      size: 1,  // replication factor
    },
    data: {
      name: 'data-pool',
      pg_num: 8,
      pgp_num: 8,
      size: 1,
    }
  },
  defaultSizes: {
    vm: 10, // GB
    data: 20, // GB
  }
};

// Execute Ceph commands
async function execCephCommand(command) {
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

// Initialize Ceph storage pools
async function initializeCephStorage() {
  try {
    // Get existing pools
    const existingPools = await execCephCommand(
      `ceph -c ${CEPH_CONFIG.confPath} osd pool ls`
    );
    const poolList = existingPools.split('\n');

    // Create pools if they don't exist
    for (const [key, pool] of Object.entries(CEPH_CONFIG.pools)) {
      if (!poolList.includes(pool.name)) {
        // Create pool
        await execCephCommand(
          `ceph -c ${CEPH_CONFIG.confPath} osd pool create ${pool.name} ${pool.pg_num}`
        );

        // Set pool parameters
        await execCephCommand(
          `ceph -c ${CEPH_CONFIG.confPath} osd pool set ${pool.name} size ${pool.size}`
        );
        await execCephCommand(
          `ceph -c ${CEPH_CONFIG.confPath} osd pool set ${pool.name} pgp_num ${pool.pgp_num}`
        );
      }
    }

    // Enable RBD application on pools
    for (const pool of Object.values(CEPH_CONFIG.pools)) {
      await execCephCommand(
        `ceph -c ${CEPH_CONFIG.confPath} osd pool application enable ${pool.name} rbd`
      );
    }

    return true;
  } catch (error) {
    console.error('Failed to initialize Ceph storage:', error);
    return false;
  }
}

// Create RBD image for VM
async function createVmImage(vmName) {
  const imageName = `${vmName}-disk`;
  try {
    // Create main VM disk
    await execCephCommand(
      `rbd -c ${CEPH_CONFIG.confPath} create ${CEPH_CONFIG.pools.vm.name}/${imageName} --size ${CEPH_CONFIG.defaultSizes.vm}G`
    );

    // Create data disk
    const dataImageName = `${vmName}-data`;
    await execCephCommand(
      `rbd -c ${CEPH_CONFIG.confPath} create ${CEPH_CONFIG.pools.data.name}/${dataImageName} --size ${CEPH_CONFIG.defaultSizes.data}G`
    );

    return {
      systemDisk: `rbd:${CEPH_CONFIG.pools.vm.name}/${imageName}:conf=${CEPH_CONFIG.confPath}`,
      dataDisk: `rbd:${CEPH_CONFIG.pools.data.name}/${dataImageName}:conf=${CEPH_CONFIG.confPath}`,
    };
  } catch (error) {
    console.error('Failed to create RBD images:', error);
    throw error;
  }
}

// Clone VM images
async function cloneVmImages(sourceVm, targetVm) {
  try {
    // Clone system disk
    const sourceImage = `${sourceVm}-disk`;
    const targetImage = `${targetVm}-disk`;
    await execCephCommand(
      `rbd -c ${CEPH_CONFIG.confPath} snap create ${CEPH_CONFIG.pools.vm.name}/${sourceImage}@snap`
    );
    await execCephCommand(
      `rbd -c ${CEPH_CONFIG.confPath} clone ${CEPH_CONFIG.pools.vm.name}/${sourceImage}@snap ${CEPH_CONFIG.pools.vm.name}/${targetImage}`
    );

    // Clone data disk
    const sourceDataImage = `${sourceVm}-data`;
    const targetDataImage = `${targetVm}-data`;
    await execCephCommand(
      `rbd -c ${CEPH_CONFIG.confPath} snap create ${CEPH_CONFIG.pools.data.name}/${sourceDataImage}@snap`
    );
    await execCephCommand(
      `rbd -c ${CEPH_CONFIG.confPath} clone ${CEPH_CONFIG.pools.data.name}/${sourceDataImage}@snap ${CEPH_CONFIG.pools.data.name}/${targetDataImage}`
    );

    return {
      systemDisk: `rbd:${CEPH_CONFIG.pools.vm.name}/${targetImage}:conf=${CEPH_CONFIG.confPath}`,
      dataDisk: `rbd:${CEPH_CONFIG.pools.data.name}/${targetDataImage}:conf=${CEPH_CONFIG.confPath}`,
    };
  } catch (error) {
    console.error('Failed to clone RBD images:', error);
    throw error;
  }
}

// Delete VM images
async function deleteVmImages(vmName) {
  try {
    // Delete system disk
    const imageName = `${vmName}-disk`;
    await execCephCommand(
      `rbd -c ${CEPH_CONFIG.confPath} rm ${CEPH_CONFIG.pools.vm.name}/${imageName}`
    );

    // Delete data disk
    const dataImageName = `${vmName}-data`;
    await execCephCommand(
      `rbd -c ${CEPH_CONFIG.confPath} rm ${CEPH_CONFIG.pools.data.name}/${dataImageName}`
    );
  } catch (error) {
    console.error('Failed to delete RBD images:', error);
    throw error;
  }
}

// Create VM snapshot
async function createVmSnapshot(vmName, snapshotName) {
  try {
    // Snapshot system disk
    const imageName = `${vmName}-disk`;
    await execCephCommand(
      `rbd -c ${CEPH_CONFIG.confPath} snap create ${CEPH_CONFIG.pools.vm.name}/${imageName}@${snapshotName}`
    );

    // Snapshot data disk
    const dataImageName = `${vmName}-data`;
    await execCephCommand(
      `rbd -c ${CEPH_CONFIG.confPath} snap create ${CEPH_CONFIG.pools.data.name}/${dataImageName}@${snapshotName}`
    );
  } catch (error) {
    console.error('Failed to create snapshots:', error);
    throw error;
  }
}

// Restore VM snapshot
async function restoreVmSnapshot(vmName, snapshotName) {
  try {
    // Restore system disk
    const imageName = `${vmName}-disk`;
    await execCephCommand(
      `rbd -c ${CEPH_CONFIG.confPath} snap rollback ${CEPH_CONFIG.pools.vm.name}/${imageName}@${snapshotName}`
    );

    // Restore data disk
    const dataImageName = `${vmName}-data`;
    await execCephCommand(
      `rbd -c ${CEPH_CONFIG.confPath} snap rollback ${CEPH_CONFIG.pools.data.name}/${dataImageName}@${snapshotName}`
    );
  } catch (error) {
    console.error('Failed to restore snapshots:', error);
    throw error;
  }
}

module.exports = {
  CEPH_CONFIG,
  initializeCephStorage,
  createVmImage,
  cloneVmImages,
  deleteVmImages,
  createVmSnapshot,
  restoreVmSnapshot,
}; 