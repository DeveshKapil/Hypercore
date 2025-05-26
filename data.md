# Shared Folder Mounting Instructions

According to the mount script we created, the shared folder should be mounted at `/shared` in your VM. So any files you place in `~/.hypercore/shared_folder/` on your host should appear in `/shared` inside your VM.

Let's verify this in your VM:

1. First, check if the 9P filesystem is properly mounted:
```bash
sudo mount | grep hypercore_share
```

2. If it's not mounted, mount it:
```bash
sudo mount -t 9p -o trans=virtio,version=9p2000.L hypercore_share /shared
```

3. Then look in the `/shared` directory:
```bash
ls -la /shared
```

If you don't see your files, let's check:

1. The mount point exists:
```bash
ls -ld /shared
```

2. The 9P filesystem is properly mounted:
```bash
df -h /shared
```

3. The permissions are correct:
```bash
ls -la /shared
```

Remember:
- The files should appear in `/shared` inside your VM
- You might need to use `sudo` to access the directory depending on how the 9P filesystem is mounted
- Any changes you make in either the host's `~/.hypercore/shared_folder/` or the VM's `/shared` directory should be immediately visible in both locations 