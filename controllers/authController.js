const jwt = require("jsonwebtoken");
const { promisify } = require("util");

const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

const USER_CODES = new Map([
  [
    process.env.USER_CODE_NEVRES,
    {
      name: "Nevres",
      role: "Stakeholder",
    },
  ],
  [
    process.env.USER_CODE_TRAM,
    {
      name: "Tram",
      role: "Developer",
    },
  ],
  [
    process.env.USER_CODE_NHAN,
    {
      name: "Nhan",
      role: "Developer",
    },
  ],
]);

const signToken = (userCode) => {
  const token = jwt.sign({ userCode }, process.env.JWT_AUTH_PRIVATE_KEY, { expiresIn: "1h" });

  return token;
};

exports.signIn = catchAsync(async (req, res, next) => {
  const { userCode } = req.body;

  if (userCode == null) {
    next(new AppError("Please provide your UserCode to login!", 403));
    return;
  }

  if (!USER_CODES.has(userCode)) {
    next(new AppError("Your UserCode is not recognized! Please contact the UserCode provider!", 403));
    return;
  }

  const token = signToken(userCode);

  const user = USER_CODES.get(userCode);

  res.status(200).json({
    status: "success",
    token,
    user,
  });
});

exports.protect = catchAsync(async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split("Bearer ")[1];
    }

    if (token == null) {
      next(new AppError("You have not logged in!", 403));
    }

    const decoded = await promisify(jwt.verify)(token, process.env.JWT_AUTH_PRIVATE_KEY);

    if (!decoded) {
      next(new AppError("Your token has expired. Please login again!", 403));
    }

    const user = USER_CODES.get(decoded.userCode);
    req.user = user;

    next();
  } catch (err) {
    next(err);
  }
});

exports.getClientID = catchAsync(async (req, res, next) => {
  if (req.body.client == null) {
    return next(new AppError("Failed to get client ID", 403));
  }

  req.client = req.body.client;
  next();
});
