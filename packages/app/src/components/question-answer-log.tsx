import { useMemo } from "react";
import { View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  QuestionAnswerLogAnswer,
  QuestionAnswerLogModel,
  QuestionAnswerLogQuestion,
} from "./question-form-card-core";

interface QuestionAnswerLogProps {
  model: QuestionAnswerLogModel;
}

export function QuestionAnswerLog({ model }: QuestionAnswerLogProps) {
  return (
    <View style={styles.container} testID="question-answer-log">
      {model.questions.map((question, index) => (
        <QuestionAnswerSection key={question.key} question={question} isFirst={index === 0} />
      ))}
    </View>
  );
}

function QuestionAnswerSection({
  question,
  isFirst,
}: {
  question: QuestionAnswerLogQuestion;
  isFirst: boolean;
}) {
  const questionHeaderStyle = useMemo(
    () => [styles.questionHeader, !isFirst && styles.questionHeaderBorder],
    [isFirst],
  );
  return (
    <View style={styles.questionSection}>
      <View style={questionHeaderStyle}>
        <Text selectable style={styles.questionText}>
          {question.question}
        </Text>
      </View>
      <View style={styles.answerBody}>
        {question.answers.map((answer) => (
          <QuestionAnswerBlock key={answer.key} answer={answer} />
        ))}
      </View>
    </View>
  );
}

function QuestionAnswerBlock({ answer }: { answer: QuestionAnswerLogAnswer }) {
  const answerTextStyle = useMemo(
    () => [styles.answerText, answer.isEmpty && styles.emptyAnswer],
    [answer.isEmpty],
  );
  return (
    <View style={styles.answerBlock}>
      <Text selectable style={answerTextStyle}>
        {answer.text}
      </Text>
      {answer.description ? (
        <Text selectable style={styles.answerDescription}>
          {answer.description}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    overflow: "hidden",
  },
  questionSection: {
    backgroundColor: theme.colors.surface1,
  },
  questionHeader: {
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  questionHeaderBorder: {
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
  },
  questionText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    lineHeight: 20,
  },
  answerBody: {
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
  },
  answerBlock: {
    gap: theme.spacing[1],
  },
  answerText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    lineHeight: 22,
  },
  emptyAnswer: {
    color: theme.colors.foregroundMuted,
  },
  answerDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    lineHeight: 20,
  },
}));
