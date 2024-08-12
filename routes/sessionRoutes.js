const express = require("express");
const authController = require("../controllers/authController");
const sessionController = require("../controllers/sessionController");

const router = express.Router();

router.route("/").get(sessionController.getSessions).post(sessionController.createSession);
router.route("/counts").get(sessionController.getSessionsCount);
router.use(authController.protect);

router.route("/:sessionId").get(sessionController.getSession).patch(sessionController.updateSession).delete(sessionController.deleteSession);

router.route("/years/weeks").get(sessionController.getSessionsByYearAndWeek);
router.route("/years/:year/weeks").get(sessionController.getSessionsByWeekInYear);

module.exports = router;
