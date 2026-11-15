/** React Query hooks over the repository, so screens share cached data. */

import { useQuery } from "@tanstack/react-query";

import {
  getPartner,
  getPost,
  listPartners,
  listPosts,
  loadClientWorkspace,
  loadMyWorkspace,
  loadPartnerClients,
} from "./repository";

export const useMyWorkspace = (userId: string) =>
  useQuery({ queryKey: ["workspace", "mine", userId], queryFn: () => loadMyWorkspace(userId) });

export const useClientWorkspace = (accountId: string) =>
  useQuery({
    queryKey: ["workspace", "client", accountId],
    queryFn: () => loadClientWorkspace(accountId),
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
