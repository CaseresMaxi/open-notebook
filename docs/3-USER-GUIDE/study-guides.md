# Study Guides - A Personalized, Evidence-Based Study Plan

A study guide turns one or more sources (or a list of topics) into a study plan on your calendar. The AI splits the material into topics and writes study material for each one; the calendar itself is computed with fixed rules taken from learning research, so reviews land when they help most.

---

## Quick Start

```
1. Go to Study guides → New study guide (or open it from a notebook's study tools)
2. Pick the notebook and the sources to use (all are selected by default)
3. Optionally list topics to focus on, one per line
4. Choose your goal (understand, memorize, pass an exam, apply) and your level
5. Pick your study days, the time per session, and an exam date or a plan length
6. Click "Create study guide" (usually under two minutes)
7. Open the "Today" tab and work through the session
```

Without any source selected, the guide is written for the topics you list from the AI's general knowledge. It is marked as such: check it against reliable material.

---

## What You Get

| Tab | What it shows |
|-----|---------------|
| **Today** | Today's session: each activity with what to do, the questions to answer from memory (answers hidden until you ask), and a confidence rating for the topics you studied |
| **Plan** | Every session by week, with its status (done, partial, missed, today, upcoming); open a session to work on it |
| **Topics** | Each topic with key ideas, why/how questions, a self-explanation prompt, concrete examples, a visual to build, common mistakes, practice questions, flashcard mastery and your confidence |
| **Flashcards** | Spaced-repetition review of the cards that are due |
| **Method** | The techniques the plan uses, their evidence and references |

## Activities

| Activity | Technique |
|----------|-----------|
| Pretest | Try to answer before studying (pretesting) |
| Study the topic | Read actively, answering why/how questions (elaborative interrogation), with examples and a diagram (dual coding) |
| Explain it in your own words | Explain without notes, then compare with the key ideas (self-explanation) |
| Retrieval practice | Write what you remember, then answer questions from memory |
| Mixed practice | Questions from several topics mixed together (interleaving) |
| Flashcards | Spaced repetition with successive relearning |
| Mock exam | A cumulative practice exam; the button creates a [practice exam](practice-exams.md) focused on the guide's topics |

Rereading, highlighting and summarizing are deliberately left out: they were rated low utility by Dunlosky et al. (2013).

## How the Calendar Is Built

- Topics are learned in order, prerequisites first, in sessions that fit your time per session.
- Each topic is reviewed at expanding gaps (1, 3, 7, 14, 30… days). Rating a topic with low confidence brings its reviews closer; high confidence spreads them out.
- When several topics are due the same day, their questions are mixed.
- A mock exam closes the plan (the day before the exam, which is never a study day) and another one runs every week.
- If the time is too short for all topics, the guide warns you and some sessions run longer.

## Your Answers Stay in the App

Every question of the guide has its own answer box: pretest and practice questions, why/how questions, the self-explanation, free recall, your own example and the visual (attach a photo of your drawing or describe it). Flashcards accept an optional typed answer before you reveal the back.

- **Nothing is lost:** an answer you are typing is kept as a draft in the browser until you save it; saved answers are stored in the guide, and every attempt stays in its history (the pretest attempt, later reviews, flashcard answers), so you can see how you improved.
- **Check yourself:** for questions with a reference answer, saving reveals it and asks whether you were right, partly right or wrong.
- **AI analysis:** open answers (why/how, self-explanation, free recall, your own example, the visual) are analyzed by the AI right after saving, against the topic's key ideas: you get a score, a grade and feedback on what was right, missing or wrong, stored with the answer. Short answers and flashcards are analyzed only when you press **Analyze with AI**.
- You can delete an answer from its history.

## Flashcards

Cards appear once you have studied their topic (or its study day has passed). After revealing the answer, rate your recall:

| Rating | Next review |
|--------|-------------|
| Again | Comes back in this same review until you recall it |
| Hard | Shortly (about 1.2× the last gap) |
| Good | 1 day, then 3 days, then the last gap × the card's ease |
| Easy | Longer, and the card gets easier |

With an exam date, no card is scheduled after the exam: it is shown once more the day before.

## Missed Sessions and Changes

If you skip sessions, the guide shows a banner. **Reschedule** rebuilds the plan from today: completed work stays, topics you already learned only get their remaining reviews, and the rest is spread over the days left. You can also change the exam or end date, study days and time per session there.

## Confidence and Calibration

After a session you rate how well you could explain each topic without notes (1-5). The Topics tab compares this with your actual flashcard recall and tells you when you feel more (or less) sure than your recall shows.

## API

Everything is available through the REST API (`/api/study-guides`): create, list, get, delete, `POST /{id}/progress`, `PUT /{id}/topics/{topic_id}/confidence`, `POST /{id}/cards/{card_id}/review` and `POST /{id}/reschedule`, `POST /{id}/responses` (save an answer), `PATCH /{id}/responses/{response_id}` (self-check), `POST /{id}/responses/{response_id}/analyze` (AI feedback) and `DELETE /{id}/responses/{response_id}`. Pass the learner's local date as `today` so due cards and missed sessions follow their time zone.
