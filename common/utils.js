const _                   = require("lodash");
const latinize            = require("latinize");
const CONFIG              = require("../config" + (process.env.NODE_ENV ? "." + process.env.NODE_ENV : "") + ".json");

class Utils {

  static config() {
    return CONFIG;
  }

  static enforceArray (obj) {
    if (!(obj instanceof Array)) {
      if (typeof(obj) === "string") {
        return [obj];
      } else {
        return [];
      }
    } else {
      return obj;
    }
  }

  static searchTerms() {
    return [
      "_diseases",
      "_locations",
      "_org_state_or_provinces",
      "_org_cities",
      "_orgs_by_location",
      "sites.org_postal_code",
      "sites.org_country",
      "sites.org_city",
      "sites.org_state_or_province",
      "sites.org_name",
      "sites.org_family",
      "sites.org_to_family_relationship",
      "_treatments",
      "anatomic_sites",
      "arms.interventions.intervention_type",
      "current_trial_status",
      "phase.phase",
      "study_protocol_type",
      "brief_title",
      "brief_summary",
      "official_title",
      "arms.interventions.synonyms",
      "primary_purpose.primary_purpose_code",
      "arms.interventions.intervention_code",
      "principal_investigator",
      "lead_org"
    ];
  }

  static termParams() {
    return [
      "term",
      "term_type",
      "size",
      "from",
      "sort",
      "order",
      "codes",
      "current_trial_statuses",
      "viewable",
      "org_family",
      "org_to_family_relationship",
      "org_country",
      "org_state_or_province",
      "org_city",
      "org_postal_code",
      "org_coordinates_dist",
      "org_coordinates_lat",
      "org_coordinates_lon"
    ];
  }

  static transformStringToKey(text) {
    return latinize(text)
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s\s+/g, " ")
      .replace(/ /g, "_")
      .replace("and_", "")
      .replace("of_", "")
      .replace("the_", "");
  }

  static getFlattenedMappingProperties(mapping) {
    let props = {};

    const _recurseMappingTree = (mappingTree, pathArr) => {
      if (mappingTree["properties"]) {
        _recurseMappingTree(mappingTree["properties"], pathArr);
      } else if (mappingTree["type"]) {
        props[pathArr.join(".")] = mappingTree["type"];
      } else {
        Object.keys(mappingTree).forEach((key) => {
          _recurseMappingTree(mappingTree[key], pathArr.concat(key));
        });
      }
    };

    _recurseMappingTree(mapping, []);
    return props;
  }

  static getFlattenedMappingPropertiesByType(mapping) {
    let props = {};

    const _recurseMappingTree = (mappingTree, pathArr) => {
      if (mappingTree["properties"]) {
        //We need to add any nested objects for groupings.
        if (mappingTree["type"] === "nested") {
          if (!props[mappingTree["type"]]) {
            props[mappingTree["type"]] = [];
          }
          props[mappingTree["type"]].push(pathArr.join("."));
        }
        _recurseMappingTree(mappingTree["properties"], pathArr);
      } else if (mappingTree["type"]) {
        if (!props[mappingTree["type"]]) {
          props[mappingTree["type"]] = [];
        }
        props[mappingTree["type"]].push(pathArr.join("."));
        //Add special "fulltext" variant to support fulltext field querying
        if (mappingTree["fields"] && mappingTree["fields"]["_fulltext"]) {
          if (!props["fulltext"]) {
            props["fulltext"] = [];
          }
          props["fulltext"].push(pathArr.join("."));
        }
      } else {
        Object.keys(mappingTree).forEach((key) => {
          _recurseMappingTree(mappingTree[key], pathArr.concat(key));
        });
      }
    };

    _recurseMappingTree(mapping, []);
    return props;
  }

  static omitDeepKeys(collection, excludeKeys) {
    const omitFn = (value) => {
      if (value && typeof value === "object") {
        excludeKeys.forEach((key) => {
          delete value[key];
        });
      }
    };
    return _.cloneDeepWith(collection, omitFn);
  }

  static omitPrivateKeys(collection) {
    const omitFn = (value) => {
      if (value && typeof value === "object") {
        Object.keys(value).forEach((key) => {
          if (key[0] === "_") {
            delete value[key];
          }
        });
      }
    };
    return _.cloneDeepWith(collection, omitFn);
  }

}

module.exports = Utils;
