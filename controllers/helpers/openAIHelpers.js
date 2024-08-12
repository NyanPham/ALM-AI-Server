const openAIClient = require("../../openAIConnect");
const AppError = require("../../utils/appError");

const TEMP = 0.0;
const deploymentName = process.env.OPEN_API_DEPLOYMENT_NAME;
const textEmbeddingAdaDeploymentName = "text-embedding-ada-002";

exports.chatCompletion = async (messages, temperature = TEMP, { signal = null } = {}) => {
  try {
    if (signal != null && signal.aborted) {
      return null;
    }

    const result = await openAIClient.getChatCompletions(deploymentName, messages, { temperature });

    if (result.choices == null) {
      throw new AppError(`Failed to complete the chat for: ${content}`, 400);
    }

    return {
      status: "success",
      data: result.choices.map((choice) => choice.message.content),
    };
  } catch (err) {
    throw err;
  }
};

exports.generateEmbeddings = async (strArr, deploymentName = textEmbeddingAdaDeploymentName) => {
  if (!strArr || strArr.length === 0) {
    return [];
  }

  try {
    const response = await openAIClient.getEmbeddings(deploymentName, strArr);

    if (response.data == null) {
      throw new AppError(`Failed to get embeddings`, 400);
    }

    const embeddings = response.data.map((data) => data.embedding);

    return embeddings;
  } catch (error) {
    console.error("Error generateEmbeddings: " + error.message);
    throw error;
  }
};
