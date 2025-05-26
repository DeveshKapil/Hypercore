import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Divider,
  TextField,
  Menu,
  MenuItem,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Folder as FolderIcon,
  Info as InfoIcon,
  Close as CloseIcon,
  CreateNewFolder as CreateNewFolderIcon,
  Delete as DeleteIcon,
  Upload as UploadIcon,
  MoreVert as MoreVertIcon,
  InsertDriveFile as FileIcon,
  Help as HelpIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';

const { ipcRenderer } = window.require('electron');

interface SharedFolderDialogProps {
  open: boolean;
  onClose: () => void;
}

interface FileItem {
  name: string;
  isDirectory: boolean;
}

const SharedFolderDialog: React.FC<SharedFolderDialogProps> = ({
  open,
  onClose,
}) => {
  const [sharedPath, setSharedPath] = React.useState('');
  const [mountPoint, setMountPoint] = React.useState('');
  const [files, setFiles] = React.useState<FileItem[]>([]);
  const [newFolderName, setNewFolderName] = React.useState('');
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = React.useState(false);
  const [selectedItem, setSelectedItem] = React.useState<string | null>(null);
  const [menuAnchorEl, setMenuAnchorEl] = React.useState<null | HTMLElement>(null);
  const [currentPath, setCurrentPath] = React.useState('');

  React.useEffect(() => {
    if (open) {
      loadSharedFolderInfo();
    }
  }, [open]);

  const loadSharedFolderInfo = async () => {
    try {
      const config = await ipcRenderer.invoke('get-shared-folder-info');
      setSharedPath(config.diskPath);
      setMountPoint(config.mountPoint);
      setCurrentPath(config.diskPath);
      await loadFiles(config.diskPath);
    } catch (error) {
      console.error('Failed to load shared folder info:', error);
    }
  };

  const loadFiles = async (path: string) => {
    try {
      const items = await ipcRenderer.invoke('list-shared-files', { path });
      setFiles(items);
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  };

  const handleCreateFolder = async () => {
    try {
      if (!newFolderName.trim()) return;
      
      await ipcRenderer.invoke('create-shared-folder', {
        path: currentPath,
        folderName: newFolderName.trim()
      });
      
      setNewFolderName('');
      setCreateFolderDialogOpen(false);
      await loadFiles(currentPath);
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleImportFile = async () => {
    try {
      const result = await ipcRenderer.invoke('import-shared-file', {
        targetPath: currentPath
      });
      if (result.success) {
        await loadFiles(currentPath);
      }
    } catch (error) {
      console.error('Failed to import file:', error);
    }
  };

  const handleDeleteItem = async (itemName: string) => {
    try {
      await ipcRenderer.invoke('delete-shared-item', {
        path: currentPath,
        itemName
      });
      await loadFiles(currentPath);
      setSelectedItem(null);
      setMenuAnchorEl(null);
    } catch (error) {
      console.error('Failed to delete item:', error);
    }
  };

  const handleItemClick = async (item: FileItem) => {
    if (item.isDirectory) {
      const newPath = `${currentPath}/${item.name}`;
      setCurrentPath(newPath);
      await loadFiles(newPath);
    }
  };

  const handleNavigateUp = async () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/');
    if (parentPath && parentPath.startsWith(sharedPath)) {
      setCurrentPath(parentPath);
      await loadFiles(parentPath);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, itemName: string) => {
    event.stopPropagation();
    setSelectedItem(itemName);
    setMenuAnchorEl(event.currentTarget);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">Shared Folder Management</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        <List>
          <ListItem>
            <ListItemIcon>
              <FolderIcon />
            </ListItemIcon>
            <ListItemText
              primary="Shared Disk Path"
              secondary={sharedPath}
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <InfoIcon />
            </ListItemIcon>
            <ListItemText
              primary="VM Mount Point"
              secondary={mountPoint}
            />
          </ListItem>
        </List>
        
        <Accordion sx={{ mb: 2 }}>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            aria-controls="mounting-instructions"
            id="mounting-instructions-header"
          >
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <HelpIcon sx={{ mr: 1 }} />
              <Typography>How to Mount Shared Folder in VM</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="subtitle1" gutterBottom>
              Follow these steps to mount the shared folder in your VM:
            </Typography>
            <Typography component="div" variant="body2">
              <ol>
                <li>
                  <strong>Enable Shared Storage:</strong>
                  <ul>
                    <li>Open VM Settings (gear icon)</li>
                    <li>Toggle "Shared Storage" switch to ON</li>
                    <li>Click "Save Changes"</li>
                  </ul>
                </li>
                <li>
                  <strong>Mount in VM (Linux):</strong>
                  <ul>
                    <li>Open terminal in VM</li>
                    <li>Run: <code>sudo mount-shared.sh</code></li>
                    <li>The shared folder will be mounted at: <code>{mountPoint}</code></li>
                  </ul>
                </li>
                <li>
                  <strong>Before Detaching:</strong>
                  <ul>
                    <li>Run: <code>sudo unmount-shared.sh</code> in VM</li>
                    <li>Then disable Shared Storage in VM Settings</li>
                  </ul>
                </li>
              </ol>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Note: The mount/unmount scripts are automatically created during VM setup.
            </Typography>
          </AccordionDetails>
        </Accordion>
        
        <Divider sx={{ my: 2 }} />
        
        <Box sx={{ mb: 2 }}>
          <Button
            startIcon={<CreateNewFolderIcon />}
            onClick={() => setCreateFolderDialogOpen(true)}
            sx={{ mr: 1 }}
          >
            New Folder
          </Button>
          <Button
            startIcon={<UploadIcon />}
            onClick={handleImportFile}
          >
            Import File
          </Button>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Button
            disabled={currentPath === sharedPath}
            onClick={handleNavigateUp}
            startIcon={<FolderIcon />}
          >
            Up
          </Button>
          <Typography variant="body2" color="text.secondary">
            Current Path: {currentPath}
          </Typography>
        </Box>

        <List>
          {files.map((item) => (
            <ListItem
              key={item.name}
              button
              onClick={() => handleItemClick(item)}
            >
              <ListItemIcon>
                {item.isDirectory ? <FolderIcon /> : <FileIcon />}
              </ListItemIcon>
              <ListItemText primary={item.name} />
              <IconButton
                onClick={(e) => handleMenuOpen(e, item.name)}
                size="small"
              >
                <MoreVertIcon />
              </IconButton>
            </ListItem>
          ))}
        </List>

        <Menu
          anchorEl={menuAnchorEl}
          open={Boolean(menuAnchorEl)}
          onClose={() => {
            setMenuAnchorEl(null);
            setSelectedItem(null);
          }}
        >
          <MenuItem
            onClick={() => {
              if (selectedItem) handleDeleteItem(selectedItem);
            }}
          >
            <ListItemIcon>
              <DeleteIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        </Menu>

        <Dialog
          open={createFolderDialogOpen}
          onClose={() => setCreateFolderDialogOpen(false)}
        >
          <DialogTitle>Create New Folder</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label="Folder Name"
              fullWidth
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateFolderDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateFolder} variant="contained">Create</Button>
          </DialogActions>
        </Dialog>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SharedFolderDialog; 