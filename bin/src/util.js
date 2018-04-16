const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const marked = require('marked');
const TerminalRenderer = require('marked-terminal');
const spawn = require('cross-spawn');

const {LAMBDASYNC_SRC} = require('./constants');
const {readFile} = require('./file');

marked.setOptions({
  // Define custom renderer
  renderer: new TerminalRenderer()
});

// Executes a CLI command and returns a promise
function promisedExec(command, options = {}) { // eslint-disable-line no-unused-vars
  return new Promise((resolve, reject) => {
    cp.exec(command, options, (err, stdout) => {
      if (err) {
        return reject(err);
      }
      resolve(stdout);
    });
  });
}

// Replaces {{vars}} in strings
function mustacheLite(template, data = {}) {
  let content = template;
  Object.keys(data).forEach(key => {
    content = content.replace(new RegExp(`{{${key}}}`, 'g'), data[key]);
  });
  return content;
}

// Takes a markdown string, or path to a markdown file (relative to Lambdasync's `src` dir)
// and produces terminal styled markdown
// Will also replace an mustahce vars with values from the supplied data object
function markdown({templateString = null, templatePath = null, data = {}}) {
  const template = templateString ?
    templateString : fs.readFileSync(path.join(LAMBDASYNC_SRC, templatePath), 'utf8');
  const content = mustacheLite(template, data);
  const md = marked(content);
  return `\n${md}\n`;
}

// Takes an object of {key,label} and a data object and produces
// markdown for a bold label and inline code ticks around the value
// that was fetched from the data object using the key
function markdownProperty({key, label}, data) {
  if (data && Object.prototype.hasOwnProperty.call(data, key)) {
    return '**' + label + ':** `' + data[key] + '`\n';
  }
  return '';
}

// Helps add default values to `inquirer` prompt objects
function addInputDefault(defaults, inputConfig) {
  if (defaults[inputConfig.name]) {
    return Object.assign({}, inputConfig, {default: defaults[inputConfig.name]});
  }
  return inputConfig;
}

// Calls an aws sdk class and method and returns a promise
function awsPromise(api, method, params) {
  return new Promise((resolve, reject) => {
    try {
      api[method](params, (err, data) => {
        if (err) {
          return reject(err);
        }
        return resolve(data);
      });
    } catch (err) {
      return reject(err)
    }
  });
}

// Removes the `:12345` version at the end of the function ARN
function stripLambdaVersion(lambdaArn) {
  return lambdaArn.replace(/:[0-9]+$/, '');
}

function makeLambdaPolicyArn({lambdaArn, apiGatewayId}) {
  return lambdaArn
    .replace('arn:aws:lambda', 'arn:aws:execute-api')
    .replace(/function.*?$/g, apiGatewayId)
    .concat(`/*/*/*`);
}

// takes an array of CLI args [ 'timeout=10' ] and returns a key value object
// {timeout: 10}, it will also try to JSON parse args
function parseCommandArgs(args = [], settings = {}) {
  return args.reduce((acc, current) => {
    let [key, valueKey] = current.split('=');
    if (!key || !valueKey) {
      return acc;
    }
    // If string starts with a [ or {, JSON.parse it
    if (valueKey[0] === '[' || valueKey[0] === '{') {
      try {
        valueKey = JSON.parse(valueKey);
      } catch (err) {}
    }

    acc[key] = settings[valueKey] || valueKey;
    return acc;
  }, {});
}

function functionExists(api, functionName) {
  return new Promise((resolve, reject) => {
    const params = {
      FunctionName: functionName
    };
    api.getFunction(params, err => {
      if (err) {
        if (err.toString().includes('ResourceNotFoundException')) {
          return resolve(false);
        }
        return reject(err);
      }
      return resolve(true);
    });
  });
}

function copyPackageJson(templateDir, targetDir, data) {
  const jsonTemplate = fs.readFileSync(path.join(templateDir, 'package.json'), 'utf8');
  return fs.writeFileSync(
    path.join(targetDir, 'package.json'),
    mustacheLite(jsonTemplate, data)
  );
}

