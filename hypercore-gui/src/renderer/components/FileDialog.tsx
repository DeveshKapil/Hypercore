import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Box,
  Breadcrumbs,
  Link,
  TextField,
  DialogActions,
  Button,
} from '@mui/material';
import {
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
  ArrowUpward as UpIcon,
  Home as HomeIcon,
} from '@mui/icons-material';

const { ipcRenderer } = window.require('electron');

interface FileDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  title: string;
  selectMode: 'file' | 'directory';
  fileFilter?: string[];
}

const FileDialog: React.FC<FileDialogProps> = ({
  open,
  onClose,
  onSelect,
  title,
  selectMode,
  fileFilter = [],
}) => {
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState<{ name: string; isDirectory: boolean }[]>([]);
  const [selectedItem, setSelectedItem] = useState('');

  useEffect(() => {
    if (open) {
      loadInitialPath();
    }
  }, [open]);

  const loadInitialPath = async () => {
    const homePath = await ipcRenderer.invoke('get-home-path');
    setCurrentPath(homePath);
    loadDirectory(homePath);
  };

  const loadDirectory = async (path: string) => {
    try {
      const contents = await ipcRenderer.invoke('read-directory', path);
      setItems(contents);
      setCurrentPath(path);
    } catch (error) {
      console.error('Failed to read directory:', error);
    }
  };

  const handleNavigate = (path: string) => {
    loadDirectory(path);
    setSelectedItem('');
  };

  const handleItemClick = async (name: string, isDirectory: boolean) => {
    const newPath = `${currentPath}/${name}`;
    if (isDirectory) {
      handleNavigate(newPath);
    } else {
      setSelectedItem(newPath);
    }
  };

  const handleUpClick = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    handleNavigate(parentPath);
  };

  const handleHomeClick = () => {
    loadInitialPath();
  };

  const handleSelect = () => {
    if (selectMode === 'directory') {
      onSelect(currentPath);
    } else {
      onSelect(selectedItem);
    }
    onClose();
  };

  const getBreadcrumbs = () => {
    const paths = currentPath.split('/').filter(Boolean);
    return (
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link
          component="button"
          variant="body1"
          onClick={handleHomeClick}
          sx={{ display: 'flex', alignItems: 'center' }}
        >
          <HomeIcon sx={{ mr: 0.5 }} fontSize="small" />
          Home
        </Link>
        {paths.map((path, index) => (
          <Link
            key={index}
            component="button"
            variant="body1"
            onClick={() =>
              handleNavigate(`/${paths.slice(0, index + 1).join('/')}`)
            }
          >
            {path}
          </Link>
        ))}
      </Breadcrumbs>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <IconButton onClick={handleUpClick}>
            <UpIcon />
          </IconButton>
          <IconButton onClick={handleHomeClick}>
            <HomeIcon />
          </IconButton>
          <TextField
            fullWidth
            value={currentPath}
            onChange={(e) => handleNavigate(e.target.value)}
            sx={{ ml: 1 }}
          />
        </Box>
        {getBreadcrumbs()}
        <List>
          {items.map((item) => (
            <ListItem
              button
              key={item.name}
              onClick={() => handleItemClick(item.name, item.isDirectory)}
              selected={`${currentPath}/${item.name}` === selectedItem}
            >
              <ListItemIcon>
                {item.isDirectory ? <FolderIcon /> : <FileIcon />}
              </ListItemIcon>
              <ListItemText primary={item.name} />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSelect}
          variant="contained"
          disabled={selectMode === 'file' && !selectedItem}
        >
          Select
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FileDialog; 