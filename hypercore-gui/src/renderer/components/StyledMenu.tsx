import React, { useState } from 'react';
import { IconButton, Tooltip, styled } from '@mui/material';
import { SvgIconProps } from '@mui/material/SvgIcon';
import { SxProps, Theme } from '@mui/material/styles';

interface MenuIconButtonProps {
  icon: React.ComponentType<SvgIconProps>;
  tooltip: string;
  onClick?: () => void;
  color?: 'inherit' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' | 'default';
  disabled?: boolean;
  sx?: SxProps<Theme>;
}

const StyledIconButton = styled(IconButton)(({ theme }) => ({
  position: 'relative',
  transition: 'all 0.3s ease',
  '&:hover': {
    transform: 'scale(1.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  '&::after': {
    content: '""',
    position: 'absolute',
    bottom: 0,
    left: '50%',
    width: 0,
    height: 2,
    backgroundColor: theme.palette.primary.main,
    transition: 'all 0.3s ease',
    transform: 'translateX(-50%)',
  },
  '&:hover::after': {
    width: '80%',
  },
}));

export const MenuIconButton: React.FC<MenuIconButtonProps> = ({
  icon: Icon,
  tooltip,
  onClick,
  color = 'inherit',
  disabled = false,
  sx,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Tooltip 
      title={tooltip}
      placement="bottom"
      open={isHovered}
      onClose={() => setIsHovered(false)}
      onOpen={() => setIsHovered(true)}
    >
      <span>
        <StyledIconButton
          color={color}
          onClick={onClick}
          disabled={disabled}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          sx={sx}
        >
          <Icon />
        </StyledIconButton>
      </span>
    </Tooltip>
  );
};

// Styled container for menu items
export const MenuContainer = styled('div')(({ theme }) => ({
  display: 'flex',
  gap: theme.spacing(1),
  alignItems: 'center',
})); 