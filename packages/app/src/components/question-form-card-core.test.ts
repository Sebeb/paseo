import { describe, expect, test } from "vitest";
import {
  areQuestionsAnswered,
  buildQuestionAnswerLogModel,
  buildQuestionFormAnswers,
  parseQuestionFormQuestions,
  questionShowsTextInput,
  resolveDismissLabel,
  shouldSubmitEmptyOnDismiss,
} from "./question-form-card-core";

describe("question form card core", () => {
  test("treats optional input prompts as skippable empty answers", () => {
    const questions = parseQuestionFormQuestions({
      questions: [
        {
          question: "Optional comment?",
          header: "Response",
          options: [],
          multiSelect: false,
          placeholder: "Optional comment (press Enter to skip)...",
          allowEmpty: true,
          dismissLabel: "Skip",
        },
      ],
    });

    if (!questions) throw new Error("questions did not parse");
    expect(areQuestionsAnswered(questions, {}, {})).toBe(true);
    expect(buildQuestionFormAnswers(questions, {}, {})).toEqual({ Response: "" });
    expect(shouldSubmitEmptyOnDismiss(questions)).toBe(true);
    expect(resolveDismissLabel(questions)).toBe("Skip");
  });

  test("requires a selection for option-only questions", () => {
    const questions = parseQuestionFormQuestions({
      questions: [
        {
          question: "Pick one",
          header: "Response",
          options: [{ label: "A" }, { label: "B" }],
          multiSelect: false,
        },
      ],
    });

    if (!questions) throw new Error("questions did not parse");
    const [question] = questions;
    if (!question) throw new Error("question missing");
    expect(questionShowsTextInput(question)).toBe(false);
    expect(areQuestionsAnswered(questions, {}, { 0: "freeform" })).toBe(false);
    expect(areQuestionsAnswered(questions, { 0: new Set([1]) }, {})).toBe(true);
    expect(buildQuestionFormAnswers(questions, { 0: new Set([1]) }, {})).toEqual({
      Response: "B",
    });
  });

  test("shows text input for explicit other questions", () => {
    const questions = parseQuestionFormQuestions({
      questions: [
        {
          question: "Pick or type",
          header: "Response",
          options: [{ label: "A" }],
          isOther: true,
          multiSelect: false,
        },
      ],
    });

    if (!questions) throw new Error("questions did not parse");
    const [question] = questions;
    if (!question) throw new Error("question missing");
    expect(questionShowsTextInput(question)).toBe(true);
    expect(areQuestionsAnswered(questions, {}, { 0: "custom" })).toBe(true);
    expect(buildQuestionFormAnswers(questions, {}, { 0: "custom" })).toEqual({
      Response: "custom",
    });
  });

  test("shows text input for questions that allow other answers", () => {
    const questions = parseQuestionFormQuestions({
      questions: [
        {
          question: "Pick or type",
          header: "Response",
          options: [{ label: "A" }],
          allowOther: true,
          multiSelect: false,
        },
      ],
    });

    if (!questions) throw new Error("questions did not parse");
    const [question] = questions;
    if (!question) throw new Error("question missing");
    expect(questionShowsTextInput(question)).toBe(true);
    expect(areQuestionsAnswered(questions, {}, { 0: "custom" })).toBe(true);
    expect(buildQuestionFormAnswers(questions, {}, { 0: "custom" })).toEqual({
      Response: "custom",
    });
  });

  test("builds a submitted answer log with option descriptions and custom answers", () => {
    expect(
      buildQuestionAnswerLogModel({
        metadata: {
          questions: [
            {
              id: "default_section",
              question: "Which section should be expanded by default?",
              header: "Default section",
              options: [
                {
                  label: "Workspaces (Recommended)",
                  description: "Keeps established workspace settings visible first.",
                },
                { label: "Projects" },
              ],
            },
            {
              id: "additional_note",
              question: "Additional note",
              header: "Note",
              options: [],
              allowEmpty: true,
            },
          ],
          answers: {
            "Default section": "Workspaces (Recommended)",
            Note: "Keep display preference changes from closing the popup.",
          },
        },
      }),
    ).toEqual({
      questions: [
        {
          key: "default_section",
          question: "Which section should be expanded by default?",
          answers: [
            {
              key: "Default section:Workspaces (Recommended)",
              text: "Workspaces (Recommended)",
              description: "Keeps established workspace settings visible first.",
              isEmpty: false,
            },
          ],
        },
        {
          key: "additional_note",
          question: "Additional note",
          answers: [
            {
              key: "Note:Keep display preference changes from closing the popup.",
              text: "Keep display preference changes from closing the popup.",
              isEmpty: false,
            },
          ],
        },
      ],
    });
  });

  test("builds multi-select logs with one answer row per selected option", () => {
    expect(
      buildQuestionAnswerLogModel({
        metadata: {
          questions: [
            {
              id: "tools",
              question: "Which tools should be enabled?",
              header: "Tools",
              multiSelect: true,
              options: [
                { label: "Browser", description: "Use the browser harness." },
                { label: "Terminal", description: "Run shell commands." },
              ],
            },
          ],
          answers: {
            Tools: ["Browser", "Terminal"],
          },
        },
      }),
    ).toEqual({
      questions: [
        {
          key: "tools",
          question: "Which tools should be enabled?",
          answers: [
            {
              key: "Tools:Browser",
              text: "Browser",
              description: "Use the browser harness.",
              isEmpty: false,
            },
            {
              key: "Tools:Terminal",
              text: "Terminal",
              description: "Run shell commands.",
              isEmpty: false,
            },
          ],
        },
      ],
    });
  });

  test("matches submitted answers by header, question text, and id", () => {
    expect(
      buildQuestionAnswerLogModel({
        metadata: {
          questions: [
            {
              id: "by_header",
              question: "Question keyed elsewhere",
              header: "Header key",
              options: [],
            },
            {
              id: "by_question",
              question: "Question key",
              header: "Missing header key",
              options: [],
            },
            {
              id: "by_id",
              question: "Missing question key",
              header: "Missing id header key",
              options: [],
            },
          ],
          answers: {
            "Header key": "Header answer",
            "Question key": "Question answer",
            by_id: "Id answer",
          },
        },
      })?.questions.map((question) => question.answers[0]?.text),
    ).toEqual(["Header answer", "Question answer", "Id answer"]);
  });

  test("builds logs from unknown tool detail input and output answers", () => {
    expect(
      buildQuestionAnswerLogModel({
        input: {
          questions: [
            {
              question: "Pick a path",
              header: "Path",
              options: [{ label: "Fast" }],
            },
          ],
        },
        output: {
          answers: {
            Path: "Fast",
          },
        },
      }),
    ).toEqual({
      questions: [
        {
          key: "Path",
          question: "Pick a path",
          answers: [{ key: "Path:Fast", text: "Fast", isEmpty: false }],
        },
      ],
    });
  });

  test("renders empty submitted answers as no response", () => {
    expect(
      buildQuestionAnswerLogModel({
        metadata: {
          questions: [
            {
              question: "Optional comment",
              header: "Comment",
              options: [],
              allowEmpty: true,
            },
          ],
          answers: {
            Comment: "",
          },
        },
      }),
    ).toEqual({
      questions: [
        {
          key: "Comment",
          question: "Optional comment",
          answers: [{ key: "Comment:empty", text: "No response", isEmpty: true }],
        },
      ],
    });
  });

  test("does not build a submitted answer log without questions and answers", () => {
    expect(buildQuestionAnswerLogModel({ metadata: { answers: { Response: "A" } } })).toBeNull();
    expect(
      buildQuestionAnswerLogModel({
        metadata: {
          questions: [{ question: "Pick", header: "Response", options: [] }],
        },
      }),
    ).toBeNull();
  });
});
