const processDataInBatches = require("../../utils/processDataInBatches");
const { chatCompletion } = require("./openAIHelpers");

const TEMP = 0.0;
const OPEN_AI_MAX_TOKENS = 8000;

const CONSISTENCY_PROMPT = `Do not consider any questions raised before. Check the next to statements if they work together. Instructions: - Compare the main requirement (the first one) against each of the other requirement (after the hyphen). Each comparison is called a pair. For example, the main requirement A, next to requirements: B, C, D, we will have 3 pairs A - B, A - C and A - D. - If there are contradictions in a pair, start the reply with issue in the format "Issues (#MainRequirementID - #NextToRequirementID): Issue between #MainRequirementID and #NextToRequirementID because (explanation here).". - If there are no contradictions in a pair, reply exactly in the format "No Issues (#MainRequirementID - #NextToRequirementID)". - If units of measurement are different convert the values and check the initial values against each other. For example, if the requirement is describing an illumination requirement, it\'s not an issue as long as the logic of the values work, for example if the turn off values are lower than the turn on values.`;
const ROLE = "Imagine you are an automotive requirements engineer. You compare the first statement to each other following statement and check for contradiction.";

const parsePairsWithIssuesOnly = (string) => {
  let regex = /^Issues \((\d+ - \d+)\): ([\s\S]*?)(?=^Issues \(\d+ - \d+\): |$)/gm;
  let match;
  let result = [];

  while ((match = regex.exec(string)) !== null) {
    result.push({
      pairIds: match[1].split(" - ").map(Number),
      message: match[2].trim(),
    });
  }

  return result;
};

const executeCheckConsistency = async ({ visitedMap, checkQueue, abortController }) => {
  const REQ_PER_TIME = 30;

  const issues = [];
  const issuesData = [];
  const errors = [];

  const promiseHandler = async ({ current, others, otherIds, currentId }, abortController) => {
    const visitedKey = `${currentId}: ${otherIds.join(",")}`;
    if (visitedMap.has(visitedKey)) {
      return null;
    }

    visitedMap.set(visitedKey, true);

    const messages = [
      {
        role: "system",
        content: ROLE,
      },
      {
        role: "user",
        content: CONSISTENCY_PROMPT + `${current}\n${others}`,
      },
    ];

    try {
      const resData = await chatCompletion(messages, TEMP, { signal: abortController?.signal });

      if (resData.status === "success") {
        const message = resData.data[0];

        if (resData.error) {
          return null;
        }

        return {
          issue: `<strong>(${currentId} - ${otherIds.join(", ")})</strong> - ${message}`,
          issueData: {
            artId: currentId,
            otherIds: otherIds,
            message,
          },
        };
      }
    } catch (err) {
      throw err;
    }
  };

  const responses = await processDataInBatches(checkQueue, REQ_PER_TIME, promiseHandler, null, abortController);

  responses.forEach((res) => {
    if (res.status === "fulfilled" && res.value != null) {
      const { issue, issueData } = res.value;
      issues.push(issue);
      issuesData.push(issueData);
    }
    if (res.status === "rejected") {
      errors.push(res.reason);
    }
  });

  return {
    issues,
    issuesData,
    errors,
  };
};

const buildQueueAndCheckConsistency = async ({ requirements, maxCharsPerReq, visitedMap, abortController }) => {
  let checkQueue = [];

  const REQ_PER_TIME = 30;
  const artsCount = requirements.length;

  const queueIssues = [];
  const queueIssuesData = [];
  const queueErrors = [];

  const innerCheckConsistency = async () => {
    try {
      const { issues, issuesData, errors } = await executeCheckConsistency({
        visitedMap,
        checkQueue,
        abortController,
      });

      checkQueue = [];
      queueIssues.push(...issues);
      queueIssuesData.push(...issuesData);
      queueErrors.push(...errors);
    } catch (err) {
      throw err;
    }
  };

  for (let i = 0; i < artsCount; i++) {
    const currentArt = requirements[i];
    const remainingArts = requirements.slice(i + 1);

    const currentStatementText = `Main: ${currentArt.id}: ${currentArt.primaryText.trim()}`;
    let charCount = CONSISTENCY_PROMPT.length + currentStatementText.length;
    let j = 0;
    let otherStatementTexts = "Others:\n";
    let otherIds = [];

    const remainingLength = remainingArts.length;

    while (j < remainingLength) {
      const otherArt = remainingArts[j];
      const nextStatementText = `${otherArt.id}: ${otherArt.primaryText.trim()}\n`;

      charCount += nextStatementText.length;

      if (charCount >= maxCharsPerReq) {
        checkQueue.push({ current: currentStatementText, currentId: currentArt.id, otherIds, others: otherStatementTexts });

        charCount = CONSISTENCY_PROMPT.length + currentStatementText.length;
        otherStatementTexts = "";
        otherIds = [];
        j -= 1;
      } else {
        otherIds.push(otherArt.id);
        otherStatementTexts += nextStatementText;
      }

      if (j == remainingLength - 1) {
        checkQueue.push({ current: currentStatementText, currentId: currentArt.id, otherIds, others: otherStatementTexts });
      }

      j += 1;
    }

    if (checkQueue.length >= REQ_PER_TIME) {
      await innerCheckConsistency();
    }

    if (abortController.signal.aborted) break;
  }

  if (!abortController.signal.aborted && checkQueue.length > 0) {
    await innerCheckConsistency();
  }

  return {
    issues: queueIssues,
    issuesData: queueIssuesData.map((issueData) => ({
      ...issueData,
      pairsWithIssues: parsePairsWithIssuesOnly(issueData.message),
    })),
    errors: queueErrors,
  };
};

exports.useChatCompletionForConsistency = async (similarTextGroups, progressHandler, sessionId, { abortController = null }) => {
  const groupsTotal = similarTextGroups.length;

  const visitedMap = new Map();
  const consistencyIssues = [];
  const consistencyIssuesData = [];
  const consistencyCheckErrors = [];

  for (let i = 0; i < groupsTotal; i++) {
    const { issues, issuesData, errors } = await buildQueueAndCheckConsistency({
      requirements: similarTextGroups[i],
      maxCharsPerReq: OPEN_AI_MAX_TOKENS,
      visitedMap,
      abortController,
    });

    consistencyIssues.push(...issues);
    consistencyIssuesData.push(...issuesData);
    consistencyCheckErrors.push(...errors);

    progressHandler({ currentIndex: i, totalIndices: groupsTotal, processId: sessionId });
  }

  return {
    data: {
      consistencyIssues,
      consistencyIssuesData,
    },
    errors: consistencyCheckErrors,
  };
};
