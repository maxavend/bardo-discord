import { getDocument, putDocument, searchGuildDocuments } from '../repositories/document-repository.js';

export class DocumentService {
  constructor(env) {
    this.env = env;
    this.db = env.DB;
  }

  get(documentId) {
    return getDocument(this.db, documentId);
  }

  save(documentId, document) {
    return putDocument(this.db, documentId, document);
  }

  searchForGuild(guildId, query, limit = 25) {
    return searchGuildDocuments(this.db, guildId, query, limit);
  }
}
