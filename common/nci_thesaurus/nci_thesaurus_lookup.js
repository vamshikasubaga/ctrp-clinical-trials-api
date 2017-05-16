const _                   = require("lodash");
const Logger              = require("../logger");
const NCIThesaurusTerm    = require("./nci_thesaurus_term");


// The NCI Thesaurus code system identifier used for building LexEVS urls.
const CODE_SYSTEM_NAME = 'NCI_Thesaurus';

let logger = new Logger({name: "nci-thesaurus-lookup"});

/**
 * A class for handling lookup to get term information from the NCI Thesaurus using LexEVS CTS2
 * 
 * @class NCIThesaurusLookup
 */
class NCIThesaurusLookup {

  /**
   * Creates an instance of NCIThesaurusLookup.
   * 
   * @param {any} client The LexEVS client to use
   * @param {string} version The version of the NCI Thesaurus to use. Defaults to "17.01e".
   * 
   * @memberOf NCIThesaurusLookup
   */
  constructor(client, version = "17.04d") {
    this.client = client;
    this.codeSystemVersion = version;
    this.termCache = {};
    this.indexCounter = 0;
  }

  /**
   * Gets a term from the NCI thesaurus.  
   * 
   * @param {any} entityID The ID of the entity to lookup.
   * @param {any} done A completion callback (err, term) called upon error or completion of lookup.
   * 
   * @memberOf NCIThesaurusLookup
   */
  getTerm(entityID, done) {

    //Basically, check to see if the term has already been fetched or not
    //and handle accordingly.  This function *currently* is not called asynchronously,
    //so we should not need to worry about locking. (even then, the only thing may be 
    //that we fetch the same term multiple times, but it should not result in error...)

    if (!this.termCache[entityID]) {
      this.client.readEntity(
        CODE_SYSTEM_NAME,
        this.codeSystemVersion,
        entityID,
        (err, rawObj) => {
          if (err) {
            return done(err);
          }

          let term = NCIThesaurusTerm.deserializeFromLexEVS(rawObj);

          //Store the term in the cache and "return" the term.
          this.termCache[entityID] = term;

          return done(null, term);
        }
      );
    } else {
      return done(null, this.termCache[entityID]);
    }
  }
}

module.exports = NCIThesaurusLookup;