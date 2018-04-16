const fs = require('fs');
const path = require('path');
const validate = require('validate-npm-package-name');
const copy = require('recursive-copy');

const maybeInit = require('./init');
const {mustacheLite, markdown, copyPackageJson, copyNodemonJson, npmInstall, logger} = require('./util');
const {LAMBDASYNC_ROOT, SETTINGS_FILE} = require('./constants');
const {setSettingsFile} = require('./settings');

const validTemplatenames = ['vanilla', 'express'];

module.exports = function (name = '', templateName) {
  // Validate name
  const validatedName = validate(name);
  if (!validatedName.validForNewPackages) {
    console.log(markdown({
      templatePath: 'markdown/naming.md'
    }));
    return;
  }

  // Validate templateName
  let template = templateName;
  if (!validTemplatenames.includes(template)) {
    // If the templateName is not valid default to `vanilla`
    template = 'vanilla';
  }

  // Create the new project folder
  fs.mkdirSync(name);
  process.chdir(name);
  setSettingsFile(path.join(process.cwd(), SETTINGS_FILE));

  const TEMPLATE_PATH = path.join(LAMBDASYNC_ROOT, 'bin', 'template', 'new', template);

  // Copy over all template files except package.json
  copyTemplateDir(TEMPLATE_PATH, process.cwd())
    // Copy the package.json template, adding the project name as name
    .then(() => copyPackageJson(TEMPLATE_PATH, process.cwd(), {name}))
    .then(() => copyNodemonJson(TEMPLATE_PATH, process.cwd(), LAMBDASYNC_ROOT))
    // Run the project init flow
    .then(() => maybeInit({}))
    .then(() => npmInstall())
    .then(() => {
      console.log(markdown({
        templatePath: 'markdown/scaffold-success.md',
        data: {name}
      }));
    })
    .catch(() => {
      console.log(markdown({
        templatePath: 'markdown/scaffold-fail.md'
      }));
    });
};

function copyTemplateDir(templateDir, targetDir) {
  const packageJsonFilter = {
    filter: path => path && !path.includes('package.json') && !path.includes('nodemon.json')
  };
  return copy(templateDir, targetDir, packageJsonFilter);
}
