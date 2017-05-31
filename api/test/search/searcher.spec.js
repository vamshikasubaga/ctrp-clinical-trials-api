//import { describe, it } from 'mocha';

import { expect } from 'chai';
const CONFIG              = require("../../../config" + (process.env.NODE_ENV ? "." + process.env.NODE_ENV : "") + ".json");

const Bodybuilder              = require("bodybuilder");
const querystring              = require('querystring');
const Searcher                 = require("../../search/searcher");
const AbstractSearchAdapter    = require("../../../common/search_adapters/abstract_search_adapter");

/**
 * Represents a mock ES adapter for use by the Searcher class. 
 * 
 * @class SearcherMockClient
 * @extends {AbstractSearchAdapter}
 */
class SearcherMockAdapter extends AbstractSearchAdapter {

    /**
     * Creates an instance of SearcherMockClient.
     * 
     */
    constructor() {
        console.log("CONSTRUCTOR")
        super();
        this.client = false;
    }
}

describe('Searcher', _ => {

    it('Should Build a NCT ID Query', () => {
        let searcher = new Searcher(new SearcherMockAdapter());
        //let query = {};        
        let query = searcher._searchTrialById("NCT02289950");

        expect(query).to.eql({
            query: {
                match: {
                    "nct_id": "NCT02289950"
                }
            }
        });

    });

    it('Should Build a NCI ID Query', () => {
        let searcher = new Searcher(new SearcherMockAdapter());
        let query = searcher._searchTrialById("NCI-2015-00253");

        expect(query).to.eql({
            query: {
                match: {
                    "nci_id": "NCI-2015-00253"
                }
            }
        });

    });


    it('Should Add String Filter With Single Value', () => {
        let searcher = new Searcher(new SearcherMockAdapter());
        let body = new Bodybuilder();
        let q = querystring.parse("current_trial_status=Active");
        searcher._addStringFilters(body, q);


        expect(body.build("v2")).to.eql({
            query: {
                bool: {
                    filter: {
                        term: {
                            "current_trial_status": "active"
                        }
                    }
                }
            }
        });

    });

    it('Should Add String Filter with multiple values', () => {
        let searcher = new Searcher(new SearcherMockAdapter());
        let body = new Bodybuilder();
        let q = querystring.parse("current_trial_status=Active&current_trial_status=Temporarily+Closed+to+Accrual");
        searcher._addStringFilters(body, q);


        expect(body.build("v2")).to.eql({
            query: {
                bool: {
                    filter: {
                        bool: {
                            "must": [
                                {
                                "query": {
                                    "filtered": {
                                        "filter": {
                                            "bool": {
                                                "should": [
                                                    {
                                                        "term": { "current_trial_status": "active" }
                                                    },
                                                    {
                                                        "term": { "current_trial_status": "temporarily closed to accrual" }
                                                    }
                                                ]
                                            }
                                        }
                                    }
                                }
                                }
                            ]                                                        
                        }
                    }
                }
            }
        });

    });

    // new unit tests
    // Unit testing for TERM_TYPE_DEFAULTS
    it('Should Be an Array', () => {
        let searcher = new Searcher(new SearcherMockAdapter());
        expect(searcher.TERM_TYPE_DEFAULTS).to.be.a('array');
    });

    it('Should Build an Array with 9 Elements', () => {
        let searcher = new Searcher(new SearcherMockAdapter());
        expect(searcher.TERM_TYPE_DEFAULTS.length).to.eql(CONFIG.SEARCH_TERMS.length);
    });

    it('Should Be an Array with 9 Elements', () => {
        let searcher = new Searcher(new SearcherMockAdapter());
        expect(searcher.TERM_TYPE_DEFAULTS).to.eql(CONFIG.SEARCH_TERMS);
    });

    /* This is not really a Unit test and bothersome to maintain, we dont need values at certain locations
    it('Should Be an Array Containing sites.org_postal_code Which Put in the 2nd Position', () => {
        let searcher = new Searcher(new SearcherMockAdapter());
        expect(searcher.TERM_TYPE_DEFAULTS[2]).to.eql('sites.org_postal_code');
    });

    it('Should Be an Array Containing sites.org_city Which Put in the 4th Position', () => {
        let searcher = new Searcher(new SearcherMockAdapter());
        expect(searcher.TERM_TYPE_DEFAULTS[4]).to.eql('sites.org_city');
    });
    */

    // Unit testing for _searchTermQuery
    it('Should Build a Term Query with term', () => {
        let searcher = new Searcher(new SearcherMockAdapter());
        let q = querystring.parse("term=dal");
        let query = searcher._searchTermsQuery(q);

        expect(query.query.function_score.query.bool.should).to.eql({
            match: {
                "term": "dal"
            }
        });
    });

    it('Should Build a Term Query with term_type', () => {
        let searcher = new Searcher(new SearcherMockAdapter());
        let q = querystring.parse("term_type=sites.org_city");
        let query = searcher._searchTermsQuery(q);

        expect(query.query.function_score.query).to.eql({
            bool: {
                filter: {
                    bool: {
                        should: [
                            {
                                term: {
                                    "term_type": "sites.org_city"
                                }
                            }
                        ]
                    }
                }
            }
        });
    });

    it('Should Build a Term Query with term and term_type', () => {
        let searcher = new Searcher(new SearcherMockAdapter());
        let q = querystring.parse("term=dal&term_type=sites.org_city");
        let query = searcher._searchTermsQuery(q);

        expect(query.query.function_score.query).to.eql({
            bool: {
                filter: {
                    bool: {
                        should: [
                            {
                                term: {
                                    "term_type": "sites.org_city"
                                }
                            }
                        ]
                    }
                },
                must: [
                    {
                        match: {
                            "term_suggest": "dal"
                        }
                    },
                    {
                        match: {
                            "term_suggest": {
                                "query": "dal",
                                "type": "phrase"
                            }
                        }
                    }
                ],
                should: {
                    match: {
                        "term": "dal"
                    }
                }
            }
        });
    });

    it('Should Build a Term Query with term_type', () => {
        let searcher = new Searcher(new SearcherMockAdapter());
        let q = querystring.parse("term_type=sites.org_postal_code");
        let query = searcher._searchTermsQuery(q);

        expect(query.query.function_score.query).to.eql({
            bool: {
                filter: {
                    bool: {
                        should: [
                            {
                                term: {
                                    "term_type": "sites.org_postal_code"
                                }
                            }
                        ]
                    }
                }
            }
        });
    });

    // Unit testing for _searchTermByKey
    it('Should Build a Term Key Query', () => {
        let searcher = new Searcher(new SearcherMockAdapter());
        let query = searcher._searchTermByKey("touro_infirmary");

        expect(query).to.eql({
            query: {
                match: {
                    "term_key": "touro_infirmary"
                }
            }
        });
    });

});
