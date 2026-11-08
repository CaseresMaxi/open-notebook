# ADR-033: Study guides — model writes the content, rules write the calendar

- **Status:** Accepted in personal fork
- **Date:** 2026-11-08

## Context

The owner asked for a "study guide" option: from one or several sources and/or topics, build a personalized study plan using the learning strategies with the strongest scientific support. The literature reviewed:

- Dunlosky et al. (2013): practice testing and distributed practice are high utility; elaborative interrogation, self-explanation and interleaved practice moderate; summarization, highlighting, the keyword mnemonic, imagery for text and rereading low.
- Cepeda et al. (2008): the optimal gap between study sessions grows with the retention interval, and gaps that are too short hurt more than gaps that are too long.
- Rawson, Dunlosky & Sciartelli (2013): successive relearning (spaced retrieval to a criterion).
- Brunmair & Richter (2019): moderate interleaving effect, stronger for similar, confusable categories; caution for expository text.
- Bisra et al. (2018): self-explanation, g ≈ 0.55. Adesope et al. (2017): practice tests beat restudying.
- Weinstein, Madan & Sumeracki (2018): retrieval, spacing, interleaving, elaboration, concrete examples, dual coding. Richland et al. (2009): pretesting.

## Decision

A study guide is a `study_guide` record (migration 29) owned by a notebook. Generation is split:

1. **Content (LLM, `prompts/study/guide.jinja`, `open_notebook/graphs/study_guide.py`).** One structured call returns ordered topics (prerequisites by index, difficulty, importance, source IDs) and, per topic, material for each strategy: key ideas, elaboration questions, a self-explanation prompt, concrete examples, a dual-coding task, misconceptions, practice questions and flashcards. Output is validated (ids assigned, prerequisite and source references filtered). Material comes from the existing exam material builder; with no source selected the guide is written for the listed topics only and stored with `grounded = false`, which the UI shows.
2. **Calendar (deterministic, `open_notebook/study_planning.py`).** Topics are placed in prerequisite order into the learner's study days within the session budget; each gets learning + self-explanation, then retrieval reviews at expanding gaps (1, 3, 7, 14, 30, 60 days, scaled by self-rated confidence). Several reviews on one day become one interleaved block. The first session opens with a pretest; a cumulative mock exam closes the plan (the exam day is never a study day) and runs weekly. Flashcards follow an SM-2 variant; "again" keeps the card due today (successive relearning) and no card is scheduled past the exam.

Progress is stored on the record (completed activity IDs, card states, topic confidence). Rescheduling keeps completed past work, drops missed activities, rebuilds learned topics' history from completed activities and replans from the learner's local date (`today` is sent by the client). Mock exams reuse the existing practice-exam generator with instructions naming the guide's topics. Deleting a notebook deletes its guides.

All study happens in the app: every question has an answer stored on the guide (`responses`, keyed by question: `t1:practice:0`, `t1:elaboration:0`, `t1:self_explain`, `t1:dual_coding`, `t1:recall`, `t1:example`, `card:c1`), as an append-only history per question with the activity it was answered in, text and images, a self-check grade and optional AI feedback. Unsaved drafts live in localStorage. AI analysis reuses the exam grader (`grade_with_ai`) with a question built from the guide: the reference answer for practice questions and flashcards, the topic's key ideas and examples with a strategy-specific rubric otherwise. Open answers are analyzed right after saving because they have no short key to self-check against; short answers are analyzed on request, to keep model calls proportional.

Visual tasks get an AI reference diagram, generated on demand once per topic (`prompts/study/diagram.jinja`) and stored in `diagram_references`: Markdown with one validated ```arc block (concept map, steps or table, rendered by the chat's interactive components) or, for shapes those cannot express, a declarative HTML/SVG fragment validated as an `HtmlVisual` (sanitized, no scripts, rendered in the existing isolated frame). It also becomes part of the reference when the learner's own diagram is analyzed.

Generation runs in the request, like practice exams, behind the frontend's long API timeout.

## Alternatives considered

- **Let the model write the dates.** Rejected: models do not reliably respect spacing, budgets or the exam day, and the calendar would not be testable or replannable.
- **FSRS instead of SM-2.** Better calibrated with review history, but needs per-user parameters and more data than a single guide produces; SM-2 is simple, well known and adequate here.
- **Background command for generation.** Consistent with ADR-004, but exams already generate synchronously and a guide is one call; it can move to a command if generation times grow.
- **Separate tables for cards and sessions.** One record keeps a guide's state atomic and is enough for one learner's guide (≤12 topics, ≤144 cards).

## Consequences

The plan is explainable (the Method tab cites the evidence) and testable. Quality of topics and questions still depends on the model and the material; topic-only guides are clearly marked ungrounded. Confidence/recall comparison gives a simple calibration hint, not a psychometric measure. Frontend copy is authored in English and Spanish; other locales carry English pending translation.
