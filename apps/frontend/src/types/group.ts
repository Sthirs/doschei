export type GroupMember = {
  id: string;
  displayName: string;
  email: string;
};

export type Group = {
  id: string;
  name: string;
  imageUrl: string | null;
  memberCount: number;
  members: GroupMember[];
};
