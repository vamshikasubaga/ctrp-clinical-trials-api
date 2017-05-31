const CONFIG              = require("../../config" + (process.env.NODE_ENV ? "." + process.env.NODE_ENV : "") + ".json");
const _                   = require("lodash");
const express             = require("express");
const md                  = require("marked");
const git                 = require("git-rev");
const searcherAdapter     = require("../../common/search_adapters/elasticsearch_adapter");
const Searcher            = require("../search/searcher");
const Logger              = require('../../common/logger');
const Utils               = require("../../common/utils");
const trialMapping        = require("../indexer/trial/mapping.json");
const package             = require("../package.json");

let logger                = new Logger({name: "api-router"});
let searcher              = new Searcher(searcherAdapter);

const router              = express.Router();
const searchPropsByType   = Utils.getFlattenedMappingPropertiesByType(trialMapping["trial"]);
const respondInvalidQuery = (res) => {
  return res.status(400).send("Invalid query.");
};

/* get a clinical trial by nci or nct id */
router.get('/v1/clinical-trial/:id', (req, res, next) => {
  let id = req.params.id;
  searcher.getTrialById(id, (err, trial) => {
    // TODO: add better error handling
    if(err) {
      return res.sendStatus(500);
    }
    if (!_.isEmpty(trial)) {
      res.json(trial);
    } else {
      res.sendStatus(404);
    }
  });
});

const _getInvalidTrialQueryParams = (queryParams) => {
  let without = _.without(queryParams,
    "from", "size", "sort", "_all", "_fulltext", "include", "exclude", "_trialids");
  return without.filter((queryParam) => {
    if (_.includes(searchPropsByType["string"], queryParam)) {
      return false;
    } else if (queryParam.endsWith("_fulltext")) {
      //This allows to handle _fulltext querying against specific fields.
      let paramWithoutOp = queryParam.substring(0, queryParam.lastIndexOf("_"));
      if ( _.includes(searchPropsByType["fulltext"], paramWithoutOp) ) {
        return false;
      }
    } else if (queryParam.endsWith("_gte") || queryParam.endsWith("_lte")) {
      let paramWithoutOp = queryParam.substring(0, queryParam.length - 4);
      if (
        _.includes(searchPropsByType["date"], paramWithoutOp) ||
        _.includes(searchPropsByType["long"], paramWithoutOp) ||
        _.includes(searchPropsByType["float"], paramWithoutOp)
      ) {
        return false;
      }
    } else if (
      queryParam.endsWith("_lon") ||
      queryParam.endsWith("_lat") ||
      queryParam.endsWith("_dist")
    ) {
      //Special endings for geo distance filtering.
      let paramWithoutOp = queryParam.substring(0, queryParam.lastIndexOf("_"));
      if ( _.includes(searchPropsByType["geo_point"], paramWithoutOp) ) {
        return false;
      }
    }
    return true;
  });
};

const queryClinicalTrialsAndSendResponse = (q, res, next) => {
  let queryParams = Object.keys(q);
  // validate query params...
  let invalidParams = _getInvalidTrialQueryParams(queryParams);
  if (invalidParams.length > 0) {
    let error = {
      "Error": "Invalid query params.",
      "Invalid Params": invalidParams
    };
    logger.error(error);
    return res.status(400).send(error);
  }

  searcher.searchTrials(q, (err, trials) => {
    // TODO: add better error handling
    if(err) {
      return res.sendStatus(500);
    }
    // TODO: format trials
    res.json(trials);
  });
};

/* get clinical trials that match supplied search criteria */
router.get('/v1/clinical-trials', (req, res, next) => {
  let q = req.query;
  queryClinicalTrialsAndSendResponse(q, res, next);
});

router.post('/v1/clinical-trials', (req, res, next) => {
  let q = req.body;
  queryClinicalTrialsAndSendResponse(q, res, next);
});

