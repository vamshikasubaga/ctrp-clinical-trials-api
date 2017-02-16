const CONFIG              = require("../../config" + (process.env.NODE_ENV ? "." + process.env.NODE_ENV : "") + ".json");
const _                   = require("lodash");
const Bodybuilder         = require("bodybuilder");
const moment              = require("moment");

const Logger              = require("../../../common/logger");
const Utils               = require("../../../common/utils");
const trialMapping        = require("../../index/indexer/trial/mapping.json");


const transformStringToKey = Utils.transformStringToKey;
const DATE_FORMAT = "YYYY-MM-DD";
const TRIAL_RESULT_SIZE_MAX = 50;
const TRIAL_RESULT_SIZE_DEFAULT = 10;
const TERM_RESULT_SIZE_MAX = 100;
const TERM_RESULT_SIZE_DEFAULT = 5;
const searchPropsByType =
  Utils.getFlattenedMappingPropertiesByType(trialMapping["trial"]);

//This is a white list of nested fields that we will use a NestedFilter
//to filter against.
const NESTED_SEARCH_PROPS_FILTER = ['sites'];

let logger = new Logger({name: "from " + CONFIG.ES_HOST + " searcher"});
logger.level(CONFIG.LOG_LEVEL);
  
class Searcher {

  constructor(adapter) {
    this.client = adapter.getClient();
  }

  /***********************************************************************
                                    TRIAL
   ***********************************************************************/

  _searchTrialById(id) {
    let body = new Bodybuilder();

    if(id.substr(0, 4) === "NCI-")
      body.query("match", "nci_id", id);
    else
    // else if(id.substr(0, 3) === "NCT")
      body.query("match", "nct_id", id);

    let query = body.build();
    // logger.info(query);

    return query;
  }

  // queries on either nci or nct id
  getTrialById(id, callback) {
    logger.info("Getting trial", {id});
    this.client.search({
      index: 'cancer-clinical-trials',
      type: 'trial',
      body: this._searchTrialById(id)
    }, (err, res) => {
      if(err) {
        logger.error(err);
        return callback(err);
      }
      // return callback(null, res);
      if(!res.hits || !res.hits.hits || !res.hits.hits[0]) {
        return callback(null, {});
      }
      let trial = Utils.omitPrivateKeys(res.hits.hits[0]._source);
      return callback(null, trial);
    });
  }

  /***********************************************************************
                                    TRIALS
   ***********************************************************************/

  _addAllFilter(body, q) {
    if (q._all) {
      this._addStringFilter(body, "_all", q._all);
      delete q._all;
    }
  }

