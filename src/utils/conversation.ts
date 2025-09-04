/**
 * Counts the number of images in the first entry of conversation history content.
 * Images are identified by objects with type 'image_url'.
 * Only examines the first message in the conversation history.
 * @param conversationHistory - Array of conversation messages with content fields
 * @returns The number of images found in the first message's content
 */
export function numImagesInMessage(conversationHistory: any[]): number {
  if (!conversationHistory || conversationHistory.length === 0) {
    return 0;
  }

  const firstMessage = conversationHistory[0];
  if (!firstMessage || !firstMessage.content) {
    return 0;
  }

  if (!Array.isArray(firstMessage.content)) {
    return 0;
  }

  // Count items with type 'image_url'
  return firstMessage.content.filter((item: any) => item.type === 'image_url').length;
}
