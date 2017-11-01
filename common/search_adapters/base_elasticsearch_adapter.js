const AbstractSearchAdapter  = require("./abstract_search_adapter");

/**
 * Represents a base adapter for ES connections that can handle the config. 
 * 
 * @class BaseElasticsearchAdapter
 * @extends {AbstractSearchAdapter}
 */
class BaseElasticsearchAdapter extends AbstractSearchAdapter {

    /**
     * Creates an instance of SearcherESClient.
     * 
     */
    constructor() {
        super();
    }

    getHostsFromConfig() {
        let hosts = [];

        if (Array.isArray(process.env.ES_HOST)) {
          process.env.ES_HOST.forEach((host) => {
            hosts.push(`${host}`);
          });
        } else {
          hosts.push(`${process.env.ES_HOST}`);
        } 

        return hosts;
    }
}

module.exports = BaseElasticsearchAdapter;
