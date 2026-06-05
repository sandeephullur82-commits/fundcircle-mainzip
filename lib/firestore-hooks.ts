import { useEffect, useState } from "react";
import { collection, query, where, orderBy, QueryConstraint, doc } from "firebase/firestore";
import { db } from "./firebase";
import { useOrganization } from "@clerk/clerk-react";
import { subscribeToCollection, subscribeToDocument } from "./firebase/realtime";

export function useCollectionRealtime<T>(collectionName: string, queryConstraints: QueryConstraint[] = []) {
  const { organization } = useOrganization();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!organization?.id) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, collectionName),
      where("organizationId", "==", organization.id),
      ...queryConstraints
    );

    const unsubscribe = subscribeToCollection<T>(
      q,
      (results) => {
        setData(results);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`[useCollectionRealtime] ${collectionName} listener error:`, err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [collectionName, organization?.id, JSON.stringify(queryConstraints)]);

  return { data, loading, error };
}

export function useCollectionRealtimeRaw<T>(collectionName: string, queryConstraints: QueryConstraint[] = []) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, collectionName),
      ...queryConstraints
    );

    const unsubscribe = subscribeToCollection<T>(
      q,
      (results) => {
        setData(results);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`[useCollectionRealtimeRaw] ${collectionName} listener error:`, err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [collectionName, JSON.stringify(queryConstraints)]);

  return { data, loading, error };
}

export function useDocumentRealtime<T>(collectionName: string, documentId: string | undefined | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!documentId) {
      setLoading(false);
      return;
    }

    const docRef = doc(db, collectionName, documentId);
    const unsubscribe = subscribeToDocument<T>(
      docRef,
      (result) => {
        setData(result);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`[useDocumentRealtime] ${collectionName}/${documentId} listener error:`, err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [collectionName, documentId]);

  return { data, loading, error };
}
