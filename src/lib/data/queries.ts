/** React Query hooks over the repository, so screens share cached data. */

import { useQuery } from "@tanstack/react-query";

import {
  getPartner,
  getPost,
  isAdmin,
  isMyPost,
  listAccessEvents,
  listConversations,
  listMyAccess,
  listMyInvitations,
  listPartners,
  listPartnersForReview,
  listPosts,
  loadClientWorkspace,
  loadConversation,
  loadCorToConfirm,
  loadMyPartnerProfile,
  loadMyWorkspace,
  loadPartnerClients,
  loadAccountTier,
  loadPlan,
  loadUsage,
} from "./repository";
import type { AccountRole, Loaded, PartnerKind, Workspace } from "./types";

/** While a document is being read, check every 4 seconds so its progress bar keeps moving. */
const whileReading = (query: { state: { data?: Loaded<Workspace> | undefined } }) =>
  query.state.data?.data.documents.some((d) => d.status === "reading") ? 4_000 : false;

export const useMyWorkspace = (userId: string) =>
  useQuery({
    queryKey: ["workspace", "mine", userId],
    queryFn: () => loadMyWorkspace(userId),
    refetchInterval: whileReading,
  });

/** A client's workspace, for a professional. Asks nothing until there is a client to ask for. */
export const useClientWorkspace = (accountId: string) =>
  useQuery({
    queryKey: ["workspace", "client", accountId],
    queryFn: () => loadClientWorkspace(accountId),
    enabled: Boolean(accountId),
    refetchInterval: whileReading,
  });

export const usePartnerClients = (userId: string) =>
  useQuery({ queryKey: ["partner-clients", userId], queryFn: () => loadPartnerClients(userId) });

export const usePartners = () => useQuery({ queryKey: ["partners"], queryFn: listPartners });

export const usePartner = (partnerId: string) =>
  useQuery({ queryKey: ["partner", partnerId], queryFn: () => getPartner(partnerId) });

export const usePosts = (signedIn: boolean) =>
  useQuery({ queryKey: ["posts", signedIn], queryFn: () => listPosts(signedIn) });

export const usePost = (postId: string, signedIn: boolean) =>
  useQuery({ queryKey: ["post", postId, signedIn], queryFn: () => getPost(postId, signedIn) });

export const useIsMyPost = (postId: string, signedIn: boolean) =>
  useQuery({
    queryKey: ["my-post", postId],
    queryFn: () => isMyPost(postId),
    enabled: signedIn && !postId.startsWith("sample-") && !postId.startsWith("local-"),
  });

/** Who can see the signed-in taxpayer's account. */
export const useMyAccess = (userId: string, enabled = true) =>
  useQuery({ queryKey: ["access", userId], queryFn: () => listMyAccess(userId), enabled });

/** The signed-in taxpayer's activity log (invitations, and what professionals did inside). */
export const useAccessEvents = (userId: string) =>
  useQuery({ queryKey: ["access-events", userId], queryFn: () => listAccessEvents(userId) });

/** Invitations waiting for the signed-in professional. Refreshes every minute. */
export const useMyInvitations = (userId: string) =>
  useQuery({
    queryKey: ["invitations", userId],
    queryFn: listMyInvitations,
    refetchInterval: 60_000,
  });

/** The conversation list. Refreshes every 20 seconds for the unread badges. */
export const useConversations = (userId: string, role: AccountRole) =>
  useQuery({
    queryKey: ["conversations", userId],
    queryFn: () => listConversations(userId, role),
    refetchInterval: 20_000,
  });

/** One conversation. New messages also arrive through Realtime; this polls as a fallback. */
export const useConversation = (conversationId: string, userId: string, role: AccountRole) =>
  useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => loadConversation(conversationId, userId, role),
    refetchInterval: 15_000,
  });

export const useMyPartnerProfile = (
  userId: string,
  fallback: { name: string; kind: PartnerKind },
) =>
  useQuery({
    queryKey: ["my-partner-profile", userId],
    queryFn: () => loadMyPartnerProfile(userId, fallback),
  });

export const useIsAdmin = (userId: string) =>
  useQuery({ queryKey: ["is-admin", userId], queryFn: isAdmin, staleTime: 5 * 60_000 });

export const usePartnersForReview = (enabled: boolean) =>
  useQuery({ queryKey: ["partners-for-review"], queryFn: listPartnersForReview, enabled });

export const useCorToConfirm = (accountId: string) =>
  useQuery({
    queryKey: ["cor-to-confirm", accountId],
    queryFn: () => loadCorToConfirm(accountId),
    enabled: Boolean(accountId),
  });

export const usePlan = (userId: string) =>
  useQuery({ queryKey: ["plan", userId], queryFn: () => loadPlan(userId) });

/** Pages read and storage used on the signed-in user's own account. */
export const useUsage = (userId: string) =>
  useQuery({ queryKey: ["usage", userId], queryFn: loadUsage });

/** The tier of a client's account, for a professional: their features follow it. */
export const useAccountTier = (accountId: string) =>
  useQuery({
    queryKey: ["account-tier", accountId],
    queryFn: () => loadAccountTier(accountId),
    enabled: Boolean(accountId),
    staleTime: 5 * 60_000,
  });