  _addFullTextQuery(body, q) {
    if (q._fulltext) {
      // need to nest `_fulltext` query as a "must"
      let ftBody = new Bodybuilder();

      ftBody.query("bool", "should", {
        "multi_match": {
          "query": q._fulltext,
          "fields": ["*_id", "other_ids.value"]
        }
      });
      ftBody.query("bool", "should", {
        "match_phrase": {
          "_diseases.term._fulltext": {
            "query": q._fulltext,
            "boost": 4
          }
        }
      });
      ftBody.query("bool", "should", {
        "match_phrase": {
          "brief_title": {
            "query": q._fulltext,
            "boost": 4
          }
        }
      });
      ftBody.query("bool", "should", {
        "match_phrase": {
          "brief_summary": {
            "query": q._fulltext
          }
        }
      });
      ftBody.query("bool", "should", {
        "match_phrase": {
          "official_title": {
            "query": q._fulltext,
            "boost": 4
          }
        }
      });
      ftBody.query("bool", "should", {
        "match_phrase": {
          "detail_description": {
            "query": q._fulltext,
            "boost": 4
          }
        }
      });
      ftBody.query("bool", "should", {
        "common": {
          "official_title": {
            "query": q._fulltext,
            "cutoff_frequency": 0.001,
            "low_freq_operator": "and",
            "boost": 4
          }
        }
      });
      ftBody.query("bool", "should", {
        "common": {
          "brief_title": {
            "query": q._fulltext,
            "cutoff_frequency": 0.001,
            "low_freq_operator": "and"
          }
        }
      });
      ftBody.query("bool", "should", {
        "common": {
          "brief_summary": {
            "query": q._fulltext,
            "cutoff_frequency": 0.001,
            "low_freq_operator": "and"
          }
        }
      });
      ftBody.query("bool", "should", {
        "common": {
          "_diseases.term._fulltext": {
            "query": q._fulltext,
            "cutoff_frequency": 0.001,
            "low_freq_operator": "and"
          }
        }
      });
      ftBody.query("bool", "should", {
        "common": {
          "detail_description": {
            "query": q._fulltext,
            "cutoff_frequency": 0.001,
            "low_freq_operator": "and"
          }
        }
      });
      ftBody.query("bool", "should", {
        "common": {
          "sites.org_name._fulltext": {
            "query": q._fulltext,
            "cutoff_frequency": 0.001,
            "low_freq_operator": "and",
            "minimum_should_match": "100%"
          }
        }
      });
      ftBody.query("bool", "should", {
        "common": {
          "collaborators.name._fulltext": {
            "query": q._fulltext,
            "cutoff_frequency": 0.001,
            "low_freq_operator": "and",
            "minimum_should_match": "100%"
          }
        }
      });
      ftBody.query("bool", "should", {
        "match": {
          "principal_investigator._fulltext": q._fulltext
        }
      });
      ftBody.query("bool", "should", {
        "match": {
          "sites.contact_name._fulltext": q._fulltext
        }
      });
      ftBody.query("bool", "should", {
        "match": {
          "sites.org_city._fulltext": q._fulltext
        }
      });
      ftBody.query("bool", "should", {
        "match": {
          "sites.org_state_or_province._fulltext": q._fulltext
        }
      });

      // TODO: break this up using another bodybuilder
      ftBody.query("bool", "should", {
        "bool": {
          "must": [{
              "nested": {
                "path": "arms.interventions",
                "score_mode": "avg",
                "query": {
                  "bool": {
                    "must": [{
                        "term": {
                          "arms.interventions.intervention_type": "drug"
                        }
                      }, {
                        "match": {
                          "arms.interventions.intervention_name": q._fulltext
                        }
                      }
                    ]
                  }
                }
              }
            }
          ]
        }
      });

      body.query("bool", "must", ftBody.build());
    }
  }

  _addNestedFilters(body, q) {
    //Get the list of property paths to treat as a Nested Filter.
    let possibleNestedFilterProps =
      _.chain(searchPropsByType["nested"]) //Get nested properties
      .intersection(NESTED_SEARCH_PROPS_FILTER) //Filter from whitelist
      .sort()
      .value(); //Sort remaining props to be able to match parent paths over child paths.

    //iterate over the possibilities to see if there are at least 2 fields,
    //if there are 2 or more properties to nest we will, otherwise we will
    //pass off to the normal filter handlers.
    possibleNestedFilterProps.forEach((nestedfield) => {
      let paramsForNesting = _.pickBy(q, (value, key) => {
        return key.startsWith(nestedfield);
      });

      if (paramsForNesting && _.keys(paramsForNesting).length > 1) {
        //We need to use a nested filter since we have more than one parameter.

        // ES 2.x removed the nested filter in lieu of nested queries
        // you can add filters to queries in 2.x

        //We will need to add a nested query to our main body.
        //A nested query needs a query, so we will create a
        // boolean "must", which holds its own query.

        let nestedBodyQuery = new Bodybuilder();
        let boolMustContents = new Bodybuilder();

        this._addFieldFilters(nestedBodyQuery, paramsForNesting);
        body.query("nested", nestedfield, 'avg', nestedBodyQuery.build());

        //Now that we have added the keys, we need to remove the params
        //from the original request params so we don't add duplicate
        //filters.
        _.keys(paramsForNesting).forEach((paramToRemove) => {
          delete q[paramToRemove];
        })
      }

    })
  }

  _addStringFilter(body, field, filter) {
    if(filter instanceof Array) {
      let orBody = new Bodybuilder();
      filter.forEach((filterElement) => {
        logger.info(filterElement);
        orBody.orFilter("term", field, filterElement.toLowerCase());
      });
      body.filter("bool", "and", orBody.build());
    } else {
      body.filter("term", field, filter.toLowerCase());
    }
  };

