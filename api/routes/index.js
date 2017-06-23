const CONFIG              = require("../../config" + (process.env.NODE_ENV ? "." + process.env.NODE_ENV : "") + ".json");
const _                   = require("lodash");
const express             = require("express");
const md                  = require("marked");
const git                 = require("git-rev");
const axios               = require("axios");
const searcherAdapter     = require("../../common/search_adapters/elasticsearch_adapter");
const Searcher            = require("../search/searcher");
const Logger              = require("../../common/logger");
const Utils               = require("../../common/utils");
const trialMapping        = require("../indexer/trial/mapping.json");
const package             = require("../package.json");

let logger                = new Logger({name: "api-router"});
let searcher              = new Searcher(searcherAdapter);
let zipCodesSource        = "http://www.cancer.gov/publishedcontent/Files/Configuration/data/zip_codes.json";

const router              = new express.Router();
const searchPropsByType   = Utils.getFlattenedMappingPropertiesByType(trialMapping["trial"]);
const respondInvalidQuery = (res) => {
  return res.status(400).send("Invalid query.");
};

/* get a clinical trial by nci or nct id */
router.get("/v1/clinical-trial/:id", (req, res, next) => {
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

const queryClinicalTrialsAndSendResponse = (q, res) => {
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
const queryTermsAndSendResponse = (q, res) => {
  searcher.searchTerms(q, (err, terms) => {
    // TODO: add better error handling
    if(err) {
      return res.sendStatus(500);
    }
    res.json(terms);
  });
};

const addCoordinatedGivenZip = (q, endPoint, res) => {
  axios.get(zipCodesSource)
    .then(function (response) {
      if (endPoint === "terms") {
        let coordinates = response.data[q["org_postal_code"]];
        q["org_coordinates_lat"] = coordinates.lat;
        q["org_coordinates_lon"] = coordinates.lon;
        delete q["org_postal_code"];
        queryTermsAndSendResponse (q, res);
      } else {
        let coordinates = response.data[q["sites.org_postal_code"]];
        q["sites.org_coordinates_lat"] = coordinates.lat;
        q["sites.org_coordinates_lon"] = coordinates.lon;
        delete q["sites.org_postal_code"];
        queryClinicalTrialsAndSendResponse(q, res);
      }
    })
    .catch(function (error) {
      console.log(error);
    });
};

/* get clinical trials that match supplied search criteria */
router.get("/v1/clinical-trials", (req, res) => {
  let q = req.query;
  if (q["sites.org_postal_code"] && q["sites.org_coordinates_dist"]) {
    addCoordinatedGivenZip(q, "trials", res);
  } else {
    queryClinicalTrialsAndSendResponse(q, res);
  }
});

router.post("/v1/clinical-trials", (req, res, next) => {
  let q = req.body;
  if (q["sites.org_postal_code"] && q["sites.org_coordinates_dist"]) {
    addCoordinatedGivenZip(q, "trials", res);
  } else {
    queryClinicalTrialsAndSendResponse(q, res);
  }
});

/* get key terms that can be used to search through clinical trials */
router.get("/v1/terms", (req, res, next) => {
  let q = _.pick(req.query, CONFIG.TERM_PARAMS);
  if (q["org_postal_code"] && q["org_coordinates_dist"]) {
    addCoordinatedGivenZip(q, "terms", res);
  } else {
    queryTermsAndSendResponse (q, res);
  }
});

router.post("/v1/terms", (req, res, next) => {
  let q = _.pick(req.body, CONFIG.TERM_PARAMS);
  if (q["org_postal_code"] && q["org_coordinates_dist"]) {
    addCoordinatedGivenZip(q, "terms", res);
  } else {
    queryTermsAndSendResponse (q, res);
  }
});

/* get a term by its key */
router.get("/v1/term/:key", (req, res, next) => {
  let key = req.params.key;
  searcher.getTermByKey(key, (err, term) => {
    // TODO: add better error handling
    if(err) {
      return res.sendStatus(500);
    }
    res.json(term);
  });
});


router.get("/v1/clinical-trial.json", (req, res, next) => {
  let clinicalTrialJson = Utils.omitPrivateKeys(trialMapping);
  let excludeKeys = [
    "analyzer", "index",
    "format", "include_in_root",
    "include_in_all"
  ];
  clinicalTrialJson = Utils.omitDeepKeys(clinicalTrialJson, excludeKeys);
  res.json(clinicalTrialJson["trial"]["properties"]);
});

router.get("/v1/", (req, res, next) => {
  res.redirect("/");
});

router.get("/v1/version", (req, res, next) => {
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
    _sendVersionResponse(gitHash);
  } else {
    git.long((gitHash) => {
      _sendVersionResponse(gitHash);
    });
  }
});

module.exports = router;
