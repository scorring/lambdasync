const AWS = require('aws-sdk');
var proxy = require('proxy-agent');
const { USE_PROXY, PROXY_URI } = require('../constants.js');

if (USE_PROXY) {
  AWS.config.update({
    httpOptions: { 
      agent: proxy(PROXY_URI) 
    }
  });
}

function configureAws(settings) {
  const credentials = new AWS.SharedIniFileCredentials({profile: settings.profileName});
  AWS.config.credentials = credentials;
  AWS.config.region = settings.region;
  return AWS;
}

module.exports = configureAws;
