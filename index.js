// This file ensures n8n can find and load your nodes and credentials

module.exports = {
  nodeTypes: {
    crawl4aiPlus: require('./dist/nodes/Crawl4aiPlus/Crawl4aiPlus.node.js').Crawl4aiPlus,
    crawl4aiPlusAdvanced: require('./dist/nodes/Crawl4aiPlusAdvanced/Crawl4aiPlusAdvanced.node.js').Crawl4aiPlusAdvanced,
  },
  credentialTypes: {
    crawl4aiPlusApi: require('./dist/credentials/Crawl4aiApi.credentials.js').Crawl4aiApi,
  },
};
