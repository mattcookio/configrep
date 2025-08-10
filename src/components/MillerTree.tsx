import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useStdout } from 'ink';
import clipboardy from 'clipboardy';
import { findMatchingKeys, applyFoundValue, type FoundValue } from '../helpers/find';

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

interface MillerTreeProps {
  tree: TreeNode;
  allConfigs?: Map<string, ConfigEntry[]>;
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

const detectFileType = (filePath: string): ConfigFile['type'] => {
  const name = filePath.split('/').pop() || '';
  if (name.startsWith('.env')) return 'env';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.yaml') || name.endsWith('.yml')) return 'yaml';
  if (name.endsWith('.toml')) return 'toml';
  if (name.endsWith('.ini')) return 'ini';
  return 'unknown';
};

const MillerTree: React.FC<MillerTreeProps> = ({ tree, allConfigs }) => {
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

  // Get the range of columns to display (always include the active column)
  const getColumnRange = () => {
    const terminalWidth = stdout?.columns || 80;
    const availableWidth = terminalWidth - 4;
    
    // Calculate how many columns we can fit, considering their actual content
    let startIndex = 0;
    let endIndex = columns.length;
    
    let totalWidth = 0;
    const columnWidths: number[] = [];
    
    // Calculate natural widths for all columns
    for (let i = 0; i < columns.length; i++) {
      const column = columns[i];
      if (!column) continue;
      
      let maxItemLength = column.title.length + 2;
      
      column.items.forEach(item => {
        let itemLength = 4;
        if (item.isConfigEntry || item.isFile || (!column.title.startsWith('Actions:') && !column.title.startsWith('Found:'))) {
          itemLength += 2;
        }
        itemLength += item.name.length;
        maxItemLength = Math.max(maxItemLength, itemLength);
      });
      
      columnWidths[i] = Math.max(20, Math.min(maxItemLength + 2, 80));
    }
    
    // Start from the active column and expand outward
    startIndex = activeColumnIndex;
    endIndex = activeColumnIndex + 1;
    totalWidth = columnWidths[activeColumnIndex] || 0;
    
    // Expand to show more columns while they fit
    while ((startIndex > 0 || endIndex < columns.length) && totalWidth < availableWidth) {
      let addedColumn = false;
      
      // Try to add a column to the right first (to show what's ahead)
      if (endIndex < columns.length) {
        const nextWidth = columnWidths[endIndex] || 0;
        if (totalWidth + nextWidth <= availableWidth) {
          totalWidth += nextWidth;
          endIndex++;
          addedColumn = true;
        }
      }
      
      // Try to add a column to the left
      if (startIndex > 0 && totalWidth < availableWidth) {
        const prevWidth = columnWidths[startIndex - 1] || 0;
        if (totalWidth + prevWidth <= availableWidth) {
          totalWidth += prevWidth;
          startIndex--;
          addedColumn = true;
        }
      }
      
      if (!addedColumn) break;
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

  const handleApplyFoundValue = async (targetEntry: ConfigEntry, foundValue: FoundValue) => {
    // Create target file info
    const targetFile: ConfigFile = {
      path: targetEntry.file,
      name: targetEntry.file.split('/').pop() || '',
      relativePath: targetEntry.file,
      type: detectFileType(targetEntry.file),
      size: 0,
      depth: 0
    };

    const result = await applyFoundValue(targetFile, targetEntry.key, foundValue);
    
    if (result.success) {
      setStatusMessage(`✅ Updated ${targetEntry.key} with value from ${foundValue.file.name}`);
      
      // Update the allConfigs map with the new value
      if (allConfigs) {
        const entries = allConfigs.get(targetEntry.file);
        if (entries) {
          const entryIndex = entries.findIndex(e => e.key === targetEntry.key);
          if (entryIndex !== -1 && entries[entryIndex]) {
            entries[entryIndex].value = foundValue.value;
            allConfigs.set(targetEntry.file, entries);
          }
        }
      }
      
      // Remove both Found and Actions columns to go back to keys/values
      // Find how many columns to remove (could be 2 or more if there are duplicate Found columns)
      let columnsToRemove = 0;
      for (let i = columns.length - 1; i >= 0; i--) {
        const column = columns[i];
        if (column && (column.title.startsWith('Found:') || column.title.startsWith('Actions:'))) {
          columnsToRemove++;
        } else {
          break;
        }
      }
      
      const newColumns = columns.slice(0, -columnsToRemove);
      
      // Update the values column to reflect the new value
      // Find the column that contains the config entries for this file
      for (let i = 0; i < newColumns.length; i++) {
        const column = newColumns[i];
        if (column && column.items) {
          for (let j = 0; j < column.items.length; j++) {
            const item = column.items[j];
            if (item && item.isConfigEntry && item.configEntry && 
                item.configEntry.key === targetEntry.key && 
                item.configEntry.file === targetEntry.file) {
              // Update the config entry with the new value
              item.configEntry.value = foundValue.value;
              // Update the display name to show the new value
              const truncatedValue = foundValue.value.length > 15 
                ? foundValue.value.substring(0, 12) + '...' 
                : foundValue.value;
              item.name = `${item.configEntry.key} = ${truncatedValue}`;
              break;
            }
          }
        }
      }
      
      setColumns(newColumns);
      setActiveColumnIndex(newColumns.length - 1);
      
      // Clear action menu state
      setActionMenu({
        isOpen: false,
        entry: null,
        selectedActionIndex: 0,
        columnIndex: -1
      });
    } else {
      setStatusMessage(`❌ Failed to update: ${result.error}`);
      // Go back to the original columns on failure
      const newColumns = columns.slice(0, -2); // Remove found values and actions columns
      setColumns(newColumns);
      setActiveColumnIndex(newColumns.length - 1);
    }
  };

  const handleFindSimilarValues = (entry: ConfigEntry) => {
    if (!allConfigs) {
      setStatusMessage('❌ Config data not available for find feature');
      return;
    }

    // Find the current file info
    const currentFile: ConfigFile = {
      path: entry.file,
      name: entry.file.split('/').pop() || '',
      relativePath: entry.file,
      type: detectFileType(entry.file),
      size: 0,
      depth: 0
    };

    // Find matching keys
    const foundValues = findMatchingKeys(
      entry.key,
      currentFile,
      allConfigs
    );

    if (foundValues.length === 0) {
      setStatusMessage(`❌ No matching values found for "${entry.key}"`);
      return;
    }

    // Create a new column with found values
    const foundColumn: Column = {
      items: foundValues.map((found, index) => ({
        name: `${found.file.name}: ${found.value}`,
        path: `found:${index}`,
        isFile: false,
        children: [],
        isConfigEntry: false,
        // Store the found value for later use
        foundValue: found
      } as TreeNode & { foundValue?: FoundValue })),
      selectedIndex: 0,
      title: `Found: ${entry.key}`
    };

    const newColumns = [...columns];
    
    // Check if we're already showing a Found column and replace it
    let foundColumnIndex = -1;
    for (let i = 0; i < columns.length; i++) {
      const column = columns[i];
      if (column && column.title.startsWith('Found:')) {
        foundColumnIndex = i;
        break;
      }
    }
    
    if (foundColumnIndex !== -1) {
      // Replace existing Found column
      newColumns[foundColumnIndex] = foundColumn;
      setColumns(newColumns);
      setActiveColumnIndex(foundColumnIndex);
    } else {
      // Add new Found column after current position
      newColumns.splice(activeColumnIndex + 1);
      newColumns.push(foundColumn);
      setColumns(newColumns);
      setActiveColumnIndex(activeColumnIndex + 1);
    }
    
    // Store the entry for when user selects a found value
    setActionMenu({
      ...actionMenu,
      entry: entry
    });
  };

  const handleActionMenuAction = async (actionIndex: number, entry: ConfigEntry) => {
    let message = '';
    
    switch (actionIndex) {
      case 0: // Search
        // This will be handled differently - we need to show found values
        handleFindSimilarValues(entry);
        return;
      case 1: // Copy key
        await clipboardy.write(entry.key);
        message = `✅ Copied key "${entry.key}" to clipboard`;
        break;
      case 2: // Copy value
        await clipboardy.write(entry.value);
        message = `✅ Copied value to clipboard`;
        break;
      case 3: // Copy key=value
        await clipboardy.write(`${entry.key}=${entry.value}`);
        message = `✅ Copied "${entry.key}=${entry.value}" to clipboard`;
        break;
      case 4: // Copy JSON format
        const jsonFormat = `"${entry.key}": ${JSON.stringify(entry.value)}`;
        await clipboardy.write(jsonFormat);
        message = `✅ Copied JSON format to clipboard`;
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
      // Move to previous column or close action menu/found values
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
      } else if (currentColumn.title.startsWith('Found:')) {
        // Close found values column and go back to actions
        const newColumns = [...columns];
        newColumns.splice(activeColumnIndex); // Remove found column
        setColumns(newColumns);
        setActiveColumnIndex(activeColumnIndex - 1);
      } else if (activeColumnIndex > 0) {
        // Move to previous column and remove columns to the right
        const newColumns = [...columns];
        newColumns.splice(activeColumnIndex); // Remove columns to the right of where we're going
        setColumns(newColumns);
        setActiveColumnIndex(activeColumnIndex - 1);
      }
    } else if (key.rightArrow || (input === 'l' && !key.ctrl && !key.meta && !key.shift)) {
      // First check if current item can be "opened" (has actions or children)
      const selectedItem = currentColumn.items[currentColumn.selectedIndex];
      
      if (selectedItem?.isConfigEntry && selectedItem.configEntry) {
        // Trigger action menu for config entries
        const dynamicActionOptions = [
          'Search',
          'Copy key',
          'Copy value', 
          'Copy key=value',
          'Copy as JSON',
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
      } else if (currentColumn.title.startsWith('Actions:') && actionMenu.entry) {
        // Handle right arrow on action items
        const actionIndex = currentColumn.selectedIndex;
        if (actionIndex === 0) { // "Find similar values" is now at index 0
          handleFindSimilarValues(actionMenu.entry);
        }
        // For other actions, do nothing on right arrow (they require Enter)
      } else if (selectedItem && selectedItem.children && selectedItem.children.length > 0) {
        // Navigate into folders
        navigateToItem(activeColumnIndex, currentColumn.selectedIndex);
        setActiveColumnIndex(activeColumnIndex + 1);
      } else if (activeColumnIndex < columns.length - 1) {
        // Move to next column and remove any columns beyond it
        const newColumns = [...columns];
        newColumns.splice(activeColumnIndex + 2); // Keep up to the next column
        setColumns(newColumns);
        setActiveColumnIndex(activeColumnIndex + 1);
      }
    } else if (key.return) {
      const selectedItem = currentColumn.items[currentColumn.selectedIndex];
      if (selectedItem?.isConfigEntry && selectedItem.configEntry) {
        // Create action menu as a new column
        const dynamicActionOptions = [
          'Search',
          'Copy key',
          'Copy value', 
          'Copy key=value',
          'Copy as JSON',
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
      } else if (currentColumn.title.startsWith('Found:')) {
        // Handle selection of a found value
        const selectedItem = currentColumn.items[currentColumn.selectedIndex] as TreeNode & { foundValue?: FoundValue };
        if (selectedItem?.foundValue && actionMenu.entry) {
          // Apply the found value to the original file
          handleApplyFoundValue(actionMenu.entry, selectedItem.foundValue);
        }
      } else {
        // Navigate into the item
        navigateToItem(activeColumnIndex, currentColumn.selectedIndex);
        if (columns.length > activeColumnIndex + 1) {
          setActiveColumnIndex(activeColumnIndex + 1);
        }
      }
    } else if (key.escape) {
      // Escape always exits immediately
      console.log('\nGoodbye! 👋');
      process.exit(0);
    } else if (input === 'q') {
      // 'q' always exits immediately
      console.log('\nGoodbye! 👋');
      process.exit(0);
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
          
          // Calculate column widths based on content
          const terminalWidth = process.stdout.columns || 80;
          const availableWidth = terminalWidth - 4; // Just leave a small margin for borders
          
          // Calculate the natural width needed for each column based on its longest item
          const naturalWidths = visibleColumns.map(column => {
            let maxItemLength = column.title.length + 2; // Account for title with indicator
            
            column.items.forEach(item => {
              // Account for selection indicator, icon, and the item name
              let itemLength = 4; // Selection indicator + space
              if (item.isConfigEntry || item.isFile || (!column.title.startsWith('Actions:') && !column.title.startsWith('Found:'))) {
                itemLength += 2; // Icon + space
              }
              itemLength += item.name.length;
              maxItemLength = Math.max(maxItemLength, itemLength);
            });
            
            return Math.min(maxItemLength + 2, 80); // Add padding, cap at 80 for readability
          });
          
          // Calculate total natural width
          const totalNaturalWidth = naturalWidths.reduce((sum, w) => sum + w, 0);
          
          // Distribute widths based on available space
          let columnWidths: number[];
          if (totalNaturalWidth <= availableWidth) {
            // If all columns fit naturally, use their natural widths
            columnWidths = [...naturalWidths];
            // Let the last column expand to fill remaining space
            const usedWidth = columnWidths.reduce((sum, w) => sum + w, 0);
            const remainingSpace = availableWidth - usedWidth;
            if (remainingSpace > 0 && columnWidths.length > 0) {
              const lastIndex = columnWidths.length - 1;
              columnWidths[lastIndex] = (columnWidths[lastIndex] || 0) + remainingSpace;
            }
          } else {
            // Scale down proportionally to fit
            const scale = availableWidth / totalNaturalWidth;
            columnWidths = naturalWidths.map(w => Math.max(20, Math.floor(w * scale))); // Minimum 20 chars
            // Even when scaled, let the last column take any remaining space
            const usedWidth = columnWidths.reduce((sum, w) => sum + w, 0);
            const remainingSpace = availableWidth - usedWidth;
            if (remainingSpace > 0 && columnWidths.length > 0) {
              const lastIndex = columnWidths.length - 1;
              columnWidths[lastIndex] = (columnWidths[lastIndex] || 0) + remainingSpace;
            }
          }
          
          return visibleColumns.map((column, visibleIndex) => {
            const columnIndex = startIndex + visibleIndex;
            const finalColumnWidth = columnWidths[visibleIndex] || 30; // Fallback to 30 if undefined
            
            // Adjust text truncation based on column width
            const maxTextLength = finalColumnWidth - 5; // Leave room for selection indicator and icon
            const truncateLength = maxTextLength - 3; // Leave room for "..."
            
            return (
            <Box key={columnIndex} flexDirection="column" width={finalColumnWidth} marginRight={1}>
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
      
      {/* Status message or full value display */}
      <Box marginTop={1}>
        {statusMessage ? (
          <Text color="green">{statusMessage}</Text>
        ) : (() => {
          // Show full value of selected item if it's a config entry
          const currentColumn = columns[activeColumnIndex];
          if (currentColumn) {
            const selectedItem = currentColumn.items[currentColumn.selectedIndex];
            if (selectedItem?.isConfigEntry && selectedItem.configEntry) {
              return (
                <Box flexDirection="column">
                  <Text dimColor>Full value:</Text>
                  <Text color="yellow">{selectedItem.configEntry.key} = {selectedItem.configEntry.value}</Text>
                </Box>
              );
            } else if (currentColumn.title.startsWith('Found:')) {
              // Show full found value with relative path
              const foundItem = selectedItem as TreeNode & { foundValue?: FoundValue };
              if (foundItem?.foundValue) {
                // Show the last 2 parts of the path (directory/filename)
                const fullPath = foundItem.foundValue.file.path;
                const pathParts = fullPath.split('/').filter(p => p); // Remove empty parts
                // Take last 2 parts for directory/filename, or just filename if that's all we have
                const displayParts = pathParts.slice(-2);
                const relativePath = displayParts.join('/');
                
                return (
                  <Box flexDirection="column">
                    <Text dimColor>Full value from {relativePath}:</Text>
                    <Text color="yellow">{foundItem.foundValue.key} = {foundItem.foundValue.value}</Text>
                  </Box>
                );
              }
            }
          }
          return null;
        })()}
      </Box>
    </Box>
  );
};

export default MillerTree;