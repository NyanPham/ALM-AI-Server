const catchAsync = require("./catchAsync");
const aiServiceQueue = require("../services/serviceQueue");
const { updateSession, createSession, deleteSession, STATUS } = require("../data/sessions/sessionOperators");
const AppError = require("./appError");

const MACHINE_STATES = {
  IDLE: "idle",
  BUSY: "busy",
};

const RESET_MACHINE_STATE_DELAY = 5000;

exports.useMachineState = () => {
  const machineState = {
    state: MACHINE_STATES.IDLE,
    currentClientId: null,
    idleTimer: null,
    session: null,
  };

  const resetMachineState = async () => {
    if (machineState.currentClientId === machineState.session.clientId) {
      await updateSession(machineState.session.id, { status: STATUS.SUCCESS });
    }

    machineState.state = MACHINE_STATES.IDLE;
    machineState.idleTimer = null;
    machineState.currentClientId = null;
    machineState.session = null;
  };

  const occupyMachine = async (clientId, tool, resetTime = RESET_MACHINE_STATE_DELAY) => {
    if (machineState.session == null) {
      machineState.session = await createSession({
        clientId,
        status: STATUS.PENDING,
        tool,
      });
    } else if (machineState.currentClientId === clientId && tool && tool !== machineState.session.tool) {
      await updateSession(machineState.session.id, { status: STATUS.SUCCESS });
      machineState.session = await createSession({
        clientId,
        status: STATUS.PENDING,
        tool,
      });
    } else if (machineState.currentClientId != clientId && machineState.session.status === STATUS.PENDING) {
      await deleteSession(machineState.session.id);
      machineState.session = null;
    }

    machineState.currentClientId = clientId;
    machineState.state = MACHINE_STATES.BUSY;
    if (machineState.idleTimer) {
      clearTimeout(machineState.idleTimer);
    }

    machineState.idleTimer = setTimeout(resetMachineState, resetTime);
  };

  const isMachineBusy = (clientId) => {
    return machineState.state === MACHINE_STATES.BUSY && machineState.currentClientId !== clientId;
  };

  const getCurrentClientId = () => {
    return machineState.currentClientId;
  };

  return [machineState, isMachineBusy, occupyMachine, getCurrentClientId];
};

exports.checkBusy = (isMachineBusy, getCurrentClientId, serviceName) =>
  catchAsync(async (req, res, next) => {
    const { clientId } = req.client;

    if (clientId == null) {
      next(new AppError("Random Client Id is required!", 400));
    }

    if (isMachineBusy(clientId)) {
      // await createSession({
      //   clientId,
      //   status: STATUS.DENIED,
      // });

      // addRequestToQueue({
      //   clientId,
      //   sessionId: session.id,
      // })

      res.status(200).json({
        status: "success",
        message: `<p>The server with ${serviceName} is busy. <br/>Do you want to add your request to queue?</p>`,
        data: {
          blockedByStateMachine: true,
          currentClientId: getCurrentClientId(),
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

exports.checkMachineState = (isMachineBusy, occupyMachine) =>
  catchAsync(async (req, res, next) => {
    const { clientId } = req.client;
    const { tool } = req.body;

    if (clientId == null) {
      next(new AppError("Random Client ID is required!", 400));
    }

    if (isMachineBusy(clientId)) {
      next(new AppError("The server is busy. Please try again later!", 429));
      return;
    }

    await occupyMachine(clientId, tool);

    next();
  });
