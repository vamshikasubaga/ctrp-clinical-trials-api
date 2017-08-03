const _                   = require("lodash");
const Bodybuilder         = require("bodybuilder");
const moment              = require("moment");

const Logger              = require("../../common/logger");
const Utils               = require("../../common/utils");
const CONFIG              = Utils.config();
const trialMapping        = require("../indexer/trial/mapping.json");

const transformStringToKey = Utils.transformStringToKey;
const DATE_FORMAT = "YYYY-MM-DD";
const TRIAL_RESULT_SIZE_MAX = 50;
const TRIAL_RESULT_SIZE_DEFAULT = 10;
const TERM_RESULT_SIZE_MAX = 100;
const TERM_RESULT_SIZE_DEFAULT = 5;
const TERM_SORT_DEFAULT = "_score";
const searchPropsByType = Utils.getFlattenedMappingPropertiesByType(trialMapping["trial"]);

//This is a white list of nested fields that we will use a NestedFilter
//to filter against.
const NESTED_SEARCH_PROPS_FILTER = ["sites"];

let CT_API_ERROR          = null;
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

    if(id.substr(0, 4) === "NCI-") {
      body.query("match", "nci_id", id);
    } else {
      // else if(id.substr(0, 3) === "NCT")
      body.query("match", "nct_id", id);
    }

    let query = body.build();
    // logger.info(query);

    return query;
  }

  // queries on either nci or nct id
  getTrialById(id, callback) {
    logger.info("Getting trial", {id});
    this.client.search({
      index: "cancer-clinical-trials",
      type: "trial",
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
        body.query("nested", nestedfield, "avg", nestedBodyQuery.build());

        //Now that we have added the keys, we need to remove the params
        //from the original request params so we don't add duplicate
        //filters.
        _.keys(paramsForNesting).forEach((paramToRemove) => {
          delete q[paramToRemove];
        });
      }

    });
  }

  _addStringFilter(body, field, filter) {
    if(filter instanceof Array) {
      let orBody = new Bodybuilder();
      filter.forEach((filterElement) => {
        //logger.info(filterElement);
        orBody.orFilter("term", field, filterElement.toLowerCase());
      });
      body.filter("bool", "and", orBody.build());
    } else {
      body.filter("term", field, filter.toLowerCase());
    }
  }

  _addStringFilters(body, q) {
    searchPropsByType["string"].forEach((field) => {
      if(q[field]) {
        this._addStringFilter(body, field, q[field]);
      }
    });
  }

  /**
   * Adds a full-text match filter to the body.  The difference between a text matching filter
   * and query is that a query feeds into the document score, and a filter is just that, a filter,
   * and it has nothing to do with ranking & sorting.
   *
   */
  _addFullTextFieldFilters(body, q) {
    const _addFulltextFieldFilter = (body, field, filter) => {
      let query = new Bodybuilder();

      if (filter instanceof Array) {
        let orBody = new Bodybuilder();
        filter.forEach((filterElement) => {
          //logger.info(filterElement);
          //Note for the actual query the field name must contain a . before _fulltext
          query.orQuery("match", field + "._fulltext", filterElement, { type: "phrase" });
        });
      } else {
        //Note for the actual query the field name must contain a . before _fulltext
        query.query("match", field + "._fulltext", filter, { type: "phrase" });
      }

      body.filter("bool", "and", query.build("v2"));
    };

    let possibleFulltextProps = searchPropsByType["fulltext"];
    possibleFulltextProps.forEach((field) => {
      if (q[field + "_fulltext"]) {
        _addFulltextFieldFilter(body, field, q[field + "_fulltext"]);
      }
    });
  }

  /**
   * Adds filters for searching trial IDs (of which there are many)
   *
   * @param {any} body
   * @param {any} q
   * @returns
   *
   * @memberOf Searcher
   */
  _addTrialIDsFilter(body, q) {

    const _addTrialIDFilter = (body, searchstr) => {
      let query = new Bodybuilder();

      //Add an or for each of the ID fields, querying the _trialid sub-field that is setup as an edge ngram for
      //supporting "begins with" (on word boundary) type queries.
      ["ccr_id", "ctep_id", "dcp_id", "nci_id", "nct_id", "other_ids.value", "protocol_id"].forEach((idField) => {
        query.orQuery("match", idField + "._trialid", searchstr, { type: "phrase" });
      });

      body.orQuery("bool", "or", query.build("v2"));
    };


    if (!q["_trialids"]) {
      return;
    }

    let searchStrings = (q["_trialids"] instanceof Array) ? q["_trialids"] : [ q["_trialids"] ];
    let trialIdFilterBody = new Bodybuilder();

    searchStrings.forEach((filterElement) => {
      _addTrialIDFilter(trialIdFilterBody, filterElement);
    });

    body.filter("bool", "and", trialIdFilterBody.build("v2"));
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
            CT_API_ERROR = new Error(
              `Invalid date supplied for ${field}_${rangeType}. ` +
              `Please use format ${DATE_FORMAT} or ISO8601.`);
            return;
          }
        }
      };

      _addRangeForRangeType("lte", lteRange);
      _addRangeForRangeType("gte", gteRange);

      body.filter("range", field, ranges);
    };

    let possibleRangeProps = searchPropsByType["date"];
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
            CT_API_ERROR = new Error(`Invalid number supplied for ${field}_${rangeType}.`);
            return;
          }
        }
      };

      _addRangeForRangeType("lte", lteRange);
      _addRangeForRangeType("gte", gteRange);

      body.filter("range", field, ranges);
    };

    let possibleRangeProps = searchPropsByType["long"];
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
            CT_API_ERROR = new Error(`Invalid number supplied for ${field}_${rangeType}.`);
            return;
          }
        }
      };

      _addRangeForRangeType("lte", lteRange);
      _addRangeForRangeType("gte", gteRange);

      body.filter("range", field, ranges);
    };

    let possibleRangeProps = searchPropsByType["float"];
    possibleRangeProps.forEach((field) => {
      let lteRange = q[field + "_lte"];
      let gteRange = q[field + "_gte"];
      if(lteRange || gteRange) {
        _addRangeFilter(field, lteRange, gteRange);
      }
    });
  }

  _validateGeoParams(field, latitude, longitude) {
    let err = "";
    if (!(latitude) || isNaN(parseFloat(latitude))) {
      err +=  `Geo Distance filter for ${field} missing or invalid latitude.  Please supply valid ${field}_lat. `;
    }
    if (!(longitude) || isNaN(parseFloat(longitude))) {
      err +=  `Geo Distance filter for ${field} missing or invalid longitude.  Please supply valid ${field}_lon.`;
    }
    return err;
  }

  _addGeoDistanceFilters(body, q) {
    //We need to put lat/long/distance into a single filter
    const _addGeoDistanceFilter = (field, latitude, longitude, distance) => {

      //add in filter.
      body.filter("geodistance", field, distance, { lat: latitude, lon: longitude});
    };

    //iterate over geo_point fields.
    //make sure that we have lat/lon/and dist for each (maybe dist is optional)
    let possibleGeoProps = searchPropsByType["geo_point"];

    possibleGeoProps.forEach((field) => {
      let latParam = q[field + "_lat"];
      let lonParam = q[field + "_lon"];
      let distParam = q[field + "_dist"];

      if (latParam || lonParam || distParam) {
        let err = this._validateGeoParams(field, latParam, lonParam);
        if (err !== "") {
          CT_API_ERROR = new Error(err);
          return;
        } else if (!(distParam) || isNaN(parseFloat(distParam)) || parseFloat(distParam) < 0.001) {
          distParam = 0.001;
        }
        _addGeoDistanceFilter(field, latParam, lonParam, distParam);
      }
    });

  }

  _addBooleanFilters(body, q) {
    const _addBooleanFilter = (field, filter) => {
      const _stringToBool = (string) => {
        return string === "true" || string === "1";
      };
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
    if (include || exclude) {
      body.rawOption("_source", this._getSource(Utils.enforceArray(include), Utils.enforceArray(exclude)));
    }
  }

  _getSource(include, exclude) {
    let _source = {};
    if (include) {
      _source.include = include;
    }
    if (exclude) {
      _source.exclude = exclude;
    }
    return _source;
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
    this._addFullTextFieldFilters(body, q);
    this._addTrialIDsFilter(body, q);
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

    //logger.info(query);
    return query;
  }

  searchTrials(q, callback) {
    logger.info("Trial searching", q);
    this.client.search({
      index: "cancer-clinical-trials",
      type: "trial",
      body: this._searchTrialsQuery(q)
    }, (err, res) => {
      let formattedRes = {};
      if(err || CT_API_ERROR) {
        formattedRes = {"Error": (CT_API_ERROR ? CT_API_ERROR.message: "Bad Request.")};
        CT_API_ERROR = null;
      } else {
        // return callback(null, res);
        let trialsResults = Utils.omitPrivateKeys(
          _.map(res.hits.hits, (hit) => {
            return hit._source;
          })
        );

        formattedRes = {
          total: res.hits.total,
          trials: trialsResults
        };
      }
      return callback(null, formattedRes);
    });
  }

  /**
   * Handles "coded" aggregations like _drugs, where there is a Name/Code pair that
   * should be returned.
   *
   * @param {any} q
   * @returns
   *
   * @memberOf Searcher
   */
  _getCodedAggregation(q) {
    let path = q["agg_field"];
    let innerAgg = {};


    //This is an aggregate for grouping the code & synonyms with the term.  This is the inner most
    //part of the aggregate and basically is returning the name and the code for this
    //specific drug.
    let groupAgg = {};
    groupAgg[path] = {
      "terms": {
        "field" : path + ".name._raw",
        "order": {
          "_term" : "asc"
        },
        "size": TERM_RESULT_SIZE_DEFAULT
      }
    };
    groupAgg[path]["aggs"] = {};
    groupAgg[path]["aggs"][path + ".code"] = {
      "terms": {
        "field": path + ".code"
      }
    };

    groupAgg[path]["aggs"][path + ".synonyms"] = {
      "terms": {
        "field": path + ".synonyms._raw",
        "size": 0
      }
    };

    //This will handle matching both the name and synonyms
    innerAgg[path + "_filtered"] = {
      "filter": {
        "query": {
          "bool": {
            "must":[{
                "bool": {
                  "should": [],
                  "minimum_number_should_match": 1
                }
              }],
            "should":[]
          }
        }
      }
    };

    let bool = innerAgg[path + "_filtered"]["filter"]["query"]["bool"];

    if (q["sort"] || q["order"]) {
      let validSort   = q["sort"] === "count" || q["sort"] === "name";
      let validOrder  = q["order"] === "asc" || q["order"] === "desc";
      if (validSort && validOrder) {
        let sortKey = "_" + q["sort"].replace("name", "term");
        groupAgg[path]["terms"]["order"][sortKey] = q["order"];
      } else {
        CT_API_ERROR = new Error("Parameters missing or incorrect. Sort can only be by (intervention) or (count) and order can only be descending (desc) or ascending (asc).");
      }
    }

    if (q["size"]) {
      if (!isNaN(parseFloat(q["size"])) && parseFloat(q["size"]) < (TERM_RESULT_SIZE_MAX + 1)) {
        groupAgg[path]["terms"]["size"] = parseFloat(q["size"]);
      } else {
        CT_API_ERROR = new Error("Size must be a number not greater than " + TERM_RESULT_SIZE_MAX + ".");
      }
    }

    // Interventions specific
    if (q["agg_field"] === "_aggregates.interventions") {

      groupAgg[path]["aggs"][path + ".type"] = {
        "terms": {
          "field": path + ".type"
        }
      };
      groupAgg[path]["aggs"][path + ".category"] = {
        "terms": {
          "field": path + ".category"
        }
      };

      this._filterAggByField(path, bool["must"][0]["bool"]["should"], q["type"],      "type._fulltext");
      this._filterAggByField(path, bool["must"][0]["bool"]["should"], q["category"],  "category._fulltext");
      this._filterAggByField(path, bool["must"][0]["bool"]["should"], q["code"],     "code._fulltext");
    }

    this._filterAggByField(path, bool["should"], q["agg_term"], "name._auto");
    this._filterAggByField(path, bool["should"], q["agg_term"], "synonyms._auto");

    if (bool["should"].length || bool["must"].length) {
      innerAgg[path + "_filtered"]["aggs"] = groupAgg;
    } else {
      innerAgg = groupAgg;
    }

    //This is adding the nested part of the query.  This ensures that we are getting
    //(and filtering) on the correct pairs of name/code pairs.
    let nested = {};
    nested[path + "_nested"] = {
      "nested": {
        "path": path
      },
      "aggs": innerAgg
    };

    return nested;
  }

  _filterAggByField (path, bool, paramFieldVals, field) {
    Utils.enforceArray(paramFieldVals).forEach((paramFieldVal) => {
      let fieldMatch = {
        "match": {}
      };

      if (paramFieldVal) {
        fieldMatch["match"][path + "." + field ] = {
          "type": "phrase",
          "query": paramFieldVal
        };
        bool.push(fieldMatch);
      }
    });
  }

  /**
   * Get a filtered aggregate, which is an aggregate request where the
   * _agg_term parameter has been specified.
   *
   * @param {any} q The params of the request.
   * @param {any} size The number of aggregates to return
   * @returns
   *
   * @memberOf Searcher
   */
  _getFilteredAggregate(q, size) {
    //They are doing autocomplete, so we need handle multiple layers.
    //body.aggregations()

    //This is doing a type ahead search.  So you must filter the
    //aggregates first based on the agg_term, then aggregate what is left.

    let field = q["agg_field"];
    let tmpAgg = {};

    //The first bit of this aggregation is to filter the aggregates against the supplied
    //search text.  This says to filter out the objects based on the _auto "sub field"
    // of the field name supplied in agg_field.  Use the agg_term as the text to match.
    //The resulting aggregation will be returned as an object called whatever was supplied
    //in agg_term appended with "_filtered" indicating the agg results were filtered.
    tmpAgg[field + "_filtered"] = {
      "filter": {
        "query": {
          "match": {}
        }
      }
    };
    //Use a phrase match to make sure we match all the words, instead of displaying
    //partial matches.
    tmpAgg[field + "_filtered"]["filter"]["query"]["match"][field + "._auto"] = {
      "type": "phrase",
      "query": q["agg_term"]
    };

    //We need to nest the actual values for the aggregation.  We will call the resulting
    //object "suggestion".  This will use a terms aggregation to aggregate the values
    //in the _raw "sub field."  The _raw sub field should be the unmodified field.
    tmpAgg[field + "_filtered"]["aggs"] = {};
    tmpAgg[field + "_filtered"]["aggs"][field] = {"terms": {
      "field": field + "._raw",
      "size": size
    }};

    //First off, it is important to make sure that if the field contains a ".", then
    //it is most likely a nested field.  We would need to add a nested aggregation.
    let lastIdx = field.lastIndexOf(".");

    if (lastIdx !== -1) {
      //This is a nested field, and since a field cannot contain a ".", then
      //the last period must split the path from the field name.
      let path = field.substr(0, lastIdx);

      let nested = {};
      nested[field + "_nested"] = { "nested": { "path": path}};
      nested[field + "_nested"]["aggs"] = tmpAgg;

      return nested;
    } else {
      return tmpAgg;
    }
  }

  /**
   * Adds an aggregation to the que query
   *
   * @param {any} body NOTE: Body is not a BodyBuilder because we need updated BB for that to work.
   * @param {any} q
   *
   * @memberOf Searcher
   */
  _addAggregation(body, q, size) {

    //TODO: NEED TO ADD SIZE to aggregate fields.  This will allow us to control the
    //number of terms to be returned.

    //So, our version of BodyBuilder does not support complex aggregations,
    //and really needs to be updated.  So we are just going to build up the aggregation
    //from scratch.
    let aggregation = {};

    //Intervions are special.  Actually, any coded field is special,
    //but this is the only implementation so far, but this can easily
    //be extended to _diseases.
    if (q["agg_field"] === "_aggregates.interventions") {
      aggregation = this._getCodedAggregation(q);
    } else {

      if (q["agg_term"]) {

        aggregation = this._getFilteredAggregate(q);

      } else {
        // This is a simple aggregate.  Which is just, go get "counts" of
        // the instances of a single field across records.  NOTE: this
        // is not always the count of the trials associated with that aggregation.

        // Use this for things like country, or phase & type of trial filtering.

        //Use the raw so that we do not get analyzed text back.
        //Note, for some fields, possibly organizations, inconsistencies
        //in casing in the field could result in 2 separate entries.
        //(e.g. University of Maryland and university of maryland)
        //This case can be delt with, but it is much more complicated
        //aggregation.

        let tmpAgg = {};
        tmpAgg[q["agg_field"]] = {"terms": {
          "field": q["agg_field"] + "._raw",
          "size": size
        }};

        aggregation = tmpAgg;

        //TODO: there is a way to get the number of trials this item appears in,
        //throught the reverse_nested aggregation -- however this needs more testing
        //to ensure it is correct, especially for deeply nested objects
      }
    }

    // Read the JSON into an object.
    body["aggs"] = aggregation;

  }

  _aggTrialsQuery(q) {
    var query;
    let body = new Bodybuilder();

    //Set the ES size parameter to 0 so that we get back no trial results and
    //only the aggregations.  This is not related to our "size" parameter
    body.size(0);

    //NOTE: Aggregations does not support paging.  ES 5.2.0 added support for crude paging (partitioning)
    //however, if you want aggregates for autosuggest or other types of post-search filters, this should
    //not need paging.  (Set the max size to say, 50)
    //Make sure that if you want a comprehensive list regardless of the query, that the aggregate-able
    //field is also indexed as part of the terms endpoint.

    this._addNestedFilters(body, q);
    this._addFieldFilters(body, q);
    this._addFullTextQuery(body, q);


    // Turn the query into JSON
    query = body.build();

    q.size = q.size ? q.size : TERM_RESULT_SIZE_DEFAULT;
    let size = q.size > TERM_RESULT_SIZE_MAX ? TERM_RESULT_SIZE_MAX : q.size;

    // add the aggregation
    this._addAggregation(query, q, size);

    //logger.info(query);
    //console.log(query);
    return query;
  }

  /**
   * Cleans up the bucket structure, more so for coded aggregations where the
   * nested buckets for codes and synonyms need to be extracted.
   *
   * @param {any} field The field aggregated on
   * @param {any} bucket A bucket from the ES results.
   * @returns
   *
   * @memberOf Searcher
   */
  _extractAggBucket(field, bucket) {
    if (field === "_aggregates.interventions") {
      return bucket.map((item) => {
        let interventionCodes    = [];
        let interventionSynonyms = [];
        let interventionType     = "";
        let interventionCategory = "";

        //TODO: This should exist, so determine what to do if it does not.
        if (item[field + ".code"] && item[field + ".code"].buckets.length > 0) {
          //Treat as array to match old Terms endpoint, AND support possible diseases multikeys
          interventionCodes = item[field + ".code"].buckets.map((codeBucket) => codeBucket.key);
        }
        if (item[field + ".category"] && item[field + ".category"].buckets.length > 0) {
          interventionCategory = item[field + ".category"].buckets[0].key;
        }
        if (item[field + ".synonyms"] && item[field + ".synonyms"].buckets.length > 0) {
          interventionSynonyms = item[field + ".synonyms"].buckets.map((synonymsBucket) => synonymsBucket.key);
        }
        if (item[field + ".type"] && item[field + ".type"].buckets.length > 0) {
          interventionType = item[field + ".type"].buckets[0].key;
        }

        return {
          name:     item.key,
          codes:    interventionCodes,
          synonyms: interventionSynonyms,
          category: interventionCategory
        };
      });
    } else {
      return bucket.map((item) => {
        return {
          key: item.key,
          count: item.doc_count //This number is != number of trials that have this field.
        }
      });
    }

  }

  /**
   * Extracts the aggregation from the ES results
   *
   * @param {any} field The field to pull out
   * @param {any} res The results
   * @returns
   *
   * @memberOf Searcher
   */
  _extractAggregations(field, res) {

    let bucket = [];

    //If we had to nest, we need to skip over this layer and move
    //to the next aggregate level down.
    if (res.aggregations[field + "_nested"]) {
      if (res.aggregations[field + "_nested"][field + "_filtered"]) {
        bucket = this._extractAggBucket(field, res.aggregations[field + "_nested"][field + "_filtered"][field].buckets);
      } else {
        bucket = this._extractAggBucket(field, res.aggregations[field + "_nested"][field].buckets);
      }
    } else if (res.aggregations[field + "_filtered"]) {

      bucket = this._extractAggBucket(field, res.aggregations[field + "_filtered"][field].buckets);
    } else {        //untested.
      bucket = this._extractAggBucket(field, res.aggregations[field].buckets);
    }

    return {
      //total: 0, //TODO: Get count from agg bucket
      terms: bucket
    }
  }

  aggTrials(q, callback) {
    logger.info("Trial aggregate", q);

    //We should call count, or search with size 0.
    this.client.search({
      index: "cancer-clinical-trials",
      type: "trial",
      body: this._aggTrialsQuery(q)
    }, (err, res) => {


      let formattedRes = {};
      if(err || CT_API_ERROR) {
        formattedRes = {"Error": (CT_API_ERROR ? CT_API_ERROR.message: "Bad Request.")};
        CT_API_ERROR = null;
      } else {
        //Get the field name
        let field = q["agg_field"];

        formattedRes = this._extractAggregations(field, res);
      }

      return callback(null, formattedRes);
    });
  }

  /***********************************************************************
                                   TERMS
   ***********************************************************************/

  get TERM_TYPE_DEFAULTS() {
    return Utils.searchTerms();
  }

  _searchTermsQuery(q) {
    // TODO: use BodyBuilder more
    let body = new Bodybuilder();

    body = this._addQueryTerms            (q, body);
    body = this._filterByCodes            (q, body);
    body = this._filterByCurrentStatuses  (q, body);
    body = this._filterByParam            (q.org_country,                 "org_country", body);
    body = this._filterByParam            (q.org_postal_code,             "org_postal_code", body);
    body = this._filterByParam            (q.org_state_or_province,       "org_state_or_province", body);
    body = this._filterByParam            (q.org_city,                    "org_city", body);
    body = this._filterByParam            (q.org_name,                    "org_name", body);
    body = this._filterByParam            (q.org_family,                  "org_family", body);
    body = this._filterByParam            (q.org_to_family_relationship,  "org_to_family_relationship", body);
    body = this._filterByParam            (q.org_country,                 "org_country", body);
    body = this._filterByGeoCoords        (q, body);
    body = this._setTermType              (q, body);

    let functionQuery = this._getFunctionQuery (q, body);

    // query is the intermediate object.
    // q is to get the actual values
    return this._sortAndGetQuery(q, functionQuery);
  }
  _addQueryTerms(q, body) {
    // add query terms (boost when phrase is matched)
    if (q.term) {
      body.query("match", "term_suggest", q.term);
      body.query("match", "term_suggest", q.term, {type: "phrase"});
    }
    return body;
  }

  _sortAndGetQuery(q, functionQuery) {
    // set the size, from and sort
    let resultSize = q.size || TERM_RESULT_SIZE_DEFAULT;
    resultSize = resultSize > TERM_RESULT_SIZE_MAX ? TERM_RESULT_SIZE_MAX : resultSize;
    let aFrom = q.from ? q.from : 0;

    // finalize the query
    let query = this._addSortQuery({
      "query": { "function_score": functionQuery },
      "size": resultSize,
      "from": aFrom,
      "sort": {}
    }, q);

    //logger.info(query);
    return query;
  }

  _addSortQuery(query, q) {
    let sortField = this._setSortByField(q);

    query["sort"][sortField] = {};
    let sortBy = query["sort"][sortField];

    sortBy["order"] = q.order;
    if (q.order && q.order.length && !(q.term && q.term.length) && !(q.sort && q.sort.length)) {
      CT_API_ERROR = new Error("Order can only be used when passing in a 'term' parameter (where a sort-by field is set as a default) and/or passing in a 'sort' parameter which is the field to sort by.");
      return;
    } else if (q.order && q.order.length && ["asc", "desc"].indexOf(q.order) < 0) {
      CT_API_ERROR = new Error("Order can only be descending (desc) or ascending (asc).");
      return;
    } if (!sortBy["order"] && ["count", "count_normalized", "_score"].indexOf(sortField) < 0) {
      sortBy["order"] = "asc";
    } else if (!sortBy["order"]){
      sortBy["order"] = "desc";
    }

    //logger.info(query);
    return query;
  }

  _setSortByField(q) {
    // use default unless specified and for 'score' use '_score'
    return q.sort === "score" ? "_score" : (q.sort || TERM_SORT_DEFAULT);
  }

  _getFunctionQuery(q, body) {
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
    functionQuery["boost_mode"] = "multiply";
    return functionQuery;
  }

  _setTermType(q, body) {
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
    return body;
  }

  _filterByCodes(q, body) {
    //Handle finding a term by code
    // note we uppercase here and that is because terms
    //are indexed as C12234 and not c12234
    if (q.codes) {
      if(q.codes instanceof Array) {
        let orBody = new Bodybuilder();
        q.codes.forEach((code) => {
          //logger.info(code);
          orBody.orFilter("term", "codes", code.toUpperCase());
        });
        body.filter("bool", "and", orBody.build());
      } else {
        body.filter("term", "codes", q.codes.toUpperCase());
      }
    }
    return body;
  }

  _filterByCurrentStatuses(q, body) {
    if (q.current_trial_statuses) {
      if(q.current_trial_statuses instanceof Array) {
        let orBody = new Bodybuilder();
        q.current_trial_statuses.forEach((currentTrialStatus) => {
          orBody.orFilter("term", "current_trial_statuses", currentTrialStatus.toUpperCase());
        });
        body.filter("bool", "and", orBody.build());
      } else {
        body.filter("term", "current_trial_statuses", q.current_trial_statuses.toUpperCase());
      }
    }
    return body;
  }

  _filterByParam (param, field, body) {
    if (param) {
      body.filter("term", field, param.toLowerCase());
    }
    return body;
  }

  _validateGeoCoords(q) {
    let err = this._validateGeoParams("org_coordinates", q.org_coordinates_lat, q.org_coordinates_lon);
    if (err !== "") {
      CT_API_ERROR = new Error(err);
      return q;
    } else {
      if (!(q.org_coordinates_dist) || isNaN(parseFloat(q.org_coordinates_dist)) || parseFloat(q.org_coordinates_dist) < 0.001) {
        q.org_coordinates_dist = 0.001;
      }
      q.org_coordinates_dist = parseFloat(q.org_coordinates_dist) + "mi";
    }
    return q;
  }

  _getGeoCoordsFilter(q, body) {
    //add in filter.
    return body.filter("geodistance", "org_coordinates", q.org_coordinates_dist, {
      lat: q.org_coordinates_lat,
      lon: q.org_coordinates_lon
    });
  }

  _filterByGeoCoords(q, body) {
    if (q["org_coordinates_lat"] || q["org_coordinates_lon"] || q["org_coordinates_dist"]) {
      return this._getGeoCoordsFilter(this._validateGeoCoords(q), body);
    } else {
      return body;
    }
  }

  searchTerms(q, callback) {
    // logger.info("Term searching", q);
    this.client.search({
      index: "cancer-terms",
      type: "term",
      body: this._searchTermsQuery(q)
    }, (err, res) => {
      let formattedRes = {};
      if(err || CT_API_ERROR) {
        formattedRes = {"Error": (CT_API_ERROR ? CT_API_ERROR.message: "Bad Request.")};
        CT_API_ERROR = null;
      } else {
        // return callback(null, res);
        formattedRes = {
          total: res.hits.total,
          terms: _.map(res.hits.hits, (hit) => {
            let source = hit._source;
            source.score = hit._score;
            return source;
          })
        };
      }
      return callback(null, formattedRes);
    });
  }

  _searchTermByKey(key) {
    let body = new Bodybuilder();
    body.query("match", "term_key", key);

    let query = body.build();

    return query;
  }

  // queries on term key
  getTermByKey(key, callback) {
    logger.info("Getting term", {key});
    this.client.search({
      index: "cancer-terms",
      type:  "term",
      body:  this._searchTermByKey(key)
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
