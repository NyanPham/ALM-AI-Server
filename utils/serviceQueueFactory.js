const Queue = require("./Queue");
const catchAsync = require("./catchAsync");

const MACHINE_STATES = {
  IDLE: "idle",
  BUSY: "busy",
};

const QUEUE_ITEM_STATES = {
  PENDING: "pending",
  RUNNING: "running",
  DONE: "done",
};

exports.useQueueFactory = () => {
  const maxConcurrentItems = 1;
  const queue = new Queue(maxConcurrentItems);

  let state = MACHINE_STATES.IDLE;

  const isBusy = () => {
    return state === MACHINE_STATES.BUSY;
  };

  const getNextConcurrentRequest = () => {
    return queue.getConcurrentItems().find((item) => item.status === QUEUE_ITEM_STATES.PENDING);
  };

  const commenceQueueProcess = (queueItem) => {
    state = MACHINE_STATES.BUSY;
    queueItem.status = QUEUE_ITEM_STATES.RUNNING;
    queueItem.progress = 0;
    queueItem.abortController = new AbortController();
  };

  const updateItemProgress = (sessionId, progress) => {
    const itemInProgress = queue.getConcurrentItems().find((item) => item.sessionId === sessionId);
    if (itemInProgress) {
      itemInProgress.progress = progress;
    }
  };

  const resetServiceState = () => {
    state = MACHINE_STATES.IDLE;
  };

  const subscribeToQueue = (jobData) => {
    jobData.status = QUEUE_ITEM_STATES.PENDING;
    jobData.progress = 0;
    queue.enqueue(jobData);

    return queue.getLength();
  };

  const removeItemFromQueue = (sessionId, clientId) => {
    const index = queue.findItemIndex((item) => item.sessionId === sessionId && item.clientId === clientId, { inConcurrent: true });
    if (index < 0) return;

    queue.removeItem(index);
  };

  const finishRequest = (itemToFinish) => {
    if (queue.isEmpty()) return;

    itemToFinish.status = QUEUE_ITEM_STATES.DONE;
    itemToFinish.progress = 100;

    removeItemFromQueue(itemToFinish.sessionId, itemToFinish.clientId);
  };

  const getNextRequest = () => {
    return queue.peek();
  };

  const peekRequest = () => {
    return queue.peek();
  };

  const printQueue = () => {
    queue.printQueue();
  };

  const deleteQueueItem = (sessionId, clientId) => {
    const index = queue.findItemIndex((item) => item.sessionId === sessionId && item.clientId === clientId, { inConcurrent: false });
    if (index < 0) return;

    const [item] = queue.removeItem(index);

    if (queue.isEmpty()) {
      state = MACHINE_STATES.IDLE;
    }

    return item;
  };

  const getCompressedQueue = ({ tool = null, clientId = null, forProgress = false }) => {
    let fileredQueueItems = queue.items;

    if (tool != null) {
      fileredQueueItems = fileredQueueItems.filter((item) => item.tool === tool);
    }

    if (clientId != null) {
      fileredQueueItems = fileredQueueItems.filter((item) => item.clientId === clientId);
    }

    if (forProgress) {
      fileredQueueItems = fileredQueueItems.filter((item) => {
        return item.status === QUEUE_ITEM_STATES.RUNNING || item.status === QUEUE_ITEM_STATES.DONE;
      });

      return fileredQueueItems.map(({ clientId, sessionId, tool, status, progress = null }) => ({
        clientId,
        sessionId,
        status,
        progress,
        tool,
      }));
    }

    return fileredQueueItems.map(({ clientId, sessionId, tool, requestedAt, status, artifactCount, progress = null }) => ({
      requestedAt,
      clientId,
      sessionId,
      tool,
      artifactCount,
      status,
      progress,
    }));
  };

  return {
    queue,
    subscribeToQueue,
    getNextRequest,
    peekRequest,
    printQueue,
    commenceQueueProcess,
    resetServiceState,
    isBusy,
    getCompressedQueue,
    finishRequest,
    deleteQueueItem,
    getNextConcurrentRequest,
    updateItemProgress,
    removeItemFromQueue,
  };
};

exports.checkBusy = (isServiceBusy, serviceName) =>
  catchAsync(async (req, res, next) => {
    const { clientId } = req.client;

    if (clientId == null) {
      next(new AppError("Random Client Id is required!", 400));
    }

    if (isServiceBusy()) {
      res.status(200).json({
        status: "success",
        message: `<p>The server with ${serviceName} is busy. <br/>Do you want to add your request to queue?</p>`,
        data: {
          blockedByStateMachine: true,
        },
      });

      return;
    }

    res.status(200).json({
      status: "success",
      data: {
        blockedByStateMachine: false,
      },
    });
  });
