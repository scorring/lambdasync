const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const expressCompat = require('./express-compat');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

function start(settings) {
  const lambdaHandler = require(path.join(process.cwd(), 'index.js')).handler; // eslint-disable-line import/no-dynamic-require
  const compat = expressCompat(settings);

  function proxyHandler(req, res) {
    // Create event, context and callback params for the Lambda handler
    const event = compat.express.requestToLambdaEvent(req);
    const context = compat.express.responseToContext(res);
    const callback = compat.lambda.callbackToExpressResponse.bind(null, res);

    // Set response headers that makes sense for a dev server
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return lambdaHandler(event, context, callback);
  }

  app.get('/favicon*', (req, res) => {
    res.sendFile(path.join(__dirname, '/favicon.ico'));
  });

  app.all('*', proxyHandler);

  app.listen(3003, () => {
    console.log('running server on port 3003');
  });
}

module.exports = start;