  _addStringFilters(body, q) {
    searchPropsByType["string"].forEach((field) => {
      if(q[field]) {
        this._addStringFilter(body, field, q[field]);
      }
    });
  }

  _addDateRangeFilters(body, q) {
    const _addRangeFilter = (field, lteRange, gteRange) => {
      let ranges = {};

      const _addRangeForRangeType = (rangeType, dateRange) => {
        if(dateRange) {
          dateRange = moment(dateRange);
          if(dateRange.isValid()) {
            ranges[rangeType] = dateRange.utc().format(DATE_FORMAT);
          } else {
            throw new Error(
              `Invalid date supplied for ${field}_${rangeType}. ` +
              `Please use format ${DATE_FORMAT} or ISO8601.`
            );
            return;
          }
        }
      };

      _addRangeForRangeType("lte", lteRange);
      _addRangeForRangeType("gte", gteRange);

      body.filter("range", field, ranges);
    }

    let possibleRangeProps = searchPropsByType["date"]
    possibleRangeProps.forEach((field) => {
      let lteRange = q[field + "_lte"];
      let gteRange = q[field + "_gte"];
      if(lteRange || gteRange) {
        _addRangeFilter(field, lteRange, gteRange);
      }
    });
  }

  _addLongRangeFilters(body, q) {
    const _addRangeFilter = (field, lteRange, gteRange) => {
      let ranges = {};

      const _addRangeForRangeType = (rangeType, longRange) => {
        if(longRange) {
          if(!isNaN(parseInt(longRange))) {
            ranges[rangeType] = longRange;
          } else {
            throw new Error(
              `Invalid number supplied for ${field}_${rangeType}.`
            );
            return;
          }
        }
      };

      _addRangeForRangeType("lte", lteRange);
      _addRangeForRangeType("gte", gteRange);

      body.filter("range", field, ranges);
    }

    let possibleRangeProps = searchPropsByType["long"]
    possibleRangeProps.forEach((field) => {
      let lteRange = q[field + "_lte"];
      let gteRange = q[field + "_gte"];
      if(lteRange || gteRange) {
        _addRangeFilter(field, lteRange, gteRange);
      }
    });
  }

  _addFloatRangeFilters(body, q) {
    const _addRangeFilter = (field, lteRange, gteRange) => {
      let ranges = {};

      const _addRangeForRangeType = (rangeType, floatRange) => {
        if(floatRange) {
          if(!isNaN(parseFloat(floatRange))) {
            ranges[rangeType] = floatRange;
          } else {
            throw new Error(
              `Invalid number supplied for ${field}_${rangeType}.`
            );
            return;
          }
        }
      };

      _addRangeForRangeType("lte", lteRange);
      _addRangeForRangeType("gte", gteRange);

      body.filter("range", field, ranges);
    }

    let possibleRangeProps = searchPropsByType["float"]
    possibleRangeProps.forEach((field) => {
      let lteRange = q[field + "_lte"];
      let gteRange = q[field + "_gte"];
      if(lteRange || gteRange) {
        _addRangeFilter(field, lteRange, gteRange);
      }
    });
  }

  _addGeoDistanceFilters(body, q) {

    //We need to put lat/long/distance into a single filter
    const _addGeoDistanceFilter = (field, lat, lon, dist) => {
      let err = "";
      if (!(lat) || isNaN(parseFloat(lat))) {
        err +=  `Geo Distance filter for ${field} missing or invalid latitude.  Please supply valid ${field}_lat. \n`
      }
      if (!(lon) || isNaN(parseFloat(lon))) {
        err +=  `Geo Distance filter for ${field} missing or invalid longitude.  Please supply valid ${field}_lon. \n`
      }

      //TODO: add in validation of values for distance

      if (err != "") {
        throw new Error(err);
        return;
      }

      //add in filter.
      body.filter("geodistance", field, dist, { lat: lat, lon: lon})
    }

    //iterate over geo_point fields.
    //make sure that we have lat/lon/and dist for each (maybe dist is optional)
    let possibleGeoProps = searchPropsByType["geo_point"]
    possibleGeoProps.forEach((field) => {
      let latParam = q[field + "_lat"];
      let lonParam = q[field + "_lon"];
      let distParam = q[field + "_dist"];

      if (latParam || lonParam || distParam) {
        _addGeoDistanceFilter(field, latParam, lonParam, distParam);
      }
    });

  }

