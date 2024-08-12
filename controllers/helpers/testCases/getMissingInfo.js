const { chatCompletion } = require("../openAIHelpers");

const FINAL_MISSING_INFO_MARKER = "**Final Information Missing**";

const missing_info_prompt = `
You are provided with a **New Requirement** and multiple examples of **Existing Test** for an Electronic Control Unit. Please follow the next steps one by one:
1. In this document there are 2 types of requirements. Some that describe software/system behaviors that should be tested and some that are documentation or chapter titles and which don't require tests.
Does **New Requirement** describe an aspect that we can write a test for? If not, then skip all the next steps and write "NO TESTS POSSIBLE".
2. Examine the examples of **Existing Test** to understand their structure.
3. Look at the **New Requirement** and write a list of list of items **Information Missing** with what information is required to write a test similar to the **Existing Tests**. Make the list minimal, only with the essentials needed. Put different signals/functions on different lines. Have very short answers per item as they will be used as queries in similarity search. Example:
**Information Missing**
- Definition Signal A
- Example of Signal B
- Constraint of Function C

4. Have a look at items from **Information Missing**. If these keywords are not mentioned in the **New Requirement** remove them. Write a second list **Filtered Information Missing** with the remaining items.
5. Look again at the **New Requirement** and the items in **Filtered Information Missing** and sort the items by how critical are critical are they to solve the test, with the most important first.
Write ${FINAL_MISSING_INFO_MARKER} with the resulting list.

**New Requirement**
##REQUIREMENT##

**Existing Test 1**
"**__Test steps:__**
1\. Set signal SEVState = Active (4)
2\. Set all outputs ON
3\. SWT inject on Comfort consumer (PHUD_MI) to overwrite the voltage to
simulate a Stuck-at-ON fault:
\- Set variable SWT_F _**[xyz]**_ _Voltage_Value = 8000 (8V)
\- Set variable SWT_F _**[xyz]**_ _Overwrite_Voltage = 1
\- Set variable SWT_F _**[xyz]**_ _Current_Value = 1000 (1A)
\- Set variable SWT_F _**[xyz]**_ _Overwrite_Current = 1
4\. Set Supply = 8V
5\. Wait 65 sec
  
** __Expected result:__**
2\. Check variable: Rte_OutDiagMgr_P_eVSVSEVState_eVSVSEVState = 1 (Active)
\- Rte_OutDiagMgr_P_Status_Latent_eVSV_StatusLatenteVSVv = 0 (no_error)
5\. Rte_OutDiagMgr_P_Status_Latent_eVSV_StatusLatenteVSVv = 6 (stuck_at_close)
\- Rte_OutDiagMgr_P_Latent_Branch_ID_eVSV_LatentBranchIDeVSVv = [eFuseID of
tested output + 100 offset]

"**Test steps:**
  1. Get OV threshold of the related eFuse channel logical ID from Receiver port R_nvram_immediate_SnapS_CDC_SnapShot_DebounceTime_OVThreshold
  2. Get the value of the configured UV threshold of the related eFuse channel logical ID from Receiver port R_nvram_immediate_SnapS_CDC_SnapShot_DebounceTime_UVThreshold
  3. Get current voltage via port P_PowerSupply_Simple - make sure current voltage is > OV.
  4. Wait for internal timer to expire.
  
**Expected result:**
1-3. Actual values correctly received, values is > OV -> internal debounce
timer (R_nvram_immediate_SnapS_CDC_SnapShot_DebounceTime_OVThreshold) started
4\. Timer expired -> the StatisticsECU SWC call the trigger for Voltage
snapshot via the Client Port CallTrigger(CallID=x) to force creation of the
snapshot assigned to this CallID in the Voltage Snapshot Template
configuration
**Notes:**
Requirement not implemented. Further details will be provided later."


**Existing Test 2**
"Test steps:
  
1.Check the Physical Command is ON
((Rte_OutDiagMgr_P_eFuse_Struct_Physical_Cmd_eFuse_physical_cmd).F015_ID) =
2(ON) for the output under test
  
2.Modify the Current feedback from vars:
○ WT_F015_Current_Value (mA)
○ SWT_F015_Overwrite_Current (flag) = 1
  
3.DAQidea: Check the time difference between (modify feedback
(SWT_F015_Overwrite_Current ) and physical command
((Rte_OutDiagMgr_P_eFuse_Struct_Physical_Cmd_eFuse_physical_cmd).F015_ID) =
1(OFF) )
  
○ Note: If the output is not disconnecting in X time(max value I2T) disable
all outputs
○ For first point measurement if the output doesnt have max time we wait 200s
○ For other measurement points if the output doesnt have max time we wait min
I2T time + 10s
  
All this stepts will be runned for all 5 points I2T verification"


**Existing Test 3**
"*Normal voltage=12V
*Channel inactive
  
** __Test steps:__**
1) Activate channel
2) Check 1]
3) Wait 50sec
4) Check 1]
5) Set power supply to 6.7V
6) Check 1]
7) Wait 50sec
8) Check 1]
9) Set power supply to 15.5V
10) Check 1]
11) Wait 50sec
12) Check 1]
13) Set power supply to 17.8V
14) Check 1]
15) Wait 50sec
16) Check 1]
  
** __Expected result:__**
1]
*Rte_Ain_S_F061_FEEDBACK_AN_IN_Voltage~= power supply voltage value set
*Rte_OutDiagMgr_P_eFuse_Struct_Physical_Cmd_eFuse_physical_cmd.F061 = SAFEIO_S_SL_ON(2)"
`;

const tokenize = (text) => {
  // Tokenize the input text (split into words)
  return text.toLowerCase().split(/\W+/).filter(Boolean);
};

const createVector = (tokens, allTokens) => {
  // Create a vector representation for the given tokens
  const vector = new Array(allTokens.length).fill(0);
  for (const token of tokens) {
    const index = allTokens.indexOf(token);
    if (index !== -1) {
      vector[index]++;
    }
  }
  return vector;
};

exports.getMissingInfoInReq = async (reqContent) => {
  const messages = [
    {
      role: "system",
      content: "You are an assistant helping System Test Engineers",
    },
    {
      role: "user",
      content: missing_info_prompt.replace("##REQUIREMENT##", reqContent),
    },
  ];

  const res = await chatCompletion(messages);
  const content = res.data[0];

  const keywords = content
    .split(FINAL_MISSING_INFO_MARKER)[1]
    .split("\n")
    .reduce((list, line) => {
      if (!line.startsWith("- ")) return list;

      return [...list, line.slice(2).trim()];
    }, []);

  return [keywords, messages[1].content];
};

exports.cosineSimilarity = (strings1, strings2) => {
  const allTokens = Array.from(new Set([...strings1, ...strings2].flatMap(tokenize)));
  const vector1 = createVector(strings1.flatMap(tokenize), allTokens);
  const vector2 = createVector(strings2.flatMap(tokenize), allTokens);

  let dotProduct = 0;
  let normVec1 = 0;
  let normVec2 = 0;

  for (let i = 0; i < allTokens.length; i++) {
    dotProduct += vector1[i] * vector2[i];
    normVec1 += vector1[i] * vector1[i];
    normVec2 += vector2[i] * vector2[i];
  }

  const similarity = dotProduct / (Math.sqrt(normVec1) * Math.sqrt(normVec2));
  return similarity;
};
