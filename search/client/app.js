import 'babel/polyfill';
import React from 'react';
import ReactDOM from 'react-dom';
import { canUseDOM } from 'fbjs/lib/ExecutionEnvironment';
import Location from './lib/Location';
import Layout from './components/Layout';

const routes = {}; // Auto-generated on build. See tools/lib/routes-loader.js

const route = async (path, callback) => {
  if (path.endsWith('/') && path !== '/') {
    path = path.slice(0, -1);
  }
  const handler = routes[path] || routes['/404'];
  const component = await handler();
  await callback(<Layout>{React.createElement(component)}</Layout>);
};

function run() {
  const container = document.getElementById('app');
  Location.listen(location => {
    route(location.pathname, async (component) =>
      ReactDOM.render(component, container, () => {
        // console.log(location.pathname, location.search);
        // Track the page view event via Google Analytics
        // window.ga('send', 'pageview');
    }));
  });
}

if (canUseDOM) {
// Run the application when both DOM is ready
// and page content is loaded
  if (window.addEventListener) {
    window.addEventListener('DOMContentLoaded', run);
  } else {
    window.attachEvent('onload', run);
  }
}

export default { route, routes };
