import React, { Component, PropTypes } from 'react';
import Autosuggest from 'react-autosuggest';
import AutosuggestHighlight from 'autosuggest-highlight';
import Similarity from 'string-similarity';

import ApiFetch from '../../lib/ApiFetch.js';
import Url from '../../lib/Url';
import ValidParams from '../../lib/ValidParams';

function escapeRegexCharacters(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSubTypeFromTerm(term) {
  let match = term.match(/ \((.*)\)/);
  let subType = null;
  if (match instanceof Array) {
    term = term.replace(match[0], "");
    subType = match[1];
  }
  return { term, subType };
}

function renderSuggestion(suggestion, { value, valueBeforeUpDown }) {
  const suggestionText = suggestion.term;
  const query = (valueBeforeUpDown || value).trim();
  const matches = AutosuggestHighlight.match(suggestionText, query);
  const parts = AutosuggestHighlight.parse(suggestionText, matches);

  let termTypeText = ValidParams
    .getParamsByKey()[suggestion.term_type]["display_name"].toLowerCase();
  // override treatment
  if (termTypeText === "treatment") {
    termTypeText = suggestion.sub_type ? `treatment - ${suggestion.sub_type.toLowerCase()}` : `treatment`;
  }

  return (
    <span className={'suggestion-content ' + suggestion.term_type}>
      <span className='text'>
        {
          parts.map((part, index) => {
            const className = part.highlight ? 'omni-suggest-highlight' : null;

            return (
              <span className={className} key={index}>{part.text}</span>
            );
          })
        }
      </span>
      <span className='suggestion-type'>&nbsp;({termTypeText})</span>
    </span>
  );
}

function getSuggestionValue(suggestion) { // when suggestion selected, this function tells
  return suggestion.term;                 // what should be the value of the input
}

class OmniSuggest extends Component {

  get SIMILARITY_THRESHOLD() {
    return 0.8;
  }

  constructor() {
    super();

    this.state = {
      value: '',
      suggestions: []
    };

    this.onSubmit = this.onSubmit.bind(this);
    this.onChange = this.onChange.bind(this);
    this.onSuggestionsUpdateRequested = this.onSuggestionsUpdateRequested.bind(this);
    this.onSuggestionSelected = this.onSuggestionSelected.bind(this);
  }

  loadSuggestions(value) {
    let term = escapeRegexCharacters(value);
    ApiFetch(`terms?term=${term}`)
      .then(response => response.json())
      .then((json) => {
        let suggestions = json.terms.map((suggestion) => {
          if (suggestion.term_type === "_treatments") {
            let {term, subType} = extractSubTypeFromTerm(suggestion.term);
            suggestion.term = term;
            suggestion.sub_type = subType;
          }
          return suggestion;
        });
        if (value === this.state.value) {
          this.setState({
            suggestions
          });
        } else { // Ignore suggestions if input value changed
          this.setState({});
        }
      });
  }

  componentDidMount() {}

  onChange(event, { newValue }) {
    this.setState({
      value: newValue
    });
  }

  gotoSearch(event, {term_type, term}) {
    let params = {};
    if (term !== "") {
      params[term_type] = term;
    }
    Url.newParamsWithDefault({ path: "/clinical-trials", params });
  }

  onSubmit(event) {
    event.preventDefault();
    let { value, suggestions } = this.state;
    if (suggestions.length) {
      let topSuggestion = suggestions.find((suggestion) => {
        let term = suggestion.term;
        if (suggestion.sub_type) { term += ` (${suggestion.sub_type})`; }
        return value === term;
      }) || suggestions[0];
      if (topSuggestion) {
        let term = topSuggestion.term;
        if (topSuggestion.sub_type) {
          term += ` (${topSuggestion.sub_type})`;
          topSuggestion.term = term;
        }
        if (topSuggestion.term_type === "_locations") {
          let locParts = topSuggestion.term.split(", ");
          value = value.split(", ")[0];
          if (locParts.length) { term = locParts[0]; }
        }
        let similarity = Similarity.compareTwoStrings(value, term);
        if (similarity > this.SIMILARITY_THRESHOLD) {
          return this.gotoSearch(event, topSuggestion);
        }
      }
    }
    return this.gotoSearch(event, {
      "term_type": "_all",
      "term": value
    });
  }

  onSuggestionSelected(event, { suggestion, suggestionValue }) {
    if (event.type === "click") {
      let { term_type, term } = suggestion;
      this.gotoSearch(event, { term_type, term });
    }
  }

  onSuggestionsUpdateRequested({ value, reason }) {
    if (reason === "type") {
      // don't load suggestions or change state if the user is
      // selecting an option
      this.loadSuggestions(value);
    }
  }

  render() {
    const { value, suggestions } = this.state;
    const inputProps = {
      placeholder: 'enter a disease, location, organization, or treatment',
      value,
      onChange: this.onChange,
      autoFocus: true
    };

    return (
      <div className="omni-suggest">
        <form onSubmit={this.onSubmit}>
          <Autosuggest id="omni-search"
                       suggestions={suggestions}
                       onSuggestionsUpdateRequested={this.onSuggestionsUpdateRequested}
                       onSuggestionSelected={this.onSuggestionSelected}
                       getSuggestionValue={getSuggestionValue}
                       renderSuggestion={renderSuggestion}
                       inputProps={inputProps} />
          <div className='search-icon'>
            <input type="image" src="images/search-icon.svg" alt="Submit Form" />
          </div>
        </form>
      </div>
    );
  }
}

export default OmniSuggest;
