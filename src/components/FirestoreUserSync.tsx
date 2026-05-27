import React, { useEffect, useRef, useState } from "react";
import { useUser, useOrganization } from "@clerk/clerk-react";
import { collection, doc, getDoc, getDocs, query, setDoc, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { reconcilePendingInviteMembership } from "@/lib/services";

export default function AuthSyncService() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { organization } = useOrganization();
  const [isSyncing, setIsSyncing] = useState(false);
  const retryRef = useRef(0);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;

    let active = true;

    const ensure = async () => {
      if (!active) return;
      setIsSyncing(true);
      try {
        const email = user.primaryEmailAddress?.emailAddress?.trim().toLowerCase() || "";
        console.log("AuthSyncService: syncing user", {
          userId: user.id,
          orgId: organization?.id || null,
          email,
        });

        const userRef = doc(db, "users", user.id);
        const snap = await getDoc(userRef);
        const baseData = {
          clerkUserId: user.id,
          id: user.id,
          email,
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          name: user.fullName || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        };

        if (!snap.exists()) {
          await setDoc(userRef, { ...baseData, profileCompleted: false }, { merge: true });
          console.log("AuthSyncService: created user doc for", user.id);
        } else {
          const existing = snap.data() as any;
          await setDoc(userRef, {
            ...baseData,
            status: existing.status || "active",
            profileCompleted: existing.profileCompleted !== undefined ? existing.profileCompleted : false,
            createdAt: existing.createdAt || baseData.createdAt,
          }, { merge: true });
          console.log("AuthSyncService: updated user doc for", user.id);
        }

        if (email) {
          const pendingUserQuery = query(collection(db, "users"), where("email", "==", email));
          const pendingUserSnapshot = await getDocs(pendingUserQuery);
          await Promise.all(
            pendingUserSnapshot.docs.map((docSnap) => {
              const existing = docSnap.data() as any;
              if (!existing.clerkUserId) {
                return updateDoc(docSnap.ref, {
                  clerkUserId: user.id,
                  updatedAt: serverTimestamp(),
                });
              }
              return Promise.resolve();
            })
          );
        }

        if (email) {
          const synced = await reconcilePendingInviteMembership(
            email,
            organization?.id,
            user.id,
            user.fullName || `${user.firstName || ""} ${user.lastName || ""}`.trim()
          );
          if (synced.length) {
            console.log("AuthSyncService: pending invite reconciled", synced.length, "member(s) created");
          }
        }

        retryRef.current = 0;
      } catch (err) {
        console.error("AuthSyncService error:", err);
        if (retryRef.current < 2) {
          retryRef.current += 1;
          const delay = 2000 * retryRef.current;
          console.log(`AuthSyncService retrying in ${delay}ms`, retryRef.current);
          setTimeout(() => {
            if (active) ensure();
          }, delay);
        }
      } finally {
        if (active) setIsSyncing(false);
      }
    };

    ensure();
    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn, user, organization?.id]);

  return null;
}
