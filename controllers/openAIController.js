const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const { useQueueFactory, checkBusy } = require("../utils/serviceQueueFactory");
const { useStorageFactory } = require("../utils/useStorageFactory");
const { STATUS, updateSession, createSession, getSession, deleteSession } = require("../data/sessions/sessionOperators");
const { useChatCompletionForConsistency } = require("./helpers/consistencyHelper");
const { useChatCompletionForIndividualItem } = require("./helpers/singleReqHelper");
const { useChatCompletionForTestCaseGeneration, testCaseProcessesManager, generateLookupForSignals } = require("./helpers/testCases");
const { getSignalsLookup } = require("../data/signalsLookupsOperator");
const TestCaseProcessesManager = require("./helpers/testCases/TestCaseProcessesManager");
const { chatCompletion, generateEmbeddings } = require("./helpers/openAIHelpers");

const TOOL_NAMES = {
  translate: "translate",
  consistency: "consistency",
  quality: "quality",
  toxic: "toxic",
  testCasesGeneration: "test-cases-generation",
  preprocessForTestCases: "preprocess-for-test-cases",
};

// State Machine and Queue variables
const {
  queue,
  subscribeToQueue,
  isBusy,
  commenceQueueProcess,
  resetServiceState,
  getCompressedQueue,
  finishRequest,
  deleteQueueItem,
  updateItemProgress,
  getNextConcurrentRequest,
  removeItemFromQueue,
} = useQueueFactory();
const { getResultsByClientID, addResultToStorage, removeResultByClientIDAndSessionID, startCleanupAfterDays } = useStorageFactory();

const daysToCleanUp = 7;
startCleanupAfterDays({ daysToCleanUp });

const resetStateAndProcessNext = () => {
  resetServiceState();
  processNextRequests();
};

const REQUIRED_REQ_PROPS = ["sessionId", "clientId", "tool"];

/* Main function to process requests */
const processNextRequests = async () => {
  while (true) {
    if (queue.isEmpty()) break;
    const request = getNextConcurrentRequest();

    if (request == null) break;

    commenceQueueProcess(request);

    const missingProps = REQUIRED_REQ_PROPS.reduce((missing, prop) => {
      if (request[prop] == null) {
        return [...missing, prop];
      }

      return missing;
    }, []);

    if (missingProps?.length) {
      if (request.sessionId != null) {
        await deleteSession(request.sessionId);
        // await updateSession(request.sessionId, {
        //   status: STATUS.ERROR,
        //   error: `The request is missing the properties: ${missingProps.join(", ")}`,
        // });
        removeItemFromQueue(sessionId, clientId);
      }

      resetStateAndProcessNext();
      break;
    }

    const { sessionId, clientId, tool, requestedAt, abortController } = request;
    let session = await getSession(sessionId, { withData: true });
    // If tool is test-cases-generation, dataForTestCases and allArtifacts are needed
    // and artifacts field is called reqsToGenTestCases
    const { artifacts, dngWorkspace, dataForTestCases = null, allArtifacts = null, translateLangCode = null } = session.data;

    if (dngWorkspace == null) {
      session.data = null;
      await deleteSession(sessionId);
      // await updateSession(sessionId, {
      //   status: STATUS.ERROR,
      //   error: "'dngWorkspace' property is undefined. Please contact the developer.",
      // });

      removeItemFromQueue(sessionId, clientId);
      resetStateAndProcessNext();
      break;
    }

    if (tool !== "test-cases-generation" && artifacts == null) {
      session.data = null;
      await deleteSession(sessionId);
      // await updateSession(sessionId, {
      //   status: STATUS.ERROR,
      //   error: "The input data in request is missing either 'artifacts' or 'dngWorkspace' property",
      // });

      resetStateAndProcessNext();
    }

    const progressHandler = ({ processId, currentIndex, totalIndices }) => {
      const progress = (((currentIndex + 1) / (totalIndices + 1)) * 100).toFixed(2);
      updateItemProgress(processId, progress);
    };

    let results;
    switch (tool) {
      case TOOL_NAMES.consistency:
        results = await useChatCompletionForConsistency(artifacts, progressHandler, sessionId, { abortController });
        break;
      case TOOL_NAMES.translate:
      case TOOL_NAMES.toxic:
      case TOOL_NAMES.quality:
        results = await useChatCompletionForIndividualItem(artifacts, tool, progressHandler, sessionId, { abortController, translateLangCode });
        break;
      case TOOL_NAMES.testCasesGeneration:
        results = await useChatCompletionForTestCaseGeneration(artifacts, allArtifacts, dataForTestCases, dngWorkspace, sessionId, progressHandler, { abortController });
        break;
      default:
        throw new AppError("Invalid tool specified", 400);
    }

    if (results == null) {
      throw new AppError("Results not correctly parsed or in a wrong format!", 400);
    }

    const { data, errors } = results;
    session = await getSession(sessionId);

    if (session != null && session.status === STATUS.CANCELLED) {
      resetStateAndProcessNext();
      await deleteSession(sessionId);
      session.data = null;
      break;
    }

    // await updateSession(sessionId, { status: STATUS.SUCCESS });
    if (session != null) await deleteSession(sessionId);
    session.data = null;
    finishRequest(request);

    await addResultToStorage(clientId, { requestedAt, sessionId, data, errors, tool, dngWorkspace });
    resetStateAndProcessNext();
  }
};

