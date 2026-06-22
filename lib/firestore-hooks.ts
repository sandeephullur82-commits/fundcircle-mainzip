import { useEffect, useState } from "react";
import { collection, query, where, orderBy, QueryConstraint, doc } from "firebase/firestore";
import { db } from "./firebase";
import { useOrganization } from "@clerk/clerk-react";
import { subscribeToCollection, subscribeToDocument } from "./firebase/realtime";

/**
 * Stable key helper: extracts a serialisable identity from Firestore
 * QueryConstraint objects (which are class instances and cannot be
 * naively JSON.stringified into something meaningful).
 */
function constraintKey(constraints: QueryConstraint[]): string {
  return constraints
    .map((c: any) => {
      // QueryFieldFilterConstraint (where)
      if (c._field && c._op !== undefined) {
        const field = c._field?.segments?.join(".") ?? String(c._field);
        return `w:${field}:${c._op}:${JSON.stringify(c._value)}`;
      }
      // QueryOrderByConstraint (orderBy)
      if (c._field && c._direction) {
        const field = c._field?.segments?.join(".") ?? String(c._field);
        return `o:${field}:${c._direction}`;
      }
      // QueryLimitConstraint (limit / limitToLast)
      if (c._limit !== undefined) return `l:${c._limit}:${c._limitType}`;
      // Fallback — stringify the enumerable keys
      try { return JSON.stringify(c); } catch { return String(c); }
    })
    .join("|");
}

export function useCollectionRealtime<T>(collectionName: string, queryConstraints: QueryConstraint[] = []) {
  const { organization } = useOrganization();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Build a stable string key from the constraints so the effect only
  // re-subscribes when the query actually changes, not on every render.
  const constraintsKey = constraintKey(queryConstraints);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, organization?.id, constraintsKey]);

  return { data, loading, error };
}

export function useCollectionRealtimeRaw<T>(collectionName: string, queryConstraints: QueryConstraint[] = []) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const constraintsKey = constraintKey(queryConstraints);

  useEffect(() => {
    if (queryConstraints.length === 0) {
      // No constraints means the caller isn't ready yet (e.g. membershipId not loaded)
      // Keep loading=true until constraints arrive.
      return;
    }

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, constraintsKey]);

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
