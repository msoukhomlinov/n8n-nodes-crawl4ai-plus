// This file is the entry point for the package
// It exports all nodes and credentials

module.exports = {
  // Nodes
  nodeTypes: [
    require('./dist/nodes/Crawl4aiBasicCrawler/Crawl4aiBasicCrawler.node.js'),
    require('./dist/nodes/Crawl4aiContentExtractor/Crawl4aiContentExtractor.node.js'),
  ],
  // Credentials
  credentialTypes: [
    require('./dist/credentials/Crawl4aiApi.credentials.js'),
  ],
};
