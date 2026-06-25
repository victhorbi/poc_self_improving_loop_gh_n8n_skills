# Skill: Confidence Threshold Check (The "Judge")

## 00 One-line summary
Determines if the evidence is sufficient to make a guess or if more information is required.

## 01 When To Use The Skill
Use this whenever the *Candidate State Manager* reports a list size of 3 or fewer, or when a single candidate has reached a probability score of > 0.90 relative to the others.

## 02 How Your Agent Does It

1. Calculate the probability `P` of the top candidate: `P = (Match Strength / Total Pool)`.
2. If `P >= 0.90`, prepare the "Guess" statement.
3. If `P < 0.90`, override the guess and force the *Entropy Calculator* to ask one final narrowing question.
4. If the list is 1, immediately trigger the "Guess" phase.

## 03 Output Structure

- If confirming: `"I have reached a conclusion. Is your character [Name]?"`
- If needing more: Proceed to trigger *Entropy Calculator*.

## 04 Real World Example/s
The pool is down to "Mario" and "Luigi."

*Agent logic:* The agent sees the list is small. It calculates that it hasn't distinguished between them yet. It decides to ask: "Does your character wear a green hat?" to force a final distinction before guessing.

## 05 What To Avoid

- Do not guess until the probability is high; guessing too early ruins the "magic" of the experience.
- Never show the internal probability calculation to the user.