const preprocessForTestCasesGeneration = async (data) => {
  const { allArtifacts, dngWorkspace } = data;
  const moduleURI = dngWorkspace.module.uri;
  const projectId = dngWorkspace.projectId;

  await generateLookupForSignals({ allArtifacts, moduleURI, projectId });
};

/* Controller functions */
exports.chatCompletion = catchAsync(async (req, res, next) => {
  const { data, tool } = req.body;
  const { clientId } = req.client;

  const session = await createSession({
    clientId,
    status: STATUS.PENDING,
    tool,
    data,
  });

  const queueLength = subscribeToQueue({
    sessionId: session.id,
    clientId,
    tool,
    artifactCount: data.artifacts.length,
    requestedAt: new Date().toString(),
  });

  processNextRequests();

  res.status(200).json({
    status: "success",
    data: {
      sessionId: session.id,
      clientId: clientId,
      tool,
      queueLength,
    },
  });
});

exports.preprocessForTestCases = catchAsync(async (req, res, next) => {
  const { data, tool } = req.body;

  const moduleURI = data.dngWorkspace.module.uri;
  const projectId = data.dngWorkspace.projectId;

  if (moduleURI == null) {
    return next(new AppError("ModuleURI is undefined!", 400));
  }

  if (projectId == null) {
    return next(new AppError("ProjectID is undefined!", 400));
  }

  if (tool === TOOL_NAMES.preprocessForTestCases) {
    preprocessForTestCasesGeneration(data);

    return res.status(200).json({
      status: "success",
      data: {
        message: "Your data for test cases have been collected and processed!",
      },
    });
  }

  if (tool === TOOL_NAMES.testCasesGeneration) {
    try {
      const signalsLookup = await getSignalsLookup(projectId, moduleURI);
      const pId = TestCaseProcessesManager.createProcessID(projectId, moduleURI);
      const isInProcess = testCaseProcessesManager.isInProcess(pId);

      if (signalsLookup == null && isInProcess) {
        return next();
      }

      if (signalsLookup == null && !isInProcess) {
        preprocessForTestCasesGeneration(data);
      }

      return next();
    } catch (err) {
      console.log(err);
      return next(err);
    }
  }

  next();
});

exports.checkBusy = checkBusy(isBusy, "OpenAI");

exports.getQueue = catchAsync(async (req, res, next) => {
  const queue = getCompressedQueue(req.query);

  res.status(200).json({
    status: "success",
    results: queue.length,
    data: {
      queue,
    },
  });
});

exports.deleteQueueItem = catchAsync(async (req, res, next) => {
  const { clientId } = req.client;
  const { sessionId } = req.body;

  const deletedItem = deleteQueueItem(sessionId, clientId);

  if (deletedItem != null && deletedItem.abortController) {
    deletedItem.abortController.abort();
  }

  // await updateSession(sessionId, { status: STATUS.CANCELLED });
  await deleteSession(sessionId);
  processNextRequests();

  res.status(204).json({
    status: "success",
  });
});

exports.getCompleteResults = catchAsync(async (req, res, next) => {
  const { tool } = req.query;
  const { clientId } = req.client;

  let results = await getResultsByClientID(clientId);

  if (tool != null && results) {
    results = results.filter((item) => item.tool === tool);
  }

  res.status(200).json({
    status: "success",
    data: results,
  });
});

exports.deleteResult = catchAsync(async (req, res, next) => {
  const { clientId } = req.client;
  const { sessionId } = req.body;

  await removeResultByClientIDAndSessionID(clientId, sessionId);

  res.status(204).json({
    status: "success",
  });
});

// Dev controller to use OpenAI
exports.devChatCompletion = catchAsync(async (req, res, next) => {
  const { messages, temp = null } = req.body;

  if (messages == null) {
    throw new AppError("Messages is required. Messages = [{ role, content }]", 400);
  }

  const data = await chatCompletion(messages, temp);

  res.status(200).json({
    status: "success",
    data,
  });
});

exports.devEmbedding = catchAsync(async (req, res, next) => {
  const { strings } = req.body;

  const data = await generateEmbeddings(strings);

  res.status(200).json({
    status: "success",
    data,
  });
});
