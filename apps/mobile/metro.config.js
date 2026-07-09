const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Monorepo setup: watch the workspace root so packages/shared is picked up,
// and resolve modules from both the app's and the root's node_modules.
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
