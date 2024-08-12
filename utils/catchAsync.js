const catchAsync = (asyncFunc) => (req, res, next) => {
    asyncFunc(req, res, next).catch(next)
}

module.exports = catchAsync
