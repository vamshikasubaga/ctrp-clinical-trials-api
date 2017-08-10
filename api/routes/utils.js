
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
      if (trials.Error) {
        return res.status(400).send(trials);
      } else if (err) {
        return res.sendStatus(500);
      }
      res.json(trials);
    });
  }

  static queryTermsAndSendResponse (q, res) {
    searcher.searchTerms(q, (err, terms) => {
      if (terms.Error) {
        return res.status(400).send(terms);
      } else if (err) {
        return res.sendStatus(500);
      }
      res.json(terms);
    });
  }

  /**
   * This is a modification of getInvalidTrialQueryParams.
   * It is almost like
   */
  static getInvalidAggQueryParams (queryParams) {
    //We allow the same things as TrialQuery except for:
    // - Include/Exclude -- we will not return trial records, so it is not needed
    // - from -- we do not need a pager for the aggs, well, not yet.
    // We have added additional params:
    //  - agg_type -- one, and only one field to aggregate by.  We will use size and sort
    //    to handle the number requested and the sort order.
    //  - agg_term -- the optional text to be used to preface the term.
    let without = _.without(queryParams,
      "agg_field", "agg_term", "size", "sort", "order", "_all", "_fulltext", "_trialids", "code", "category", "menu", "menu_not", "parents");
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
  }
  /**
   * Function for handling aggregation endpoint, which is kind
   * of like a search, with some additional processing.
   */
  static aggClinicalTrialsAndSendResponse (q, res) {
    let queryParams = Object.keys(q);
    // validate query params...
    // First, we require agg_type to be a valid aggregate-able field.
    // At the very least it must have a ._raw "sub-field."
    if (!q["agg_field"]) {
      let error = {
        "Error": "agg_field parameter required."
      };
      //logger.error(error);
      return res.status(400).send(error);
    } else {
      //TODO: check to see if the field is a special know field,
      //or if it has a _raw sub-field.

      //TODO: ensure that only one field has been selected.  OR, make
      // sure that if agg_term is used then there are not multiple
      // aggregation fields
    }

    // Now see if it is a valid aggregate field for autosuggest
    // filtering.
    if (q["agg_term"]) {
      //TODO: check to see if the agg_field has a _auto sub-field.
    }

    let invalidParams = Utils.getInvalidAggQueryParams(queryParams);
    if (invalidParams.length > 0) {
      let error = {
        "Error": "Invalid query params.",
        "Invalid Params": invalidParams
      };
      return res.status(400).send(error);
    }

    searcher.aggTrials(q, (err, aggRes) => {
      if (aggRes.Error) {
        return res.status(400).send(aggRes);
      } else if (err) {
        return res.sendStatus(500);
      }
      res.json(aggRes);
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