const fs = require("fs").promises;
const path = require("path");

const createFileName = (clientId) => {
  return path.join(__dirname, "..", "data", "results", `${clientId}.json`);
};

exports.useStorageFactory = () => {
  const ONE_DAY_OFFSET = 24 * 60 * 60 * 1000;
  const TWELVE_HRS_OFFSET = ONE_DAY_OFFSET / 2;

  const getResultsByClientID = async (clientId) => {
    try {
      const file = await fs.readFile(createFileName(clientId));
      if (file == null) return [];

      return JSON.parse(file);
    } catch (err) {
      if (err.errno == "-4058" && err.code == "ENOENT") {
        return [];
      }

      throw err;
    }
  };

  const addResultToStorage = async (clientId, { requestedAt, sessionId, data, errors, tool, dngWorkspace }) => {
    const doneRequestsForClientId = await getResultsByClientID(clientId);

    const addedRequests = [
      ...doneRequestsForClientId,
      {
        requestedAt,
        sessionId,
        data,
        errors,
        tool,
        dngWorkspace,
      },
    ];

    await fs.writeFile(createFileName(clientId), JSON.stringify(addedRequests, null, 2));
  };

  const removeResultByClientIDAndSessionID = async (clientId, sessionId) => {
    const finishedReqs = (await getResultsByClientID(clientId)).filter((completion) => completion.sessionId !== sessionId);
    await fs.writeFile(createFileName(clientId), JSON.stringify(finishedReqs, null, 2));
  };

  const startCleanupAfterDays = ({ daysToCleanUp = 7 }) => {
    // Run the removal function periodically (e.g., twice a day)
    // Todo
  };

  return { getResultsByClientID, addResultToStorage, removeResultByClientIDAndSessionID, startCleanupAfterDays };
};
