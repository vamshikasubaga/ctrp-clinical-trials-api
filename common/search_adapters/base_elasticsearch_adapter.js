const AbstractSearchAdapter  = require("./abstract_search_adapter");
const Utils                  = require("../../common/utils");
const CONFIG                 = Utils.config();

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

        if (Array.isArray(CONFIG.ES_HOST)) {
            CONFIG.ES_HOST.forEach((host) => {
              hosts.push(`${host}`);
            });
        } else {
            hosts.push(`${CONFIG.ES_HOST}`);
        } 

        return hosts;
    }
}

module.exports = BaseElasticsearchAdapter;
