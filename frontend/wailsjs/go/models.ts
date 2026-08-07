export namespace atproto {
	
	export class LabelDefs_Label {
	    cid?: string;
	    cts: string;
	    exp?: string;
	    neg?: boolean;
	    sig?: number[];
	    src: string;
	    uri: string;
	    val: string;
	    ver?: number;
	
	    static createFrom(source: any = {}) {
	        return new LabelDefs_Label(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cid = source["cid"];
	        this.cts = source["cts"];
	        this.exp = source["exp"];
	        this.neg = source["neg"];
	        this.sig = source["sig"];
	        this.src = source["src"];
	        this.uri = source["uri"];
	        this.val = source["val"];
	        this.ver = source["ver"];
	    }
	}
	export class RepoDefs_CommitMeta {
	    cid: string;
	    rev: string;
	
	    static createFrom(source: any = {}) {
	        return new RepoDefs_CommitMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cid = source["cid"];
	        this.rev = source["rev"];
	    }
	}
	export class RepoCreateRecord_Output {
	    cid: string;
	    commit?: RepoDefs_CommitMeta;
	    uri: string;
	    validationStatus?: string;
	
	    static createFrom(source: any = {}) {
	        return new RepoCreateRecord_Output(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cid = source["cid"];
	        this.commit = this.convertValues(source["commit"], RepoDefs_CommitMeta);
	        this.uri = source["uri"];
	        this.validationStatus = source["validationStatus"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class RepoStrongRef {
	    $type?: string;
	    cid: string;
	    uri: string;
	
	    static createFrom(source: any = {}) {
	        return new RepoStrongRef(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.cid = source["cid"];
	        this.uri = source["uri"];
	    }
	}

}

export namespace bsky {
	
	export class GraphDefs_ListViewerState {
	    blocked?: string;
	    muted?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new GraphDefs_ListViewerState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.blocked = source["blocked"];
	        this.muted = source["muted"];
	    }
	}
	export class GraphDefs_ListViewBasic {
	    avatar?: string;
	    cid: string;
	    indexedAt?: string;
	    labels?: atproto.LabelDefs_Label[];
	    listItemCount?: number;
	    name: string;
	    purpose?: string;
	    uri: string;
	    viewer?: GraphDefs_ListViewerState;
	
	    static createFrom(source: any = {}) {
	        return new GraphDefs_ListViewBasic(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.avatar = source["avatar"];
	        this.cid = source["cid"];
	        this.indexedAt = source["indexedAt"];
	        this.labels = this.convertValues(source["labels"], atproto.LabelDefs_Label);
	        this.listItemCount = source["listItemCount"];
	        this.name = source["name"];
	        this.purpose = source["purpose"];
	        this.uri = source["uri"];
	        this.viewer = this.convertValues(source["viewer"], GraphDefs_ListViewerState);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class NotificationDefs_ActivitySubscription {
	    post: boolean;
	    reply: boolean;
	
	    static createFrom(source: any = {}) {
	        return new NotificationDefs_ActivitySubscription(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.post = source["post"];
	        this.reply = source["reply"];
	    }
	}
	export class ActorDefs_ViewerState {
	    activitySubscription?: NotificationDefs_ActivitySubscription;
	    blockedBy?: boolean;
	    blocking?: string;
	    blockingByList?: GraphDefs_ListViewBasic;
	    followedBy?: string;
	    following?: string;
	    knownFollowers?: ActorDefs_KnownFollowers;
	    muted?: boolean;
	    mutedByList?: GraphDefs_ListViewBasic;
	
	    static createFrom(source: any = {}) {
	        return new ActorDefs_ViewerState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.activitySubscription = this.convertValues(source["activitySubscription"], NotificationDefs_ActivitySubscription);
	        this.blockedBy = source["blockedBy"];
	        this.blocking = source["blocking"];
	        this.blockingByList = this.convertValues(source["blockingByList"], GraphDefs_ListViewBasic);
	        this.followedBy = source["followedBy"];
	        this.following = source["following"];
	        this.knownFollowers = this.convertValues(source["knownFollowers"], ActorDefs_KnownFollowers);
	        this.muted = source["muted"];
	        this.mutedByList = this.convertValues(source["mutedByList"], GraphDefs_ListViewBasic);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ActorDefs_VerificationView {
	    createdAt: string;
	    isValid: boolean;
	    issuer: string;
	    issuerDisplayName?: string;
	    issuerHandle?: string;
	    uri: string;
	
	    static createFrom(source: any = {}) {
	        return new ActorDefs_VerificationView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.createdAt = source["createdAt"];
	        this.isValid = source["isValid"];
	        this.issuer = source["issuer"];
	        this.issuerDisplayName = source["issuerDisplayName"];
	        this.issuerHandle = source["issuerHandle"];
	        this.uri = source["uri"];
	    }
	}
	export class ActorDefs_VerificationState {
	    trustedVerifierStatus: string;
	    verifications: ActorDefs_VerificationView[];
	    verifiedStatus: string;
	
	    static createFrom(source: any = {}) {
	        return new ActorDefs_VerificationState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.trustedVerifierStatus = source["trustedVerifierStatus"];
	        this.verifications = this.convertValues(source["verifications"], ActorDefs_VerificationView);
	        this.verifiedStatus = source["verifiedStatus"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EmbedExternal_ColorRGB {
	    b: number;
	    g: number;
	    r: number;
	
	    static createFrom(source: any = {}) {
	        return new EmbedExternal_ColorRGB(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.b = source["b"];
	        this.g = source["g"];
	        this.r = source["r"];
	    }
	}
	export class EmbedExternal_ViewExternalSourceTheme {
	    accentForegroundRGB?: EmbedExternal_ColorRGB;
	    accentRGB?: EmbedExternal_ColorRGB;
	    backgroundRGB?: EmbedExternal_ColorRGB;
	    foregroundRGB?: EmbedExternal_ColorRGB;
	
	    static createFrom(source: any = {}) {
	        return new EmbedExternal_ViewExternalSourceTheme(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.accentForegroundRGB = this.convertValues(source["accentForegroundRGB"], EmbedExternal_ColorRGB);
	        this.accentRGB = this.convertValues(source["accentRGB"], EmbedExternal_ColorRGB);
	        this.backgroundRGB = this.convertValues(source["backgroundRGB"], EmbedExternal_ColorRGB);
	        this.foregroundRGB = this.convertValues(source["foregroundRGB"], EmbedExternal_ColorRGB);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EmbedExternal_ViewExternalSource {
	    description?: string;
	    icon?: string;
	    theme?: EmbedExternal_ViewExternalSourceTheme;
	    title: string;
	    uri: string;
	
	    static createFrom(source: any = {}) {
	        return new EmbedExternal_ViewExternalSource(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.description = source["description"];
	        this.icon = source["icon"];
	        this.theme = this.convertValues(source["theme"], EmbedExternal_ViewExternalSourceTheme);
	        this.title = source["title"];
	        this.uri = source["uri"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EmbedExternal_ViewExternal {
	    associatedProfiles?: ActorDefs_ProfileViewBasic[];
	    associatedRefs?: atproto.RepoStrongRef[];
	    createdAt?: string;
	    description: string;
	    labels?: atproto.LabelDefs_Label[];
	    readingTime?: number;
	    source?: EmbedExternal_ViewExternalSource;
	    thumb?: string;
	    title: string;
	    updatedAt?: string;
	    uri: string;
	
	    static createFrom(source: any = {}) {
	        return new EmbedExternal_ViewExternal(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.associatedProfiles = this.convertValues(source["associatedProfiles"], ActorDefs_ProfileViewBasic);
	        this.associatedRefs = this.convertValues(source["associatedRefs"], atproto.RepoStrongRef);
	        this.createdAt = source["createdAt"];
	        this.description = source["description"];
	        this.labels = this.convertValues(source["labels"], atproto.LabelDefs_Label);
	        this.readingTime = source["readingTime"];
	        this.source = this.convertValues(source["source"], EmbedExternal_ViewExternalSource);
	        this.thumb = source["thumb"];
	        this.title = source["title"];
	        this.updatedAt = source["updatedAt"];
	        this.uri = source["uri"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EmbedExternal_View {
	    $type: string;
	    external?: EmbedExternal_ViewExternal;
	
	    static createFrom(source: any = {}) {
	        return new EmbedExternal_View(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.external = this.convertValues(source["external"], EmbedExternal_ViewExternal);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ActorDefs_StatusView_Embed {
	    EmbedExternal_View?: EmbedExternal_View;
	
	    static createFrom(source: any = {}) {
	        return new ActorDefs_StatusView_Embed(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.EmbedExternal_View = this.convertValues(source["EmbedExternal_View"], EmbedExternal_View);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ActorDefs_StatusView {
	    cid?: string;
	    embed?: ActorDefs_StatusView_Embed;
	    expiresAt?: string;
	    isActive?: boolean;
	    isDisabled?: boolean;
	    labels?: atproto.LabelDefs_Label[];
	    record?: util.LexiconTypeDecoder;
	    status: string;
	    uri?: string;
	
	    static createFrom(source: any = {}) {
	        return new ActorDefs_StatusView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cid = source["cid"];
	        this.embed = this.convertValues(source["embed"], ActorDefs_StatusView_Embed);
	        this.expiresAt = source["expiresAt"];
	        this.isActive = source["isActive"];
	        this.isDisabled = source["isDisabled"];
	        this.labels = this.convertValues(source["labels"], atproto.LabelDefs_Label);
	        this.record = this.convertValues(source["record"], util.LexiconTypeDecoder);
	        this.status = source["status"];
	        this.uri = source["uri"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ActorDefs_ProfileAssociatedGerm {
	    messageMeUrl: string;
	    showButtonTo: string;
	
	    static createFrom(source: any = {}) {
	        return new ActorDefs_ProfileAssociatedGerm(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.messageMeUrl = source["messageMeUrl"];
	        this.showButtonTo = source["showButtonTo"];
	    }
	}
	export class ActorDefs_ProfileAssociatedChat {
	    allowGroupInvites?: string;
	    allowIncoming: string;
	
	    static createFrom(source: any = {}) {
	        return new ActorDefs_ProfileAssociatedChat(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.allowGroupInvites = source["allowGroupInvites"];
	        this.allowIncoming = source["allowIncoming"];
	    }
	}
	export class ActorDefs_ProfileAssociatedActivitySubscription {
	    allowSubscriptions: string;
	
	    static createFrom(source: any = {}) {
	        return new ActorDefs_ProfileAssociatedActivitySubscription(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.allowSubscriptions = source["allowSubscriptions"];
	    }
	}
	export class ActorDefs_ProfileAssociated {
	    activitySubscription?: ActorDefs_ProfileAssociatedActivitySubscription;
	    chat?: ActorDefs_ProfileAssociatedChat;
	    feedgens?: number;
	    germ?: ActorDefs_ProfileAssociatedGerm;
	    labeler?: boolean;
	    lists?: number;
	    starterPacks?: number;
	
	    static createFrom(source: any = {}) {
	        return new ActorDefs_ProfileAssociated(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.activitySubscription = this.convertValues(source["activitySubscription"], ActorDefs_ProfileAssociatedActivitySubscription);
	        this.chat = this.convertValues(source["chat"], ActorDefs_ProfileAssociatedChat);
	        this.feedgens = source["feedgens"];
	        this.germ = this.convertValues(source["germ"], ActorDefs_ProfileAssociatedGerm);
	        this.labeler = source["labeler"];
	        this.lists = source["lists"];
	        this.starterPacks = source["starterPacks"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ActorDefs_ProfileViewBasic {
	    associated?: ActorDefs_ProfileAssociated;
	    avatar?: string;
	    createdAt?: string;
	    debug?: any;
	    did: string;
	    displayName?: string;
	    handle: string;
	    labels?: atproto.LabelDefs_Label[];
	    pronouns?: string;
	    status?: ActorDefs_StatusView;
	    verification?: ActorDefs_VerificationState;
	    viewer?: ActorDefs_ViewerState;
	
	    static createFrom(source: any = {}) {
	        return new ActorDefs_ProfileViewBasic(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.associated = this.convertValues(source["associated"], ActorDefs_ProfileAssociated);
	        this.avatar = source["avatar"];
	        this.createdAt = source["createdAt"];
	        this.debug = source["debug"];
	        this.did = source["did"];
	        this.displayName = source["displayName"];
	        this.handle = source["handle"];
	        this.labels = this.convertValues(source["labels"], atproto.LabelDefs_Label);
	        this.pronouns = source["pronouns"];
	        this.status = this.convertValues(source["status"], ActorDefs_StatusView);
	        this.verification = this.convertValues(source["verification"], ActorDefs_VerificationState);
	        this.viewer = this.convertValues(source["viewer"], ActorDefs_ViewerState);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ActorDefs_KnownFollowers {
	    count: number;
	    followers: ActorDefs_ProfileViewBasic[];
	
	    static createFrom(source: any = {}) {
	        return new ActorDefs_KnownFollowers(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.count = source["count"];
	        this.followers = this.convertValues(source["followers"], ActorDefs_ProfileViewBasic);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	export class ActorDefs_ProfileView {
	    associated?: ActorDefs_ProfileAssociated;
	    avatar?: string;
	    createdAt?: string;
	    debug?: any;
	    description?: string;
	    did: string;
	    displayName?: string;
	    handle: string;
	    indexedAt?: string;
	    labels?: atproto.LabelDefs_Label[];
	    pronouns?: string;
	    status?: ActorDefs_StatusView;
	    verification?: ActorDefs_VerificationState;
	    viewer?: ActorDefs_ViewerState;
	
	    static createFrom(source: any = {}) {
	        return new ActorDefs_ProfileView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.associated = this.convertValues(source["associated"], ActorDefs_ProfileAssociated);
	        this.avatar = source["avatar"];
	        this.createdAt = source["createdAt"];
	        this.debug = source["debug"];
	        this.description = source["description"];
	        this.did = source["did"];
	        this.displayName = source["displayName"];
	        this.handle = source["handle"];
	        this.indexedAt = source["indexedAt"];
	        this.labels = this.convertValues(source["labels"], atproto.LabelDefs_Label);
	        this.pronouns = source["pronouns"];
	        this.status = this.convertValues(source["status"], ActorDefs_StatusView);
	        this.verification = this.convertValues(source["verification"], ActorDefs_VerificationState);
	        this.viewer = this.convertValues(source["viewer"], ActorDefs_ViewerState);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	
	
	export class EmbedDefs_AspectRatio {
	    height: number;
	    width: number;
	
	    static createFrom(source: any = {}) {
	        return new EmbedDefs_AspectRatio(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.height = source["height"];
	        this.width = source["width"];
	    }
	}
	
	
	
	
	
	export class EmbedGallery_ViewImage {
	    $type: string;
	    alt: string;
	    aspectRatio?: EmbedDefs_AspectRatio;
	    fullsize: string;
	    thumbnail: string;
	
	    static createFrom(source: any = {}) {
	        return new EmbedGallery_ViewImage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.alt = source["alt"];
	        this.aspectRatio = this.convertValues(source["aspectRatio"], EmbedDefs_AspectRatio);
	        this.fullsize = source["fullsize"];
	        this.thumbnail = source["thumbnail"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EmbedGallery_View_Items_Elem {
	    EmbedGallery_ViewImage?: EmbedGallery_ViewImage;
	
	    static createFrom(source: any = {}) {
	        return new EmbedGallery_View_Items_Elem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.EmbedGallery_ViewImage = this.convertValues(source["EmbedGallery_ViewImage"], EmbedGallery_ViewImage);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EmbedGallery_View {
	    $type: string;
	    items: EmbedGallery_View_Items_Elem[];
	
	    static createFrom(source: any = {}) {
	        return new EmbedGallery_View(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.items = this.convertValues(source["items"], EmbedGallery_View_Items_Elem);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class EmbedImages_ViewImage {
	    alt: string;
	    aspectRatio?: EmbedDefs_AspectRatio;
	    fullsize: string;
	    thumb: string;
	
	    static createFrom(source: any = {}) {
	        return new EmbedImages_ViewImage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.alt = source["alt"];
	        this.aspectRatio = this.convertValues(source["aspectRatio"], EmbedDefs_AspectRatio);
	        this.fullsize = source["fullsize"];
	        this.thumb = source["thumb"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EmbedImages_View {
	    $type: string;
	    images: EmbedImages_ViewImage[];
	
	    static createFrom(source: any = {}) {
	        return new EmbedImages_View(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.images = this.convertValues(source["images"], EmbedImages_ViewImage);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class GraphDefs_StarterPackViewBasic {
	    $type: string;
	    cid: string;
	    creator?: ActorDefs_ProfileViewBasic;
	    indexedAt: string;
	    joinedAllTimeCount?: number;
	    joinedWeekCount?: number;
	    labels?: atproto.LabelDefs_Label[];
	    listItemCount?: number;
	    record?: util.LexiconTypeDecoder;
	    uri: string;
	
	    static createFrom(source: any = {}) {
	        return new GraphDefs_StarterPackViewBasic(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.cid = source["cid"];
	        this.creator = this.convertValues(source["creator"], ActorDefs_ProfileViewBasic);
	        this.indexedAt = source["indexedAt"];
	        this.joinedAllTimeCount = source["joinedAllTimeCount"];
	        this.joinedWeekCount = source["joinedWeekCount"];
	        this.labels = this.convertValues(source["labels"], atproto.LabelDefs_Label);
	        this.listItemCount = source["listItemCount"];
	        this.record = this.convertValues(source["record"], util.LexiconTypeDecoder);
	        this.uri = source["uri"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class LabelerDefs_LabelerViewerState {
	    like?: string;
	
	    static createFrom(source: any = {}) {
	        return new LabelerDefs_LabelerViewerState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.like = source["like"];
	    }
	}
	export class LabelerDefs_LabelerView {
	    $type: string;
	    cid: string;
	    creator?: ActorDefs_ProfileView;
	    indexedAt: string;
	    labels?: atproto.LabelDefs_Label[];
	    likeCount?: number;
	    uri: string;
	    viewer?: LabelerDefs_LabelerViewerState;
	
	    static createFrom(source: any = {}) {
	        return new LabelerDefs_LabelerView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.cid = source["cid"];
	        this.creator = this.convertValues(source["creator"], ActorDefs_ProfileView);
	        this.indexedAt = source["indexedAt"];
	        this.labels = this.convertValues(source["labels"], atproto.LabelDefs_Label);
	        this.likeCount = source["likeCount"];
	        this.uri = source["uri"];
	        this.viewer = this.convertValues(source["viewer"], LabelerDefs_LabelerViewerState);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class GraphDefs_ListView {
	    $type: string;
	    avatar?: string;
	    cid: string;
	    creator?: ActorDefs_ProfileView;
	    description?: string;
	    descriptionFacets?: RichtextFacet[];
	    indexedAt: string;
	    labels?: atproto.LabelDefs_Label[];
	    listItemCount?: number;
	    name: string;
	    purpose?: string;
	    uri: string;
	    viewer?: GraphDefs_ListViewerState;
	
	    static createFrom(source: any = {}) {
	        return new GraphDefs_ListView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.avatar = source["avatar"];
	        this.cid = source["cid"];
	        this.creator = this.convertValues(source["creator"], ActorDefs_ProfileView);
	        this.description = source["description"];
	        this.descriptionFacets = this.convertValues(source["descriptionFacets"], RichtextFacet);
	        this.indexedAt = source["indexedAt"];
	        this.labels = this.convertValues(source["labels"], atproto.LabelDefs_Label);
	        this.listItemCount = source["listItemCount"];
	        this.name = source["name"];
	        this.purpose = source["purpose"];
	        this.uri = source["uri"];
	        this.viewer = this.convertValues(source["viewer"], GraphDefs_ListViewerState);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FeedDefs_GeneratorViewerState {
	    like?: string;
	
	    static createFrom(source: any = {}) {
	        return new FeedDefs_GeneratorViewerState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.like = source["like"];
	    }
	}
	export class RichtextFacet_ByteSlice {
	    byteEnd: number;
	    byteStart: number;
	
	    static createFrom(source: any = {}) {
	        return new RichtextFacet_ByteSlice(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.byteEnd = source["byteEnd"];
	        this.byteStart = source["byteStart"];
	    }
	}
	export class RichtextFacet_Tag {
	    $type: string;
	    tag: string;
	
	    static createFrom(source: any = {}) {
	        return new RichtextFacet_Tag(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.tag = source["tag"];
	    }
	}
	export class RichtextFacet_Link {
	    $type: string;
	    uri: string;
	
	    static createFrom(source: any = {}) {
	        return new RichtextFacet_Link(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.uri = source["uri"];
	    }
	}
	export class RichtextFacet_Mention {
	    $type: string;
	    did: string;
	
	    static createFrom(source: any = {}) {
	        return new RichtextFacet_Mention(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.did = source["did"];
	    }
	}
	export class RichtextFacet_Features_Elem {
	    RichtextFacet_Mention?: RichtextFacet_Mention;
	    RichtextFacet_Link?: RichtextFacet_Link;
	    RichtextFacet_Tag?: RichtextFacet_Tag;
	
	    static createFrom(source: any = {}) {
	        return new RichtextFacet_Features_Elem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.RichtextFacet_Mention = this.convertValues(source["RichtextFacet_Mention"], RichtextFacet_Mention);
	        this.RichtextFacet_Link = this.convertValues(source["RichtextFacet_Link"], RichtextFacet_Link);
	        this.RichtextFacet_Tag = this.convertValues(source["RichtextFacet_Tag"], RichtextFacet_Tag);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RichtextFacet {
	    features: RichtextFacet_Features_Elem[];
	    index?: RichtextFacet_ByteSlice;
	
	    static createFrom(source: any = {}) {
	        return new RichtextFacet(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.features = this.convertValues(source["features"], RichtextFacet_Features_Elem);
	        this.index = this.convertValues(source["index"], RichtextFacet_ByteSlice);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FeedDefs_GeneratorView {
	    $type: string;
	    acceptsInteractions?: boolean;
	    avatar?: string;
	    cid: string;
	    contentMode?: string;
	    creator?: ActorDefs_ProfileView;
	    description?: string;
	    descriptionFacets?: RichtextFacet[];
	    did: string;
	    displayName: string;
	    indexedAt: string;
	    labels?: atproto.LabelDefs_Label[];
	    likeCount?: number;
	    uri: string;
	    viewer?: FeedDefs_GeneratorViewerState;
	
	    static createFrom(source: any = {}) {
	        return new FeedDefs_GeneratorView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.acceptsInteractions = source["acceptsInteractions"];
	        this.avatar = source["avatar"];
	        this.cid = source["cid"];
	        this.contentMode = source["contentMode"];
	        this.creator = this.convertValues(source["creator"], ActorDefs_ProfileView);
	        this.description = source["description"];
	        this.descriptionFacets = this.convertValues(source["descriptionFacets"], RichtextFacet);
	        this.did = source["did"];
	        this.displayName = source["displayName"];
	        this.indexedAt = source["indexedAt"];
	        this.labels = this.convertValues(source["labels"], atproto.LabelDefs_Label);
	        this.likeCount = source["likeCount"];
	        this.uri = source["uri"];
	        this.viewer = this.convertValues(source["viewer"], FeedDefs_GeneratorViewerState);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EmbedRecord_ViewDetached {
	    $type: string;
	    detached: boolean;
	    uri: string;
	
	    static createFrom(source: any = {}) {
	        return new EmbedRecord_ViewDetached(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.detached = source["detached"];
	        this.uri = source["uri"];
	    }
	}
	export class FeedDefs_BlockedAuthor {
	    did: string;
	    viewer?: ActorDefs_ViewerState;
	
	    static createFrom(source: any = {}) {
	        return new FeedDefs_BlockedAuthor(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.did = source["did"];
	        this.viewer = this.convertValues(source["viewer"], ActorDefs_ViewerState);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EmbedRecord_ViewBlocked {
	    $type: string;
	    author?: FeedDefs_BlockedAuthor;
	    blocked: boolean;
	    uri: string;
	
	    static createFrom(source: any = {}) {
	        return new EmbedRecord_ViewBlocked(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.author = this.convertValues(source["author"], FeedDefs_BlockedAuthor);
	        this.blocked = source["blocked"];
	        this.uri = source["uri"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EmbedRecord_ViewNotFound {
	    $type: string;
	    notFound: boolean;
	    uri: string;
	
	    static createFrom(source: any = {}) {
	        return new EmbedRecord_ViewNotFound(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.notFound = source["notFound"];
	        this.uri = source["uri"];
	    }
	}
	export class EmbedRecord_ViewRecord_Embeds_Elem {
	    EmbedImages_View?: EmbedImages_View;
	    EmbedVideo_View?: EmbedVideo_View;
	    EmbedGallery_View?: EmbedGallery_View;
	    EmbedExternal_View?: EmbedExternal_View;
	    EmbedRecord_View?: EmbedRecord_View;
	    EmbedRecordWithMedia_View?: EmbedRecordWithMedia_View;
	
	    static createFrom(source: any = {}) {
	        return new EmbedRecord_ViewRecord_Embeds_Elem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.EmbedImages_View = this.convertValues(source["EmbedImages_View"], EmbedImages_View);
	        this.EmbedVideo_View = this.convertValues(source["EmbedVideo_View"], EmbedVideo_View);
	        this.EmbedGallery_View = this.convertValues(source["EmbedGallery_View"], EmbedGallery_View);
	        this.EmbedExternal_View = this.convertValues(source["EmbedExternal_View"], EmbedExternal_View);
	        this.EmbedRecord_View = this.convertValues(source["EmbedRecord_View"], EmbedRecord_View);
	        this.EmbedRecordWithMedia_View = this.convertValues(source["EmbedRecordWithMedia_View"], EmbedRecordWithMedia_View);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EmbedRecord_ViewRecord {
	    $type: string;
	    author?: ActorDefs_ProfileViewBasic;
	    cid: string;
	    embeds?: EmbedRecord_ViewRecord_Embeds_Elem[];
	    indexedAt: string;
	    labels?: atproto.LabelDefs_Label[];
	    likeCount?: number;
	    quoteCount?: number;
	    replyCount?: number;
	    repostCount?: number;
	    uri: string;
	    value?: util.LexiconTypeDecoder;
	
	    static createFrom(source: any = {}) {
	        return new EmbedRecord_ViewRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.author = this.convertValues(source["author"], ActorDefs_ProfileViewBasic);
	        this.cid = source["cid"];
	        this.embeds = this.convertValues(source["embeds"], EmbedRecord_ViewRecord_Embeds_Elem);
	        this.indexedAt = source["indexedAt"];
	        this.labels = this.convertValues(source["labels"], atproto.LabelDefs_Label);
	        this.likeCount = source["likeCount"];
	        this.quoteCount = source["quoteCount"];
	        this.replyCount = source["replyCount"];
	        this.repostCount = source["repostCount"];
	        this.uri = source["uri"];
	        this.value = this.convertValues(source["value"], util.LexiconTypeDecoder);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EmbedRecord_View_Record {
	    EmbedRecord_ViewRecord?: EmbedRecord_ViewRecord;
	    EmbedRecord_ViewNotFound?: EmbedRecord_ViewNotFound;
	    EmbedRecord_ViewBlocked?: EmbedRecord_ViewBlocked;
	    EmbedRecord_ViewDetached?: EmbedRecord_ViewDetached;
	    FeedDefs_GeneratorView?: FeedDefs_GeneratorView;
	    GraphDefs_ListView?: GraphDefs_ListView;
	    LabelerDefs_LabelerView?: LabelerDefs_LabelerView;
	    GraphDefs_StarterPackViewBasic?: GraphDefs_StarterPackViewBasic;
	
	    static createFrom(source: any = {}) {
	        return new EmbedRecord_View_Record(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.EmbedRecord_ViewRecord = this.convertValues(source["EmbedRecord_ViewRecord"], EmbedRecord_ViewRecord);
	        this.EmbedRecord_ViewNotFound = this.convertValues(source["EmbedRecord_ViewNotFound"], EmbedRecord_ViewNotFound);
	        this.EmbedRecord_ViewBlocked = this.convertValues(source["EmbedRecord_ViewBlocked"], EmbedRecord_ViewBlocked);
	        this.EmbedRecord_ViewDetached = this.convertValues(source["EmbedRecord_ViewDetached"], EmbedRecord_ViewDetached);
	        this.FeedDefs_GeneratorView = this.convertValues(source["FeedDefs_GeneratorView"], FeedDefs_GeneratorView);
	        this.GraphDefs_ListView = this.convertValues(source["GraphDefs_ListView"], GraphDefs_ListView);
	        this.LabelerDefs_LabelerView = this.convertValues(source["LabelerDefs_LabelerView"], LabelerDefs_LabelerView);
	        this.GraphDefs_StarterPackViewBasic = this.convertValues(source["GraphDefs_StarterPackViewBasic"], GraphDefs_StarterPackViewBasic);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EmbedRecord_View {
	    $type: string;
	    record?: EmbedRecord_View_Record;
	
	    static createFrom(source: any = {}) {
	        return new EmbedRecord_View(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.record = this.convertValues(source["record"], EmbedRecord_View_Record);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EmbedVideo_View {
	    $type: string;
	    alt?: string;
	    aspectRatio?: EmbedDefs_AspectRatio;
	    cid: string;
	    playlist: string;
	    presentation?: string;
	    thumbnail?: string;
	
	    static createFrom(source: any = {}) {
	        return new EmbedVideo_View(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.alt = source["alt"];
	        this.aspectRatio = this.convertValues(source["aspectRatio"], EmbedDefs_AspectRatio);
	        this.cid = source["cid"];
	        this.playlist = source["playlist"];
	        this.presentation = source["presentation"];
	        this.thumbnail = source["thumbnail"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EmbedRecordWithMedia_View_Media {
	    EmbedImages_View?: EmbedImages_View;
	    EmbedVideo_View?: EmbedVideo_View;
	    EmbedGallery_View?: EmbedGallery_View;
	    EmbedExternal_View?: EmbedExternal_View;
	
	    static createFrom(source: any = {}) {
	        return new EmbedRecordWithMedia_View_Media(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.EmbedImages_View = this.convertValues(source["EmbedImages_View"], EmbedImages_View);
	        this.EmbedVideo_View = this.convertValues(source["EmbedVideo_View"], EmbedVideo_View);
	        this.EmbedGallery_View = this.convertValues(source["EmbedGallery_View"], EmbedGallery_View);
	        this.EmbedExternal_View = this.convertValues(source["EmbedExternal_View"], EmbedExternal_View);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EmbedRecordWithMedia_View {
	    $type: string;
	    media?: EmbedRecordWithMedia_View_Media;
	    record?: EmbedRecord_View;
	
	    static createFrom(source: any = {}) {
	        return new EmbedRecordWithMedia_View(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.media = this.convertValues(source["media"], EmbedRecordWithMedia_View_Media);
	        this.record = this.convertValues(source["record"], EmbedRecord_View);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	
	
	
	
	
	
	export class FeedDefs_BlockedPost {
	    $type: string;
	    author?: FeedDefs_BlockedAuthor;
	    blocked: boolean;
	    uri: string;
	
	    static createFrom(source: any = {}) {
	        return new FeedDefs_BlockedPost(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.author = this.convertValues(source["author"], FeedDefs_BlockedAuthor);
	        this.blocked = source["blocked"];
	        this.uri = source["uri"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class FeedDefs_NotFoundPost {
	    $type: string;
	    notFound: boolean;
	    uri: string;
	
	    static createFrom(source: any = {}) {
	        return new FeedDefs_NotFoundPost(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.notFound = source["notFound"];
	        this.uri = source["uri"];
	    }
	}
	export class FeedDefs_ViewerState {
	    bookmarked?: boolean;
	    embeddingDisabled?: boolean;
	    like?: string;
	    pinned?: boolean;
	    replyDisabled?: boolean;
	    repost?: string;
	    threadMuted?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FeedDefs_ViewerState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.bookmarked = source["bookmarked"];
	        this.embeddingDisabled = source["embeddingDisabled"];
	        this.like = source["like"];
	        this.pinned = source["pinned"];
	        this.replyDisabled = source["replyDisabled"];
	        this.repost = source["repost"];
	        this.threadMuted = source["threadMuted"];
	    }
	}
	export class FeedDefs_ThreadgateView {
	    cid?: string;
	    lists?: GraphDefs_ListViewBasic[];
	    record?: util.LexiconTypeDecoder;
	    uri?: string;
	
	    static createFrom(source: any = {}) {
	        return new FeedDefs_ThreadgateView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cid = source["cid"];
	        this.lists = this.convertValues(source["lists"], GraphDefs_ListViewBasic);
	        this.record = this.convertValues(source["record"], util.LexiconTypeDecoder);
	        this.uri = source["uri"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FeedDefs_PostView_Embed {
	    EmbedImages_View?: EmbedImages_View;
	    EmbedVideo_View?: EmbedVideo_View;
	    EmbedGallery_View?: EmbedGallery_View;
	    EmbedExternal_View?: EmbedExternal_View;
	    EmbedRecord_View?: EmbedRecord_View;
	    EmbedRecordWithMedia_View?: EmbedRecordWithMedia_View;
	
	    static createFrom(source: any = {}) {
	        return new FeedDefs_PostView_Embed(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.EmbedImages_View = this.convertValues(source["EmbedImages_View"], EmbedImages_View);
	        this.EmbedVideo_View = this.convertValues(source["EmbedVideo_View"], EmbedVideo_View);
	        this.EmbedGallery_View = this.convertValues(source["EmbedGallery_View"], EmbedGallery_View);
	        this.EmbedExternal_View = this.convertValues(source["EmbedExternal_View"], EmbedExternal_View);
	        this.EmbedRecord_View = this.convertValues(source["EmbedRecord_View"], EmbedRecord_View);
	        this.EmbedRecordWithMedia_View = this.convertValues(source["EmbedRecordWithMedia_View"], EmbedRecordWithMedia_View);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FeedDefs_PostView {
	    $type: string;
	    author?: ActorDefs_ProfileViewBasic;
	    bookmarkCount?: number;
	    cid: string;
	    debug?: any;
	    embed?: FeedDefs_PostView_Embed;
	    indexedAt: string;
	    labels?: atproto.LabelDefs_Label[];
	    likeCount?: number;
	    quoteCount?: number;
	    record?: util.LexiconTypeDecoder;
	    replyCount?: number;
	    repostCount?: number;
	    threadgate?: FeedDefs_ThreadgateView;
	    uri: string;
	    viewer?: FeedDefs_ViewerState;
	
	    static createFrom(source: any = {}) {
	        return new FeedDefs_PostView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.author = this.convertValues(source["author"], ActorDefs_ProfileViewBasic);
	        this.bookmarkCount = source["bookmarkCount"];
	        this.cid = source["cid"];
	        this.debug = source["debug"];
	        this.embed = this.convertValues(source["embed"], FeedDefs_PostView_Embed);
	        this.indexedAt = source["indexedAt"];
	        this.labels = this.convertValues(source["labels"], atproto.LabelDefs_Label);
	        this.likeCount = source["likeCount"];
	        this.quoteCount = source["quoteCount"];
	        this.record = this.convertValues(source["record"], util.LexiconTypeDecoder);
	        this.replyCount = source["replyCount"];
	        this.repostCount = source["repostCount"];
	        this.threadgate = this.convertValues(source["threadgate"], FeedDefs_ThreadgateView);
	        this.uri = source["uri"];
	        this.viewer = this.convertValues(source["viewer"], FeedDefs_ViewerState);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class FeedDefs_ThreadContext {
	    rootAuthorLike?: string;
	
	    static createFrom(source: any = {}) {
	        return new FeedDefs_ThreadContext(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.rootAuthorLike = source["rootAuthorLike"];
	    }
	}
	export class FeedDefs_ThreadViewPost_Replies_Elem {
	    FeedDefs_ThreadViewPost?: FeedDefs_ThreadViewPost;
	    FeedDefs_NotFoundPost?: FeedDefs_NotFoundPost;
	    FeedDefs_BlockedPost?: FeedDefs_BlockedPost;
	
	    static createFrom(source: any = {}) {
	        return new FeedDefs_ThreadViewPost_Replies_Elem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.FeedDefs_ThreadViewPost = this.convertValues(source["FeedDefs_ThreadViewPost"], FeedDefs_ThreadViewPost);
	        this.FeedDefs_NotFoundPost = this.convertValues(source["FeedDefs_NotFoundPost"], FeedDefs_NotFoundPost);
	        this.FeedDefs_BlockedPost = this.convertValues(source["FeedDefs_BlockedPost"], FeedDefs_BlockedPost);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FeedDefs_ThreadViewPost_Parent {
	    FeedDefs_ThreadViewPost?: FeedDefs_ThreadViewPost;
	    FeedDefs_NotFoundPost?: FeedDefs_NotFoundPost;
	    FeedDefs_BlockedPost?: FeedDefs_BlockedPost;
	
	    static createFrom(source: any = {}) {
	        return new FeedDefs_ThreadViewPost_Parent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.FeedDefs_ThreadViewPost = this.convertValues(source["FeedDefs_ThreadViewPost"], FeedDefs_ThreadViewPost);
	        this.FeedDefs_NotFoundPost = this.convertValues(source["FeedDefs_NotFoundPost"], FeedDefs_NotFoundPost);
	        this.FeedDefs_BlockedPost = this.convertValues(source["FeedDefs_BlockedPost"], FeedDefs_BlockedPost);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FeedDefs_ThreadViewPost {
	    $type: string;
	    parent?: FeedDefs_ThreadViewPost_Parent;
	    post?: FeedDefs_PostView;
	    replies?: FeedDefs_ThreadViewPost_Replies_Elem[];
	    threadContext?: FeedDefs_ThreadContext;
	
	    static createFrom(source: any = {}) {
	        return new FeedDefs_ThreadViewPost(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.$type = source["$type"];
	        this.parent = this.convertValues(source["parent"], FeedDefs_ThreadViewPost_Parent);
	        this.post = this.convertValues(source["post"], FeedDefs_PostView);
	        this.replies = this.convertValues(source["replies"], FeedDefs_ThreadViewPost_Replies_Elem);
	        this.threadContext = this.convertValues(source["threadContext"], FeedDefs_ThreadContext);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	export class FeedGetPostThread_Output_Thread {
	    FeedDefs_ThreadViewPost?: FeedDefs_ThreadViewPost;
	    FeedDefs_NotFoundPost?: FeedDefs_NotFoundPost;
	    FeedDefs_BlockedPost?: FeedDefs_BlockedPost;
	
	    static createFrom(source: any = {}) {
	        return new FeedGetPostThread_Output_Thread(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.FeedDefs_ThreadViewPost = this.convertValues(source["FeedDefs_ThreadViewPost"], FeedDefs_ThreadViewPost);
	        this.FeedDefs_NotFoundPost = this.convertValues(source["FeedDefs_NotFoundPost"], FeedDefs_NotFoundPost);
	        this.FeedDefs_BlockedPost = this.convertValues(source["FeedDefs_BlockedPost"], FeedDefs_BlockedPost);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FeedGetPostThread_Output {
	    thread?: FeedGetPostThread_Output_Thread;
	    threadgate?: FeedDefs_ThreadgateView;
	
	    static createFrom(source: any = {}) {
	        return new FeedGetPostThread_Output(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.thread = this.convertValues(source["thread"], FeedGetPostThread_Output_Thread);
	        this.threadgate = this.convertValues(source["threadgate"], FeedDefs_ThreadgateView);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	
	
	
	
	
	
	
	
	

}

export namespace services {
	
	export class ChatConvoDTO {
	    id: string;
	    rev: string;
	    members: string;
	    lastMessage: string;
	    unreadCount: number;
	
	    static createFrom(source: any = {}) {
	        return new ChatConvoDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.rev = source["rev"];
	        this.members = source["members"];
	        this.lastMessage = source["lastMessage"];
	        this.unreadCount = source["unreadCount"];
	    }
	}
	export class ChatMessageDTO {
	    id: string;
	    rev: string;
	    sender: string;
	    text: string;
	    sentAt: string;
	    embedUri?: string;
	    replyToMessageText?: string;
	    replyToSender?: string;
	
	    static createFrom(source: any = {}) {
	        return new ChatMessageDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.rev = source["rev"];
	        this.sender = source["sender"];
	        this.text = source["text"];
	        this.sentAt = source["sentAt"];
	        this.embedUri = source["embedUri"];
	        this.replyToMessageText = source["replyToMessageText"];
	        this.replyToSender = source["replyToSender"];
	    }
	}
	export class ChatMessagesDTO {
	    cursor: string;
	    messages: ChatMessageDTO[];
	
	    static createFrom(source: any = {}) {
	        return new ChatMessagesDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.messages = this.convertValues(source["messages"], ChatMessageDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ContentFilterDTO {
	    labelerDid: string;
	    label: string;
	    visibility: string;
	
	    static createFrom(source: any = {}) {
	        return new ContentFilterDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.labelerDid = source["labelerDid"];
	        this.label = source["label"];
	        this.visibility = source["visibility"];
	    }
	}
	export class ExternalEmbedDTO {
	    uri: string;
	    title: string;
	    description: string;
	    thumb: string;
	
	    static createFrom(source: any = {}) {
	        return new ExternalEmbedDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uri = source["uri"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.thumb = source["thumb"];
	    }
	}
	export class VideoEmbedDTO {
	    playlist: string;
	    thumbnail: string;
	    alt: string;
	    presentation: string;
	
	    static createFrom(source: any = {}) {
	        return new VideoEmbedDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.playlist = source["playlist"];
	        this.thumbnail = source["thumbnail"];
	        this.alt = source["alt"];
	        this.presentation = source["presentation"];
	    }
	}
	export class ImageDTO {
	    thumb: string;
	    fullsize: string;
	    alt: string;
	    width?: number;
	    height?: number;
	
	    static createFrom(source: any = {}) {
	        return new ImageDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.thumb = source["thumb"];
	        this.fullsize = source["fullsize"];
	        this.alt = source["alt"];
	        this.width = source["width"];
	        this.height = source["height"];
	    }
	}
	export class PostDTO {
	    uri: string;
	    cid: string;
	    authorName: string;
	    authorHandle: string;
	    authorDid: string;
	    text: string;
	    createdAt: string;
	    replyCount: number;
	    repostCount: number;
	    likeCount: number;
	    isReply: boolean;
	    replyToAuthor: string;
	    replyToUri: string;
	    rootAuthor: string;
	    rootUri: string;
	    parentPost?: PostDTO;
	    repostedBy: string;
	    repostedByHandle: string;
	    quotePost?: PostDTO;
	    imageAlts: string[];
	    images: ImageDTO[];
	    external?: ExternalEmbedDTO;
	    video?: VideoEmbedDTO;
	    hasMedia: boolean;
	    viewerLike: string;
	    viewerRepost: string;
	    viewerBookmark: string;
	
	    static createFrom(source: any = {}) {
	        return new PostDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uri = source["uri"];
	        this.cid = source["cid"];
	        this.authorName = source["authorName"];
	        this.authorHandle = source["authorHandle"];
	        this.authorDid = source["authorDid"];
	        this.text = source["text"];
	        this.createdAt = source["createdAt"];
	        this.replyCount = source["replyCount"];
	        this.repostCount = source["repostCount"];
	        this.likeCount = source["likeCount"];
	        this.isReply = source["isReply"];
	        this.replyToAuthor = source["replyToAuthor"];
	        this.replyToUri = source["replyToUri"];
	        this.rootAuthor = source["rootAuthor"];
	        this.rootUri = source["rootUri"];
	        this.parentPost = this.convertValues(source["parentPost"], PostDTO);
	        this.repostedBy = source["repostedBy"];
	        this.repostedByHandle = source["repostedByHandle"];
	        this.quotePost = this.convertValues(source["quotePost"], PostDTO);
	        this.imageAlts = source["imageAlts"];
	        this.images = this.convertValues(source["images"], ImageDTO);
	        this.external = this.convertValues(source["external"], ExternalEmbedDTO);
	        this.video = this.convertValues(source["video"], VideoEmbedDTO);
	        this.hasMedia = source["hasMedia"];
	        this.viewerLike = source["viewerLike"];
	        this.viewerRepost = source["viewerRepost"];
	        this.viewerBookmark = source["viewerBookmark"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FeedDTO {
	    cursor: string;
	    posts: PostDTO[];
	
	    static createFrom(source: any = {}) {
	        return new FeedDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.posts = this.convertValues(source["posts"], PostDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FeedGeneratorDTO {
	    uri: string;
	    cid: string;
	    did: string;
	    creator: string;
	    displayName: string;
	    description: string;
	    likeCount: number;
	    avatar: string;
	
	    static createFrom(source: any = {}) {
	        return new FeedGeneratorDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uri = source["uri"];
	        this.cid = source["cid"];
	        this.did = source["did"];
	        this.creator = source["creator"];
	        this.displayName = source["displayName"];
	        this.description = source["description"];
	        this.likeCount = source["likeCount"];
	        this.avatar = source["avatar"];
	    }
	}
	export class FeedGeneratorResponseDTO {
	    cursor: string;
	    feeds: FeedGeneratorDTO[];
	
	    static createFrom(source: any = {}) {
	        return new FeedGeneratorResponseDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.feeds = this.convertValues(source["feeds"], FeedGeneratorDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class LabelerPolicyDefinitionDTO {
	    identifier: string;
	    severity: string;
	    blurs: string;
	    defaultSetting: string;
	    adultOnly: boolean;
	    title: string;
	    description: string;
	
	    static createFrom(source: any = {}) {
	        return new LabelerPolicyDefinitionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.identifier = source["identifier"];
	        this.severity = source["severity"];
	        this.blurs = source["blurs"];
	        this.defaultSetting = source["defaultSetting"];
	        this.adultOnly = source["adultOnly"];
	        this.title = source["title"];
	        this.description = source["description"];
	    }
	}
	export class LabelerDTO {
	    did: string;
	    handle: string;
	    displayName: string;
	    description: string;
	    avatar: string;
	    banner: string;
	    likeCount: number;
	    isSubscribed: boolean;
	    viewerLike: string;
	    indexedAt: string;
	    policies: LabelerPolicyDefinitionDTO[];
	
	    static createFrom(source: any = {}) {
	        return new LabelerDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.did = source["did"];
	        this.handle = source["handle"];
	        this.displayName = source["displayName"];
	        this.description = source["description"];
	        this.avatar = source["avatar"];
	        this.banner = source["banner"];
	        this.likeCount = source["likeCount"];
	        this.isSubscribed = source["isSubscribed"];
	        this.viewerLike = source["viewerLike"];
	        this.indexedAt = source["indexedAt"];
	        this.policies = this.convertValues(source["policies"], LabelerPolicyDefinitionDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ListDTO {
	    uri: string;
	    cid: string;
	    name: string;
	    purpose: string;
	    description: string;
	    creator: string;
	    creatorDid: string;
	    creatorHandle: string;
	    avatar: string;
	    listItemCount: number;
	    viewerMuted: boolean;
	    viewerBlock: string;
	
	    static createFrom(source: any = {}) {
	        return new ListDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uri = source["uri"];
	        this.cid = source["cid"];
	        this.name = source["name"];
	        this.purpose = source["purpose"];
	        this.description = source["description"];
	        this.creator = source["creator"];
	        this.creatorDid = source["creatorDid"];
	        this.creatorHandle = source["creatorHandle"];
	        this.avatar = source["avatar"];
	        this.listItemCount = source["listItemCount"];
	        this.viewerMuted = source["viewerMuted"];
	        this.viewerBlock = source["viewerBlock"];
	    }
	}
	export class ListResponseDTO {
	    cursor: string;
	    lists: ListDTO[];
	
	    static createFrom(source: any = {}) {
	        return new ListResponseDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.lists = this.convertValues(source["lists"], ListDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MutedWordDTO {
	    value: string;
	    targets: string[];
	
	    static createFrom(source: any = {}) {
	        return new MutedWordDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.value = source["value"];
	        this.targets = source["targets"];
	    }
	}
	export class NotificationDTO {
	    uri: string;
	    cid: string;
	    authorName: string;
	    authorHandle: string;
	    reason: string;
	    indexedAt: string;
	    text: string;
	    reasonSubject: string;
	    hasMedia: boolean;
	    video?: VideoEmbedDTO;
	    quoteAuthorName?: string;
	    quoteAuthorHandle?: string;
	    quoteText?: string;
	    quoteUri?: string;
	    hydratedPost?: PostDTO;
	
	    static createFrom(source: any = {}) {
	        return new NotificationDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uri = source["uri"];
	        this.cid = source["cid"];
	        this.authorName = source["authorName"];
	        this.authorHandle = source["authorHandle"];
	        this.reason = source["reason"];
	        this.indexedAt = source["indexedAt"];
	        this.text = source["text"];
	        this.reasonSubject = source["reasonSubject"];
	        this.hasMedia = source["hasMedia"];
	        this.video = this.convertValues(source["video"], VideoEmbedDTO);
	        this.quoteAuthorName = source["quoteAuthorName"];
	        this.quoteAuthorHandle = source["quoteAuthorHandle"];
	        this.quoteText = source["quoteText"];
	        this.quoteUri = source["quoteUri"];
	        this.hydratedPost = this.convertValues(source["hydratedPost"], PostDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class NotificationListDTO {
	    cursor: string;
	    notifications: NotificationDTO[];
	
	    static createFrom(source: any = {}) {
	        return new NotificationListDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.notifications = this.convertValues(source["notifications"], NotificationDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class PostSearchFilter {
	    Query: string;
	    Author: string;
	    Lang: string;
	    Sort: string;
	    Since: string;
	    Until: string;
	    Cursor: string;
	
	    static createFrom(source: any = {}) {
	        return new PostSearchFilter(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Query = source["Query"];
	        this.Author = source["Author"];
	        this.Lang = source["Lang"];
	        this.Sort = source["Sort"];
	        this.Since = source["Since"];
	        this.Until = source["Until"];
	        this.Cursor = source["Cursor"];
	    }
	}
	export class PreferencesDTO {
	    adultContentEnabled: boolean;
	    contentFilters: ContentFilterDTO[];
	    mutedWords: MutedWordDTO[];
	    pinnedFeeds: string[];
	    savedFeeds: string[];
	    threadSort: string;
	    threadPrioritizeFollowed: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PreferencesDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.adultContentEnabled = source["adultContentEnabled"];
	        this.contentFilters = this.convertValues(source["contentFilters"], ContentFilterDTO);
	        this.mutedWords = this.convertValues(source["mutedWords"], MutedWordDTO);
	        this.pinnedFeeds = source["pinnedFeeds"];
	        this.savedFeeds = source["savedFeeds"];
	        this.threadSort = source["threadSort"];
	        this.threadPrioritizeFollowed = source["threadPrioritizeFollowed"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ProfileDTO {
	    did: string;
	    handle: string;
	    displayName: string;
	    description: string;
	    avatar: string;
	    followersCount: number;
	    followsCount: number;
	    postsCount: number;
	    viewerFollowing: string;
	    viewerFollowedBy: string;
	    viewerMuted: boolean;
	    viewerBlocking: string;
	    viewerBlockedBy: boolean;
	    pinnedPostUri: string;
	    isMe: boolean;
	    isLabeler: boolean;
	    viewerSubscribedLabeler: boolean;
	    labelerInfo?: LabelerDTO;
	
	    static createFrom(source: any = {}) {
	        return new ProfileDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.did = source["did"];
	        this.handle = source["handle"];
	        this.displayName = source["displayName"];
	        this.description = source["description"];
	        this.avatar = source["avatar"];
	        this.followersCount = source["followersCount"];
	        this.followsCount = source["followsCount"];
	        this.postsCount = source["postsCount"];
	        this.viewerFollowing = source["viewerFollowing"];
	        this.viewerFollowedBy = source["viewerFollowedBy"];
	        this.viewerMuted = source["viewerMuted"];
	        this.viewerBlocking = source["viewerBlocking"];
	        this.viewerBlockedBy = source["viewerBlockedBy"];
	        this.pinnedPostUri = source["pinnedPostUri"];
	        this.isMe = source["isMe"];
	        this.isLabeler = source["isLabeler"];
	        this.viewerSubscribedLabeler = source["viewerSubscribedLabeler"];
	        this.labelerInfo = this.convertValues(source["labelerInfo"], LabelerDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ProfileListDTO {
	    cursor: string;
	    profiles: ProfileDTO[];
	
	    static createFrom(source: any = {}) {
	        return new ProfileListDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.profiles = this.convertValues(source["profiles"], ProfileDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SavedFeedDTO {
	    uri: string;
	    cid: string;
	    displayName: string;
	    creator: string;
	    pinned: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SavedFeedDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uri = source["uri"];
	        this.cid = source["cid"];
	        this.displayName = source["displayName"];
	        this.creator = source["creator"];
	        this.pinned = source["pinned"];
	    }
	}
	export class SearchDTO {
	    cursor: string;
	    posts: PostDTO[];
	
	    static createFrom(source: any = {}) {
	        return new SearchDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.posts = this.convertValues(source["posts"], PostDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class StarterPackDTO {
	    uri: string;
	    cid: string;
	    name: string;
	    description: string;
	    creator: string;
	    listUri: string;
	
	    static createFrom(source: any = {}) {
	        return new StarterPackDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uri = source["uri"];
	        this.cid = source["cid"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.creator = source["creator"];
	        this.listUri = source["listUri"];
	    }
	}
	export class StarterPackResponseDTO {
	    cursor: string;
	    starterPacks: StarterPackDTO[];
	
	    static createFrom(source: any = {}) {
	        return new StarterPackResponseDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.starterPacks = this.convertValues(source["starterPacks"], StarterPackDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UpdateInfoDTO {
	    hasUpdate: boolean;
	    currentVersion: string;
	    latestVersion: string;
	    releaseUrl: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfoDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hasUpdate = source["hasUpdate"];
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.releaseUrl = source["releaseUrl"];
	    }
	}
	
	export class VideoJobStatusDTO {
	    jobId: string;
	    did: string;
	    state: string;
	    progress?: number;
	    message?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new VideoJobStatusDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.jobId = source["jobId"];
	        this.did = source["did"];
	        this.state = source["state"];
	        this.progress = source["progress"];
	        this.message = source["message"];
	        this.error = source["error"];
	    }
	}

}

export namespace util {
	
	export class LexiconTypeDecoder {
	    Val: any;
	
	    static createFrom(source: any = {}) {
	        return new LexiconTypeDecoder(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Val = source["Val"];
	    }
	}

}

