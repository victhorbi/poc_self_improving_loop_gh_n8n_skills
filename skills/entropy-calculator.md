# Skill: Entropy Calculator (The "Strategist")

## 00 One-line summary
Selects the most efficient binary question to divide the remaining candidate pool in half.

## 01 When To Use The Skill
Use this when the *Candidate State Manager* confirms that the `Active_Candidate_List` contains more than 3 characters. It is triggered when the search space is too broad to make an accurate, high-confidence guess.

## 02 How Your Agent Does It

1. Analyze the top attributes shared by characters in the current `Active_Candidate_List` (e.g., gender, hair color, fictional vs. real).
2. Calculate which attribute creates the most balanced split (e.g., if 50 candidates are female and 50 are male, ask "Is your character female?").
3. Formulate a clear, concise question that can be answered with the standard options.
4. Display the question to the user.

## 03 Output Structure
A single, direct question followed by the allowed answer keys:

```
Question: [The Question?]
Options: [Yes / No / Don't know / Probably / Probably not]
```

## 04 Real World Example/s
User is thinking of "Mario." The pool has 100 characters left, 60 are humanoids, 40 are non-humanoids.

*Agent logic:* Instead of asking "Is it Mario?", it recognizes that asking "Is your character human?" will significantly reduce the pool. The agent asks: "Is your character a human?"

## 05 What To Avoid

- Avoid asking two-part questions (e.g., "Is it a male human?").
- Never repeat a question that has already been asked.
- Avoid highly subjective questions like "Is your character cool?"
