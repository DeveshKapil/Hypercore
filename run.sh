#!/bin/bash

# Start Ceph monitor
echo "Starting Ceph monitor..."
sudo ceph-mon -i a --conf /home/dev/Hypercore-1/ceph.conf &
MON_PID=$!
sleep 3

# Start Ceph OSD
echo "Starting Ceph OSD..."
sudo ceph-osd -i 0 --osd-data /var/lib/ceph/osd/ceph-0 --conf /home/dev/Hypercore-1/ceph.conf &
OSD_PID=$!
sleep 3

# Check Ceph health
echo "Checking Ceph cluster health..."
ceph -c /home/dev/Hypercore-1/ceph.conf health

# Launch QEMU VM
echo "Launching QEMU VM..."
qemu-system-x86_64 \
  -enable-kvm \
  -m 4096 \
  -smp 4 \
  -drive file=rbd:vm-pool/ubuntu-vm:conf=/home/dev/Hypercore-1/ceph.conf,if=virtio,format=raw \
  -cdrom /home/dev/Downloads/ubuntu-22.04.5-desktop-amd64.iso \
  -boot d

# Optionally, kill Ceph daemons after QEMU exits
echo "Shutting down Ceph daemons..."
sudo kill $MON_PID $OSD_PID