  _addBooleanFilters(body, q) {
    const _addBooleanFilter = (field, filter) => {
      const _stringToBool = (string) => {
        return string === "true" || string === "1";
      }
      if(filter instanceof Array) {
        let orBody = new Bodybuilder();
        filter.forEach((filterEl) => {
          orBody.orFilter("term", field, _stringToBool(filterEl));
        });
        body.filter("bool", "and", orBody.build());
      } else {
        body.filter("term", field, _stringToBool(filter));
      }
    };

    searchPropsByType["boolean"].forEach((field) => {
      if(q[field]) {
        _addBooleanFilter(field, q[field]);
      }
    });
  }

  _addSizeFromParams(body, q) {
    q.size = q.size ? q.size : TRIAL_RESULT_SIZE_DEFAULT;
    let size = q.size > TRIAL_RESULT_SIZE_MAX ? TRIAL_RESULT_SIZE_MAX : q.size;
    let from = q.from ? q.from : 0;
    body.size(size);
    body.from(from);
  }

  _addIncludeExclude(body, q) {
    let include = q.include;
    let exclude = q.exclude;

    const _enforceArray = (obj) => {
      if (!(obj instanceof Array)) {
        if (typeof(obj) === "string") {
          return [obj];
        } else {
          return [];
        }
      } else {
        return obj;
      }
    };

    if (include || exclude) {
      include = _enforceArray(include);
      exclude = _enforceArray(exclude);
      let _source = {};
      if (include) _source.include = include;
      if (exclude) _source.exclude = exclude;
      body.rawOption("_source", _source);
    }
  }

  /**
   * This adds all of our data field filters to a bodybuilder object
   *
   * @param {any} body An instance of a Bodybuilder class
   * @param {any} q The query parameters a user is searching for
   */
  _addFieldFilters(body, q){
    this._addStringFilters(body, q);
    this._addDateRangeFilters(body, q);
    this._addLongRangeFilters(body, q);
    this._addFloatRangeFilters(body, q);
    this._addGeoDistanceFilters(body, q);
    this._addBooleanFilters(body, q);
  }

  /**
   * Adds sorting depending on query input parameters.
   *
   * @param {any} body An instance of a Bodybuilder class
   * @param {any} q The query parameters a user is searching for
   */
  _addSortOrder(body, q) {
    // NOTE: most of these sort fields are dependent on the transform
    //       code - to see how we are sorting enums, please look at the
    //       import/transform logic
    // NOTE: each successive numbered step is nested inside the former

    // 1.) sort by the study type (interventional vs non-interventional)
    body.sort("_study_protocol_type_sort_order", "asc");
    // 2.) sort by the primary purpose (treatment, supportive care, etc)
    body.sort("primary_purpose._primary_purpose_code_sort_order", "asc");
    // 3.) sort by trial status (active, enrolling by invitation, etc)
    body.sort("_current_trial_status_sort_order", "asc");
    // 4.) sort by location distance (if one is entered)
    if (q["sites.org_coordinates_lat"] && q["sites.org_coordinates_lon"]) {
      body.sort([{
        "sites.org_coordinates": {
          "location": {
            "lat": q["sites.org_coordinates_lat"],
            "lon": q["sites.org_coordinates_lon"]
          },
          "order": "asc",
          "unit": "mi",
          "distance_type": "plane"
        }
      }]);
    }
    // 5.) sort by number of active or enrolling locations
    body.sort("_active_sites_count", "desc");
    // 6.) sort by phase (3, 2, 1, 0, 4, N/A)
    body.sort("phase._phase_sort_order", "asc");
    // 7.) sort by the scoring function
    body.sort("_score", "desc");
    // 8.) sort by nct id
    body.sort("nct_id", "desc");
  }

  _searchTrialsQuery(q) {
    var query;
    let body = new Bodybuilder();

    // TODO: remove _all filter...
    this._addAllFilter(body, q);

    this._addNestedFilters(body, q);
    this._addFieldFilters(body, q);
    this._addSizeFromParams(body, q);
    this._addIncludeExclude(body, q);
    this._addFullTextQuery(body, q);

    this._addSortOrder(body, q);

    query = body.build();

    // logger.info(query);
    return query;
  }

