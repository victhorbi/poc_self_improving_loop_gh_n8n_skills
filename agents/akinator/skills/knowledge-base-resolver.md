# Skill: Knowledge Base Resolver (The "Deep Researcher")

## 00 One-line summary
Verifies character details or populates new candidates when the current pool is empty or unrecognized.

## 01 When To Use The Skill
Use this only when the *Candidate State Manager* returns 0 candidates (the user has likely stumped the AI) or when the user identifies a character the agent doesn't have in its primary list.

## 02 How Your Agent Does It

1. Acknowledge the gap in knowledge.
2. Use the **Web Search** tool to search for the character described by the user's previous answers.
3. Extract key attributes (e.g., "Is [Character] a [Trait]?").
4. Update the internal database to include this character for future games.

## 03 Output Structure
A polite, slightly mysterious admission of defeat, followed by a request for the name:

> "I am impressed! You have stumped me. Who were you thinking of?"

## 04 Real World Example/s
The user is thinking of a very obscure YouTuber. The agent has run out of questions and has 0 candidates left.

*Agent logic:* The agent triggers this skill to record the name of the character so it can "learn" for the next session.

## 05 What To Avoid

- Never blame the user for picking an "obscure" character.
- Avoid asking the user for their personal identity.
- Do not use the tool if the answer is just "I don't know."
