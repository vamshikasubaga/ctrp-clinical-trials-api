const _                   = require("lodash");
const express             = require("express");
const md                  = require("marked");
const git                 = require("git-rev");
const searcherAdapter     = require("../../common/search_adapters/elasticsearch_adapter");
const Searcher            = require("../search/searcher");
const Logger              = require("../../common/logger");
const Utils               = require("../../common/utils");
const RouteUtils          = require("../routes/utils");
const trialMapping        = require("../indexer/trial/mapping.json");
const package             = require("../package.json");
const axios               = require("axios");
const utilTermParams      = Utils.termParams();

let logger                = new Logger({name: "api-router"});
let searcher              = new Searcher(searcherAdapter);

const zipCodesSource      = "http://www.cancer.gov/publishedcontent/Files/Configuration/data/zip_codes.json";
let   usZipCodes          = [];
axios.get(zipCodesSource)
  .then(function (response) {
    usZipCodes = response.data;
  });

const respondInvalidQuery = (res) => {
  return res.status(400).send("Invalid query.");
};

const router              = new express.Router();

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

/* get clinical trials that match supplied search criteria */
router.get("/v1/clinical-trials", (req, res) => {
  let q = req.query;
  if (q["sites.org_postal_code"] && q["sites.org_coordinates_dist"]) {
    RouteUtils.queryClinicalTrialsAndSendResponse(RouteUtils.addCoordinatedGivenZip(q, "trials", usZipCodes), res);
  } else {
    RouteUtils.queryClinicalTrialsAndSendResponse(q, res);
  }
});

router.post("/v1/clinical-trials", (req, res, next) => {
  let q = req.body;
  if (q["sites.org_postal_code"] && q["sites.org_coordinates_dist"]) {
    RouteUtils.queryClinicalTrialsAndSendResponse(RouteUtils.addCoordinatedGivenZip(q, "trials", usZipCodes), res);
  } else {
    RouteUtils.queryClinicalTrialsAndSendResponse(q, res);
  }
});

/* get key terms that can be used to search through clinical trials */
router.get("/v1/terms", (req, res, next) => {
  let q = _.pick(req.query, utilTermParams);
  if (q["org_postal_code"] && q["org_coordinates_dist"]) {
    RouteUtils.queryTermsAndSendResponse(RouteUtils.addCoordinatedGivenZip(q, "terms", usZipCodes), res);
  } else {
    RouteUtils.queryTermsAndSendResponse(q, res);
  }
});

router.post("/v1/terms", (req, res, next) => {
  let q = _.pick(req.body, utilTermParams);
  if (q["org_postal_code"] && q["org_coordinates_dist"]) {
    RouteUtils.queryTermsAndSendResponse(RouteUtils.addCoordinatedGivenZip(q, "terms", usZipCodes), res);
  } else {
    RouteUtils.queryTermsAndSendResponse (q, res);
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

/* get aggregates for a field that match supplied
 search criteria
 */
router.get("/v1/interventions", (req, res, next) => {
  let q = req.query;
  q["agg_field"]  = "_aggregates.interventions";
  q["agg_term"]   = q["name"];
  delete q["name"];
  RouteUtils.aggClinicalTrialsAndSendResponse(q, res);
});

router.post("/v1/interventions", (req, res, next) => {
  let q = req.body;
  q["agg_field"]  = "_aggregates.interventions";
  q["agg_term"]   = q["name"];
  delete q["name"];
  RouteUtils.aggClinicalTrialsAndSendResponse(q, res);
});

router.get("/v1/diseases", (req, res, next) => {
  let q = req.query;
  q["agg_field"]  = "_aggregates.diseases";
  q["agg_term"]   = q["name"];
  delete q["name"];
  RouteUtils.aggClinicalTrialsAndSendResponse(q, res);
});

router.post("/v1/diseases", (req, res, next) => {
  let q = req.body;
  q["agg_field"]  = "_aggregates.diseases";
  q["agg_term"]   = q["name"];
  delete q["name"];
  RouteUtils.aggClinicalTrialsAndSendResponse(q, res);
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

  git.short((gitHash) => {
    _sendVersionResponse(gitHash);
  });
});

module.exports = router;
