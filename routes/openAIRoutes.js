const express = require("express");

const openAIController = require("../controllers/openAIController");
const authController = require("../controllers/authController");

const router = express.Router();

router.route("/chatCompletion").post(authController.getClientID, openAIController.preprocessForTestCases, openAIController.chatCompletion);
router.route("/chatCompletion/queue").get(openAIController.getQueue).delete(authController.getClientID, openAIController.deleteQueueItem);
router.route("/chatCompletion/results").post(authController.getClientID, openAIController.getCompleteResults).delete(authController.getClientID, openAIController.deleteResult);

router.route("/checkBusy").post(authController.getClientID, openAIController.checkBusy);

router.route("/dev").post(openAIController.devChatCompletion);
router.route("/devEmbedding").post(openAIController.devEmbedding);

module.exports = router;
