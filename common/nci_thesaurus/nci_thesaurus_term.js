const _                   = require("lodash");
const Logger              = require("../logger");

let logger = new Logger({name: "nci-thesaurus-term"});

/**
 * A class for respresenting a simplified NCI Thesaurus term using LexEVS CTS2
 * 
 * @class NCIThesaurusTerm
 */
class NCIThesaurusTerm {

  /**
   * Creates an instance of NCIThesaurusTerm.
   * 
   * @param {any} entityID The Entity ID
   * @param {any} preferredName The preferred Name
   * @param {any} displayName The display name 
   * @param {any} synonyms An array of synonym objects.
   * 
   * @memberOf NCIThesaurusTerm
   */
  constructor(entityID, preferredName, displayName, synonyms) {
    this.entityID = entityID;
    this.preferredName = preferredName;
    this.displayName = displayName;
    this.synonyms = synonyms;
  }

  /**
   * Filters synonyms by source and type
   * 
   * @param {any} source Null, A string representing the source, or an array of strings.
   * @param {any} type Null, A string representing the type, or an array of strings.
   * @returns An array of the filtered synonyms
   * 
   * @memberOf NCIThesaurusTerm
   */
  filterSynonyms(termSource, type) {

    let filtered = this.synonyms;

    if (termSource != null) {
      if (Array.isArray(termSource)) {
        if (termSource.length >= 1) {
          filtered = _.filter(filtered, (syn) => {
            return _.includes(termSource, syn.source);
          });
        }
      } else {
        filtered = _.filter(filtered, { source: termSource });
      }
    }

    if (type != null) {
      if (Array.isArray(type)) {
        if (type.length >= 1) {
          filtered = _.filter(filtered, (syn) => { return _.includes(type, syn.type); })
        }
      } else {
        filtered = _.filter(filtered, { type: type });
      }
    }
    
    return filtered;
  }

  /**
   * Deserializes a term from a JSON object as returned by the LexEVS.
   * 
   * @static
   * @param {any} lexEVSObj The JSON object
   * @returns
   * 
   * @memberOf NCIThesaurusTerm
   */
  static deserializeFromLexEVS(lexEVSObj) {
    //Until I find out otherwise, I will start assuming that these paths exist.
    let namedEntity = lexEVSObj.EntityDescriptionMsg.entityDescription.namedEntity;

    let entityID = namedEntity.entityID.name;
    let displayName = NCIThesaurusTerm._extractFirstSimpleProperty(namedEntity, "Display_Name");
    let preferredName = NCIThesaurusTerm._extractFirstSimpleProperty(namedEntity, "Preferred_Name");
     
    
    let synonyms = NCIThesaurusTerm._extractSynonyms(namedEntity);

    let term = new NCIThesaurusTerm(entityID, preferredName, displayName, synonyms); 
    return term;
  }

  /**
   * Extract the first value of a simple property from an entity
   * 
   * @static
   * @param {any} namedEntity The entity to extract the property from
   * @param {any} type The type of the property
   * @returns An string representing the value, or null if prop does not exist
   * 
   * @memberOf NCIThesaurusTerm
   */
  static _extractFirstSimpleProperty(namedEntity, type) {
    //Let's extract the synonyms from this object.
    let props = NCIThesaurusTerm._extractSimpleProperty(namedEntity, type);
    if (props.length > 0) {
      return props[0];
    } else {
      return null;
    }
  }

  /**
   * Extracts a simple property from an entity
   * 
   * @static
   * @param {any} namedEntity The entity to extract the property from
   * @param {any} type The type of the property
   * @returns An array of the property values
   * 
   * @memberOf NCIThesaurusTerm
   */
  static _extractSimpleProperty(namedEntity, type) {
    //Let's extract the synonyms from this object.
    let props = _.filter(namedEntity.property, { 
            predicate : { 
              name: type
            }        
          })
        //Map to a synonym.
        .map((prop) => {
          return NCIThesaurusTerm._extractValue(prop);
        });

    return props;    
  }

  /**
   * Extracts the synonyms (FULL_SYN) from an entity record.
   * 
   * @static
   * @param {any} namedEntity The entity to extract
   * @returns An array of synonym objects.
   * 
   * @memberOf NCIThesaurusTerm
   */
  static _extractSynonyms(namedEntity) {

    //Let's extract the synonyms from this object.
    let synonyms = _.filter(namedEntity.property, { 
            predicate : { 
              uri: "http://lexgrid.org/presentation-alternate",
              namespace: "NCI_Thesaurus",
              name: "FULL_SYN"
            }        
          })
        //Map to a synonym.
        .map((prop) => {
          
          let synonymText = NCIThesaurusTerm._extractValue(prop);

          let synonymType = "";
          let sourceProperty = "";
          let sourceCode = "";

          //Loop through each property qualifier extracting above values
          prop.propertyQualifier.forEach((qual) => {
            //Extract the qualifier value.
            let qualVal = NCIThesaurusTerm._extractValue(qual);

            switch(qual.predicate.name) {
              case "representational-form": 
                synonymType = qualVal;
                break;
              case "source-code": 
                sourceCode = qualVal;
                break;
              case "property-source":
                sourceProperty = qualVal;
                break;
            }
          }); 

          return {
            text: synonymText,
            source: sourceProperty,
            type: synonymType,
            sourceCode: sourceCode
          };
        });

    return synonyms;
  }

  /**
   * Extracts a value from a CTS2 property or propertyQualifier.
   * 
   * @static
   * @param {any} obj The object to extract the value from.
   * @returns
   * 
   * @memberOf NCIThesaurusTerm
   */
  static _extractValue(obj) {

    let valueObj = obj["value"];

    //Make sure the item is not null and is an array of 1 item.
    if (!(valueObj && Array.isArray(valueObj) && valueObj.length == 1)) {
      return null;
    }

    if (valueObj[0].literal && valueObj[0].literal.value) {
      return valueObj[0].literal.value;
    } else {
      return null;
    }
  }

}

module.exports = NCIThesaurusTerm;