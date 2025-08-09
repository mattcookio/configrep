import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useStdout } from 'ink';
import clipboardy from 'clipboardy';

interface ConfigFile {
  path: string;
  name: string;
  relativePath: string;
  type: 'env' | 'json' | 'yaml' | 'toml' | 'ini' | 'unknown';
  size: number;
  depth: number;
}

interface ConfigEntry {
  key: string;
  value: string;
  file: string;
}

interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  isConfigEntry?: boolean;
  children: TreeNode[];
  configFile?: ConfigFile;
  configEntry?: ConfigEntry;
  expanded?: boolean;
  parent?: TreeNode;
}

interface MillerTreeComponentProps {
  tree: TreeNode;
  onExit: () => void;
}

interface Column {
  items: TreeNode[];
  selectedIndex: number;
  title: string;
}

interface ActionMenuState {
  isOpen: boolean;
  entry: ConfigEntry | null;
  selectedActionIndex: number;
  columnIndex: number;
}

const getFileIcon = (type: string): string => {
  switch (type) {
    case 'env': return '🌍';
    case 'json': return '📋';
    case 'yaml': return '📄';
    case 'toml': return '⚙️';
    case 'ini': return '🔧';
    default: return '📄';
  }
};

const MillerTreeComponent: React.FC<MillerTreeComponentProps> = ({ tree, onExit }) => {
  const { stdout } = useStdout();
  const [columns, setColumns] = useState<Column[]>([]);
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [actionMenu, setActionMenu] = useState<ActionMenuState>({
    isOpen: false,
    entry: null,
    selectedActionIndex: 0,
    columnIndex: -1
  });

  // Calculate how many columns can fit based on terminal width
  const getVisibleColumns = () => {
    const terminalWidth = stdout?.columns || 80;
    
    // Determine max columns based on terminal width
    let maxVisibleColumns = 2; // Start with minimum of 2
    
    if (terminalWidth >= 120) {
      maxVisibleColumns = 3;
    }
    if (terminalWidth >= 180) {
      maxVisibleColumns = 4; // For really wide terminals
    }
    
    // If we have an action menu, account for its wider width
    const hasActionMenu = columns.some(col => col.title.startsWith('Actions:'));
    if (hasActionMenu && terminalWidth < 150) {
      maxVisibleColumns = Math.max(2, maxVisibleColumns - 1);
    }
    
    return Math.min(maxVisibleColumns, columns.length);
  };

  // Get the range of columns to display (always include the active column)
  const getColumnRange = () => {
    const visibleCount = getVisibleColumns();
    
    if (columns.length <= visibleCount) {
      // Show all columns if they fit
      return { startIndex: 0, endIndex: columns.length };
    }
    
    // Calculate range to include active column
    let startIndex = Math.max(0, activeColumnIndex - Math.floor(visibleCount / 2));
    let endIndex = startIndex + visibleCount;
    
    // Adjust if we're near the end
    if (endIndex > columns.length) {
      endIndex = columns.length;
      startIndex = Math.max(0, endIndex - visibleCount);
    }
    
    // Ensure active column is always visible
    if (activeColumnIndex < startIndex) {
      startIndex = activeColumnIndex;
      endIndex = Math.min(columns.length, startIndex + visibleCount);
    } else if (activeColumnIndex >= endIndex) {
      endIndex = activeColumnIndex + 1;
      startIndex = Math.max(0, endIndex - visibleCount);
    }
    
    return { startIndex, endIndex };
  };

  // Action options are now generated dynamically with JSON preview

  // Initialize columns with root directory
  useEffect(() => {
    const rootColumn: Column = {
      items: tree.children,
      selectedIndex: 0,
      title: tree.name
    };
    setColumns([rootColumn]);
    setActiveColumnIndex(0);
    setActionMenu({
      isOpen: false,
      entry: null,
      selectedActionIndex: 0,
      columnIndex: -1
    });
  }, [tree]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      // Reset all state on unmount
      setColumns([]);
      setActiveColumnIndex(0);
      setStatusMessage('');
      setActionMenu({
        isOpen: false,
        entry: null,
        selectedActionIndex: 0,
        columnIndex: -1
      });
    };
  }, []);

  const handleActionMenuAction = async (actionIndex: number, entry: ConfigEntry) => {
    let message = '';
    
    switch (actionIndex) {
      case 0: // Copy key
        await clipboardy.write(entry.key);
        message = `✅ Copied key "${entry.key}" to clipboard`;
        break;
      case 1: // Copy value
        await clipboardy.write(entry.value);
        message = `✅ Copied value to clipboard`;
        break;
      case 2: // Copy key=value
        await clipboardy.write(`${entry.key}=${entry.value}`);
        message = `✅ Copied "${entry.key}=${entry.value}" to clipboard`;
        break;
      case 3: // Copy JSON format
        const jsonFormat = `"${entry.key}": ${JSON.stringify(entry.value)}`;
        await clipboardy.write(jsonFormat);
        message = `✅ Copied JSON format to clipboard`;
        break;
      case 4: // View full value
        message = `📋 Full value: ${entry.value}`;
        break;
      case 5: // Cancel
        // Go back to previous column
        const newColumns = [...columns];
        newColumns.splice(activeColumnIndex); // Remove action column
        setColumns(newColumns);
        setActiveColumnIndex(activeColumnIndex - 1);
        setActionMenu({
          isOpen: false,
          entry: null,
          selectedActionIndex: 0,
          columnIndex: -1
        });
        return;
    }
    
    // Show status message
    if (message) {
      setStatusMessage(message);
      setTimeout(() => setStatusMessage(''), 3000);
    }
    
    // Go back to previous column after action
    const newColumns = [...columns];
    newColumns.splice(activeColumnIndex); // Remove action column
    setColumns(newColumns);
    setActiveColumnIndex(activeColumnIndex - 1);
    setActionMenu({
      isOpen: false,
      entry: null,
      selectedActionIndex: 0,
      columnIndex: -1
    });
  };

  const updateSelection = (columnIndex: number, itemIndex: number) => {
    const column = columns[columnIndex];
    if (!column || itemIndex >= column.items.length || itemIndex < 0) return;
    
    // Just update the selected index in the current column
    const newColumns = [...columns];
    newColumns[columnIndex] = { ...column, selectedIndex: itemIndex };
    setColumns(newColumns);
  };

  const navigateToItem = (columnIndex: number, itemIndex: number) => {
    const column = columns[columnIndex];
    if (!column || itemIndex >= column.items.length || itemIndex < 0) return;

    const selectedItem = column.items[itemIndex];
    if (!selectedItem) return;
    
    // Update the selected index in the current column
    const newColumns = [...columns];
    newColumns[columnIndex] = { ...column, selectedIndex: itemIndex };
    
    // Remove columns to the right of the current one
    newColumns.splice(columnIndex + 1);
    
    // If the selected item has children, add a new column
    if (selectedItem.children && selectedItem.children.length > 0) {
      const newColumn: Column = {
        items: selectedItem.children,
        selectedIndex: 0,
        title: selectedItem.name
      };
      newColumns.push(newColumn);
    }
    
    setColumns(newColumns);
  };

  useInput((input, key) => {
    const currentColumn = columns[activeColumnIndex];
    if (!currentColumn) return;

    if (key.upArrow || (input === 'k' && !key.ctrl && !key.meta && !key.shift)) {
      const newIndex = currentColumn.selectedIndex === 0 
        ? currentColumn.items.length - 1  // Loop to bottom
        : currentColumn.selectedIndex - 1;
      updateSelection(activeColumnIndex, newIndex);
    } else if (key.downArrow || (input === 'j' && !key.ctrl && !key.meta && !key.shift)) {
      const newIndex = currentColumn.selectedIndex === currentColumn.items.length - 1
        ? 0  // Loop to top
        : currentColumn.selectedIndex + 1;
      updateSelection(activeColumnIndex, newIndex);
    } else if (key.leftArrow || (input === 'h' && !key.ctrl && !key.meta && !key.shift)) {
      // Move to previous column or close action menu
      if (currentColumn.title.startsWith('Actions:')) {
        // Close action menu and go back to previous column
        const newColumns = [...columns];
        newColumns.splice(activeColumnIndex); // Remove action column
        setColumns(newColumns);
        setActiveColumnIndex(activeColumnIndex - 1);
        setActionMenu({
          isOpen: false,
          entry: null,
          selectedActionIndex: 0,
          columnIndex: -1
        });
      } else if (activeColumnIndex > 0) {
        setActiveColumnIndex(activeColumnIndex - 1);
      }
    } else if (key.rightArrow || (input === 'l' && !key.ctrl && !key.meta && !key.shift)) {
      // First check if current item can be "opened" (has actions or children)
      const selectedItem = currentColumn.items[currentColumn.selectedIndex];
      
      if (selectedItem?.isConfigEntry && selectedItem.configEntry) {
        // Trigger action menu for config entries with dynamic JSON preview
        const jsonPreview = `"${selectedItem.configEntry.key}": ${JSON.stringify(selectedItem.configEntry.value)}`;
        const shortJsonPreview = jsonPreview.length > 50 ? jsonPreview.substring(0, 47) + '...' : jsonPreview;
        
        const dynamicActionOptions = [
          'Copy key to clipboard',
          'Copy value to clipboard', 
          'Copy key=value to clipboard',
          `Copy JSON: ${shortJsonPreview}`,
          'View full value',
          'Cancel'
        ];
        
        const actionColumn: Column = {
          items: dynamicActionOptions.map((option, index) => ({
            name: option,
            path: `action:${index}`,
            isFile: false,
            children: [],
            isConfigEntry: false
          })),
          selectedIndex: 0,
          title: `Actions: ${selectedItem.configEntry.key}`
        };
        
        const newColumns = [...columns];
        newColumns.splice(activeColumnIndex + 1);
        newColumns.push(actionColumn);
        setColumns(newColumns);
        setActiveColumnIndex(activeColumnIndex + 1);
        
        setActionMenu({
          isOpen: true,
          entry: selectedItem.configEntry,
          selectedActionIndex: 0,
          columnIndex: activeColumnIndex + 1
        });
      } else if (selectedItem && selectedItem.children && selectedItem.children.length > 0) {
        // Navigate into folders
        navigateToItem(activeColumnIndex, currentColumn.selectedIndex);
        setActiveColumnIndex(activeColumnIndex + 1);
      } else if (activeColumnIndex < columns.length - 1) {
        // Only move to next column if current item can't be opened
        setActiveColumnIndex(activeColumnIndex + 1);
      }
    } else if (key.return) {
      const selectedItem = currentColumn.items[currentColumn.selectedIndex];
      if (selectedItem?.isConfigEntry && selectedItem.configEntry) {
        // Create action menu as a new column with dynamic JSON preview
        const jsonPreview = `"${selectedItem.configEntry.key}": ${JSON.stringify(selectedItem.configEntry.value)}`;
        const shortJsonPreview = jsonPreview.length > 50 ? jsonPreview.substring(0, 47) + '...' : jsonPreview;
        
        const dynamicActionOptions = [
          'Copy key to clipboard',
          'Copy value to clipboard', 
          'Copy key=value to clipboard',
          `Copy JSON: ${shortJsonPreview}`,
          'View full value',
          'Cancel'
        ];
        
        const actionColumn: Column = {
          items: dynamicActionOptions.map((option, index) => ({
            name: option,
            path: `action:${index}`,
            isFile: false,
            children: [],
            isConfigEntry: false
          })),
          selectedIndex: 0,
          title: `Actions: ${selectedItem.configEntry.key}`
        };
        
        const newColumns = [...columns];
        newColumns.splice(activeColumnIndex + 1); // Remove columns to the right
        newColumns.push(actionColumn);
        setColumns(newColumns);
        setActiveColumnIndex(activeColumnIndex + 1);
        
        // Store the config entry for action execution
        setActionMenu({
          isOpen: true,
          entry: selectedItem.configEntry,
          selectedActionIndex: 0,
          columnIndex: activeColumnIndex + 1
        });
      } else if (currentColumn.title.startsWith('Actions:') && actionMenu.entry) {
        // Execute the selected action
        const actionIndex = currentColumn.selectedIndex;
        handleActionMenuAction(actionIndex, actionMenu.entry);
      } else {
        // Navigate into the item
        navigateToItem(activeColumnIndex, currentColumn.selectedIndex);
        if (columns.length > activeColumnIndex + 1) {
          setActiveColumnIndex(activeColumnIndex + 1);
        }
      }
    } else if (key.escape) {
      onExit();
    } else if (input === 'q') {
      onExit();
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="blue">📂 Config File Explorer - Miller Columns</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>↑↓/jk: Navigate items | ←→/hl: Switch columns | Enter: Select/Open | q/Esc: Exit</Text>
      </Box>
      
      {/* Breadcrumb when columns are hidden */}
      {(() => {
        const { startIndex, endIndex } = getColumnRange();
        const hasHiddenLeft = startIndex > 0;
        const hasHiddenRight = endIndex < columns.length;
        
        if (hasHiddenLeft || hasHiddenRight) {
          const visibleTitles = columns.slice(startIndex, endIndex).map(col => col.title);
          let breadcrumb = '';
          
          if (hasHiddenLeft) {
            breadcrumb += '... › ';
          }
          breadcrumb += visibleTitles.join(' › ');
          if (hasHiddenRight) {
            breadcrumb += ' › ...';
          }
          
          return (
            <Box marginBottom={1}>
              <Text dimColor>Path: {breadcrumb}</Text>
            </Box>
          );
        }
        return null;
      })()}
      
      <Box flexDirection="row" position="relative">
        {(() => {
          const { startIndex, endIndex } = getColumnRange();
          const visibleColumns = columns.slice(startIndex, endIndex);
          
          return visibleColumns.map((column, visibleIndex) => {
            const columnIndex = startIndex + visibleIndex;
            // Make action menu columns wider to accommodate JSON preview text
            const columnWidth = column.title.startsWith('Actions:') ? 60 : 30;
            // Adjust text truncation length based on column width
            const maxTextLength = columnWidth === 60 ? 55 : 25;
            const truncateLength = columnWidth === 60 ? 52 : 22;
            
            return (
            <Box key={columnIndex} flexDirection="column" width={columnWidth} marginRight={1}>
              {/* Column header */}
              <Box marginBottom={1}>
                <Text 
                  bold 
                  color={columnIndex === activeColumnIndex ? 'cyan' : 'gray'}
                >
                  {columnIndex === activeColumnIndex ? '▶ ' : '  '}{column.title}
                </Text>
              </Box>
              
              {/* Column items */}
              <Box flexDirection="column">
                {column.items.map((item, itemIndex) => {
                  const isSelected = itemIndex === column.selectedIndex && columnIndex === activeColumnIndex;
                  const isHighlighted = itemIndex === column.selectedIndex && columnIndex <= activeColumnIndex;
                  
                  let icon: string;
                  if (item.isConfigEntry) {
                    icon = '🔑';
                  } else if (item.isFile) {
                    icon = getFileIcon(item.configFile?.type || 'unknown');
                  } else if (column.title.startsWith('Actions:')) {
                    // No icon for action items
                    icon = '';
                  } else {
                    icon = '📁';
                  }
                  
                  return (
                    <Box key={itemIndex}>
                      <Text 
                        color={isSelected ? 'black' : (isHighlighted ? 'white' : undefined)}
                        backgroundColor={isSelected ? 'white' : (isHighlighted ? 'gray' : undefined)}
                        bold={isHighlighted}
                      >
                        {isSelected ? '❯ ' : (isHighlighted ? '• ' : '  ')}
                        {icon && `${icon} `}{item.name.length > maxTextLength ? item.name.substring(0, truncateLength) + '...' : item.name}
                      </Text>
                    </Box>
                  );
                })}
              </Box>
            </Box>
            );
          });
        })()}
      </Box>
      
      {/* Status message at bottom left */}
      {statusMessage && (
        <Box marginTop={1}>
          <Text color="green">{statusMessage}</Text>
        </Box>
      )}
    </Box>
  );
};

export default MillerTreeComponent;