const moment = require("moment/moment");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const { getSessions, getSession, updateSession, deleteSession, createSession, STATUS } = require("../data/sessions/sessionOperators");

exports.getSessions = catchAsync(async (req, res, next) => {
  const { query } = req;
  const sessions = await getSessions(query);

  res.status(200).json({
    status: "success",
    results: sessions.length,
    data: sessions,
  });
});

exports.getSession = catchAsync(async (req, res, next) => {
  const { params } = req;

  const session = await getSession(params.sessionId);

  res.status(200).json({
    status: "success",
    data: session,
  });
});

exports.getSessionsCount = catchAsync(async (req, res, next) => {
  const { query } = req;
  const sessions = await getSessions(query);

  const toolsCount = sessions.reduce((counts, session) => {
    const { tool, finishedAt, status } = session;
    if (finishedAt == null || status !== STATUS.SUCCESS) {
      return counts;
    }

    return {
      ...counts,
      [tool]: (counts[tool] || 0) + 1,
    };
  }, {});

  res.status(200).json({
    status: "success",
    data: toolsCount,
  });
});

exports.createSession = catchAsync(async (req, res, next) => {
  const {
    body: { clientId, tool, status, origin },
  } = req;

  if (clientId == null) {
    next(new AppError("UserID is required", 403));
  }

  const newSession = await createSession({ clientId, tool, status, origin });

  res.status(201).json({
    status: "success",
    data: newSession,
  });
});

exports.updateSession = catchAsync(async (req, res, next) => {
  const { params, body } = req;

  const updatedSession = await updateSession(params.sessionId, body);

  res.status(200).json({
    status: "success",
    data: updatedSession,
  });
});

exports.deleteSession = catchAsync(async (req, res, next) => {
  const { params } = req;

  await deleteSession(params.sessionId);

  res.status(204).json({
    status: "success",
    data: null,
  });
});

exports.getSessionsByWeekInYear = catchAsync(async (req, res, next) => {
  const {
    query,
    params: { year },
  } = req;

  if (year == null) {
    next(new AppError("Please provide a valid year!", 400));
  }

  const sessions = await getSessions(query);

  const groupedByWeek = sessions.reduce((grouped, session) => {
    const sessionYear = moment(session.createdAt).year();

    if (Number(sessionYear) === Number(year)) {
      const week = moment(session.createdAt).week();
      if (!grouped[week]) {
        grouped[week] = [];
      }
      grouped[week].push(session);
    }

    return grouped;
  }, {});

  res.status(200).json({
    status: "success",
    data: groupedByWeek,
  });
});

exports.getSessionsByYearAndWeek = catchAsync(async (req, res, next) => {
  const { query } = req;
  const sessions = await getSessions(query);

  const groupedByYearAndWeek = sessions.reduce((grouped, session) => {
    const year = moment(session.createdAt).year();
    const week = moment(session.createdAt).week();

    if (!grouped[year]) {
      grouped[year] = {};
    }

    if (!grouped[year][week]) {
      grouped[year][week] = [];
    }

    grouped[year][week].push(session);

    return grouped;
  }, {});

  res.status(200).json({
    status: "success",
    data: groupedByYearAndWeek,
  });
});
