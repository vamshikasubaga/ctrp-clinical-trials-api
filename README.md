# ctrp-clinical-trials-api
Contains the Clinical Trial API. This is a version extracted initially from NCIP/clinical-trials-search to support micro-services and migrate to AWS.

#### Setting Node Environment for search
The configuration file used for Search by default is /search/config.json otherwise /search/config.${NODE_ENV}.json.

To set to another environment you will need to set environment variable NODE_ENV when running search and index.

Therefore commands npm run index (in index) and npm start (in api) use /search/config.json.

While commands 'NODE_ENV=prod npm run index' (in index) and 'NODE_ENV=prod npm start' (in api) use /search/config.prod.json.

