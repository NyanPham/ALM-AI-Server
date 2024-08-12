const { chatCompletion } = require("../openAIHelpers");

const TEST_CASE_FIELD = {
  number: "TEST_NUMBER",
  title: "TEST_TITLE",
  description: "TEST_DESC",
  designSet: "SET",
  designCheck: "CHECK",
};

const GEN_TEST_CASES_PROMPT = `
I found these requirements with information related to **Information Missing**.

##ADDITIONAL_REQUIREMENTS##

Take a deep breadth and follow the next steps 1 by one:
  1. Reason on how are **Boundary Value Analysis** and **Equivalence Class Partitioning** applied in existing tests 
  Look above at the pairs of Requirements and Tests. Reason and write your thoughts about how they use the testing techniques **Boundary Value Analysis** and **Equivalence Class Partitioning** to write the tests.

  2. Identifying the precondition.
  Look at again at the **New Requirement**. For clarity it's written again below.
  Testing Requirements have 2 parts: Preconditions and Actions. Preconditions define the scenarios/cases and Actions define what should happen when the preconditions are true.

**New Requirement**
##REQUIREMENT##

  3. Identifying the parameter ranges of values.
  For each Signals and Parameter mentioned at step 1, infer the parameter range of values.

  4. Identifying the defined execution paths.
  From the Precodition write in a list all the defined execution paths and for each one write in a list the logical conditions that enable it.
  We need to clarify which execution paths are Defined and which are not. If we have a ""IF .. THEN .."" without ELSE; then ELSE BRANCH is NOT defined.

  5. Select values for all parameters that satisfy the condition with a specific difference of 3 units. Here's how to do it:
  - If we have a logical condition that involves comparing two continuous parameters (A and B), pick values for one side of the logical condition and then calculate the values for the other side of the logical condition such that the other side is at an absolute distance of 3 units from the first one. 3 unites regardless of what the values measure: units or Amperes.
  Examples:
      - If the condition is A>B. Then we pick A=50 and we calculate B=A-3, thus B = 47.
      - If the condition is A<B and A has the range 60-80. Then we pick A=70, and we calculate B=A+3, thus B = 73.
      - If the condition is A-B>C and C is in percentages of A and C has the range 20%-40%. Then we pick C = 30%, pick A=100(Amperes) and we calculate B to be A-C/100*A-3(Amperes), so B = 67(Amperes).

  6. Test: Replace the values picked at step 4 in the logical conditions from step 2 and calculate them step-by-step.
  Do the logical conditions hold true?
  Note: arithmetical operations on values with Amperes work the same way as arithmetical operations on Integers. Examples:
    - 1A + 2A = 3A;
    - 9A / 3 - 1A = 2A;
    - 1A < 2A;
    - 2A == 2A;
    - 10% from 20A is 10/100*20A=2A;

  7. Test: Did all parameters from the logical conditions receive values? Yes or no.
  8. Test: Are the values for the logical conditions picked such that the absolute difference between the left side andthe right side of the logical condition is 3 units? Yes or no.
  9. Test: Are the values within the ranges of values identified at step 2? Yes or no.

  10. Formatting the tests.
  For each test written at step 4, rewrite it using the following format in a paragraph called **Generated Tests**.
  Make sure thhe test cases are in the format below as JSON.
  In the ""CHECK"" part try to reuse words from the requirement but replace the variables with the values defined.

  **Generated Tests**
  [{  ""TEST_NUMBER"": 1,
      ""SET"": [""Signal_A=100A"", ""Signal_B=20A"", ""Parameter_C=2""],
      ""CHECK"": [""Variable_D is increased with X"", ""Signal_E is set to 3""],
      ""TEST_TITLE"": Title here,
      ""TEST_DESC"": Description here
  },{ ""TEST_NUMBER"": 2,
      ...
  }, ...
  ]
`;

const extractTestCasesTextToObjects = (str) => {
  if (str == null) return null;

  const startAt = str.indexOf("[");
  const endAt = str.lastIndexOf("]");

  const jsonStr = str.slice(startAt, endAt + 1);
  const json = JSON.parse(jsonStr);

  const testCases = json.map((d) => {
    return {
      number: d[TEST_CASE_FIELD.number],
      title: d[TEST_CASE_FIELD.title],
      description: d[TEST_CASE_FIELD.description],
      testCaseDesign: {
        set: d[TEST_CASE_FIELD.designSet],
        check: d[TEST_CASE_FIELD.designCheck],
      },
    };
  });

  return testCases;
};

exports.genTestCases = async (reqData, additionalReqIds, artifactLookupById) => {
  const additionalReqsText = additionalReqIds
    .map((reqId) => {
      const req = artifactLookupById[reqId];
      return `**Existing Requirement ${req.id}:**\n${req.primaryText}`;
    })
    .join("\n\n");

  const messages = [
    {
      role: "system",
      content: "You are an assistant helping System Test Engineers",
    },
    {
      role: "user",
      content: GEN_TEST_CASES_PROMPT.replace("##ADDITIONAL_REQUIREMENTS##", additionalReqsText).replace("##REQUIREMENT##", reqData.primaryText),
    },
  ];

  const delimiters = ["Generated Tests", "Generated Tests\\:", "\\*\\*Generated Tests\\*\\*"];

  try {
    const res = await chatCompletion(messages);
    const content = res.data[0];
    const testCasesText = content.split(new RegExp(delimiters.join("|")))[1];

    if (testCasesText == null) return [null, additionalReqsText, messages[1].content];

    return [extractTestCasesTextToObjects(testCasesText), additionalReqsText, messages[1].content];
  } catch (err) {
    console.log("Error: ", err);
    throw err;
  }
};
