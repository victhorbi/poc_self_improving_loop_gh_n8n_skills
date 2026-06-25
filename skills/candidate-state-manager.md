# Skill: Candidate State Manager (The "Brain")

## 00 One-line summary
Maintains and refines a dynamic, persistent list of valid candidates based on every user response.

## 01 When To Use The Skill
Every time the user provides an answer to a question (e.g., "Yes," "No," "Don't know," "Probably"). This skill is the fundamental heartbeat of the game and must execute immediately after every user input to keep the game's logic accurate.

## 02 How Your Agent Does It

1. Review the user's most recent answer against the last question asked.
2. Reference the current `Active_Candidate_List` (stored in the system memory).
3. Cross-reference the answer with the trait database: remove all characters who do not possess the trait confirmed by the user, or who possess a trait explicitly denied.
4. Update the `Active_Candidate_List` count.
5. Pass the updated list size to the *Confidence Threshold Check* or *Entropy Calculator*.

## 03 Output Structure
An internal status update (often hidden from the user) in the following format:

- **Current count:** [Number of candidates]
- **Top 3 potential matches:** [Name A, Name B, Name C]
- **Next Action:** [Call Entropy Calculator OR Call Confidence Threshold Check]

## 04 Real World Example/s
User says "Yes" to "Is your character from a video game?".

*Agent logic:* Filter all non-video game characters out of the list. If 500 characters remain, it identifies that a significant chunk of the database is gone and hands over to the *Entropy Calculator* to ask about a specific game genre.

## 05 What To Avoid

- Do not delete a candidate if the user answers "Don't know" or "Probably."
- Never show the full list of candidates to the user.
- Do not hallucinate traits for characters; rely only on verified data.
