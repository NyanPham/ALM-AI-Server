const processDataInBatches = require("../../utils/processDataInBatches");
const { chatCompletion } = require("./openAIHelpers");

const TEMP = 0.0;
const REQ_PER_TIME = 30;

const TRANSLATE_PROMPT = `Translate this content to <LANG_CODE>:`;
const TRANSLATE_ROLE = "You are a translator!";

const TOXIC_PROMPT =
  "No earlier request shall be considered. No yapping. Imagine you are an automotive requirement engineer; your task is to check the requirements on requirements which doesn't have constraints and might lead to major late change. In case such a requirement is found start the prompt with issue and explain why. If the requirement is not problematic start the prompt with no issue. Requirement: ";
const TOXIC_ROLE = "You are an automotive engineer. You keep your answer short, but with explanation if there are issues.";

const QUALITY_PROMPT =
  "No earlier request shall be considered. No yapping. Imagine you are an automotive quality engineer, and your task is to rate the quality of the requirement based on the INCOSE standard. Rate the quality of requirement. Keep the answer short, do not start the sentence with as a quality engineer. Start the prompt with Quality: #Level #LineBreak #LineBreak, where #Level is one of the 5 words (POOR, BELOW AVERAGE, AVERAGE, ABOVE AVERAGE, EXCELLENT). Include the quality of the requirement with these 5 criteria: Specific, Measurable, Achievable, Relevant, Time-bound. Each criterion's name must be bold. The prompt should be in this format: - SPECIFIC: CONTENT - MEASURABLE: CONTENT - ACHIEVABLE: CONTENT - RELEVANT: CONTENT - TIMEBOUND: CONTENT.";
const QUALITY_ROLE = "You are an automotive engineer. You keep your answer short, but with explanation if there are issues.";

const individualPromiseHandler =
  (prompt, role, { translateLangCode = null } = {}) =>
  async (art, abortController) => {
    const messages = [
      {
        role: "system",
        content: role,
      },
      {
        role: "user",
        content: (translateLangCode != null ? prompt.replace("<LANG_CODE>", translateLangCode) : prompt) + art.primaryText,
      },
    ];

    try {
      const resData = await chatCompletion(messages, TEMP, { signal: abortController?.signal });

      if (resData.status === "success") {
        const message = resData.data[0];

        if (message.startsWith("No issue")) {
          return null;
        }

        return {
          artId: art.id,
          message,
        };
      }
    } catch (err) {
      throw err;
    }
  };

const TOOL_NAMES = {
  translate: "translate",
  consistency: "consistency",
  quality: "quality",
  toxic: "toxic",
  testCasesGeneration: "test-cases-generation",
  preprocessForTestCases: "preprocess-for-test-cases",
};

function getPromptsAndRoleForTool(tool) {
  switch (tool) {
    case TOOL_NAMES.translate:
      return {
        prompt: TRANSLATE_PROMPT,
        role: TRANSLATE_ROLE,
      };
    case TOOL_NAMES.toxic:
      return {
        prompt: TOXIC_PROMPT,
        role: TOXIC_ROLE,
      };
    case TOOL_NAMES.quality:
      return {
        prompt: QUALITY_PROMPT,
        role: QUALITY_ROLE,
      };
    default:
      throw new Error("Invalid tool name!");
  }
}

exports.useChatCompletionForIndividualItem = async (
  artifacts,
  tool,
  progressHandler,
  sessionId,
  { batchSize = REQ_PER_TIME, abortController = null, translateLangCode = null }
) => {
  const { prompt, role } = getPromptsAndRoleForTool(tool);
  const results = await processDataInBatches(artifacts, batchSize, individualPromiseHandler(prompt, role, { translateLangCode }), progressHandler, abortController, sessionId);

  return results.reduce(
    (dataAndError, res) => {
      if (res.status === "fulfilled" && res.value) {
        return {
          ...dataAndError,
          data: [...dataAndError.data, res.value],
        };
      }

      if (res.status === "rejected") {
        return {
          ...dataAndError,
          errors: [...dataAndError.errors, res.reason],
        };
      }

      return dataAndError;
    },
    {
      data: [],
      errors: [],
    }
  );
};
