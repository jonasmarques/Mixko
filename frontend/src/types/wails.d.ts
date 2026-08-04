declare global {
  interface Window {
    go: {
      services: {
        AuthService: {
          Login(identifier: string, password: string, remember: boolean): Promise<void>;
          RestoreSession(): Promise<string>;
          Logout(): Promise<void>;
        };
        FeedService: {
          GetTimeline(cursor: string, limit: number): Promise<any>;
          GetAuthorFeed(actor: string, cursor: string, limit: number, filter?: string): Promise<any>;
          GetSavedFeeds(): Promise<any[]>;
          GetCustomFeed(feedUri: string, cursor: string, limit: number): Promise<any>;
          GetPostThread(uri: string, depth: number): Promise<any>;
          GetListFeed(listUri: string, cursor: string, limit: number): Promise<any>;
          GetPopularFeedGenerators(cursor: string, query: string): Promise<any>;
          GetRepostedBy(uri: string, cid: string, cursor: string): Promise<any>;
          GetQuotes(uri: string, cid: string, cursor: string): Promise<any>;
          GetLikes(uri: string, cid: string, cursor: string): Promise<any>;
          GetActorLikes(actor: string, cursor: string, limit: number): Promise<any>;
          GetPosts(uris: string[]): Promise<any>;
        };
        PostBuilderService: {
          CreatePost(text: string, replyUri: string, replyCid: string, images: string[], alts: string[], videoPath: string, videoAlt: string, linkUrl: string, language: string, threadgate: string): Promise<any>;
          LikePost(uri: string, cid: string): Promise<string>;
          UnlikePost(likeUri: string): Promise<void>;
          Repost(uri: string, cid: string): Promise<string>;
          QuotePost(text: string, quoteUri: string, quoteCid: string, images: string[], alts: string[], videoPath: string, videoAlt: string, language: string, threadgate: string): Promise<any>;
          DeletePost(uri: string): Promise<void>;
          DeleteRepost(repostUri: string): Promise<void>;
          HideReply(postUri: string, replyUri: string): Promise<void>;
          FetchLinkCard(url: string): Promise<any>;
        };
        NotificationsService: {
          GetNotifications(cursor: string): Promise<any>;
          UpdateSeen(seenAt: string): Promise<void>;
        };
        SocialService: {
          GetProfile(actor: string): Promise<any>;
          Follow(actorDID: string): Promise<void>;
          Unfollow(followURI: string): Promise<void>;
          GetActorLists(actorDID: string, cursor: string): Promise<any>;
          GetActorStarterPacks(actorDID: string, cursor: string): Promise<any>;
          GetFollowers(actor: string, cursor: string): Promise<any>;
          GetFollows(actor: string, cursor: string): Promise<any>;
          GetPreferences(): Promise<any>;
          UpdateMutedWords(words: string[]): Promise<void>;
          UpdateAdultContentEnabled(enabled: boolean): Promise<void>;
          UpdateContentFilters(filters: any[]): Promise<void>;
          UpdateThreadPreferences(sort: string, prioritizeFollowed: boolean): Promise<void>;
          UpdateAllPreferences(threadSort: string, adultContent: boolean, mutedWords: string[], filters: any[]): Promise<void>;
          UpdateSavedFeeds(pinnedUris: string[], savedUris: string[]): Promise<void>;
          UpdateProfile(displayName: string, description: string): Promise<void>;
          UploadProfileAvatar(imagePath: string): Promise<void>;
          UploadProfileBanner(imagePath: string): Promise<void>;
          CreateList(name: string, purpose: string, description: string): Promise<void>;
          EditList(uri: string, name: string, purpose: string, description: string): Promise<void>;
          DeleteList(uri: string): Promise<void>;
          SubscribeList(listUri: string): Promise<void>;
          UnsubscribeList(listUri: string): Promise<void>;
          MuteList(uri: string): Promise<void>;
          UnmuteList(uri: string): Promise<void>;
          BlockList(uri: string): Promise<void>;
          UnblockList(blockUri: string): Promise<void>;
          CreateStarterPack(name: string, description: string, listUri: string): Promise<void>;
          DeleteStarterPack(uri: string): Promise<void>;
          PinPost(postUri: string, cid: string): Promise<void>;
          UnpinPost(): Promise<void>;
          AddUserToList(listUri: string, subjectDid: string): Promise<string>;
          RemoveUserFromList(itemUri: string): Promise<void>;
          GetListMembers(listUri: string, cursor: string): Promise<any>;
          FollowAllInList(listUri: string): Promise<number>;
          AddSelfLabel(val: string): Promise<void>;
          RemoveSelfLabel(val: string): Promise<void>;
          GetSelfLabels(): Promise<string[]>;
          GetKnownFollowers(actor: string, cursor: string): Promise<any>;
          GetSuggestedFollows(): Promise<any>;
        };
        ChatService: {
          ListConvos(cursor: string): Promise<any[]>;
          GetMessages(convoId: string, cursor: string): Promise<any>;
          SendMessage(convoId: string, text: string): Promise<void>;
          GetConvoForMembers(members: string[]): Promise<any>;
          UpdateReadStatus(convoId: string, messageId: string): Promise<void>;
          DeleteMessage(convoId: string, messageId: string): Promise<void>;
          MuteConvo(convoId: string): Promise<void>;
          UnmuteConvo(convoId: string): Promise<void>;
          LeaveConvo(convoId: string): Promise<void>;
        };
        ModerationService: {
          MuteActor(actor: string): Promise<void>;
          BlockActor(actorDID: string): Promise<void>;
          GetMutes(cursor: string): Promise<any>;
          GetBlocks(cursor: string): Promise<any>;
          UnmuteActor(actorDID: string): Promise<void>;
          UnblockActor(actorDID: string): Promise<void>;
          MuteThread(uri: string): Promise<void>;
          UnmuteThread(uri: string): Promise<void>;
          ReportPost(uri: string, cid: string, reasonType: string, reason: string): Promise<void>;
          ReportAccount(did: string, reasonType: string, reason: string): Promise<void>;
        };
        SearchService: {
          SearchPosts(filter: any): Promise<any>;
          SearchProfiles(query: string, cursor: string): Promise<any>;
          SearchProfilesTypeahead(query: string): Promise<any>;
        };
      };
      main: {
        App: any;
      }
    }
  }
}
export interface ListDTO {
  uri: string;
  cid: string;
  name: string;
  purpose: string;
  description: string;
  creator: string;
  creatorDid?: string;
  creatorHandle?: string;
  avatar?: string;
  listItemCount?: number;
  viewerMuted?: boolean;
  viewerBlock?: string;
}

export {};