  searchTrials(q, callback) {
    logger.info("Trial searching", q);
    this.client.search({
      index: 'cancer-clinical-trials',
      type: 'trial',
      body: this._searchTrialsQuery(q)
    }, (err, res) => {
      if(err) {
        logger.error(err);
        return callback(err);
      }
      // return callback(null, res);
      let trials = Utils.omitPrivateKeys(
        _.map(res.hits.hits, (hit) => {
          return hit._source;
        })
      );

      let formattedRes = {
        total: res.hits.total,
        trials: trials
      }
      return callback(null, formattedRes);
    });
  }

  /***********************************************************************
                                   TERMS
   ***********************************************************************/

  get TERM_TYPE_DEFAULTS() {
    return [
      "_diseases",
      "_locations",
      "sites.org_name",
      "sites.org_family",
      "_treatments"
    ];
  }

  _searchTermsQuery(q) {
    // TODO: use BodyBuilder more
    let body = new Bodybuilder();

    // add query terms (boost when phrase is matched)
    if (q.term) {
      body.query("match", "term_suggest", q.term);
      body.query("match", "term_suggest", q.term, {type: "phrase"});
    }

    //Handle finding a term by code
    // note we uppercase here and that is because terms
    //are indexed as C12234 and not c12234
    if (q.codes) {
      if(q.codes instanceof Array) {
        let orBody = new Bodybuilder();
        q.codes.forEach((code) => {
          logger.info(code);
          orBody.orFilter("term", "codes", code.toUpperCase());
        });
        body.filter("bool", "and", orBody.build());
      } else {
        body.filter("term", "codes", q.codes.toUpperCase());
      }
    }

    // set the term types (use defaults if not supplied)
    let termTypes = this.TERM_TYPE_DEFAULTS;
    if (q.term_type) {
      if (q.term_type instanceof Array) {
        termTypes = q.term_type;
      } else {
        termTypes = [q.term_type];
      }
    }
    termTypes.forEach((termType) => {
      body.orFilter("term", "term_type", termType);
    });

    // build the query and add custom fields (that bodyparser can't handle)
    let functionQuery = body.build("v2");
    // boost exact match
    if (q.term) {
      functionQuery.query.bool.should = {
        "match": {
          "term": q.term
        }
      };
    }

    // add scoring function
    functionQuery.functions = [{
      "field_value_factor": {
        "field": "count_normalized",
        "factor": .25
      }
    }];
    functionQuery.boost_mode = "multiply";

    // set the size, from
    let size = q.size || TERM_RESULT_SIZE_DEFAULT;
    size = size > TERM_RESULT_SIZE_MAX ? TERM_RESULT_SIZE_MAX : size;
    let from = q.from ? q.from : 0;

    // finalize the query
    let query = {
      "query": { "function_score": functionQuery },
      "size": size,
      "from": from
    };

     //logger.info(query);
    return query;
  }

  searchTerms(q, callback) {
    // logger.info("Term searching", q);
    this.client.search({
      index: 'cancer-terms',
      type: 'term',
      body: this._searchTermsQuery(q)
    }, (err, res) => {
      if(err) {
        logger.error(err);
        return callback(err);
      }
      // return callback(null, res);
      let formattedRes = {
        total: res.hits.total,
        terms: _.map(res.hits.hits, (hit) => {
          let source = hit._source;
          source.score = hit._score;
          return source;
        })
      }
      return callback(null, formattedRes);
    });
  }

  _searchTermByKey(key) {
    let body = new Bodybuilder();

    body.query("match", "term_key", key);

    let query = body.build();
    // logger.info(query);

    return query;
  }

  // queries on term key
  getTermByKey(key, callback) {
    logger.info("Getting term", {key});
    this.client.search({
      index: 'cancer-terms',
      type: 'term',
      body: this._searchTermByKey(key)
    }, (err, res) => {
      if(err) {
        logger.error(err);
        return callback(err);
      }
      // return callback(null, res);
      if(!res.hits || !res.hits.hits || !res.hits.hits[0]) {
        return callback(null, {});
      }
      let term = Utils.omitPrivateKeys(res.hits.hits[0]._source);
      return callback(null, term);
    });
  }

}

module.exports = Searcher;
