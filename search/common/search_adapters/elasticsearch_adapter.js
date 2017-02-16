const AwsEsConnector                = require('http-aws-es');
const ElasticSearch                 = require("elasticsearch");
const Logger                        = require("../../../common/logger");
const BaseElasticsearchAdapter      = require("./base_elasticsearch_adapter");

const CONFIG                 = require("../../config" + (process.env.NODE_ENV ? "." + process.env.NODE_ENV : "") + ".json");

/**
 * A logger to be used by ElasticSearch 
 * 
 * @class SearchLogger
 * @extends {Logger}
 */
class SearchLogger extends Logger {
  get DEFAULT_LOGGER_NAME() {
    return "adapter-elasticsearch";
  }
}

/**
 * Represents the client that should be used for connecting to Elasticsearch 
 * 
 * @class ElasticsearchAdapter
 * @extends {AbstractElasticsearchAdapter}
 */
class ElasticsearchAdapter extends BaseElasticsearchAdapter {

    /**
     * Creates an instance of ElasticsearchAdapter.
     * 
     */
    constructor() {
        super();

        let hosts = this.getHostsFromConfig();

        this.client = new ElasticSearch.Client({
            host: hosts,
            log: SearchLogger,
            connectionClass: AwsEsConnector,
            amazonES: {
                region: CONFIG.REGION,
                accessKey: process.env.AWS_ACCESS_KEY_ID,
                secretKey: process.env.AWS_SECRET_ACCESS_KEY
            }
        });
    }
}

let exportedInstance = new ElasticsearchAdapter()
module.exports = exportedInstance;
