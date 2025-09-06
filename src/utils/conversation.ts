export function numImagesInMessage(conversationHistoryWithImages: any[]): number {
  if (!conversationHistoryWithImages || conversationHistoryWithImages.length === 0) {
    return 0;
  }

  const firstMessage = conversationHistoryWithImages[0];
  if (!firstMessage || !firstMessage.content) {
    return 0;
  }

  if (!Array.isArray(firstMessage.content)) {
    return 0;
  }

  return firstMessage.content.filter((item: any) => item.type === 'image_url').length;
}
