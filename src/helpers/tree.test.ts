import { test, expect } from 'bun:test';
import { buildSimpleFileTree, sortTreeNode, printTree } from './tree';
import type { ConfigFile } from '../types.ts';

const mockFiles: ConfigFile[] = [
  {
    path: '/root/config.json',
    name: 'config.json',
    relativePath: 'config.json',
    type: 'json',
    size: 100,
    depth: 0
  },
  {
    path: '/root/nested/app.env',
    name: 'app.env',
    relativePath: 'nested/app.env',
    type: 'env',
    size: 50,
    depth: 1
  },
  {
    path: '/root/nested/other.yaml',
    name: 'other.yaml',
    relativePath: 'nested/other.yaml',
    type: 'yaml',
    size: 60,
    depth: 1
  }
];

test('buildSimpleFileTree builds correct tree structure', () => {
  const tree = buildSimpleFileTree(mockFiles, '/root');
  expect(tree.children.length).toBe(2); // config.json and nested
  const nested = tree.children.find(n => n.name === 'nested');
  expect(nested).toBeTruthy();
  if (nested && Array.isArray(nested.children)) {
    expect(nested.children.length).toBe(2); // app.env and other.yaml
  }
});

test('sortTreeNode sorts directories before files', () => {
  const files: ConfigFile[] = [
    { path: '/root/b.json', name: 'b.json', relativePath: 'b.json', type: 'json', size: 1, depth: 0 },
    { path: '/root/a', name: 'a', relativePath: 'a', type: 'unknown', size: 1, depth: 0 }
  ];
  const tree = buildSimpleFileTree(files, '/root');
  sortTreeNode(tree);
  expect(tree.children[0]?.name).toBe('a');
  expect(tree.children[1]?.name).toBe('b.json');
});

test('printTree outputs tree structure', () => {
  const files: ConfigFile[] = [
    { path: '/root/foo.json', name: 'foo.json', relativePath: 'foo.json', type: 'json', size: 1, depth: 0 }
  ];
  const tree = buildSimpleFileTree(files, '/root');
  // Just ensure it runs without error
  printTree(tree);
});