/* get key terms that can be used to search through clinical trials */
router.get('/v1/terms', (req, res, next) => {
  let q = _.pick(req.query, CONFIG.TERM_PARAMS);

  searcher.searchTerms(q, (err, terms) => {
    // TODO: add better error handling
    if(err) {
      return res.sendStatus(500);
    }
    res.json(terms);
  });
});

router.post('/v1/terms', (req, res, next) => {
  let q = _.pick(req.body, CONFIG.TERM_PARAMS);

  searcher.searchTerms(q, (err, terms) => {
    // TODO: add better error handling
    if(err) {
      return res.sendStatus(500);
    }
    res.json(terms);
  });
});

/* get a term by its key */
router.get('/v1/term/:key', (req, res, next) => {
  let key = req.params.key;
  searcher.getTermByKey(key, (err, term) => {
    // TODO: add better error handling
    if(err) {
      return res.sendStatus(500);
    }
    res.json(term);
  });
});


router.get('/v1/clinical-trial.json', (req, res, next) => {
  let clinicalTrialJson = Utils.omitPrivateKeys(trialMapping);
  let excludeKeys = [
    "analyzer", "index",
    "format", "include_in_root",
    "include_in_all"
  ];
  clinicalTrialJson = Utils.omitDeepKeys(clinicalTrialJson, excludeKeys);
  res.json(clinicalTrialJson["trial"]["properties"]);
});

router.get('/v1/', (req, res, next) => {
  let title = "NCI Clinical Trials API";
  res.render('index', { md, title });
});

router.get('/v1/version', (req, res, next) => {
  var gitHash;

  const _sendVersionResponse = (gitHash) => {
    res.json({
      "version": package.version,
      "git-hash": gitHash,
      "git-repository": package.repository.url,
      "environment": process.env.NODE_ENV,
      "authors": package.authors
    });
  };

  if (gitHash) {
    _sendVersionResponse(gitHash)
  } else {
    git.long((gitHash) => {
      _sendVersionResponse(gitHash);
    });
  }
});

/* get a term by its key */
router.get('/v1/locations/:org_country', (req, res, next) => {
  let q = _.pick(req.query, CONFIG.TERM_PARAMS);
  q.term_type = "sites.org_country";
  q.term      = req.params.org_country;
  searcher.searchTerms(q, (err, terms) => {
    // TODO: add better error handling
    if(err) {
      return res.sendStatus(500);
    }
    res.json(terms);
  });
});

/* get a term by its key */
router.get('/v1/locations/:org_country/:org_state_or_province', (req, res, next) => {
  let q = _.pick(req.query, CONFIG.TERM_PARAMS);
  q.term_type = "_org_state_or_provinces";
  q.org_country      = req.params.org_country;
  if (req.params.org_state_or_province !== "_all") {
    q.term      = req.params.org_state_or_province;
  }
  searcher.searchTerms(q, (err, terms) => {
    // TODO: add better error handling
    if(err) {
      return res.sendStatus(500);
    }
    res.json(terms);
  });
});

router.get('/v1/locations/:org_country/:org_state_or_province/:org_city', (req, res, next) => {
  let q = _.pick(req.query, CONFIG.TERM_PARAMS);
  q.org_country            = req.params.org_country;
  q.org_state_or_province  = req.params.org_state_or_province;
  q.term_type = "_org_cities";
  if (req.params.org_city !== "_all") {
    q.term = req.params.org_city;
  }
  searcher.searchTerms(q, (err, terms) => {
    // TODO: add better error handling
    if(err) {
      return res.sendStatus(500);
    }
    res.json(terms);
  });
});

router.get('/v1/sites_by_country_zip/:org_country/:org_postal_code', (req, res, next) => {
  let q = _.pick(req.query, CONFIG.TERM_PARAMS);
  q.org_country             = req.params.org_country;
  q.org_state_or_province   = req.params.org_state_or_province;
  q.org_city                = req.params.org_city;
  q.org_postal_code         = req.params.org_postal_code;
  q.term                    = req.params.org_name;

  q.term_type               = "_orgs_by_location";

  searcher.searchTerms(q, (err, terms) => {
    // TODO: add better error handling
    if(err) {
      return res.sendStatus(500);
    }
    res.json(terms);
  });
});

