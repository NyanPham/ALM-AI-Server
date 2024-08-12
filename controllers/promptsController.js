const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

const { getPrompts, updatePrompt } = require("../data/prompts/promptsOperators")

exports.getPrompts = catchAsync(async (req, res, next) => {
    const prompts = await getPrompts()

    res.status(200).json({
        status: "success",
        data: prompts,
    })
});

exports.updatePrompt = catchAsync(async (req, res, next) => {
    const { params: { promptName }, body: { newValue } } = req
    
    if (promptName == null || newValue == null) {
        next(new AppError("Need prompt name and value to update", 400))
    }

    const updatedPrompt = await updatePrompt({ promptName, newValue })

    res.status(200).json({
        status: "success",
        data: updatedPrompt
    })
});