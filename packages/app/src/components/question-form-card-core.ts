export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionFormQuestion {
  id?: string;
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
  allowOther: boolean;
  allowEmpty: boolean;
  placeholder?: string;
  dismissLabel?: string;
}

export type QuestionSelections = Record<number, ReadonlySet<number>>;
export type QuestionOtherTexts = Record<number, string>;

export interface QuestionAnswerLogAnswer {
  key: string;
  text: string;
  description?: string;
  isEmpty: boolean;
}

export interface QuestionAnswerLogQuestion {
  key: string;
  question: string;
  answers: QuestionAnswerLogAnswer[];
}

export interface QuestionAnswerLogModel {
  questions: QuestionAnswerLogQuestion[];
}

interface QuestionAnswerLogInput {
  metadata?: Record<string, unknown>;
  input?: unknown;
  output?: unknown;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readQuestionsFrom(value: unknown): QuestionFormQuestion[] | null {
  const record = readRecord(value);
  if (!record) return null;
  if (Array.isArray(record.questions)) {
    return parseQuestionFormQuestions(record);
  }
  return null;
}

function readAnswersProperty(value: unknown): Record<string, unknown> | null {
  const record = readRecord(value);
  if (!record) return null;
  return readRecord(record.answers);
}

function readBareAnswers(value: unknown): Record<string, unknown> | null {
  const record = readRecord(value);
  if (!record || Array.isArray(record.questions)) return null;
  return record;
}

export function parseQuestionFormQuestions(input: unknown): QuestionFormQuestion[] | null {
  if (
    typeof input !== "object" ||
    input === null ||
    !("questions" in input) ||
    !Array.isArray((input as Record<string, unknown>).questions)
  ) {
    return null;
  }
  const raw = (input as Record<string, unknown>).questions as unknown[];
  const questions: QuestionFormQuestion[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const q = item as Record<string, unknown>;
    if (typeof q.question !== "string" || typeof q.header !== "string") return null;
    if (!Array.isArray(q.options)) return null;
    const options: QuestionOption[] = [];
    for (const opt of q.options as unknown[]) {
      if (typeof opt !== "object" || opt === null) return null;
      const o = opt as Record<string, unknown>;
      if (typeof o.label !== "string") return null;
      options.push({
        label: o.label,
        description: typeof o.description === "string" ? o.description : undefined,
      });
    }
    questions.push({
      id: readOptionalString(q, "id"),
      question: q.question,
      header: q.header,
      options,
      multiSelect: q.multiSelect === true,
      allowOther: q.allowOther === true || q.isOther === true,
      allowEmpty: q.allowEmpty === true,
      placeholder: readOptionalString(q, "placeholder"),
      dismissLabel: readOptionalString(q, "dismissLabel"),
    });
  }
  return questions.length > 0 ? questions : null;
}

function resolveQuestionAnswerValue(
  question: QuestionFormQuestion,
  answers: Record<string, unknown>,
): unknown {
  const keys = [question.header, question.question, question.id].filter(
    (key): key is string => typeof key === "string" && key.length > 0,
  );
  for (const key of keys) {
    if (key in answers) {
      return answers[key];
    }
  }
  return undefined;
}

function readAnswerValues(value: unknown, multiSelect: boolean): string[] {
  if (typeof value === "string") {
    if (!multiSelect) {
      const trimmed = value.trim();
      return trimmed.length > 0 ? [trimmed] : [];
    }
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  const record = readRecord(value);
  if (record && "answers" in record) {
    return readAnswerValues(record.answers, multiSelect);
  }
  return [];
}

function buildLogAnswers(
  question: QuestionFormQuestion,
  rawValue: unknown,
): QuestionAnswerLogAnswer[] {
  const values = readAnswerValues(rawValue, question.multiSelect);
  if (values.length === 0) {
    return [{ key: `${question.header}:empty`, text: "No response", isEmpty: true }];
  }
  return values.map((value) => {
    const option = question.options.find((candidate) => candidate.label === value);
    const answer: QuestionAnswerLogAnswer = {
      key: `${question.header}:${value}`,
      text: value,
      isEmpty: false,
    };
    if (option?.description) {
      answer.description = option.description;
    }
    return answer;
  });
}

export function buildQuestionAnswerLogModel({
  metadata,
  input,
  output,
}: QuestionAnswerLogInput): QuestionAnswerLogModel | null {
  const metadataQuestionForm = readRecord(metadata?.questionForm);
  const inputRecord = readRecord(input);
  const outputRecord = readRecord(output);

  const questions =
    readQuestionsFrom(metadataQuestionForm) ??
    readQuestionsFrom(metadata) ??
    readQuestionsFrom(inputRecord) ??
    readQuestionsFrom(outputRecord);
  if (!questions) return null;

  const answers =
    readAnswersProperty(metadataQuestionForm) ??
    readBareAnswers(metadataQuestionForm?.answers) ??
    readBareAnswers(metadata?.answers) ??
    readAnswersProperty(outputRecord) ??
    readAnswersProperty(inputRecord) ??
    readBareAnswers(outputRecord);
  if (!answers) return null;

  return {
    questions: questions.map((question) => ({
      key: question.id ?? question.header,
      question: question.question,
      answers: buildLogAnswers(question, resolveQuestionAnswerValue(question, answers)),
    })),
  };
}

export function questionShowsTextInput(question: QuestionFormQuestion): boolean {
  return question.options.length === 0 || question.allowOther;
}

export function isQuestionAnswered(
  question: QuestionFormQuestion,
  qIndex: number,
  selections: QuestionSelections,
  otherTexts: QuestionOtherTexts,
): boolean {
  const selected = selections[qIndex];
  if (selected && selected.size > 0) {
    return true;
  }

  if (!questionShowsTextInput(question)) {
    return false;
  }

  const otherText = otherTexts[qIndex]?.trim();
  if (otherText && otherText.length > 0) {
    return true;
  }

  return question.allowEmpty;
}

export function areQuestionsAnswered(
  questions: QuestionFormQuestion[] | null,
  selections: QuestionSelections,
  otherTexts: QuestionOtherTexts,
): boolean {
  return (
    questions?.every((question, qIndex) =>
      isQuestionAnswered(question, qIndex, selections, otherTexts),
    ) ?? false
  );
}

export function buildQuestionFormAnswers(
  questions: QuestionFormQuestion[],
  selections: QuestionSelections,
  otherTexts: QuestionOtherTexts,
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const selected = selections[i];
    const otherText = otherTexts[i]?.trim();

    if (questionShowsTextInput(q)) {
      if (otherText && otherText.length > 0) {
        answers[q.header] = otherText;
        continue;
      }
      if (q.allowEmpty && q.options.length === 0) {
        answers[q.header] = "";
        continue;
      }
    }

    if (selected && selected.size > 0) {
      const labels = Array.from(selected).map((idx) => q.options[idx].label);
      answers[q.header] = labels.join(", ");
    }
  }
  return answers;
}

export function shouldSubmitEmptyOnDismiss(questions: QuestionFormQuestion[]): boolean {
  return (
    questions.length > 0 &&
    questions.every((question) => question.allowEmpty && question.options.length === 0)
  );
}

export function resolveDismissLabel(
  questions: QuestionFormQuestion[],
  fallbackLabel = "Dismiss",
): string {
  return questions.find((question) => question.dismissLabel)?.dismissLabel ?? fallbackLabel;
}
