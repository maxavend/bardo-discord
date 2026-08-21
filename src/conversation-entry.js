import p6Entry from './p6-entry.js';
import { maybeHandleConversationInteraction } from './conversation/interaction.js';

export default {
  async fetch(request, env, ctx = { waitUntil: () => {} }) {
    const conversation = await maybeHandleConversationInteraction(request, env, ctx);
    if (conversation) return conversation;
    return p6Entry.fetch(request, env, ctx);
  },

  scheduled(event, env, ctx = { waitUntil: () => {} }) {
    return p6Entry.scheduled(event, env, ctx);
  },
};
