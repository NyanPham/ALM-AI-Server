const fs = require("fs");

const { isUnexpected } = require("@azure-rest/ai-translation-text");
const translatorClient = require("../translatorConnect");
const catchAsync = require("../utils/catchAsync");
const { useMachineState, checkBusy, checkMachineState } = require("../utils/machineStateFactory");
const [_, isServiceBusy, userOccupyService, getCurrentServiceUserId] = useMachineState();

const languagesPath = "./data/languages.json";
const languagesJSON = fs.readFileSync(languagesPath, "utf8");
const languagesData = JSON.parse(languagesJSON);

exports.checkBusy = checkBusy(isServiceBusy, getCurrentServiceUserId, "Translator");
exports.checkMachineState = checkMachineState(isServiceBusy, userOccupyService);

exports.translate = catchAsync(async (req, res, next) => {
  const { text, to, from } = req.body;

  if (text == null || text === "") {
    return res.status(400).json({
      status: "fail",
      message: "Text to translate cannot be epty!",
    });
  }

  if (to == null || from == null) {
    return res.status(400).json({
      status: "fail",
      message: "Require codes of the source and target languages!",
    });
  }

  try {
    const translateResponse = await translatorClient.path("/translate").post({
      body: [{ text }],
      queryParameters: {
        to,
        from,
      },
    });

    if (isUnexpected(translateResponse)) {
      next(translateResponse.body.error);
    }

    const translations = translateResponse.body;

    res.status(200).json({
      status: "success",
      data: translations,
    });
  } catch (err) {
    next(err);
  }
});

exports.fetchLanguages = catchAsync(async (req, res, next) => {
  try {
    res.status(200).json({
      status: "success",
      data: languagesData,
    });
  } catch (err) {
    next(err);
  }
});
