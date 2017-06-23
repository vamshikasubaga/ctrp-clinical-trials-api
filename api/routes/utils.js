
const _                   = require("lodash");
const searcherAdapter     = require("../../common/search_adapters/elasticsearch_adapter");
const Searcher            = require("../search/searcher");
const searcher            = new Searcher(searcherAdapter);
const CommonUtils         = require("../../common/utils");
const trialMapping        = require("../indexer/trial/mapping.json");
const searchPropsByType   = CommonUtils.getFlattenedMappingPropertiesByType(trialMapping["trial"]);

class Utils {
  static getInvalidTrialQueryParams (queryParams) {
    let without = _.without(queryParams,
      "from", "size", "sort", "_all", "_fulltext", "include", "exclude", "_trialids");
    return without.filter((queryParam) => {
      if (_.includes(searchPropsByType["string"], queryParam)) {
        return false;
      } else if (queryParam.endsWith("_fulltext")) {
        //This allows to handle _fulltext querying against specific fields.
        let paramWithoutOp = queryParam.substring(0, queryParam.lastIndexOf("_"));
        if (_.includes(searchPropsByType["fulltext"], paramWithoutOp)) {
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
        if (_.includes(searchPropsByType["geo_point"], paramWithoutOp)) {
          return false;
        }
      }
      return true;
    });
  }

  static queryClinicalTrialsAndSendResponse (q, res) {
    let queryParams = Object.keys(q);
    // validate query params...
    let invalidParams = Utils.getInvalidTrialQueryParams(queryParams);
    if (invalidParams.length > 0) {
      let error = {
        "Error": "Invalid query params.",
        "Invalid Params": invalidParams
      };
      return res.status(400).send(error);
    }

    searcher.searchTrials(q, (err, trials) => {
      // TODO: add better error handling
      if (err) {
        return res.sendStatus(500);
      }
      // TODO: format trials
      res.json(trials);
    });
  }

  static queryTermsAndSendResponse (q, res) {
    searcher.searchTerms(q, (err, terms) => {
      // TODO: add better error handling
      if (err) {
        return res.sendStatus(500);
      }
      res.json(terms);
    });
  }

  static addCoordinatedGivenZip (q, endPoint, usZipCodes) {
    if (endPoint === "terms") {
      let coordinates = usZipCodes[q["org_postal_code"]];
      q["org_coordinates_lat"] = coordinates.lat;
      q["org_coordinates_lon"] = coordinates.lon;
      delete q["org_postal_code"];
    } else {
      let coordinates = usZipCodes[q["sites.org_postal_code"]];
      q["sites.org_coordinates_lat"] = coordinates.lat;
      q["sites.org_coordinates_lon"] = coordinates.lon;
      delete q["sites.org_postal_code"];
    }
    return q;
  }
}

module.exports = Utils;