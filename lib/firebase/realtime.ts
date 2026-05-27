import { onSnapshot, Query, DocumentReference } from "firebase/firestore";

export function subscribeToCollection<T>(queryRef: Query, callback: (data: T[]) => void) {
  return onSnapshot(
    queryRef,
    (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as T[];
      callback(data);
    },
    (error) => {
      console.error("Firestore realtime collection listener failed:", error);
    }
  );
}

export function subscribeToDocument<T>(docRef: DocumentReference, callback: (data: T | null) => void) {
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback({ id: snapshot.id, ...snapshot.data() } as T);
      } else {
        callback(null);
      }
    },
    (error) => {
      console.error("Firestore realtime document listener failed:", error);
    }
  );
}
