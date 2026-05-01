// metro.config.js
// Forces Metro to resolve react, react-native, and scheduler from the project
// root, preventing nested copies inside @realm/react/node_modules from being
// bundled and causing "Cannot read property 'useEffect' of null" crashes.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Force these singleton modules to always resolve from the project root.
// @realm/react ships its own react-native@0.85.2 nested inside its
// node_modules, which clashes with our react-native@0.81.5 and causes
// the React hook dispatcher to be null at runtime on the new architecture.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  react: path.resolve(__dirname, 'node_modules/react'),
  'react-native': path.resolve(__dirname, 'node_modules/react-native'),
  scheduler: path.resolve(__dirname, 'node_modules/scheduler'),
};

module.exports = config;
