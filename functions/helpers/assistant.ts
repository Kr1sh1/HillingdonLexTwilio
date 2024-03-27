import OpenAI from "openai"
import { ImageFileContentBlock, TextContentBlock, MessageListParams, Message } from "openai/resources/beta/threads"
import { Conversation } from "../types/types"

export async function fetchThreadConversation(openai: OpenAI, threadId: string, config: MessageListParams) {
  const pages = await openai.beta.threads.messages.list(threadId, config)
  let messages: Message[] = []

  for await (const page of pages.iterPages()) {
    messages = messages.concat(page.getPaginatedItems())
  }

  function isMessageContentText(message: TextContentBlock | ImageFileContentBlock): message is TextContentBlock {
    return message.type === "text"
  }

  const formattedMessages: Conversation = messages.map(message => {
    const textMessage: TextContentBlock = message.content.filter(isMessageContentText)[0]
    return {
      role: message.role,
      content: textMessage?.text?.value ?? ""
    }
  })

  return formattedMessages
}

export async function fetchAssistantResponse(openai: OpenAI, threadId: string, lastMessage: Message) {
  const conversation = await fetchThreadConversation(openai, threadId, { after: lastMessage.id, order: "asc" })
  return conversation.map(message => message.content).join(" ")
}

export function addMessageToThread(openai: OpenAI, threadId: string, message: string) {
  return openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: message
  });
}

export function startNewStreamingRun(openai: OpenAI, threadId: string, assistantId: string) {
  return openai.beta.threads.runs.create(threadId, { assistant_id: assistantId, stream: true });
}
