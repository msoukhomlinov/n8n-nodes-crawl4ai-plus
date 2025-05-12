const { writeFileSync, existsSync, mkdirSync } = require('fs');
const path = require('path');

// Make sure dist directory exists
const distDir = path.join(__dirname, 'dist');
if (!existsSync(distDir)) {
  mkdirSync(distDir);
}

// Generate main index.js file
const indexJs = `
// This file is auto-generated. Don't edit it directly.
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

// Import credentials
const credentialTypes = { 
  crawl4aiApi: require('./credentials/Crawl4aiApi.credentials').Crawl4aiApi
};
exports.credentialTypes = credentialTypes;

// Import nodes
const nodeTypes = {
  crawl4aiBasicCrawler: require('./nodes/Crawl4aiBasicCrawler/Crawl4aiBasicCrawler.node').Crawl4aiBasicCrawler,
  crawl4aiContentExtractor: require('./nodes/Crawl4aiContentExtractor/Crawl4aiContentExtractor.node').Crawl4aiContentExtractor,
};
exports.nodeTypes = nodeTypes;
`;

writeFileSync(path.join(distDir, 'index.js'), indexJs);
console.log('Generated dist/index.js');
