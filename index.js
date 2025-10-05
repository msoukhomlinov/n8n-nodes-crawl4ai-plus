// This file ensures n8n can find and load your nodes and credentials

module.exports = {
  nodeTypes: {
    crawl4aiPlusBasicCrawler: require('./dist/nodes/Crawl4aiPlusBasicCrawler/Crawl4aiPlusBasicCrawler.node.js').Crawl4aiPlusBasicCrawler,
    crawl4aiPlusContentExtractor: require('./dist/nodes/Crawl4aiPlusContentExtractor/Crawl4aiPlusContentExtractor.node.js').Crawl4aiPlusContentExtractor,
  },
  credentialTypes: {
    crawl4aiPlusApi: require('./dist/credentials/Crawl4aiApi.credentials.js').Crawl4aiApi,
  },
};
