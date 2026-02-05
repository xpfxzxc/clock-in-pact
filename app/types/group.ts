export type MemberRole = "CHALLENGER" | "SUPERVISOR";

export interface CreateGroupRequest {
  name: string;
  description?: string;
  timezone?: string;
  role: MemberRole;
}

export interface GroupResponse {
  id: number;
  name: string;
  description: string | null;
  timezone: string;
  createdAt: string;
  memberCount: number;
  myRole?: MemberRole;
}

export interface GroupDetailResponse extends GroupResponse {
  members: GroupMemberInfo[];
  inviteCodes: string[];
}

export interface GroupMemberInfo {
  id: number;
  userId: number;
  nickname: string;
  role: MemberRole;
  joinedAt: string;
}

export interface JoinGroupRequest {
  inviteCode: string;
  role: MemberRole;
}

export interface JoinGroupResponse {
  group: GroupResponse;
  role: MemberRole;
}
