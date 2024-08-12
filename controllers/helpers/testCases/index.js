const EventEmitter = require("events");
const eventEmitter = new EventEmitter();

const { getSignalsLookup, saveSignalsLookup } = require("../../../data/signalsLookupsOperator");
const TestCaseProcessesManager = require("./TestCaseProcessesManager");
const { signalsReqsLookupReducer } = require("./preprocessing");
const { processAndGenTestCases } = require("./processAndGenTestCases");
const AppError = require("../../../utils/appError");

const testCaseProcessesManager = new TestCaseProcessesManager();

const REQ_PER_TIME = 30;
const SIGNAL_LOOKUP_CREATED = "signals-created";

const generateLookupForSignals = async ({ allArtifacts, projectId, moduleURI }) => {
  const pId = TestCaseProcessesManager.createProcessID(projectId, moduleURI);

  testCaseProcessesManager.addProcess(pId);

  const lookup = await signalsReqsLookupReducer(allArtifacts);
  await saveSignalsLookup(projectId, moduleURI, lookup);
  testCaseProcessesManager.deleteProcess(pId);

  const eventName = SIGNAL_LOOKUP_CREATED + "-" + pId;
  eventEmitter.emit(eventName, lookup);

  return lookup;
};

const waitForLookupForSignalsGenerated = (pId) => {
  const eventName = SIGNAL_LOOKUP_CREATED + "-" + pId;

  return new Promise((resolve) => {
    eventEmitter.once(eventName, (lookup) => {
      resolve(lookup);
    });
  });
};

exports.useChatCompletionForTestCaseGeneration = async (
  reqsToGenTestCases,
  allArtifacts,
  dataForTestCases,
  dngWorkspace,
  sessionId,
  progressHandler,
  { batchSize = REQ_PER_TIME, abortController = null }
) => {
  const {
    module: { uri: moduleURI },
    projectId,
  } = dngWorkspace;

  const { commonEtmTCEnvVariables } = dataForTestCases;

  try {
    if (moduleURI == null) {
      throw new AppError("ModuleURI is undefined!", 400);
    }

    let signalsLookup = await getSignalsLookup(projectId, moduleURI);
    const pId = TestCaseProcessesManager.createProcessID(projectId, moduleURI);
    const isInProcess = testCaseProcessesManager.isInProcess(pId);

    const eventName = SIGNAL_LOOKUP_CREATED + "-" + pId;

    if (signalsLookup == null && isInProcess) {
      signalsLookup = await waitForLookupForSignalsGenerated(pId);
    }

    if (signalsLookup == null && !isInProcess) {
      signalsLookup = await generateLookupForSignals({ projectId, moduleURI, allArtifacts });
    }

    const responses = await processAndGenTestCases(
      reqsToGenTestCases,
      signalsLookup.lookupTable,
      signalsLookup.lookupKeys,
      signalsLookup.artifactLookupById,
      signalsLookup.lookupKeysEmbedded
    );

    const testCasesOfRequirements = [];
    const errors = [];

    responses.forEach((res) => {
      if (res.status !== "fulfilled") {
        errors.push(res.reason);
        return;
      }

      testCasesOfRequirements.push(res.value);
    });

    return {
      data: {
        testCasesOfRequirements,
        commonEtmTCEnvVariables,
      },
      errors,
    };
  } catch (err) {
    console.log(err);
    throw err;
  }
};

exports.generateLookupForSignals = generateLookupForSignals;
exports.testCaseProcessesManager = testCaseProcessesManager;