function copyNodemonJson(templateDir, targetDir, lambdasyncRoot) {
  const jsonTemplate = fs.readFileSync(path.join(templateDir, 'nodemon.json'), 'utf8');
  return fs.writeFileSync(
    path.join(targetDir, 'nodemon.json'),
    mustacheLite(jsonTemplate, { lambdasyncRoot: lambdasyncRoot })
  );
}

function hashPackageDependencies({dependencies = {}}) {
  if (!dependencies) {
    return null;
  }
  return crypto.createHash('md5').update(JSON.stringify(dependencies)).digest('hex');
}

const logger = label => input => {
  console.log('\n\n' + label + '\n');
  console.log(input);
  console.log('\n\n');
  return input;
};

function handleGenericFailure() {
  // TODO: Log errors here, possibly to a Lambda instance? :)
  console.log(markdown({
    templatePath: 'markdown/generic-fail.md'
  }));
}

const logMessage = message => input => {
  console.log(message);
  return input;
};

function formatTimestamp(timestamp) {
  // Timestamp is in UTC, but user wants to see local time so add the offset
  // Inverse the offset since we have a UTC time to convert to local
  const offset = new Date().getTimezoneOffset() * -1;
  const localTime = new Date(timestamp.getTime() + (offset * 60 * 1000));
  if (isDate(localTime)) {
    const dateStr = localTime.toISOString();
    return dateStr.replace('T', ' ').substring(0, dateStr.indexOf('.'));
  }
  return null;
}

const delay = time => input => new Promise(resolve => {
  setTimeout(() => {
    resolve(input);
  }, time);
});

const startWith = data => Promise.resolve(data);

function npmInstall(flags = '') {
  return new Promise((resolve, reject) => {
    var child = spawn('npm', ['install', flags], {stdio: 'inherit'});
    child.on('close', code => {
      if (code !== 0) {
        return reject('npm install failed');
      }
      return resolve();
    });
  });
}

function ignoreData() {
  return {};
}

function isDate(date) {
  return Object.prototype.toString.call(date) === '[object Date]' &&
    (date.toString() && date.toString() !== 'Invalid Date');
}

function removeCurrentPath(path = '') {
  const pathToRemove = `${process.cwd()}/`;
  return path.replace(pathToRemove, '');
}

function removeFileExtension(path = '') {
  // Instead of setting rules for what a file extension is based on length and allowed chars
  // Let's just specify which file endings we want to be able to remove
  const extensionsToRemove = ['js'];
  // Get position of last dot
  const lastDotPosition = path.lastIndexOf('.');
  // If none are found we can safely just return the original string
  if (lastDotPosition === -1) {
    return path;
  }

  // Get the file extension (right of the last dot)
  const maybeExtension = path.substr(lastDotPosition + 1);
  if (extensionsToRemove.indexOf(maybeExtension) !== -1) {
    return path.substr(0, lastDotPosition);
  }
  return path;
}

function makeAbsolutePath(inPath) {
  // First find out if the path is absolute
  if (path.isAbsolute(inPath)) {
    return inPath;
  }

  // Otherwise build an absolute path from process.cwd()
  return path.join(process.cwd(), inPath);
}

exports = module.exports = {};
exports.promisedExec = promisedExec;
exports.handleGenericFailure = handleGenericFailure;
exports.markdown = markdown;
exports.markdownProperty = markdownProperty;
exports.mustacheLite = mustacheLite;
exports.addInputDefault = addInputDefault;
exports.awsPromise = awsPromise;
exports.stripLambdaVersion = stripLambdaVersion;
exports.startWith = startWith;
exports.delay = delay;
exports.makeLambdaPolicyArn = makeLambdaPolicyArn;
exports.parseCommandArgs = parseCommandArgs;
exports.logger = logger;
exports.logMessage = logMessage;
exports.formatTimestamp = formatTimestamp;
exports.isDate = isDate;
exports.functionExists = functionExists;
exports.copyPackageJson = copyPackageJson;
exports.copyNodemonJson = copyNodemonJson;
exports.npmInstall = npmInstall;
exports.hashPackageDependencies = hashPackageDependencies;
exports.ignoreData = ignoreData;
exports.removeFileExtension = removeFileExtension;
exports.makeAbsolutePath = makeAbsolutePath;
exports.removeCurrentPath = removeCurrentPath;

if (process.env.NODE_ENV === 'test') {
  exports.isDate = isDate;
}
