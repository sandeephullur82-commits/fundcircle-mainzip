import React from "react";
import { useUser } from "@clerk/clerk-react";
import { useDocumentRealtime } from "@/lib/firestore-hooks";

export default function DebugUserDoc() {
  const { user, isLoaded } = useUser();
  const userId = user?.id;
  const { data, loading, error } = useDocumentRealtime<any>("users", userId || "");

  if (!isLoaded) return <div className="p-6">Loading clerk...</div>;
  if (!user) return <div className="p-6">Not signed in.</div>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h2 className="text-lg font-bold mb-3">Debug: Firestore user document</h2>
      <p className="text-sm text-slate-500 mb-4">Signed-in Clerk ID: <strong>{userId}</strong></p>

      {loading && <div className="p-4 bg-slate-50 rounded-md">Listening for changes...</div>}
      {error && <div className="p-4 bg-rose-50 rounded-md">Error: {String(error.message)}</div>}

      {!loading && !error && (
        <div className="bg-white border border-slate-100 rounded-md p-4">
          {data ? (
            <pre className="text-xs overflow-auto max-h-72">{JSON.stringify(data, null, 2)}</pre>
          ) : (
            <div className="text-sm text-slate-500">No document found for this user yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
