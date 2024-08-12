const fs = require("fs").promises;
const path = require("path");

const createLookupFileName = (projectId, moduleURI) => {
  return path.join(__dirname, "signalsLookups", `${projectId}-${moduleURI}.json`);
};

exports.getSignalsLookup = async (projectId, moduleURI) => {
  try {
    const file = await fs.readFile(createLookupFileName(projectId, moduleURI));
    if (file == null) return null;

    return JSON.parse(file);
  } catch (err) {
    if (err.errno == "-4058" && err.code == "ENOENT") {
      return null;
    }

    throw err;
  }
};

exports.saveSignalsLookup = async (projectId, moduleURI, signals) => {
  await fs.writeFile(createLookupFileName(projectId, moduleURI), JSON.stringify(signals, null, 2));
};

exports.removeSignalsByProjectIDAndModuleURI = async (projectId, moduleURI) => {
  await fs.unlink(createLookupFileName(projectId, moduleURI));
};
