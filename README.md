
[![Build Status](https://travis-ci.org/CBIIT/ctrp-clinical-trials-api.svg?branch=master)](https://travis-ci.org/BIAD/ctrp-clinical-trials-api)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/8b9f855009784107bcdbbd48f7566aab)](https://www.codacy.com/app/FNLCR/ctrp-clinical-trials-api?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=BIAD/ctrp-clinical-trials-api&amp;utm_campaign=Badge_Grade)
[![Codacy Badge](https://api.codacy.com/project/badge/Coverage/8b9f855009784107bcdbbd48f7566aab)](https://www.codacy.com/app/FNLCR/ctrp-clinical-trials-api?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=BIAD/ctrp-clinical-trials-api&amp;utm_campaign=Badge_Coverage)

# ctrp-clinical-trials-api
Contains the Clinical Trial API (https://clinicaltrialsapi.cancer.gov/) . This is a version extracted initially from NCIP/clinical-trials-search to support micro-services and migrate to AWS.



#### Setting Node Environment for search
The configuration file used for Search by default is /search/config.json otherwise /search/config.${NODE_ENV}.json.

To set to another environment you will need to set environment variable NODE_ENV when running search and index.

Therefore commands npm run index (in index) and npm start (in api) use /search/config.json.

While commands 'NODE_ENV=prod npm run index' (in index) and 'NODE_ENV=prod npm start' (in api) use /search/config.prod.json.


#### Config Settings

 - "ES_HOST": URL for elastic search [string]
 - "REGION": for AWS e.g "us-east-1",
 - "NUM_DAYS": number of days for indices to live e.g 10
 - "LOG_LEVEL": logging level for API requests [string or integer]
   - "LVL0"/0, "TRACE"/10, "DEBUG"/20, "INFO"/30, "WARN"/40, "ERROR"/50, "FATAL"/60


