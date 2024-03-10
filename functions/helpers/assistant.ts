import OpenAI from "openai"
import { MessageContentImageFile, MessageContentText, MessageListParams, ThreadMessage } from "openai/resources/beta/threads"
import { Message } from "../types/interfaces";

type Conversation = Message[];

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
