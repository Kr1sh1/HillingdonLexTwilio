import OpenAI from "openai"
import { MessageContentImageFile, MessageContentText, MessageListParams, ThreadMessage } from "openai/resources/beta/threads"
import { Conversation } from "../types/types"

export async function fetchThreadConversation(openai: OpenAI, threadId: string, config: MessageListParams) {
  const pages = await openai.beta.threads.messages.list(threadId, config)
  let messages: ThreadMessage[] = []

  for await (const page of pages.iterPages()) {
    messages = messages.concat(page.getPaginatedItems())
  }

  function isMessageContentText(message: MessageContentText | MessageContentImageFile): message is MessageContentText {
    return message.type === "text"
  }

  const formattedMessages: Conversation = messages.map(message => {
    const textMessage: MessageContentText = message.content.filter(isMessageContentText)[0]
    return {
      role: message.role,
      content: textMessage.text.value
    }
  })

  return formattedMessages
}

export async function fetchAssistantResponse(openai: OpenAI, threadId: string, lastMessage: ThreadMessage) {
  const conversation = await fetchThreadConversation(openai, threadId, { after: lastMessage.id, order: "asc" })
  return conversation.map(message => message.content).join(" ")
}

export function addMessageToThread(openai: OpenAI, threadId: string, message: string) {
  return openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: message
  });
}

export function startNewRun(openai: OpenAI, threadId: string, assistantId: string) {
  return openai.beta.threads.runs.create(threadId, { assistant_id: assistantId });
}
