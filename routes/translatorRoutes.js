const express = require("express");

const translatorController = require("../controllers/translatorController");
const authController = require("../controllers/authController");

const router = express.Router();
router.route("/translate").post(authController.getClientID, translatorController.checkMachineState, translatorController.translate);
router.route("/checkBusy").post(authController.getClientID, translatorController.checkBusy);
router.route("/languages").get(translatorController.fetchLanguages);

module.exports = router;