router.get('/v1/sites_by_zip/:org_postal_code', (req, res, next) => {
  let q = _.pick(req.query, CONFIG.TERM_PARAMS);
  q.org_country             = req.params.org_country;
  q.org_state_or_province   = req.params.org_state_or_province;
  q.org_city                = req.params.org_city;
  q.org_postal_code         = req.params.org_postal_code;
  q.term                    = req.params.org_name;

  q.term_type               = "_orgs_by_location";

  searcher.searchTerms(q, (err, terms) => {
    // TODO: add better error handling
    if(err) {
      return res.sendStatus(500);
    }
    res.json(terms);
  });
});

router.get('/v1/sites/:org_country/:org_state_or_province/:org_city/:org_name', (req, res, next) => {
  let q = _.pick(req.query, CONFIG.TERM_PARAMS);
  q.org_country             = req.params.org_country;
  q.org_state_or_province   = req.params.org_state_or_province;
  q.org_city                = req.params.org_city;
  q.org_postal_code         = req.params.org_postal_code;
  q.term                    = req.params.org_name;

  q.term_type               = "_orgs_by_location";

  if (req.params.org_name) {
    q.term = req.params.org_name;
  }
  searcher.searchTerms(q, (err, terms) => {
    // TODO: add better error handling
    if(err) {
      return res.sendStatus(500);
    }
    res.json(terms);
  });
});

router.get('/v1/sites/:org_country/:org_state_or_province/:org_city', (req, res, next) => {
  let q = _.pick(req.query, CONFIG.TERM_PARAMS);
  q.org_country             = req.params.org_country;
  q.org_state_or_province   = req.params.org_state_or_province;
  q.org_city                = req.params.org_city;

  q.term_type               = "_orgs_by_location";

  if (req.params.org_name) {
    q.term = req.params.org_name;
  }
  searcher.searchTerms(q, (err, terms) => {
    // TODO: add better error handling
    if(err) {
      return res.sendStatus(500);
    }
    res.json(terms);
  });
});

router.get('/v1/sites/:org_country/:org_state_or_province', (req, res, next) => {
  let q = _.pick(req.query, CONFIG.TERM_PARAMS);
  q.org_country             = req.params.org_country;
  q.org_state_or_province   = req.params.org_state_or_province;
  q.org_coordinates_lat     = req.params.org_coordinates_lat;
  q.org_coordinates_lon     = req.params.org_coordinates_lon;

  q.term_type               = "_orgs_by_location";

  if (req.params.org_name) {
    q.term = req.params.org_name;
  }
  searcher.searchTerms(q, (err, terms) => {
    // TODO: add better error handling
    if(err) {
      return res.sendStatus(500);
    }
    res.json(terms);
  });
});

router.get('/v1/sites/:org_country', (req, res, next) => {
  let q = _.pick(req.query, CONFIG.TERM_PARAMS);
  q.org_country             = req.params.org_country;

  q.term_type               = "_orgs_by_location";

  if (req.params.org_name) {
    q.term = req.params.org_name;
  }
  searcher.searchTerms(q, (err, terms) => {
    // TODO: add better error handling
    if(err) {
      return res.sendStatus(500);
    }
    res.json(terms);
  });
});

router.get('/v1/sites', (req, res, next) => {
  let q = _.pick(req.query, CONFIG.TERM_PARAMS);
  q.term_type               = "_orgs_by_location";

  if (req.params.org_name) {
    q.term = req.params.org_name;
  }
  searcher.searchTerms(q, (err, terms) => {
    // TODO: add better error handling
    if(err) {
      return res.sendStatus(500);
    }
    res.json(terms);
  });
});

module.exports = router;
