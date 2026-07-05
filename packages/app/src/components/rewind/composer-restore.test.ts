import { describe, expect, test } from "vitest";
import type { AttachmentMetadata, UserComposerAttachment } from "@/attachments/types";
import {
  buildRewindComposerImageAttachments,
  restoreComposerInputIfEmpty,
  restoreComposerTextIfEmpty,
} from "./composer-restore";
import { shouldRestoreComposerForRewindMode } from "./rewind-mode";

function imageMetadata(id: string): AttachmentMetadata {
  return {
    id,
    mimeType: "image/png",
    storageType: "web-indexeddb",
    storageKey: `attachments/${id}`,
    createdAt: 1,
  };
}

describe("restoreComposerTextIfEmpty", () => {
  test("restores the rewound message when the composer is empty", () => {
    expect(
      restoreComposerTextIfEmpty({
        currentText: "",
        rewoundText: "message before rewind",
      }),
    ).toBe("message before rewind");
  });

  test("preserves an existing composer draft", () => {
    expect(
      restoreComposerTextIfEmpty({
        currentText: "keep this draft",
        rewoundText: "message before rewind",
      }),
    ).toBe("keep this draft");
  });
});

describe("restoreComposerInputIfEmpty", () => {
  test("restores rewound text and image attachments when the composer is empty", () => {
    const image = imageMetadata("image-1");
    const rewoundAttachments = buildRewindComposerImageAttachments([image]);

    expect(
      restoreComposerInputIfEmpty({
        currentInput: { text: "", attachments: [] },
        rewoundInput: {
          text: "message before rewind",
          attachments: rewoundAttachments,
        },
      }),
    ).toEqual({
      text: "message before rewind",
      attachments: [{ kind: "image", metadata: image }],
    });
  });

  test("preserves an existing attachment-only composer draft", () => {
    const currentAttachment: UserComposerAttachment = {
      kind: "image",
      metadata: imageMetadata("current-image"),
    };
    const rewoundAttachment: UserComposerAttachment = {
      kind: "image",
      metadata: imageMetadata("rewound-image"),
    };

    expect(
      restoreComposerInputIfEmpty({
        currentInput: { text: "", attachments: [currentAttachment] },
        rewoundInput: {
          text: "message before rewind",
          attachments: [rewoundAttachment],
        },
      }),
    ).toEqual({
      text: "",
      attachments: [currentAttachment],
    });
  });
});

describe("shouldRestoreComposerForRewindMode", () => {
  test("restores only conversation-mutating rewind modes", () => {
    expect(shouldRestoreComposerForRewindMode("conversation")).toBe(true);
    expect(shouldRestoreComposerForRewindMode("files")).toBe(false);
    expect(shouldRestoreComposerForRewindMode("both")).toBe(true);
  });
});
