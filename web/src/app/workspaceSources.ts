import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "../auth/auth";
import type {
  ChatAnswer,
  DocumentSummary,
  KnowledgeApi,
  SourceDocument,
} from "./api";
import type { Language } from "./language";

interface SourceSelection {
  id: string;
  number?: number;
  excerpt?: string;
}

const EMPTY_DOCUMENTS: DocumentSummary[] = [];

export interface OpenSource extends SourceSelection {
  request: number;
  document?: SourceDocument;
  failed?: boolean;
}

export function useWorkspaceSources(
  session: Session | null,
  language: Language,
  api: KnowledgeApi,
) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loadedFor, setLoadedFor] = useState<{
    session: Session;
    language: Language;
    api: KnowledgeApi;
  } | null>(null);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState<string | null>(null);
  const [reader, setReader] = useState<OpenSource | null>(null);
  const generation = useRef(0);
  const readerRequest = useRef(0);

  const clearReader = useCallback(() => {
    readerRequest.current++;
    setReader(null);
  }, []);

  const invalidate = useCallback(() => {
    generation.current++;
    setDocuments([]);
    setLoadedFor(null);
    setLoading(false);
    setError(null);
    clearReader();
  }, [clearReader]);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    let active = true;
    setDocuments([]);
    setLoadedFor(null);
    setError(null);
    clearReader();
    if (!session) {
      setLoading(false);
      return () => {
        active = false;
        generation.current++;
      };
    }
    setLoading(true);
    api
      .loadDocuments(session.accessToken, language)
      .then((docs) => {
        if (active && currentGeneration === generation.current) {
          setDocuments(docs);
          setLoadedFor({ session, language, api });
        }
      })
      .catch(() => {
        if (active && currentGeneration === generation.current)
          setError(
            "Documents are unavailable. Please check your connection and sign in again.",
          );
      })
      .finally(() => {
        if (active && currentGeneration === generation.current)
          setLoading(false);
      });
    return () => {
      active = false;
      generation.current++;
    };
  }, [session, language, api, clearReader]);

  const authorizedListing = Boolean(
    session &&
    loadedFor?.session === session &&
    loadedFor.language === language &&
    loadedFor.api === api,
  );

  const openSource = async (source: SourceSelection): Promise<boolean> => {
    if (
      !session ||
      !authorizedListing ||
      loading ||
      !documents.some((doc) => doc.id === source.id)
    )
      return false;
    const currentGeneration = generation.current;
    const request = ++readerRequest.current;
    const current = () =>
      currentGeneration === generation.current &&
      request === readerRequest.current;
    setReader({ ...source, request });
    try {
      const document = await api.openDocument(
        session.accessToken,
        source.id,
        language,
      );
      if (!current()) return true;
      if (new URL(document.url).protocol !== "https:")
        throw new Error("Invalid source URL");
      setReader({ ...source, request, document });
    } catch {
      if (current()) setReader({ ...source, request, failed: true });
    }
    return true;
  };

  const askQuestion = async (question: string): Promise<ChatAnswer | null> => {
    if (!session || !authorizedListing || !documents.length)
      throw new Error("Sources unavailable");
    const currentGeneration = generation.current;
    let response: ChatAnswer;
    try {
      response = await api.askQuestion(session.accessToken, question, language);
    } catch (error) {
      if (currentGeneration !== generation.current) return null;
      throw error;
    }
    if (currentGeneration !== generation.current) return null;
    if (
      response.citations.some(
        (citation) => !documents.some((doc) => doc.id === citation.document_id),
      )
    )
      throw new Error("Unknown citation");
    return response;
  };

  return {
    documents: authorizedListing ? documents : EMPTY_DOCUMENTS,
    loading: loading || Boolean(session && loadedFor && !authorizedListing),
    error,
    reader,
    authorizedListing,
    clearReader,
    invalidate,
    openSource,
    askQuestion,
  };
}
