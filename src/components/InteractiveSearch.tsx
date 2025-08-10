import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import MillerColumns from './MillerColumns';

interface ConfigEntry {
  key: string;
  value: string;
  file: string;
  rawValue?: any;
}

interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  isConfigEntry?: boolean;
  children: TreeNode[];
  configFile?: any;
  configEntry?: ConfigEntry;
  expanded?: boolean;
  parent?: TreeNode;
}

interface InteractiveSearchProps {
  allEntries: ConfigEntry[];
  buildFilteredTree: (entries: ConfigEntry[], filter: string) => Promise<TreeNode>;
  allConfigs?: Map<string, ConfigEntry[]>;
}

const InteractiveSearch: React.FC<InteractiveSearchProps> = ({ 
  allEntries, 
  buildFilteredTree,
  allConfigs
}) => {  const [searchTerm, setSearchTerm] = useState('');
  const [filteredTree, setFilteredTree] = useState<TreeNode | null>(null);
  const [isSearchMode, setIsSearchMode] = useState(true);

  // Filter entries based on search term
  useEffect(() => {
    const updateFilter = async () => {
      if (searchTerm.trim() === '') {
        // Show all entries when no search term
        const tree = await buildFilteredTree(allEntries, '');
        setFilteredTree(tree);
      } else {
        // Filter entries by key name
        const filtered = allEntries.filter(entry => 
          entry.key.toLowerCase().includes(searchTerm.toLowerCase())
        );
        const tree = await buildFilteredTree(filtered, searchTerm);
        setFilteredTree(tree);
      }
    };
    
    updateFilter();
  }, [searchTerm, allEntries, buildFilteredTree]);

  useInput((input, key) => {
    if (isSearchMode) {
      if (key.return) {
        // Switch to navigation mode
        setIsSearchMode(false);
      } else if (key.backspace || key.delete) {
        // Handle backspace
        setSearchTerm(prev => prev.slice(0, -1));
      } else if (key.escape) {
        // Exit immediately
        process.exit(0);
      } else if (input && input.length === 1 && !key.ctrl && !key.meta) {
        // Add character to search term
        setSearchTerm(prev => prev + input);
      }
    } else {
      // In navigation mode, let Miller Columns handle input
      if (key.escape) {
        // Go back to search mode
        setIsSearchMode(true);
      }
    }
  });

  if (!filteredTree) {
    return (
      <Box flexDirection="column">
        <Text>Loading...</Text>
      </Box>
    );
  }

  if (isSearchMode) {
    const children = Array.isArray(filteredTree.children) ? filteredTree.children : [];
    const matchCount = children.reduce((total, fileNode) => 
      total + (Array.isArray(fileNode.children) ? fileNode.children.length : 0), 0
    );

    return (
      <Box flexDirection="column">
        <Box height={1}>{/* Blank line at top */}</Box>
        <Box marginBottom={1}>
          <Box flexDirection="column">
            <Box>
              <Text bold color="blue">ConfiGREP</Text>
              <Text dimColor> | Interactive Search</Text>
            </Box>
            <Box>
              <Text dimColor>Type to filter | Enter: Browse results | Esc: Exit</Text>
            </Box>
          </Box>
        </Box>
        <Box marginBottom={1}>
          <Text>Search: <Text color="cyan">{searchTerm}</Text><Text color="gray">█</Text></Text>
        </Box>
        <Box marginBottom={1}>
          <Text color="green">Found {matchCount} matching entries in {children.length} files</Text>
        </Box>
        
        {/* Show preview of results */}
        <Box flexDirection="column">
          {children.slice(0, 10).map((fileNode, index) => (
            <Box key={index}>
              <Text dimColor>
                📄 {fileNode.name}
              </Text>
            </Box>
          ))}
          {children.length > 10 && (
            <Text dimColor>... and {children.length - 10} more files</Text>
          )}
        </Box>
      </Box>
    );
  }

  // Navigation mode - show Miller Columns
  return (
    <MillerColumns 
      key={`nav-${Date.now()}`}
      tree={filteredTree} 
      allConfigs={allConfigs}
    />
  );
};

export default InteractiveSearch;